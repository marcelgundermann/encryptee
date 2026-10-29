import {
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

/**
 * Reads the age header at the start of `file`: `null` if it isn't an age file
 * or the header doesn't end within the size age allows.
 */
export async function readHeader(
	file: Blob
): Promise<{ kind: FileKind; header: Uint8Array | null }> {
	let head = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer());
	const kind = sniffBytes(head);

	if (kind !== 'age') return { kind, header: null };
	let length = headerLength(head);

	if (length === null && file.size > head.length) {
		head = new Uint8Array(await file.slice(0, MAX_HEADER_SIZE).arrayBuffer());
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
