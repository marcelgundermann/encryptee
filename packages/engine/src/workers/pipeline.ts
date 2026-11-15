import { EngineError, serializeError } from '../errors.ts';
import { PAYLOAD_NONCE_SIZE, REFUSALS, readHeader, type ReadRange } from '../format/age.ts';
import { openHeader, sealHeader } from '../format/header.ts';
import { derivePayloadKey } from '../payload/cipher.ts';
import { batchRange, openLayout, sealLayout, type PayloadLayout } from '../payload/layout.ts';
import { openSink } from '../sinks/open-sink.ts';
import type { ByteSink, SinkResult } from '../sinks/sink.ts';
import type { CryptoPool } from './pool.ts';
import type { CoordinatorEvent, FileTask, Source, TaskOperation, Tuning } from './protocol.ts';

const PROGRESS_INTERVAL_MS = 100;

/** What a file needs before its payload: the layout, the payload key and, when sealing, the header. */
export interface Prepared {
	layout: PayloadLayout;
	payloadKey: Uint8Array<ArrayBuffer>;
	/** Header and payload nonce, written before the payload when sealing. */
	prefix: Uint8Array<ArrayBuffer> | null;
	outputSize: number;
}

/**
 * Runs one file task inside the coordinator: header, then a sliding window of
 * batches through the crypto pool, written to the sink strictly in order.
 * Nothing reaches the sink before the header has been verified. `preparation`
 * is the header a `check` already opened, or the one being prepared.
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
		const prepared = await preparation;
		signal.throwIfAborted();
		const backend = await pool.setKey(prepared.payloadKey, tuning.backend);
		prepared.payloadKey.fill(0);
		// A cancel sent while scrypt ran is only read while the workers take the key.
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

/** Seals a new header, or opens the file's header with its credentials. */
export async function prepare(
	operation: TaskOperation,
	source: Source,
	batchChunks: number
): Promise<Prepared> {
	const read = reader(source);
	const size = source.kind === 'blob' ? source.blob.size : source.size;

	if (operation.mode === 'encrypt') {
		const { header, fileKey } = await sealHeader(operation.credentials);
		const nonce = crypto.getRandomValues(new Uint8Array(PAYLOAD_NONCE_SIZE));
		const prefix = new Uint8Array(header.length + nonce.length);
		prefix.set(header);
		prefix.set(nonce, header.length);
		const payloadKey = derivePayloadKey(fileKey, nonce);
		fileKey.fill(0);

		const layout = sealLayout(size, batchChunks);

		return { layout, payloadKey, prefix, outputSize: prefix.length + layout.outputSize };
	}

	const { kind, header } = await readHeader(read, size);

	if (kind !== 'age') throw new EngineError(REFUSALS[kind], `not an age file: ${kind}`);

	if (!header) throw new EngineError('corrupted', 'the header is incomplete');
	const nonceEnd = header.length + PAYLOAD_NONCE_SIZE;

	if (size < nonceEnd) throw new EngineError('corrupted', 'the file is truncated');

	const fileKey = await openHeader(header, operation.credentials);
	const nonce = new Uint8Array(await read(header.length, nonceEnd));
	const payloadKey = derivePayloadKey(fileKey, nonce);
	fileKey.fill(0);
	const layout = openLayout(nonceEnd, size, batchChunks);

	return { layout, payloadKey, prefix: null, outputSize: layout.outputSize };
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

function reader(source: Source): ReadRange {
	if (source.kind === 'blob') return (start, end) => source.blob.slice(start, end).arrayBuffer();

	return async (start, end) => new ArrayBuffer(end - start);
}

function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
	if (signal.aborted) return Promise.reject(signal.reason);

	return new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(signal.reason);
		signal.addEventListener('abort', onAbort, { once: true });
		promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
	});
}
