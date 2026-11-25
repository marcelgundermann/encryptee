import { readKeyFile, type KeyFileContents } from '@encryptee/engine';
import { useRef, useState, type ReactNode } from 'react';
import { errorMessage, strings } from '#/strings.ts';
import { Hint, LineField, StableLabel, TextButton, touchScreen } from './ui.tsx';

type Keys = Extract<KeyFileContents, { protected: false }>;

/** Where the key file chosen last stands. */
type KeyFile =
	| { status: 'none' }
	| { status: 'reading'; file: File }
	/** Protected: it waits for its passphrase. `error` says why the last one didn't open it. */
	| { status: 'locked'; file: File; error: string | null }
	| { status: 'unlocking'; file: File }
	| { status: 'loaded'; file: File; keys: Keys }
	/** It couldn't be read as a key file, so no key is loaded. */
	| { status: 'failed'; error: string };

export interface KeyFileReader {
	choose(): void;
	/** The key file chosen last, unless it failed: its keys once it's read and unlocked. */
	picked: { name: string; keys: Keys | null } | null;
	/** A key file is being read or unlocked. */
	reading: boolean;
	/** The hidden file input, the passphrase field a protected key file needs, and why reading failed. */
	field: ReactNode;
}

/**
 * Reads the key file the user chooses, asking for its passphrase if it's
 * protected. A file chosen later replaces one still being read, and a file
 * that fails leaves no key loaded. `onChange` gets `null` as a file starts to
 * read, and its keys once they're read. The screen renders its own button for
 * `choose`, and `field`. The passphrase field's id is `${id}-key-passphrase`,
 * which the e2e tests use.
 */
export function useKeyFile(id: string, onChange: (keys: Keys | null) => void): KeyFileReader {
	const input = useRef<HTMLInputElement>(null);
	const [keyFile, setKeyFile] = useState<KeyFile>({ status: 'none' });
	const [passphrase, setPassphrase] = useState('');
	/** The file the latest read is for. */
	const latest = useRef<File | null>(null);

	/** Reads `file`, unlocking it with `pass` if it's given. */
	const read = async (file: File, pass?: string) => {
		latest.current = file;
		setKeyFile(pass === undefined ? { status: 'reading', file } : { status: 'unlocking', file });
		onChange(null);
		let next: KeyFile;

		try {
			const contents = await readKeyFile(await file.bytes(), pass);

			next = contents.protected
				? { status: 'locked', file, error: null }
				: { status: 'loaded', file, keys: contents };
		} catch (cause) {
			const error = errorMessage(cause);
			next = pass === undefined ? { status: 'failed', error } : { status: 'locked', file, error };
		}

		// A file chosen later replaced this one while it was read.
		if (latest.current !== file) return;
		setKeyFile(next);

		if (next.status === 'loaded') onChange(next.keys);
	};

	const unlock = () => {
		if (keyFile.status === 'locked') void read(keyFile.file, passphrase);
	};

	const field = (
		<>
			<input
				ref={input}
				type="file"
				hidden
				aria-label={strings.keyFile.choose}
				onChange={async (event) => {
					const file = event.currentTarget.files?.[0];
					event.currentTarget.value = '';

					if (!file) return;
					// A passphrase belongs to its key file.
					setPassphrase('');
					await read(file);
				}}
			/>
			{(keyFile.status === 'locked' || keyFile.status === 'unlocking') && (
				<LineField
					id={`${id}-key-passphrase`}
					label={strings.keyFile.passphrase}
					input={{
						type: 'password',
						autoFocus: !touchScreen(),
						value: passphrase,
						onChange: (e) => setPassphrase(e.target.value),
						onKeyDown: (e) => {
							// Enter unlocks the key file, and never submits a form around it.
							if (e.key === 'Enter') {
								e.preventDefault();
								unlock();
							}
						}
					}}
					action={
						<TextButton onClick={unlock}>
							<StableLabel
								labels={[strings.keyFile.apply, strings.keyFile.checking]}
								shown={keyFile.status === 'unlocking' ? 1 : 0}
							/>
						</TextButton>
					}
				/>
			)}
			{(keyFile.status === 'locked' || keyFile.status === 'failed') && keyFile.error && (
				<Hint tone="error">{keyFile.error}</Hint>
			)}
		</>
	);

	const file = keyFile.status === 'none' || keyFile.status === 'failed' ? null : keyFile.file;

	return {
		choose: () => input.current?.click(),
		picked: file && { name: file.name, keys: keyFile.status === 'loaded' ? keyFile.keys : null },
		reading: keyFile.status === 'reading' || keyFile.status === 'unlocking',
		field
	};
}
