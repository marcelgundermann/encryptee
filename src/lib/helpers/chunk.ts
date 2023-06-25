import { CHUNK_SIZE, IV_BYTE_LENGTH, SALT_BYTE_LENGTH, SIGNATURE_BYTE_LENGTH, TAG_LENGTH } from '$lib/constants';
import type { WebWorkerIncomingMessageChunk, ChunkData } from '$lib/types';

async function* readChunks(
	file: File,
	chunkSize: number,
	type: WebWorkerIncomingMessageChunk['type']
): AsyncGenerator<ChunkData> {
	if (chunkSize <= 0) throw new Error('Chunk size must be greater than 0');

	let isFirstChunk = true;
	let bytesRead = 0;
	let adjustment = 0;

	if (isFirstChunk && type === 'decrypt') {
		adjustment = SIGNATURE_BYTE_LENGTH;
	}

	while (bytesRead < file.size) {
		const start = bytesRead;
		const end = Math.min(start + chunkSize + adjustment, file.size);
		const chunk = file.slice(start, end);
		const buffer = await chunk.arrayBuffer();

		bytesRead += buffer.byteLength;
		const isLastChunk = bytesRead >= file.size;
		yield { buffer, isFirstChunk, isLastChunk };

		isFirstChunk = false;
		adjustment = 0;
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

	if (type === 'decrypt') {
		chunkSize += TAG_LENGTH + SALT_BYTE_LENGTH + IV_BYTE_LENGTH;
	}

	for await (const { buffer, isFirstChunk, isLastChunk } of readChunks(file, chunkSize, type)) {
		const message: WebWorkerIncomingMessageChunk = {
			type,
			chunk: buffer,
			isLastChunk,
			password,
			writerId,
			isFirstChunk
		};
		worker.postMessage(message, [buffer]);
	}
};
