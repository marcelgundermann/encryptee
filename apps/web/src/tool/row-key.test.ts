import { expect, test } from 'vitest';
import { rowKey } from './row-key.ts';

test('two files with the same name get different row keys', () => {
	const first = new File(['one'], 'photo.jpg');
	const second = new File(['two'], 'photo.jpg');

	expect(rowKey(first)).not.toBe(rowKey(second));
});

test('a file keeps its row key when its list is sorted', () => {
	const files = [new File(['b'], 'b.txt'), new File(['a'], 'a.txt')];
	const before = files.map(rowKey);
	const sorted = files.toSorted((x, y) => x.name.localeCompare(y.name));

	expect(sorted.map(rowKey)).toEqual(before.toReversed());
});
