import { serializeError } from '../errors.ts';
import type { ReadRange } from '../format/age.ts';
import { batchRange, type PayloadLayout } from '../payload/layout.ts';
import { openSink } from '../sinks/open-sink.ts';
import type { ByteSink, SinkResult } from '../sinks/sink.ts';
import type { CryptoPool } from './pool.ts';
import type { CoordinatorEvent, FileTask, Prepared, Tuning } from './protocol.ts';
import { reader } from './source.ts';

const PROGRESS_INTERVAL_MS = 100;

/**
 * Runs one file task inside the coordinator: header, then a sliding window of
 * batches through the crypto pool, written to the sink strictly in order.
 * Nothing reaches the sink before the header has been verified. `preparation`
 * is the header a `check` already opened, or the one the header worker prepares.
 */
export async function runFileTask(
	task: FileTask,
	preparation: Prepared | Promise<Prepared>,
	pool: CryptoPool,
	tuning: Tuning,
	emit: (event: CoordinatorEvent) => void,
	signal: AbortSignal
): Promise<SinkResult> {
	const read = reader(task.source);
	let sink: ByteSink | null = null;

	try {
		// scrypt runs in the header worker, so a cancel needn't wait for it.
		const prepared = await untilAborted(Promise.resolve(preparation), signal);
		const backend = await pool.setKey(prepared.payloadKey, tuning.backend);
		prepared.payloadKey.fill(0);
		// A cancel that came while the workers took the key.
		signal.throwIfAborted();

		sink = await openSink(task.sink);
		emit({ type: 'opened', id: task.id, outputSize: prepared.outputSize, backend });

		if (prepared.prefix) await untilAborted(sink.write(prepared.prefix), signal);
		await pumpBatches(task, prepared.layout, tuning.window, read, pool, sink, emit, signal);
		signal.throwIfAborted();

		return await sink.close();
	} catch (error) {
		const reason: unknown = signal.aborted ? signal.reason : error;
		await sink?.abort(serializeError(reason));
		throw reason;
	} finally {
		pool.forget();
	}
}

async function pumpBatches(
	task: FileTask,
	layout: PayloadLayout,
	window: number,
	read: ReadRange,
	pool: CryptoPool,
	sink: ByteSink,
	emit: (event: CoordinatorEvent) => void,
	signal: AbortSignal
): Promise<void> {
	const mode = task.operation.mode === 'encrypt' ? 'seal' : 'open';
	const inFlight = new Map<number, Promise<Uint8Array<ArrayBuffer>>>();
	let nextToStart = 0;
	let bytesDone = 0;
	let lastProgress = 0;

	const start = (index: number) => {
		const range = batchRange(layout, index);
		const result = read(range.start, range.end).then((data) => pool.run(mode, range, data));
		result.catch(() => {}); // Observed below; avoid unhandled-rejection noise for later batches.
		inFlight.set(index, result);
	};

	for (let next = 0; next < layout.batches; next++) {
		while (nextToStart < layout.batches && nextToStart < next + window) start(nextToStart++);
		const output = await untilAborted(inFlight.get(next)!, signal);
		inFlight.delete(next);
		await untilAborted(sink.write(output), signal);

		const range = batchRange(layout, next);
		bytesDone += range.end - range.start;
		const now = performance.now();

		if (now - lastProgress >= PROGRESS_INTERVAL_MS || next === layout.batches - 1) {
			lastProgress = now;
			emit({ type: 'progress', id: task.id, bytes: bytesDone });
		}
	}
}

function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
	if (signal.aborted) return Promise.reject(signal.reason);

	return new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(signal.reason);
		signal.addEventListener('abort', onAbort, { once: true });
		promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
	});
}
