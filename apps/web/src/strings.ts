import type { EngineErrorCode, PreflightWarning } from '@encryptee/engine';

/** All UI copy lives here (D12). Terms follow GLOSSARY.md. */
export const strings = {
	appName: 'Encryptee',
	tagline: 'Encrypt and decrypt files on your device. Nothing is uploaded.',
	nav: {
		tool: 'Encrypt & decrypt',
		keys: 'Keys',
		howItWorks: 'How it works',
		security: 'Security',
		faq: 'FAQ'
	},
	files: {
		choose: 'Choose files',
		drop: 'or drop them anywhere on this page',
		clear: 'Clear',
		mixed: 'Choose either plaintext files to encrypt or encrypted files to decrypt, not both.',
		legacy: 'This file is from the old Encryptee. Open it at v1.encryptee.io.',
		armored: 'Armored age files (-----BEGIN AGE ENCRYPTED FILE-----) are not supported yet.'
	},
	encrypt: {
		title: 'Encrypt',
		withPassphrase: 'With a passphrase',
		withPublicKeys: 'For public keys',
		passphrase: 'Passphrase',
		confirm: 'Repeat passphrase',
		mismatch: 'The passphrases don’t match.',
		generate: 'Generate passphrase',
		generatedHint: 'Write this passphrase down. Without it, the files can’t be decrypted.',
		publicKeys: 'Public keys, one per line',
		mixedKeys:
			'You are mixing post-quantum and classic public keys. The files will only be as strong as the classic keys.',
		start: 'Encrypt'
	},
	decrypt: {
		title: 'Decrypt',
		passphrase: 'Passphrase',
		keyFile: 'Key file',
		keyFilePassphrase: 'Key file passphrase',
		keyFileLoaded: (n: number) => `${n} private key${n === 1 ? '' : 's'} loaded`,
		start: 'Decrypt'
	},
	job: {
		cancel: 'Cancel',
		done: 'Done',
		again: 'Start over',
		saved: 'Saved',
		downloaded: 'Downloaded',
		failed: 'Failed',
		cancelled: 'Cancelled',
		waiting: 'Waiting',
		progress: (done: string, total: string) => `${done} of ${total}`
	},
	keys: {
		title: 'Keys',
		generate: 'Create a key pair',
		postQuantum: 'Post-quantum (recommended)',
		classic: 'Classic (X25519)',
		protect: 'Protect the key file with a passphrase',
		save: 'Save key file',
		savedWarning:
			'Keep the key file safe. Encryptee does not store private keys; if you lose it, files encrypted to this key are gone.',
		publicKey: 'Your public key',
		shareLink: 'Share link',
		copy: 'Copy',
		copied: 'Copied',
		contacts: 'Contacts',
		contactName: 'Name',
		contactKey: 'Public key',
		addContact: 'Add contact',
		remove: 'Remove',
		noContacts: 'No contacts yet. Contacts hold public keys only.'
	},
	update: {
		ready: 'A new version of Encryptee is ready.',
		reload: 'Update',
		unsafe:
			'This version of Encryptee has a known problem. Update before encrypting or decrypting.',
		offline: (date: string) => `Offline. Running the version from ${date}.`
	},
	unsupported:
		'This browser can’t save large files. Use a current version of Chrome, Edge, Firefox or Safari.',
	errors: {
		'wrong-credentials': 'The passphrase or key doesn’t match this file.',
		'not-encrypted': 'This isn’t an encrypted file.',
		'legacy-file': 'This file is from the old Encryptee. Open it at v1.encryptee.io.',
		armored: 'Armored age files are not supported yet.',
		corrupted: 'This file was changed or is incomplete. Nothing was saved.',
		'invalid-public-key': 'One of the public keys isn’t valid.',
		'invalid-key-file': 'That key file isn’t valid.',
		cancelled: 'Cancelled.',
		'save-failed': 'Saving failed.',
		'storage-full': 'There isn’t enough space to save the file.',
		unsupported: 'This browser can’t do that.',
		internal: 'Something went wrong.'
	} satisfies Record<EngineErrorCode, string>,
	warnings: {
		'ios-large-job':
			'This is a large job for an iPhone or iPad. Keep Encryptee open and in the foreground, and make sure there is enough free space.',
		'over-browser-limit':
			'This file is larger than this browser handles reliably. For large files, use Chrome or Edge on a computer.',
		'low-storage': 'There may not be enough free space for the output.',
		'needs-double-space': 'This browser needs free space for two copies of the output while saving.'
	} satisfies Record<PreflightWarning['code'], string>
};

export function formatBytes(bytes: number): string {
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let value = bytes;
	let unit = 0;
	while (value >= 1000 && unit < units.length - 1) {
		value /= 1000;
		unit++;
	}
	return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
