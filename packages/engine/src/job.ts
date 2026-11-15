import { detectCapabilities } from './capabilities.ts';
import {
	EngineError,
	deserializeError,
	serializeError,
	type EngineErrorCode,
	type SerializedError
} from './errors.ts';
import type { DecryptCredentials } from './format/header.ts';
import { outputName } from './format/names.ts';
import { acquireJobGuards } from './guards.ts';
import type { Backend } from './payload/cipher.ts';
import { openOutput, saveError, type SaveLocation } from './sinks/save-location.ts';
import type { FileOutput, Output, SinkResult } from './sinks/sink.ts';
import type {
	CoordinatorEvent,
	CoordinatorInit,
	CoordinatorRequest,
	CryptoConnect,
	FileTask,
	Source,
	TaskOperation,
	Tuning
} from './workers/protocol.ts';

/** A real file, or a size-only stand-in that produces zeros (benchmarks). */
export type JobInput = File | { name: string; size: number; synthetic: true };

export type JobOptions = TaskOperation & {
	files: JobInput[];
	save: SaveLocation;
	/** Overrides for benchmarks and tests. */
	tuning?: Partial<Tuning>;
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
const FILE_LOCAL_ERRORS = new Set<EngineErrorCode>([
	'wrong-credentials',
	'not-encrypted',
	'legacy-file',
	'armored',
	'corrupted'
]);

/** Starts an encrypt or decrypt job over `files`. One input file → one output file. */
export function startJob(options: JobOptions): Job {
	assertSaveFits(options.save, options.files.length);

	return new RunningJob(options, spawnWorkers(jobTuning(options.tuning)));
}

/** A decrypt job whose first header opened, waiting for its save location. */
export interface CheckedCredentials {
	/** Starts the job; the first file's header isn't opened again. Once only. */
	startJob(save: SaveLocation): Job;
	/** Stops the job's workers when no job follows. Does nothing once `startJob` ran. */
	discard(): void;
}

/**
 * Opens the first file's header with `credentials` in a new decrypt job's
 * workers, so wrong credentials fail before the user picks where to save, and
 * the job doesn't run scrypt for that header a second time. Rejects with the
 * header's error: `wrong-credentials`, `not-encrypted`, `legacy-file`, …
 */
export async function checkCredentials(options: {
	files: JobInput[];
	credentials: DecryptCredentials;
	tuning?: Partial<Tuning>;
}): Promise<CheckedCredentials> {
	const { files, credentials } = options;
	const [first] = files;

	if (!first) throw new EngineError('internal', 'nothing to check');
	const workers = spawnWorkers(jobTuning(options.tuning));

	try {
		await workers.check(0, sourceOf(first), credentials);
	} catch (error) {
		workers.terminate();
		throw error;
	}

	let taken = false;

	return {
		startJob(save) {
			if (taken) throw new EngineError('internal', 'a check starts one job');
			assertSaveFits(save, files.length);
			taken = true;

			return new RunningJob({ mode: 'decrypt', credentials, files, save }, workers);
		},
		discard() {
			if (taken) return;
			taken = true;
			workers.terminate();
		}
	};
}

function assertSaveFits(save: SaveLocation, fileCount: number): void {
	if (save.kind === 'file' && fileCount !== 1) {
		throw new EngineError('internal', 'a single save file needs exactly one input file');
	}
}

function jobTuning(overrides: Partial<Tuning> = {}): Tuning {
	const { cores, mobile } = detectCapabilities();
	const workers = overrides.workers ?? Math.min(8, Math.max(1, cores - 1));

	return { workers, batchChunks: mobile ? 16 : 64, window: 2 * workers, ...overrides };
}

/** One job's workers: a coordinator wired to its pool of crypto workers. */
interface JobWorkers {
	/** Opens file `index`'s header, which its `run` then doesn't open again. */
	check(index: number, source: Source, credentials: DecryptCredentials): Promise<void>;
	/** Runs `task`, handing its events to `onEvent`; rejects with the file's failure. */
	run(
		task: FileTask,
		transfer: Transferable[],
		onEvent: (event: CoordinatorEvent) => void
	): Promise<SinkResult>;
	cancel(index: number): void;
	terminate(): void;
}

function spawnWorkers(tuning: Tuning): JobWorkers {
	const coordinator = new Worker(new URL('./workers/coordinator.worker.ts', import.meta.url), {
		type: 'module',
		name: 'encryptee-coordinator'
	});

	/** Set once a worker failed, e.g. to load: the request waiting, and every later one, fail with it. */
	let failure: EngineError | null = null;
	let rejectWaiting: ((error: EngineError) => void) | null = null;

	const onError = (event: ErrorEvent) => {
		failure ??= new EngineError('internal', event.message || 'a worker failed');
		rejectWaiting?.(failure);
	};

	coordinator.onerror = onError;
	const crypto: Worker[] = [];
	const ports: MessagePort[] = [];

	for (let i = 0; i < tuning.workers; i++) {
		const worker = new Worker(new URL('./workers/crypto.worker.ts', import.meta.url), {
			type: 'module',
			name: 'encryptee-crypto'
		});

		worker.onerror = onError;
		const channel = new MessageChannel();
		worker.postMessage({ type: 'connect', port: channel.port1 } satisfies CryptoConnect, [
			channel.port1
		]);
		ports.push(channel.port2);
		crypto.push(worker);
	}

	coordinator.postMessage({ type: 'init', pool: ports, tuning } satisfies CoordinatorInit, ports);

	/**
	 * Posts `request` about file `id` and hands that file's events to `onEvent`,
	 * which resolves; the file's failure, or a failed worker, rejects.
	 */
	const send = <T>(
		request: CoordinatorRequest,
		transfer: Transferable[],
		id: number,
		onEvent: (event: CoordinatorEvent, resolve: (value: T) => void) => void
	) =>
		new Promise<T>((resolve, reject) => {
			if (failure) {
				reject(failure);

				return;
			}

			rejectWaiting = reject;

			coordinator.onmessage = ({ data }: MessageEvent<CoordinatorEvent>) => {
				if (data.id !== id) return;

				if (data.type === 'failed') reject(deserializeError(data.error));
				else onEvent(data, resolve);
			};

			coordinator.postMessage(request, transfer);
		});

	return {
		check: (index, source, credentials) =>
			send<void>({ type: 'check', id: index, source, credentials }, [], index, (event, resolve) => {
				if (event.type === 'checked') resolve();
			}),
		run: (task, transfer, onEvent) =>
			send<SinkResult>({ type: 'run', task }, transfer, task.id, (event, resolve) => {
				if (event.type === 'done') resolve(event.result);
				else onEvent(event);
			}),
		cancel: (index) =>
			coordinator.postMessage({ type: 'cancel', id: index } satisfies CoordinatorRequest),
		terminate() {
			// The last request's handler shares a scope with that request, credentials and all.
			coordinator.onmessage = null;
			coordinator.terminate();

			for (const worker of crypto) worker.terminate();
		}
	};
}

class RunningJob implements Job {
	readonly done: Promise<JobSnapshot>;
	private snapshot: JobSnapshot;
	private readonly listeners = new Set<() => void>();
	private cancelled = false;
	/** The index of the file that runs, or ran last. */
	private current = -1;

	constructor(
		options: JobOptions,
		private readonly workers: JobWorkers
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
			backend: null
		};

		// Only `run` holds the files and credentials, so they go when the job ends.
		this.done = this.run(options);
	}

	getSnapshot = (): JobSnapshot => this.snapshot;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);

		return () => this.listeners.delete(listener);
	};

	cancel = (): void => {
		if (this.snapshot.status !== 'running') return;
		this.cancelled = true;
		this.workers.cancel(this.current);
	};

	private async run(options: JobOptions): Promise<JobSnapshot> {
		const guards = await acquireJobGuards();
		let crash: SerializedError | null = null;

		try {
			for (let index = 0; index < options.files.length && !this.cancelled; index++) {
				if ((await this.runFile(options, index)) === 'stop') break;
			}
		} catch (cause) {
			crash = serializeError(cause);
		} finally {
			guards.release();
			this.workers.terminate();
		}

		// What the loop didn't finish: a file a crash interrupted fails with it,
		// and the files it never started are cancelled.
		const files = this.snapshot.files.map((file): JobFile => {
			if (file.status === 'running') return { ...file, status: 'failed', error: crash };

			return file.status === 'waiting' ? { ...file, status: 'cancelled' } : file;
		});

		const status: JobStatus = files.every((file) => file.status === 'done')
			? 'done'
			: this.cancelled
				? 'cancelled'
				: 'failed';

		this.update({ files, status });

		return this.snapshot;
	}

	private async runFile(options: JobOptions, index: number): Promise<'next' | 'stop'> {
		const input = options.files[index]!;
		const file = this.snapshot.files[index]!;
		this.current = index;
		this.updateFile(index, { status: 'running' });
		const doneBefore = this.snapshot.bytesDone;
		let output: Output;

		try {
			output = await openOutput(options.save, file.outputName);
		} catch (cause) {
			return this.failFile(index, doneBefore, saveError(cause));
		}

		/** Set when the output failed while the coordinator was still writing to it. */
		let saveFailure: SerializedError | null = null;

		const fail = (error: SerializedError) => {
			output.release();

			return this.failFile(index, doneBefore, saveFailure ?? error);
		};

		// A cancel before the coordinator has the file never reaches it.
		if (this.cancelled) return fail({ code: 'cancelled', message: 'cancelled' });

		const task: FileTask = {
			id: index,
			source: sourceOf(input),
			sink: output.sink,
			operation:
				options.mode === 'encrypt'
					? { mode: 'encrypt', credentials: options.credentials }
					: { mode: 'decrypt', credentials: options.credentials }
		};

		let result: SinkResult;

		try {
			result = await this.workers.run(task, output.transfer, (event) => {
				if (event.type === 'progress') {
					this.updateFile(index, { bytesDone: event.bytes });
					this.update({ bytesDone: doneBefore + event.bytes });
				} else if (event.type === 'opened') {
					this.updateFile(index, { outputSize: event.outputSize });
					this.update({ backend: event.backend });

					try {
						output.opened(event.outputSize);
					} catch (cause) {
						saveFailure = saveError(cause);
						this.workers.cancel(index);
					}
				}
			});
		} catch (cause) {
			return fail(serializeError(cause));
		}

		if (saveFailure) return fail(saveFailure);
		let delivered: FileOutput;

		try {
			delivered = await output.finish(result);
		} catch (cause) {
			return fail(saveError(cause));
		}

		this.updateFile(index, { status: 'done', output: delivered, bytesDone: file.size });
		this.update({ bytesDone: doneBefore + file.size });

		return 'next';
	}

	/** Marks the file failed, or cancelled, and says whether the rest are still worth trying. */
	private failFile(index: number, doneBefore: number, error: SerializedError): 'next' | 'stop' {
		const cancelled = error.code === 'cancelled';
		// The user's Cancel, or the browser's cancel of a streamed download.
		this.cancelled ||= cancelled;

		this.updateFile(index, {
			status: cancelled ? 'cancelled' : 'failed',
			error: cancelled ? null : error
		});
		this.update({ bytesDone: doneBefore + this.snapshot.files[index]!.size });

		return cancelled || !FILE_LOCAL_ERRORS.has(error.code) ? 'stop' : 'next';
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
