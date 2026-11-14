import {
	CHUNK_SIZE,
	SEALED_CHUNK_SIZE,
	openedPayloadSize,
	sealedPayloadSize
} from '../format/age.ts';

/**
 * A batch is a run of consecutive age chunks handled by one crypto worker in
 * one message. `final` marks the batch holding the file's last chunk.
 */
export interface BatchPosition {
	firstChunk: number;
	final: boolean;
}

/** How a payload is cut into batches. Offsets are relative to the input file. */
export interface PayloadLayout {
	batchChunks: number;
	/** Where the payload starts in the input (0 when sealing). */
	inputOffset: number;
	inputSize: number;
	outputSize: number;
	/** Input bytes per (non-final) batch. */
	batchInputSize: number;
	batches: number;
}

interface BatchRange extends BatchPosition {
	start: number;
	end: number;
}

export function sealLayout(plaintextSize: number, batchChunks: number): PayloadLayout {
	const batchInputSize = batchChunks * CHUNK_SIZE;

	return {
		batchChunks,
		inputOffset: 0,
		inputSize: plaintextSize,
		outputSize: sealedPayloadSize(plaintextSize),
		batchInputSize,
		batches: Math.max(1, Math.ceil(plaintextSize / batchInputSize))
	};
}

/** Layout for opening the payload that spans `[payloadOffset, fileSize)`. Throws `corrupted` on impossible sizes. */
export function openLayout(
	payloadOffset: number,
	fileSize: number,
	batchChunks: number
): PayloadLayout {
	const sealedSize = fileSize - payloadOffset;
	const batchInputSize = batchChunks * SEALED_CHUNK_SIZE;

	return {
		batchChunks,
		inputOffset: payloadOffset,
		inputSize: sealedSize,
		outputSize: openedPayloadSize(sealedSize),
		batchInputSize,
		batches: Math.max(1, Math.ceil(sealedSize / batchInputSize))
	};
}

export function batchRange(layout: PayloadLayout, index: number): BatchRange {
	const start = layout.inputOffset + index * layout.batchInputSize;

	return {
		start,
		end: Math.min(start + layout.batchInputSize, layout.inputOffset + layout.inputSize),
		firstChunk: index * layout.batchChunks,
		final: index === layout.batches - 1
	};
}
