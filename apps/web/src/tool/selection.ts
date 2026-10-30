import { inspectFile } from '@encryptee/engine';
import { strings } from '../strings.ts';

/** What the dropped files are, decided by their headers, never their names. */
export type Selection =
	| { kind: 'none' }
	| { kind: 'encrypt'; files: File[] }
	| { kind: 'decrypt'; files: File[]; unlock: 'passphrase' | 'private-key' }
	| { kind: 'invalid'; files: File[]; message: string };

export async function classify(files: File[]): Promise<Selection> {
	if (files.length === 0) return { kind: 'none' };
	const infos = await Promise.all(files.map(inspectFile));
	const invalid = (message: string): Selection => ({ kind: 'invalid', files, message });

	if (infos.some((info) => info.kind === 'legacy')) return invalid(strings.selection.legacy);

	if (infos.some((info) => info.kind === 'age-armored')) return invalid(strings.selection.armored);

	const encrypted = infos.filter((info) => info.kind === 'age');

	if (encrypted.length === 0) return { kind: 'encrypt', files };

	if (encrypted.length !== files.length) return invalid(strings.selection.mixed);
	const locks = new Set(encrypted.map((info) => info.unlock ?? 'private-key'));

	if (locks.size > 1) return invalid(strings.selection.mixedLocks);

	return { kind: 'decrypt', files, unlock: [...locks][0]! };
}
