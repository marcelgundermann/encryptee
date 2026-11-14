import {
	HEADER_PROBE_SIZE,
	MAX_HEADER_SIZE,
	headerLength,
	sniffBytes,
	stanzaTypes,
	type FileKind
} from './format/age.ts';

export interface FileInfo {
	kind: FileKind;
	/**
	 * For age files: how it can be opened. `passphrase` when the only stanza is
	 * scrypt, `private-key` otherwise. `null` if the header is unreadable.
	 */
	unlock: 'passphrase' | 'private-key' | null;
	/** Recipient types from the header, e.g. `["mlkem768x25519", "X25519"]`. */
	recipientTypes: string[];
}

/** Holds every magic `sniffBytes` knows; the armor line, the longest, is 34 bytes. */
const SNIFF_SIZE = 64;

/**
 * Reads the age header at the start of `file`: `null` if it isn't an age file
 * or the header doesn't end within the size age allows. Other files cost only
 * a few bytes, since a selection inspects every file at once.
 */
async function readHeader(file: Blob): Promise<{ kind: FileKind; header: Uint8Array | null }> {
	const kind = sniffBytes(await file.slice(0, SNIFF_SIZE).bytes());

	if (kind !== 'age') return { kind, header: null };
	let head = await file.slice(0, HEADER_PROBE_SIZE).bytes();
	let length = headerLength(head);

	if (length === null && file.size > head.length) {
		head = await file.slice(0, MAX_HEADER_SIZE).bytes();
		length = headerLength(head);
	}

	return { kind, header: length === null ? null : head.subarray(0, length) };
}

/**
 * Looks at a file's first bytes to decide between encrypt and decrypt. This
 * sniffs the header, never the extension, and does no cryptography.
 */
export async function inspectFile(file: Blob): Promise<FileInfo> {
	const { kind, header } = await readHeader(file);

	if (!header) return { kind, unlock: null, recipientTypes: [] };
	const recipientTypes = stanzaTypes(header);

	const unlock =
		recipientTypes.length === 1 && recipientTypes[0] === 'scrypt' ? 'passphrase' : 'private-key';

	return { kind, unlock, recipientTypes };
}
