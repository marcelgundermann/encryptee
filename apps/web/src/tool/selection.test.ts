import { expect, test } from 'vite-plus/test';
import { strings } from '../strings.ts';
import { classify } from './selection.ts';

/** An age file whose header has these stanzas' recipient types, e.g. `scrypt`; never decryptable. */
function ageFile(name: string, ...types: string[]): File {
	const stanzas = types.map((type) => `-> ${type} c3RhbnphIGFyZ3VtZW50\nYm9keQ\n`).join('');

	return new File([`age-encryption.org/v1\n${stanzas}--- bWFj\npayload`], name);
}

const plain = (name: string) => new File(['just some text'], name);
const passphraseFile = ageFile('notes.txt.age', 'scrypt');
const keyFile = ageFile('photo.jpg.age', 'mlkem768x25519');
const legacyFile = new File(['encryptee.io…'], 'report.pdf.cre');
const armoredFile = new File(['-----BEGIN AGE ENCRYPTED FILE-----\n'], 'armored.age');

test('no files are no selection', async () => {
	expect(await classify([])).toEqual({ kind: 'none' });
});

test.each([
	['a plaintext file', [plain('notes.txt')]],
	['a plaintext file named .age, since names never decide', [plain('notes.age')]],
	['several plaintext files', [plain('a.txt'), plain('b.txt')]]
])('%s is encrypted', async (_, files) => {
	expect(await classify(files)).toEqual({ kind: 'encrypt', files });
});

test.each([
	['a file locked with a passphrase', [passphraseFile], 'passphrase'],
	['several files locked with a passphrase', [passphraseFile, passphraseFile], 'passphrase'],
	['a file locked with a key', [keyFile], 'private-key'],
	['a file locked with several keys', [ageFile('a.age', 'X25519', 'X25519')], 'private-key'],
	[
		'a file locked with a passphrase and a key',
		[ageFile('a.age', 'scrypt', 'X25519')],
		'private-key'
	]
])('%s is decrypted with its %s', async (_, files, unlock) => {
	expect(await classify(files)).toEqual({ kind: 'decrypt', files, unlock });
});

test.each([
	['plaintext and encrypted files', [plain('a.txt'), keyFile], strings.selection.mixed],
	[
		'files locked with a passphrase and with a key',
		[passphraseFile, keyFile],
		strings.selection.mixedLocks
	],
	['a legacy file', [legacyFile], strings.selection.legacy],
	['a legacy file among others', [plain('a.txt'), keyFile, legacyFile], strings.selection.legacy],
	['an armored age file', [armoredFile], strings.selection.armored]
])('%s can’t be used, and say why', async (_, files, message) => {
	expect(await classify(files)).toEqual({ kind: 'invalid', files, message });
});
