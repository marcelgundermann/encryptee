import { inspectFile, type FileInfo } from '@encryptee/engine';
import { errorMessage, strings } from '../strings.ts';

/** What the dropped files are, decided by their headers, never their names. */
export type Selection =
	| { kind: 'none' }
	| { kind: 'encrypt'; files: File[] }
	| { kind: 'decrypt'; files: File[]; unlock: 'passphrase' | 'private-key' }
	| { kind: 'invalid'; files: File[]; message: string };

export async function classify(files: File[]): Promise<Selection> {
	if (files.length === 0) return { kind: 'none' };
	const invalid = (message: string): Selection => ({ kind: 'invalid', files, message });
	let infos: FileInfo[];

	try {
		infos = await Promise.all(files.map(inspectFile));
	} catch (cause) {
		return invalid(errorMessage(cause));
	}

	const unusable = new Set(infos.map((info) => (info.kind === 'unusable' ? info.reason : null)));

	for (const reason of ['legacy-file', 'armored'] satisfies Array<'legacy-file' | 'armored'>) {
		if (unusable.has(reason)) return invalid(strings.errors[reason]);
	}

	const encrypted = infos.filter((info) => info.kind === 'encrypted');

	if (encrypted.length === 0) return { kind: 'encrypt', files };

	if (encrypted.length !== files.length) return invalid(strings.selection.mixed);
	const locks = new Set(encrypted.map((info) => info.unlock));

	if (locks.size > 1) return invalid(strings.selection.mixedLocks);

	return { kind: 'decrypt', files, unlock: [...locks][0]! };
}
