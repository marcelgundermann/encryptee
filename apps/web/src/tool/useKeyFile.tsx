import { readKeyFile, type KeyFileContents } from '@encryptee/engine';
import { useRef, useState, type ReactNode } from 'react';
import { errorMessage, strings } from '../strings.ts';
import { Hint, LineField, StableLabel, TextButton, touchScreen } from './ui.tsx';

type Keys = Extract<KeyFileContents, { protected: false }>;

interface Picked {
	file: File;
	keys: Keys | null;
}

export interface KeyFileReader {
	choose(): void;
	/** The last key file that read: its keys, or `null` while it waits for its passphrase. */
	picked: { name: string; keys: Keys | null } | null;
	reading: boolean;
	/** The hidden file input, the passphrase field a protected key file needs, and why reading failed. */
	field: ReactNode;
}

/**
 * Reads the key file the user chooses, asking for its passphrase if it's
 * protected. `onChange` gets `null` as a file starts to read, and its keys
 * once they're read. The screen renders its own button for
 * `choose`, and `field`. The passphrase field's id is `${id}-key-passphrase`,
 * which the e2e tests use.
 */
export function useKeyFile(id: string, onChange: (keys: Keys | null) => void): KeyFileReader {
	const input = useRef<HTMLInputElement>(null);
	const [picked, setPicked] = useState<Picked | null>(null);
	const [passphrase, setPassphrase] = useState('');
	const [reading, setReading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const read = async (file: File, pass?: string) => {
		setReading(true);
		setError(null);
		onChange(null);

		try {
			const contents = await readKeyFile(await file.bytes(), pass);
			const keys = contents.protected ? null : contents;
			setPicked({ file, keys });

			if (keys) onChange(keys);
		} catch (cause) {
			setError(errorMessage(cause));
		} finally {
			setReading(false);
		}
	};

	const unlock = () => {
		if (picked && !reading) void read(picked.file, passphrase);
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

					if (file) await read(file);
				}}
			/>
			{picked && !picked.keys && (
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
								shown={reading ? 1 : 0}
							/>
						</TextButton>
					}
				/>
			)}
			{error && <Hint tone="error">{error}</Hint>}
		</>
	);

	return {
		choose: () => input.current?.click(),
		picked: picked && { name: picked.file.name, keys: picked.keys },
		reading,
		field
	};
}
