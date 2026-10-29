import { defaultTuning, detectCapabilities } from './capabilities.ts';
import { EngineError, serializeError, type SerializedError } from './errors.ts';
import type { DecryptCredentials, EncryptCredentials } from './format/header.ts';
import { acquireJobGuards } from './guards.ts';
import type { Backend } from './payload/cipher.ts';
import {
	openOutput,
	saveError,
	type FileOutput,
	type Output,
	type SaveLocation
} from './sinks/save-location.ts';
import type { SinkResult } from './sinks/sink.ts';
import type {
	CoordinatorEvent,
	CoordinatorRequest,
	CryptoConnect,
	FileTask,
	Source
} from './workers/protocol.ts';

/** A real file, or a size-only stand-in that produces zeros (benchmarks). */
export type JobInput = File | { name: string; size: number; synthetic: true };

export type JobOptions = (
	| { mode: 'encrypt'; credentials: EncryptCredentials }
	| { mode: 'decrypt'; credentials: DecryptCredentials }
) & {
	files: JobInput[];
	save: SaveLocation;
	/** Overrides for benchmarks; defaults come from `defaultTuning`. */
	tuning?: { workers?: number; batchChunks?: number; window?: number; backend?: Backend };
};

export type FileStatus = 'waiting' | 'running' | 'done' | 'failed' | 'cancelled';

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
		} catch (cause) {
			// Only a bug gets here. Fail what was running instead of rejecting `done`.
			this.failUnfinished(serializeError(cause));
		} finally {
			guards.release();
			this.coordinator.terminate();

			for (const worker of this.crypto) worker.terminate();
		}

		const statuses = this.snapshot.files.map((file) => file.status);

		const status: JobStatus = this.cancelled
			? 'cancelled'
			: statuses.every((s) => s === 'done')
				? 'done'
				: 'failed';

		this.update({ status, finishedAt: Date.now() });

		return this.snapshot;
	}

	private async runFile(index: number): Promise<'next' | 'stop'> {
		const input = this.options.files[index]!;
		const file = this.snapshot.files[index]!;
		const id = ++this.currentId;
		this.updateFile(index, { status: 'running' });
		const doneBefore = this.snapshot.bytesDone;
		let output: Output;

		try {
			output = await openOutput(this.options.save, file.outputName);
		} catch (cause) {
			return this.failFile(index, doneBefore, saveError(cause));
		}

		const task: FileTask = {
			id,
			source: sourceOf(input),
			sink: output.sink,
			operation:
				this.options.mode === 'encrypt'
					? { mode: 'encrypt', credentials: this.options.credentials }
					: { mode: 'decrypt', credentials: this.options.credentials },
			batchChunks: this.tuning.batchChunks,
			window: this.tuning.window,
			backend: this.tuning.backend
		};

		/** Set when the output failed while the coordinator was still writing to it. */
		let saveFailure: SerializedError | null = null;

		const result = await new Promise<
			{ ok: true; result: SinkResult } | { ok: false; error: SerializedError }
		>((resolve) => {
			this.coordinator.onmessage = ({ data }: MessageEvent<CoordinatorEvent>) => {
				if (data.id !== id) return;

				switch (data.type) {
					case 'opened':
						this.updateFile(index, { outputSize: data.outputSize });
						this.update({ backend: data.backend });

						try {
							output.opened(data.outputSize);
						} catch (cause) {
							saveFailure = saveError(cause);
							this.request({ type: 'cancel', id });
						}

						break;
					case 'progress':
						this.updateFile(index, { bytesDone: data.bytes });
						this.update({ bytesDone: doneBefore + data.bytes });
						break;
					case 'done':
						resolve(
							saveFailure ? { ok: false, error: saveFailure } : { ok: true, result: data.result }
						);
						break;
					case 'failed':
						resolve({ ok: false, error: saveFailure ?? data.error });
				}
			};

			this.coordinator.onerror = (event) =>
				resolve({
					ok: false,
					error: { code: 'internal', message: event.message || 'worker crashed' }
				});
			this.request({ type: 'run', task }, output.transfer);
		});

		if (!result.ok) {
			output.release();

			return this.failFile(index, doneBefore, result.error);
		}

		let delivered: FileOutput;

		try {
			delivered = await output.finish(result.result);
		} catch (cause) {
			output.release();

			return this.failFile(index, doneBefore, saveError(cause));
		}

		this.updateFile(index, { status: 'done', output: delivered, bytesDone: file.size });
		this.update({ bytesDone: doneBefore + file.size });

		return 'next';
	}

	/** Marks the file failed, or cancelled, and says whether the rest are still worth trying. */
	private failFile(index: number, doneBefore: number, error: SerializedError): 'next' | 'stop' {
		const cancelled = error.code === 'cancelled';

		this.updateFile(index, {
			status: cancelled ? 'cancelled' : 'failed',
			error: cancelled ? null : error
		});
		this.update({ bytesDone: doneBefore + this.snapshot.files[index]!.size });

		return cancelled || !FILE_LOCAL_ERRORS.has(error.code) ? 'stop' : 'next';
	}

	private failUnfinished(error: SerializedError): void {
		for (let i = 0; i < this.snapshot.files.length; i++) {
			const status = this.snapshot.files[i]!.status;

			if (status === 'running') this.updateFile(i, { status: 'failed', error });
			else if (status === 'waiting') this.updateFile(i, { status: 'cancelled' });
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
