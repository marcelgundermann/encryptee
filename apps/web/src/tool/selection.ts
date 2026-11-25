import { inspectFile, type FileInfo } from '@encryptee/engine';
import { errorMessage, strings } from '#/strings.ts';

/** What the dropped files are, decided by their headers, never their names. */
export type Selection =
	| { kind: 'none' }
	| { kind: 'encrypt'; files: File[] }
	| { kind: 'decrypt'; files: File[]; unlock: 'passphrase' | 'private-key' }
	| { kind: 'invalid'; files: File[]; message: string };

/** What `files` are; `folder` says one of them is a folder, which no file's bytes tell. */
export async function classify(files: File[], folder = false): Promise<Selection> {
	const invalid = (message: string): Selection => ({ kind: 'invalid', files, message });

	if (folder) return invalid(strings.selection.folder);

	if (files.length === 0) return { kind: 'none' };
	let infos: FileInfo[];

	try {
		infos = await Promise.all(files.map(inspectFile));
	} catch (cause) {
		return invalid(errorMessage(cause));
	}

	if (infos.some((info) => info.kind === 'armored')) return invalid(strings.errors.armored);

	const encrypted = infos.filter((info) => info.kind === 'encrypted');

	if (encrypted.length === 0) return { kind: 'encrypt', files };

	if (encrypted.length !== files.length) return invalid(strings.selection.mixed);
	const locks = new Set(encrypted.map((info) => info.unlock));

	if (locks.size > 1) return invalid(strings.selection.mixedLocks);

	return { kind: 'decrypt', files, unlock: [...locks][0]! };
}
