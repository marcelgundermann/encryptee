import { EngineError, type EngineErrorCode, type PreflightWarning } from '@encryptee/engine';

/** All UI copy lives here. */

const files = (n: number) => `${n} ${n === 1 ? 'file' : 'files'}`;

export const strings = {
	wordmark: 'encryptee',
	/** The document's title on each route. `index.html` repeats the tool's, for link previews. */
	titles: {
		tool: 'Encryptee · Encrypt files in your browser',
		howItWorks: 'How Encryptee works',
		security: 'Encryptee security',
		faq: 'Encryptee FAQ',
		notFound: 'Page not found · Encryptee'
	},
	/** The header's items: the Keys button and a link to each content page. */
	nav: {
		keys: 'Keys',
		'/how-it-works': 'How it works',
		'/security': 'Security',
		'/faq': 'FAQ'
	},
	drop: {
		title: 'Drop files.',
		titleTouch: 'Choose files.',
		subtitle: 'Encrypted in this browser, or decrypted if they already are.',
		facts: 'Nothing leaves this device · Opens with the age tool · Works offline',
		choose: 'Choose files',
		release: 'Release to add.'
	},
	selection: {
		encrypt: (n: number) => `Encrypting ${files(n)}`,
		decrypt: (n: number) => `Decrypting ${files(n)}`,
		other: 'Choose other files',
		more: (n: number) => `and ${n.toLocaleString('en')} more ${n === 1 ? 'file' : 'files'}`,
		unusable: (n: number) => (n === 1 ? 'Can’t use this file.' : 'Can’t use these files.'),
		folder: 'Encryptee works on files, not folders. Drop the files inside it instead.',
		mixed: 'Drop either files to encrypt or encrypted files to decrypt, not both at once.',
		mixedLocks: 'Some of these files use a passphrase and some use a key. Decrypt them separately.'
	},
	passphrase: {
		label: 'Passphrase',
		generatedHint: 'Generated for you. Write it down; nobody can recover it.',
		new: 'New',
		copy: 'Copy',
		copied: 'Copied',
		own: 'Use my own',
		generated: 'Generate one instead',
		repeat: 'Repeat passphrase',
		mismatch: 'The passphrases don’t match.'
	},
	keyFile: {
		choose: 'Choose your key file',
		hint: 'Usually called key.age',
		loaded: (name: string) => `Key loaded from ${name}`,
		passphrase: 'Key file passphrase',
		apply: 'Use key file',
		checking: 'Checking…'
	},
	encrypt: {
		passphrase: 'Passphrase',
		publicKeys: 'Public keys',
		whoCanOpen: 'Who can open them',
		pasteKey: 'Paste a public key (age1…)',
		addKey: 'Add',
		removeKey: (key: string) => `Remove public key ${key}`,
		mixedKeys:
			'You’re mixing post-quantum and classic keys. The files will only be as strong as the classic keys.',
		submit: (n: number) => `Encrypt ${files(n)}`,
		savePicker: (n: number) =>
			n === 1 ? 'You’ll choose where to save it next.' : 'You’ll choose a folder next.',
		saveDownload: 'They’ll be saved to your downloads.'
	},
	decrypt: {
		encryptedWithPassphrase: 'Encrypted with a passphrase.',
		encryptedToKey: 'Encrypted to a public key.',
		passphrase: 'Passphrase',
		checking: 'Checking…',
		checked: 'That matches. Now choose where to save.',
		submit: 'Decrypt',
		chooseSave: 'Choose where to save'
	},
	job: {
		progress: 'Progress',
		progressText: (percent: number, step: string) => `${percent}%, ${step}`,
		preparing: 'Preparing…',
		checking: 'Checking the file…',
		decrypting: 'Decrypting…',
		of: (done: string, total: string) => `${done} of ${total}`,
		rate: (rate: string) => `${rate}/s`,
		left: (time: string) => `about ${time} left`,
		cancel: 'Cancel'
	},
	done: {
		encrypt: (n: number) => `${files(n)} encrypted.`,
		decrypt: (n: number) => `${files(n)} decrypted.`,
		partial: {
			encrypt: (ok: number, total: number) => `${ok} of ${files(total)} encrypted.`,
			decrypt: (ok: number, total: number) => `${ok} of ${files(total)} decrypted.`
		},
		file: '✓',
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
		creating: 'Creating…',
		another: 'Create another key',
		type: 'Key type',
		postQuantum: 'Post-quantum',
		classic: 'Classic',
		typeHint: 'Post-quantum keys need age 1.3 or newer. Use classic only for older tools.',
		openExisting: 'Already have a key file? Open it',
		saveTitle: 'Save your key file.',
		protect: 'Protect it with a passphrase',
		save: 'Save key file',
		saving: 'Saving…',
		savedTo: (name: string) => `Saved ${name} to your downloads.`,
		saveAgain: 'Save key file again',
		privateNote:
			'Your private key is in the key file. Encryptee never keeps it; if you lose the file, files sent to this key can’t be opened.',
		publicKey: 'Public key · share freely',
		copyKey: 'Copy public key',
		copied: 'Copied',
		close: 'Close'
	},
	errors: {
		'wrong-credentials': 'That doesn’t match. Check the passphrase or key file.',
		'not-encrypted': 'This isn’t an encrypted file.',
		armored: 'Armored age files (-----BEGIN AGE ENCRYPTED FILE-----) aren’t supported yet.',
		corrupted: 'This file was changed or is incomplete. Nothing was saved.',
		'invalid-public-key': 'That isn’t a valid public key.',
		'invalid-key-file': 'That isn’t a valid key file.',
		cancelled: 'Cancelled. Nothing was saved.',
		'read-failed': 'This file can’t be read. It may have been moved, changed or deleted.',
		'save-failed': 'Saving failed.',
		'storage-full': 'There isn’t enough space to save the file.',
		unsupported:
			'Encryptee can’t save files in this window yet. Reload the page; if that doesn’t help, use a window that isn’t private.',
		internal: 'Something went wrong.'
	} satisfies Record<EngineErrorCode, string>,
	warnings: {
		'ios-large-job':
			'Large job for an iPhone or iPad: keep Encryptee open and in front, and check there’s enough free space.',
		'over-browser-limit':
			'This file is larger than this browser saves reliably. For large files, use Chrome or Edge on a computer.'
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

/** The message for a thrown value: its engine error's, else the generic one. */
export function errorMessage(cause: unknown): string {
	return cause instanceof EngineError ? strings.errors[cause.code] : strings.errors.internal;
}
