import { expect, test } from 'vitest';
import { droppedFiles } from './dropped.ts';

const file = new File(['hello'], 'a.txt');

/** A folder as a drop carries it: a File that reads as empty, or not at all. */
const folder = new File([], 'photos');

const item = (isDirectory: boolean) => ({ webkitGetAsEntry: () => ({ isDirectory }) });

test('dropped files hold no folder', () => {
	expect(droppedFiles({ files: [file], items: [item(false)] })).toEqual({
		files: [file],
		folder: false
	});
});

test('a folder among dropped files is noticed, whatever its size', () => {
	const transfer = { files: [file, folder], items: [item(false), item(true)] };

	expect(droppedFiles(transfer)).toEqual({ files: [file, folder], folder: true });
});

test('an item without an entry, like a file added by a script, is a file', () => {
	const transfer = { files: [file], items: [{ webkitGetAsEntry: () => null }] };

	expect(droppedFiles(transfer).folder).toBe(false);
});
