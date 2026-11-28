import type { JobFile } from '@encryptee/engine';

const keys = new WeakMap<File | JobFile, number>();
let lastKey = 0;

/**
 * The key of a file's row in a list, which stays with the file itself: a
 * name can repeat in a selection, and a file's place changes when a list is
 * sorted.
 */
export function rowKey(file: File | JobFile): number {
	const known = keys.get(file);

	if (known !== undefined) return known;
	lastKey += 1;
	keys.set(file, lastKey);

	return lastKey;
}
