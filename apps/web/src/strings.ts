import type { EngineErrorCode, PreflightWarning } from '@encryptee/engine';

/** All UI copy lives here (D12). Terms follow GLOSSARY.md. */

const files = (n: number) => `${n} ${n === 1 ? 'file' : 'files'}`;

export const strings = {
	wordmark: 'encryptee',
	nav: {
		keys: 'Keys',
		howItWorks: 'How it works',
		security: 'Security',
		faq: 'FAQ'
	},
	drop: {
		title: 'Drop files.',
		subtitle: 'We’ll lock or unlock them.',
		facts: 'Nothing leaves this device · Opens with the age app · Works offline',
		choose: 'Choose files',
		release: 'Release to add.'
	},
	selection: {
		encrypting: (n: number) => `Encrypting ${files(n)}`,
		decrypting: (n: number) => `Decrypting ${files(n)}`,
		other: 'Choose other files',
		mixed: 'Drop either files to encrypt or encrypted files to decrypt, not both at once.',
		mixedLocks: 'Some of these files use a passphrase and some use a key. Decrypt them separately.',
		legacy: 'This file is from the old Encryptee. Open it at v1.encryptee.io.',
		armored: 'Armored age files (-----BEGIN AGE ENCRYPTED FILE-----) aren’t supported yet.'
	},
	encrypt: {
		passphrase: 'Passphrase',
		people: 'People',
		generatedHint: 'Generated for you. Write it down; nobody can recover it.',
		newPassphrase: 'New',
		copy: 'Copy',
		ownPassphrase: 'Use my own',
		generatedPassphrase: 'Generate one instead',
		repeat: 'Repeat passphrase',
		mismatch: 'The passphrases don’t match.',
		whoCanOpen: 'Who can open them',
		pasteKey: 'Paste a public key (age1…)',
		addKey: 'Add',
		noContacts: 'No saved people yet. Add them under Keys, or paste a key.',
		mixedKeys:
			'You’re mixing post-quantum and classic keys. The files will only be as strong as the classic keys.',
		submit: (n: number) => `Encrypt ${files(n)} →`,
		savePicker: (n: number) =>
			n === 1 ? 'You’ll choose where to save it next.' : 'You’ll choose a folder next.',
		saveDownload: 'They’ll be saved to your downloads.'
	},
	decrypt: {
		lockedPassphrase: 'Locked with a passphrase.',
		lockedKey: 'Locked with a key.',
		passphrase: 'Passphrase',
		keyFile: 'Choose your key file',
		keyFileHint: 'Usually called key.age',
		keyFilePassphrase: 'Key file passphrase',
		unlockKeyFile: 'Unlock',
		keysLoaded: (name: string) => `Key loaded from ${name}`,
		checking: 'Checking…',
		submit: 'Decrypt →',
		chooseSave: 'Choose where to save →'
	},
	job: {
		preparing: 'Preparing…',
		of: (done: string, total: string) => `${done} of ${total}`,
		rate: (rate: string) => `${rate}/s`,
		left: (time: string) => `about ${time} left`,
		cancel: 'Cancel'
	},
	done: {
		encrypted: (n: number) => `${files(n)} encrypted.`,
		decrypted: (n: number) => `${files(n)} decrypted.`,
		partial: (ok: number, total: number, verb: string) => `${ok} of ${files(total)} ${verb}.`,
		saved: 'Saved where you chose.',
		downloaded: 'Saved to your downloads.',
		again: 'Do another'
	},
	failed: {
		encrypt: 'Couldn’t encrypt.',
		decrypt: 'Couldn’t decrypt.',
		cancelled: 'Cancelled.',
		cancelledHint: 'Nothing was saved.',
		integrityHint: 'Every piece of an encrypted file is checked; a single changed byte stops it.',
		again: 'Try again'
	},
	keys: {
		kicker: 'Your key',
		title: 'Let people send you files only you can open.',
		create: 'Create my key',
		postQuantum: 'Post-quantum',
		classic: 'Classic',
		typeHint: 'Post-quantum keys need age 1.3 or newer. Use classic only for older tools.',
		openExisting: 'Already have a key file? Open it',
		saveTitle: 'Save your key file.',
		protect: 'Protect it with a passphrase',
		save: 'Save key file',
		saveAgain: 'Save key file again',
		privateNote:
			'Your private key is in the key file. Encryptee never keeps it; if you lose the file, files sent to this key can’t be opened.',
		publicKey: 'Public key · share freely',
		copyLink: 'Copy share link',
		copyKey: 'Copy public key',
		copied: 'Copied',
		people: 'People',
		noPeople: 'No one yet. Saved people show up when you encrypt.',
		name: 'Name',
		key: 'Public key (age1…)',
		add: 'Add',
		remove: 'Remove',
		quantumSafe: 'post-quantum',
		classicTag: 'classic'
	},
	update: {
		ready: 'A new version is ready.',
		reload: 'Update',
		unsafe: 'This version has a known problem. Update before encrypting or decrypting.',
		offline: (date: string) => `Offline · version from ${date}`
	},
	unsupported:
		'This browser can’t save files this way. Use a current Chrome, Edge, Firefox or Safari.',
	errors: {
		'wrong-credentials': 'That doesn’t match. Check the passphrase or key file.',
		'not-encrypted': 'This isn’t an encrypted file.',
		'legacy-file': 'This file is from the old Encryptee. Open it at v1.encryptee.io.',
		armored: 'Armored age files aren’t supported yet.',
		corrupted: 'This file was changed or is incomplete. Nothing was saved.',
		'invalid-public-key': 'That isn’t a valid public key.',
		'invalid-key-file': 'That isn’t a valid key file.',
		cancelled: 'Cancelled. Nothing was saved.',
		'save-failed': 'Saving failed.',
		'storage-full': 'There isn’t enough space to save the file.',
		unsupported: 'This browser can’t do that.',
		internal: 'Something went wrong.'
	} satisfies Record<EngineErrorCode, string>,
	warnings: {
		'ios-large-job':
			'Large job for an iPhone or iPad: keep Encryptee open and in front, and check there’s enough free space.',
		'over-browser-limit':
			'This file is larger than this browser saves reliably. For large files, use Chrome or Edge on a computer.',
		'low-storage': 'There may not be enough free space for the result.',
		'needs-double-space': 'This browser needs room for two copies of the result while saving.'
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

export function formatDuration(seconds: number): string {
	if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`;
	if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
	return `${(seconds / 3600).toFixed(1)} h`;
}

/** The message for an engine error, whatever shape it arrives in. */
export function errorMessage(error: unknown): string {
	const code = (error as { code?: EngineErrorCode } | null)?.code;
	return code && code in strings.errors ? strings.errors[code] : strings.errors.internal;
}
