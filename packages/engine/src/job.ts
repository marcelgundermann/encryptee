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
import { openOutput, saveError, type SaveLocation } from './sinks/save-location.ts';
import { checksFirst, type FileOutput, type Output, type SinkResult } from './sinks/sink.ts';
import {
	fileDone,
	fileFailed,
	fileOpened,
	fileProgress,
	fileStarted,
	jobEnded,
	startSnapshot,
	type JobSnapshot
} from './snapshot.ts';
import type {
	CoordinatorEvent,
	CoordinatorInit,
	CoordinatorRequest,
	FileTask,
	Source,
	TaskOperation,
	Tuning,
	WorkerConnect
} from './workers/protocol.ts';

/** A real file, or a size-only stand-in that produces zeros (benchmarks). */
export type JobInput = File | { name: string; size: number; synthetic: true };

export type JobOptions = TaskOperation & {
	files: JobInput[];
	save: SaveLocation;
	/** Overrides for benchmarks and tests. */
	tuning?: Partial<Tuning>;
};

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
 * header's error: `wrong-credentials`, `not-encrypted`, `armored`, … or,
 * once `signal` aborts, at once with `cancelled`: the workers stop, scrypt and all.
 */
export async function checkCredentials(options: {
	files: JobInput[];
	credentials: DecryptCredentials;
	signal?: AbortSignal;
	tuning?: Partial<Tuning>;
}): Promise<CheckedCredentials> {
	const { files, credentials, signal } = options;
	const [first] = files;

	if (!first) throw new EngineError('internal', 'nothing to check');

	if (signal?.aborted) throw new EngineError('cancelled', 'cancelled');
	const workers = spawnWorkers(jobTuning(options.tuning));
	const stop = () => workers.terminate();
	signal?.addEventListener('abort', stop, { once: true });

	try {
		await workers.check(0, sourceOf(first), credentials);

		// An abort that came with the answer.
		if (signal?.aborted) throw new EngineError('cancelled', 'cancelled');
	} catch (error) {
		workers.terminate();
		throw error;
	} finally {
		// From here the workers belong to the job the check starts, which an abort mustn't stop.
		signal?.removeEventListener('abort', stop);
	}

	let state: 'checked' | 'started' | 'discarded' = 'checked';

	return {
		startJob(save) {
			if (state === 'started') throw new EngineError('internal', 'a check starts one job');

			if (state === 'discarded')
				throw new EngineError('internal', 'a discarded check starts no job');
			assertSaveFits(save, files.length);
			state = 'started';

			return new RunningJob({ mode: 'decrypt', credentials, files, save }, workers);
		},
		discard() {
			if (state !== 'checked') return;
			state = 'discarded';
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

/** One job's workers: a coordinator wired to its header worker and its pool of crypto workers. */
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

/** Where a job's one request to its coordinator stands. */
type RequestSlot =
	| { status: 'idle' }
	| { status: 'waiting'; reject: (error: EngineError) => void }
	| { status: 'failed'; error: EngineError }
	| { status: 'terminated' };

function spawnWorkers(tuning: Tuning): JobWorkers {
	const coordinator = new Worker(new URL('./workers/coordinator.worker.ts', import.meta.url), {
		type: 'module',
		name: 'encryptee-coordinator'
	});

	/**
	 * The coordinator answers one request at a time. A worker that fails, e.g.
	 * to load, fails the request waiting and every later one; `terminate` fails
	 * the one waiting as cancelled. Only `reject` is kept: a closure made with
	 * the request would hold its credentials.
	 */
	let slot: RequestSlot = { status: 'idle' };

	/** Moves the slot to `next`, rejecting the request that waited with `error`. */
	const settle = (next: RequestSlot, error: EngineError) => {
		const previous = slot;
		slot = next;

		if (previous.status === 'waiting') previous.reject(error);
	};

	const onError = (event: ErrorEvent) => {
		if (slot.status === 'failed' || slot.status === 'terminated') return;
		const error = new EngineError('internal', event.message || 'a worker failed');
		settle({ status: 'failed', error }, error);
	};

	coordinator.onerror = onError;

	/** Wires a worker that serves the coordinator, and returns the coordinator's port to it. */
	const connect = (worker: Worker): MessagePort => {
		worker.onerror = onError;
		const channel = new MessageChannel();
		worker.postMessage({ type: 'connect', port: channel.port1 } satisfies WorkerConnect, [
			channel.port1
		]);

		return channel.port2;
	};

	// scrypt runs here, so it never holds up the coordinator, and a cancel never waits for it.
	const header = new Worker(new URL('./workers/header.worker.ts', import.meta.url), {
		type: 'module',
		name: 'encryptee-header'
	});

	const crypto = Array.from(
		{ length: tuning.workers },
		() =>
			new Worker(new URL('./workers/crypto.worker.ts', import.meta.url), {
				type: 'module',
				name: 'encryptee-crypto'
			})
	);

	const init: CoordinatorInit = {
		type: 'init',
		pool: crypto.map(connect),
		header: connect(header),
		tuning
	};

	coordinator.postMessage(init, [...init.pool, init.header]);

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
			switch (slot.status) {
				case 'failed':
					reject(slot.error);

					return;
				case 'terminated':
					reject(new EngineError('cancelled', 'the job’s workers were stopped'));

					return;
				case 'waiting':
					reject(new EngineError('internal', 'a request while another waits'));

					return;
				case 'idle':
					slot = { status: 'waiting', reject };
			}

			coordinator.onmessage = ({ data }: MessageEvent<CoordinatorEvent>) => {
				if (data.id !== id) return;

				if (data.type === 'failed') {
					slot = { status: 'idle' };
					reject(deserializeError(data.error));
				} else {
					onEvent(data, (value) => {
						slot = { status: 'idle' };
						resolve(value);
					});
				}
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
			header.terminate();

			for (const worker of crypto) worker.terminate();
			settle({ status: 'terminated' }, new EngineError('cancelled', 'cancelled'));
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
		this.snapshot = startSnapshot(
			options.mode,
			options.files.map(({ name, size }) => ({
				name,
				size,
				outputName: outputName(options.mode, name)
			})),
			Date.now(),
			checksFirst(options.mode, options.save.kind)
		);

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

		this.set(jobEnded(this.snapshot, crash, this.cancelled));

		return this.snapshot;
	}

	private async runFile(options: JobOptions, index: number): Promise<'next' | 'stop'> {
		const input = options.files[index]!;
		const file = this.snapshot.files[index]!;
		this.current = index;
		this.set(fileStarted(this.snapshot, index));
		let output: Output;

		try {
			output = await openOutput(options.save, file.outputName);
		} catch (cause) {
			return this.failFile(index, saveError(cause));
		}

		/** Set when the output failed while the coordinator was still writing to it. */
		let saveFailure: SerializedError | null = null;

		const fail = (error: SerializedError) => {
			output.release();

			return this.failFile(index, saveFailure ?? error);
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
					this.set(fileProgress(this.snapshot, index, event.bytes));
				} else if (event.type === 'opened') {
					this.set(fileOpened(this.snapshot, index, event.outputSize, event.backend));

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

		this.set(fileDone(this.snapshot, index, delivered));

		return 'next';
	}

	/** Marks the file failed, or cancelled, and says whether the rest are still worth trying. */
	private failFile(index: number, error: SerializedError): 'next' | 'stop' {
		const cancelled = error.code === 'cancelled';
		// The user's Cancel, or the browser's cancel of a streamed download.
		this.cancelled ||= cancelled;
		this.set(fileFailed(this.snapshot, index, error));

		return cancelled || !FILE_LOCAL_ERRORS.has(error.code) ? 'stop' : 'next';
	}

	private set(snapshot: JobSnapshot): void {
		this.snapshot = { ...snapshot, updatedAt: Date.now() };

		for (const listener of this.listeners) listener();
	}
}

function sourceOf(input: JobInput): Source {
	return 'synthetic' in input
		? { kind: 'synthetic', size: input.size }
		: { kind: 'blob', blob: input };
}
