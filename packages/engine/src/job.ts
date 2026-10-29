import { defaultTuning, detectCapabilities } from './capabilities.ts';
import { EngineError, type SerializedError } from './errors.ts';
import type { DecryptCredentials, EncryptCredentials } from './format/header.ts';
import { acquireJobGuards } from './guards.ts';
import type { Backend } from './payload/cipher.ts';
import { SwDownload, downloadStagedFile } from './sinks/download.ts';
import type { SinkDescriptor, SinkResult } from './sinks/sink.ts';
import type {
	CoordinatorEvent,
	CoordinatorRequest,
	CryptoConnect,
	FileTask,
	Source
} from './workers/protocol.ts';

/** A real file, or a size-only stand-in that produces zeros (benchmarks). */
export type JobInput = File | { name: string; size: number; synthetic: true };

/** Where outputs go. Pickers must be shown by the UI, inside the user gesture. */
export type SaveTarget =
	| { kind: 'file'; handle: FileSystemFileHandle }
	| { kind: 'directory'; handle: FileSystemDirectoryHandle }
	| { kind: 'sw-download' }
	| { kind: 'opfs' }
	| { kind: 'memory' }
	| { kind: 'discard' };

export type JobOptions = (
	| { mode: 'encrypt'; credentials: EncryptCredentials }
	| { mode: 'decrypt'; credentials: DecryptCredentials }
) & {
	files: JobInput[];
	save: SaveTarget;
	/** Overrides for benchmarks; defaults come from `defaultTuning`. */
	tuning?: { workers?: number; batchChunks?: number; window?: number; backend?: Backend };
};

export type FileStatus = 'waiting' | 'running' | 'done' | 'failed' | 'cancelled';

export type FileOutput =
	| { kind: 'saved' }
	| { kind: 'downloaded' }
	| { kind: 'memory'; blob: Blob }
	| { kind: 'discarded'; bytes: number };

export interface JobFile {
	name: string;
	size: number;
	outputName: string;
	status: FileStatus;
	/** Input bytes processed. */
	bytesDone: number;
	/** Set once the header checked out and the output was opened. */
	outputSize: number | null;
	output: FileOutput | null;
	error: SerializedError | null;
}

export type JobStatus = 'running' | 'done' | 'failed' | 'cancelled';

/** Immutable; a new object on every change, for `useSyncExternalStore`. */
export interface JobSnapshot {
	mode: 'encrypt' | 'decrypt';
	status: JobStatus;
	files: readonly JobFile[];
	bytesTotal: number;
	bytesDone: number;
	startedAt: number;
	/** When this snapshot was produced; with `startedAt` it gives the throughput. */
	updatedAt: number;
	finishedAt: number | null;
	workers: number;
	backend: Backend | null;
}

export interface Job {
	getSnapshot(): JobSnapshot;
	subscribe(listener: () => void): () => void;
	cancel(): void;
	/** Resolves with the final snapshot; never rejects. */
	readonly done: Promise<JobSnapshot>;
}

/** Per-file failures after which the remaining files are still worth trying. */
const FILE_LOCAL_ERRORS = new Set([
	'wrong-credentials',
	'not-encrypted',
	'legacy-file',
	'armored',
	'corrupted'
]);

export function outputName(mode: 'encrypt' | 'decrypt', name: string): string {
	if (mode === 'encrypt') return `${name}.age`;
	return /\.age$/i.test(name) && name.length > 4 ? name.slice(0, -4) : `${name}.decrypted`;
}

/** Starts an encrypt or decrypt job over `files`. One input file → one output file (D6). */
export function startJob(options: JobOptions): Job {
	if (options.save.kind === 'file' && options.files.length !== 1) {
		throw new EngineError('internal', 'a single save file needs exactly one input file');
	}
	const tuning = { ...defaultTuning(detectCapabilities()), ...options.tuning };
	return new RunningJob(options, tuning);
}

class RunningJob implements Job {
	readonly done: Promise<JobSnapshot>;
	private snapshot: JobSnapshot;
	private readonly listeners = new Set<() => void>();
	private readonly coordinator: Worker;
	private readonly crypto: Worker[];
	private cancelled = false;
	private currentId = -1;

	constructor(
		private readonly options: JobOptions,
		private readonly tuning: {
			workers: number;
			batchChunks: number;
			window: number;
			backend?: Backend;
		}
	) {
		this.snapshot = {
			mode: options.mode,
			status: 'running',
			files: options.files.map((file) => ({
				name: file.name,
				size: file.size,
				outputName: outputName(options.mode, file.name),
				status: 'waiting',
				bytesDone: 0,
				outputSize: null,
				output: null,
				error: null
			})),
			bytesTotal: options.files.reduce((sum, file) => sum + file.size, 0),
			bytesDone: 0,
			startedAt: Date.now(),
			updatedAt: Date.now(),
			finishedAt: null,
			workers: tuning.workers,
			backend: null
		};

		// The main thread only spawns the workers and wires them together;
		// file bytes travel coordinator ⇄ crypto workers over these ports.
		this.coordinator = new Worker(new URL('./workers/coordinator.worker.ts', import.meta.url), {
			type: 'module',
			name: 'encryptee-coordinator'
		});
		this.crypto = [];
		const ports: MessagePort[] = [];
		for (let i = 0; i < tuning.workers; i++) {
			const worker = new Worker(new URL('./workers/crypto.worker.ts', import.meta.url), {
				type: 'module',
				name: 'encryptee-crypto'
			});
			const channel = new MessageChannel();
			worker.postMessage({ type: 'connect', port: channel.port1 } satisfies CryptoConnect, [
				channel.port1
			]);
			ports.push(channel.port2);
			this.crypto.push(worker);
		}
		this.request({ type: 'init', pool: ports }, ports);
		this.done = this.run();
	}

	getSnapshot = (): JobSnapshot => this.snapshot;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	cancel = (): void => {
		if (this.snapshot.status !== 'running') return;
		this.cancelled = true;
		this.request({ type: 'cancel', id: this.currentId });
	};

	private async run(): Promise<JobSnapshot> {
		const guards = await acquireJobGuards();
		try {
			for (let index = 0; index < this.options.files.length; index++) {
				if (this.cancelled) {
					this.updateFile(index, { status: 'cancelled' });
					continue;
				}
				const outcome = await this.runFile(index);
				if (outcome === 'stop') this.cancelRemaining(index + 1);
				if (outcome === 'stop' || this.cancelled) break;
			}
			const statuses = this.snapshot.files.map((file) => file.status);
			const status: JobStatus = this.cancelled
				? 'cancelled'
				: statuses.every((s) => s === 'done')
					? 'done'
					: 'failed';
			this.update({ status, finishedAt: Date.now() });
		} finally {
			guards.release();
			this.coordinator.terminate();
			for (const worker of this.crypto) worker.terminate();
		}
		return this.snapshot;
	}

	private async runFile(index: number): Promise<'next' | 'stop'> {
		const input = this.options.files[index]!;
		const file = this.snapshot.files[index]!;
		const id = ++this.currentId;
		const download =
			this.options.save.kind === 'sw-download' ? new SwDownload(file.outputName) : null;
		const task: FileTask = {
			id,
			source: sourceOf(input),
			sink: this.sinkFor(file.outputName, download),
			operation:
				this.options.mode === 'encrypt'
					? { mode: 'encrypt', credentials: this.options.credentials }
					: { mode: 'decrypt', credentials: this.options.credentials },
			batchChunks: this.tuning.batchChunks,
			window: this.tuning.window,
			backend: this.tuning.backend
		};
		this.updateFile(index, { status: 'running' });
		const doneBefore = this.snapshot.bytesDone;

		const result = await new Promise<
			{ ok: true; result: SinkResult } | { ok: false; error: SerializedError }
		>((resolve) => {
			this.coordinator.onmessage = ({ data }: MessageEvent<CoordinatorEvent>) => {
				if (data.id !== id) return;
				switch (data.type) {
					case 'opened':
						this.updateFile(index, { outputSize: data.outputSize });
						this.update({ backend: data.backend });
						download?.begin(data.outputSize);
						break;
					case 'progress':
						this.updateFile(index, { bytesDone: data.bytes });
						this.update({ bytesDone: doneBefore + data.bytes });
						break;
					case 'done':
						resolve({ ok: true, result: data.result });
						break;
					case 'failed':
						resolve({ ok: false, error: data.error });
				}
			};
			this.coordinator.onerror = (event) =>
				resolve({
					ok: false,
					error: { code: 'internal', message: event.message || 'worker crashed' }
				});
			this.request({ type: 'run', task }, task.sink.kind === 'sw-download' ? [task.sink.port] : []);
		});
		download?.end();

		if (!result.ok) {
			const cancelled = result.error.code === 'cancelled';
			this.updateFile(index, {
				status: cancelled ? 'cancelled' : 'failed',
				error: cancelled ? null : result.error
			});
			this.update({ bytesDone: doneBefore + file.size });
			return cancelled || !FILE_LOCAL_ERRORS.has(result.error.code) ? 'stop' : 'next';
		}
		const output = await this.deliver(result.result, file.outputName);
		this.updateFile(index, { status: 'done', output, bytesDone: file.size });
		this.update({ bytesDone: doneBefore + file.size });
		return 'next';
	}

	private sinkFor(name: string, download: SwDownload | null): SinkDescriptor {
		const save = this.options.save;
		switch (save.kind) {
			case 'file':
				return { kind: 'fsa-file', handle: save.handle };
			case 'directory':
				return { kind: 'fsa-directory', handle: save.handle, name };
			case 'sw-download':
				return { kind: 'sw-download', port: download!.port };
			case 'opfs':
				void navigator.storage.persist?.();
				return { kind: 'opfs', name: `${crypto.randomUUID()}.part` };
			case 'memory':
			case 'discard':
				return { kind: save.kind };
		}
	}

	private async deliver(result: SinkResult, name: string): Promise<FileOutput> {
		switch (result.kind) {
			case 'saved':
				return { kind: this.options.save.kind === 'sw-download' ? 'downloaded' : 'saved' };
			case 'opfs':
				await downloadStagedFile(result.path, name);
				return { kind: 'downloaded' };
			case 'memory':
				return { kind: 'memory', blob: result.blob };
			case 'discarded':
				return { kind: 'discarded', bytes: result.bytes };
		}
	}

	private cancelRemaining(from: number): void {
		for (let i = from; i < this.snapshot.files.length; i++)
			this.updateFile(i, { status: 'cancelled' });
	}

	private request(message: CoordinatorRequest, transfer: Transferable[] = []): void {
		this.coordinator.postMessage(message, transfer);
	}

	private updateFile(index: number, patch: Partial<JobFile>): void {
		const files = this.snapshot.files.slice();
		files[index] = { ...files[index]!, ...patch };
		this.update({ files });
	}

	private update(patch: Partial<JobSnapshot>): void {
		this.snapshot = { ...this.snapshot, ...patch, updatedAt: Date.now() };
		for (const listener of this.listeners) listener();
	}
}

function sourceOf(input: JobInput): Source {
	return 'synthetic' in input
		? { kind: 'synthetic', size: input.size }
		: { kind: 'blob', blob: input };
}
