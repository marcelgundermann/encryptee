import { EngineError } from './errors.ts';
import type { ReadRange } from './format/age.ts';

/**
 * Reads byte ranges of a file. A file moved, deleted or changed since it was
 * chosen can't be read, or gives less than it had; either is `read-failed`,
 * since a short read would otherwise pass for the end of the file.
 */
export function readBlob(blob: Blob): ReadRange {
	return async (start, end) => {
		let bytes: ArrayBuffer;

		try {
			bytes = await blob.slice(start, end).arrayBuffer();
		} catch (cause) {
			throw new EngineError('read-failed', 'the file can’t be read', { cause });
		}

		if (bytes.byteLength !== end - start) {
			throw new EngineError(
				'read-failed',
				`read ${bytes.byteLength} bytes of the ${end - start} asked for`
			);
		}

		return bytes;
	};
}
