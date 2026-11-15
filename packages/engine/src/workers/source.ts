import type { ReadRange } from '../format/age.ts';
import type { Source } from './protocol.ts';

/** Reads byte ranges of a file task's input; a synthetic input reads zeros without I/O. */
export function reader(source: Source): ReadRange {
	if (source.kind === 'blob') return (start, end) => source.blob.slice(start, end).arrayBuffer();

	return async (start, end) => new ArrayBuffer(end - start);
}
