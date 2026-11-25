import { EngineError, serializeError } from '../errors.ts';
import { PAYLOAD_NONCE_SIZE, REFUSALS, readHeader } from '../format/age.ts';
import { openHeader, sealHeader } from '../format/header.ts';
import { derivePayloadKey } from '../payload/cipher.ts';
import { openLayout, sealLayout } from '../payload/layout.ts';
import type { HeaderRequest, HeaderResponse, Prepared, Source, TaskOperation } from './protocol.ts';
import { reader } from './source.ts';

/**
 * Seals and opens the coordinator's headers, one at a time, in the order it
 * asks. scrypt blocks only this worker, so the coordinator goes on writing the
 * files before. How many of these run, and so how many times scrypt's 256 MiB
 * are there at once, is the job's tuning.
 */
export function serveHeaders(port: MessagePort): void {
	let previous = Promise.resolve();

	port.onmessage = ({ data: request }: MessageEvent<HeaderRequest>) => {
		previous = previous.then(() => answer(port, request));
	};

	port.start();
}

async function answer(port: MessagePort, request: HeaderRequest): Promise<void> {
	let response: HeaderResponse;
	let transfer: Transferable[] = [];

	try {
		const prepared = await prepare(request.operation, request.source, request.batchChunks);
		response = { type: 'prepared', request: request.request, prepared };
		// Transferred, so the payload key leaves this worker.
		transfer = [prepared.payloadKey.buffer, ...(prepared.prefix ? [prepared.prefix.buffer] : [])];
	} catch (error) {
		response = { type: 'failed', request: request.request, error: serializeError(error) };
	}

	port.postMessage(response, transfer);
}

/** Seals a new header, or opens the file's header with its credentials. */
async function prepare(
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
