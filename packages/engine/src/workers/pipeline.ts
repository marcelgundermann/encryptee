import { EngineError, serializeError } from '../errors.ts';
import {
	MAX_HEADER_SIZE,
	PAYLOAD_NONCE_SIZE,
	headerLength,
	sealedPayloadSize,
	sniffBytes
} from '../format/age.ts';
import { openHeader, sealHeader } from '../format/header.ts';
import { derivePayloadKey, type Backend } from '../payload/cipher.ts';
import { batchRange, openLayout, sealLayout, type PayloadLayout } from '../payload/layout.ts';
import { openSink } from '../sinks/open-sink.ts';
import type { ByteSink, SinkResult } from '../sinks/sink.ts';
import type { CryptoPool } from './pool.ts';
import type { CoordinatorEvent, FileTask, Source } from './protocol.ts';

const PROGRESS_INTERVAL_MS = 100;

/** First read when looking for the header; almost every header fits. */
const HEADER_PROBE_SIZE = 64 * 1024;

interface Prepared {
	layout: PayloadLayout;
	payloadKey: Uint8Array<ArrayBuffer>;
	/** Header and payload nonce, written before the payload when sealing. */
	prefix: Uint8Array<ArrayBuffer> | null;
	outputSize: number;
}

/**
 * Runs one file task inside the coordinator: header, then a sliding window of
 * batches through the crypto pool, written to the sink strictly in order.
 * Nothing reaches the sink before the header has been verified.
 */
export async function runFileTask(
	task: FileTask,
	pool: CryptoPool,
	emit: (event: CoordinatorEvent) => void,
	signal: AbortSignal
): Promise<SinkResult> {
	const read = reader(task.source);
	const size = task.source.kind === 'blob' ? task.source.blob.size : task.source.size;
	let sink: ByteSink | null = null;

	try {
		const prepared = await prepare(task, read, size);
		signal.throwIfAborted();
		const backend: Backend = await pool.setKey(prepared.payloadKey, task.backend);
		prepared.payloadKey.fill(0);

		sink = await openSink(task.sink);
		emit({ type: 'opened', id: task.id, outputSize: prepared.outputSize, backend });

		if (prepared.prefix) await untilAborted(sink.write(prepared.prefix), signal);
		await pumpBatches(task, prepared.layout, read, pool, sink, emit, signal);
		signal.throwIfAborted();

		return await sink.close();
	} catch (error) {
		const reason = signal.aborted ? new EngineError('cancelled', 'cancelled') : error;
		await sink?.abort(serializeError(reason));
		throw reason;
	} finally {
		pool.forget();
	}
}

async function prepare(
	task: FileTask,
	read: (start: number, end: number) => Promise<ArrayBuffer>,
	size: number
): Promise<Prepared> {
	const { operation, batchChunks } = task;

	if (operation.mode === 'encrypt') {
		const { header, fileKey } = await sealHeader(operation.credentials);
		const nonce = crypto.getRandomValues(new Uint8Array(PAYLOAD_NONCE_SIZE));
		const prefix = new Uint8Array(header.length + nonce.length);
		prefix.set(header);
		prefix.set(nonce, header.length);
		const payloadKey = derivePayloadKey(fileKey, nonce);
		fileKey.fill(0);

		return {
			layout: sealLayout(size, batchChunks),
			payloadKey,
			prefix,
			outputSize: prefix.length + sealedPayloadSize(size)
		};
	}

	let head = new Uint8Array(await read(0, Math.min(size, HEADER_PROBE_SIZE)));
	const kind = sniffBytes(head);

	if (kind === 'legacy') throw new EngineError('legacy-file', 'this is an Encryptee v1 file');

	if (kind === 'age-armored')
		throw new EngineError('armored', 'armored age files are not supported');

	if (kind !== 'age') throw new EngineError('not-encrypted', 'not an age file');
	let length = headerLength(head);

	if (length === null && size > head.length) {
		head = new Uint8Array(await read(0, Math.min(size, MAX_HEADER_SIZE)));
		length = headerLength(head);
	}

	if (length === null) throw new EngineError('corrupted', 'the header is incomplete');
	const nonceEnd = length + PAYLOAD_NONCE_SIZE;

	if (size < nonceEnd) throw new EngineError('corrupted', 'the file is truncated');

	const fileKey = await openHeader(head.subarray(0, length), operation.credentials);

	const nonce =
		head.length >= nonceEnd
			? head.slice(length, nonceEnd)
			: new Uint8Array(await read(length, nonceEnd));

	const payloadKey = derivePayloadKey(fileKey, nonce);
	fileKey.fill(0);
	const layout = openLayout(nonceEnd, size, batchChunks);

	return { layout, payloadKey, prefix: null, outputSize: layout.outputSize };
}

async function pumpBatches(
	task: FileTask,
	layout: PayloadLayout,
	read: (start: number, end: number) => Promise<ArrayBuffer>,
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
		const range = batchRange(layout, index, task.batchChunks);
		const result = read(range.start, range.end).then((data) => pool.run(mode, range, data));
		result.catch(() => {}); // Observed below; avoid unhandled-rejection noise for later batches.
		inFlight.set(index, result);
	};

	for (let next = 0; next < layout.batches; next++) {
		while (nextToStart < layout.batches && nextToStart < next + task.window) start(nextToStart++);
		const output = await untilAborted(inFlight.get(next)!, signal);
		inFlight.delete(next);
		await untilAborted(sink.write(output), signal);

		const range = batchRange(layout, next, task.batchChunks);
		bytesDone += range.end - range.start;
		const now = performance.now();

		if (now - lastProgress >= PROGRESS_INTERVAL_MS || next === layout.batches - 1) {
			lastProgress = now;
			emit({ type: 'progress', id: task.id, bytes: bytesDone });
		}
	}
}

function reader(source: Source): (start: number, end: number) => Promise<ArrayBuffer> {
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
