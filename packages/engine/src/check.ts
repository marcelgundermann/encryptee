import { EngineError } from './errors.ts';
import { openHeader, type DecryptCredentials } from './format/header.ts';
import { readHeader } from './inspect.ts';

/**
 * Verifies a passphrase or private keys against a file's header without
 * decrypting anything, so the UI can reject a wrong passphrase before asking
 * where to save. Runs scrypt, so call it through the tools worker.
 */
export async function checkCredentials(file: Blob, credentials: DecryptCredentials): Promise<void> {
	const { kind, header } = await readHeader(file);

	if (kind === 'legacy') throw new EngineError('legacy-file', 'this is an Encryptee v1 file');

	if (kind === 'age-armored')
		throw new EngineError('armored', 'armored age files are not supported');

	if (kind !== 'age') throw new EngineError('not-encrypted', 'not an age file');

	if (!header) throw new EngineError('corrupted', 'the header is incomplete');
	(await openHeader(header, credentials)).fill(0);
}
