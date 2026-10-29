import { MAX_HEADER_SIZE, headerLength, sniffBytes, type FileKind } from './format/age.ts';
import { stanzaTypes } from './format/header.ts';

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
 * Looks at a file's first bytes to decide between encrypt and decrypt. This
 * sniffs the header, never the extension, and does no cryptography.
 */
export async function inspectFile(file: Blob): Promise<FileInfo> {
	let head = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer());
	const kind = sniffBytes(head);
	if (kind !== 'age') return { kind, unlock: null, recipientTypes: [] };
	let length = headerLength(head);
	if (length === null && file.size > head.length) {
		head = new Uint8Array(await file.slice(0, MAX_HEADER_SIZE).arrayBuffer());
		length = headerLength(head);
	}
	if (length === null) return { kind, unlock: null, recipientTypes: [] };
	const recipientTypes = stanzaTypes(head.subarray(0, length));
	const unlock =
		recipientTypes.length === 1 && recipientTypes[0] === 'scrypt' ? 'passphrase' : 'private-key';
	return { kind, unlock, recipientTypes };
}
