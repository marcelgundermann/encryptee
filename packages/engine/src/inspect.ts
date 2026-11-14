import { REFUSALS, readHeader, stanzaTypes } from './format/age.ts';

/** What a file is, which decides between encrypt and decrypt. */
export type FileInfo =
	| { kind: 'plaintext' }
	/** Opened with a passphrase when its only stanza is scrypt, else with a private key. */
	| { kind: 'encrypted'; unlock: 'passphrase' | 'private-key' }
	/** A file Encryptee recognizes but can't decrypt. */
	| { kind: 'unusable'; reason: 'legacy-file' | 'armored' };

/**
 * Looks at a file's first bytes to decide between encrypt and decrypt. This
 * sniffs the header, never the extension, and does no cryptography.
 */
export async function inspectFile(file: Blob): Promise<FileInfo> {
	const { kind, header } = await readHeader(
		(start, end) => file.slice(start, end).arrayBuffer(),
		file.size
	);

	if (kind === 'plain') return { kind: 'plaintext' };

	if (kind !== 'age') return { kind: 'unusable', reason: REFUSALS[kind] };
	// An unreadable header names no stanzas, so a private key gets to try it
	// and the job says what's wrong with it.
	const types = header ? stanzaTypes(header) : [];

	return {
		kind: 'encrypted',
		unlock: types.length === 1 && types[0] === 'scrypt' ? 'passphrase' : 'private-key'
	};
}
