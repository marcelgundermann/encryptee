import { EngineError, serializeError } from '../errors.ts';
import { openBatch, sealBatch } from '../payload/batch.ts';
import { createChunkCipher, type ChunkCipher } from '../payload/cipher.ts';
import type { CryptoConnect, CryptoRequest, CryptoResponse } from './protocol.ts';

declare const self: DedicatedWorkerGlobalScope;

let cipher: ChunkCipher | null = null;

self.onmessage = ({ data }: MessageEvent<CryptoConnect>) => {
	if (data.type !== 'connect') return;
	const port = data.port;

	const reply = (message: CryptoResponse, transfer: Transferable[] = []) =>
		port.postMessage(message, transfer);

	port.onmessage = async ({ data: request }: MessageEvent<CryptoRequest>) => {
		switch (request.type) {
			case 'key':
				try {
					cipher = await createChunkCipher(request.key, request.backend);
					request.key.fill(0);
					reply({ type: 'ready', backend: cipher.backend });
				} catch (error) {
					reply({ type: 'error', task: null, error: serializeError(error) });
				}

				return;
			case 'forget':
				cipher = null;

				return;
			case 'seal':
			case 'open':
				try {
					if (!cipher) throw new EngineError('internal', 'no payload key');
					const run = request.type === 'seal' ? sealBatch : openBatch;
					const out = await run(cipher, new Uint8Array(request.data), request);
					reply({ type: 'result', task: request.task, data: out.buffer }, [out.buffer]);
				} catch (error) {
					reply({ type: 'error', task: request.task, error: serializeError(error) });
				}
		}
	};

	port.start();
};
