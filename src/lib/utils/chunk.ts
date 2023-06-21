import { CHUNK_SIZE, IV_BYTE_LENGTH, SALT_BYTE_LENGTH, TAG_LENGTH } from '$lib/constants';
import type { WebWorkerIncomingMessageChunk } from '$lib/types';

export async function* readChunks(file: File, chunkSize: number): AsyncGenerator<ArrayBufferLike> {
	if (chunkSize <= 0) throw new Error('Chunk size must be greater than 0');

	let bytesRead = 0;
	while (bytesRead < file.size) {
		const start = bytesRead;
		const end = Math.min(start + chunkSize, file.size);
		const chunk = file.slice(start, end);
		const buffer = await chunk.arrayBuffer();

		bytesRead += buffer.byteLength;
		yield buffer;
	}
}

export const processChunks = async ({
	file,
	password,
	type,
	worker,
	writerId
}: {
	file: File;
	password: string;
	type: WebWorkerIncomingMessageChunk['type'];
	worker: Worker;
	writerId: string;
}): Promise<void> => {
	let chunkSize = CHUNK_SIZE;
	let isFirstChunk = true;

	if (type === 'decrypt') {
		chunkSize += TAG_LENGTH + SALT_BYTE_LENGTH + IV_BYTE_LENGTH;
	}

	for await (const buffer of readChunks(file, chunkSize)) {
		const isLastChunk = buffer.byteLength < chunkSize;
		const message: WebWorkerIncomingMessageChunk = {
			type,
			transferType: 'chunk',
			chunk: buffer,
			isLastChunk,
			password,
			writerId,
			isFirstChunk
		};
		worker.postMessage(message, [buffer]);
		isFirstChunk = false;
	}
};
