import {
	checkCredentials,
	chooseSaveLocation,
	readKeyFile,
	startJob,
	type DecryptCredentials,
	type Job
} from '@encryptee/engine';
import { useRef, useState, type FormEvent } from 'react';
import { errorMessage, strings } from '../strings.ts';
import { Warnings } from './Warnings.tsx';
import {
	BigButton,
	Card,
	FileLines,
	Headline,
	Hint,
	Kicker,
	LineField,
	TextButton
} from './ui.tsx';

interface KeyFile {
	name: string;
	bytes: Uint8Array;
	privateKeys: string[] | null;
}

export function DecryptCard(props: {
	files: File[];
	unlock: 'passphrase' | 'private-key';
	disabled: boolean;
	onStart: (job: Job) => void;
	onBack: () => void;
}) {
	const [passphrase, setPassphrase] = useState('');
	const [keyFile, setKeyFile] = useState<KeyFile | null>(null);
	const [keyFilePassphrase, setKeyFilePassphrase] = useState('');
	const [phase, setPhase] = useState<'idle' | 'checking' | 'needs-click'>('idle');
	const [error, setError] = useState<string | null>(null);
	const keyInput = useRef<HTMLInputElement>(null);

	const credentials: DecryptCredentials | null =
		props.unlock === 'passphrase'
			? passphrase
				? { kind: 'passphrase', passphrase }
				: null
			: keyFile?.privateKeys
				? { kind: 'private-keys', privateKeys: keyFile.privateKeys }
				: null;

	const loadKeyFile = async (name: string, bytes: Uint8Array, pass?: string) => {
		setError(null);

		try {
			const contents = await readKeyFile(bytes, pass);
			setKeyFile({ name, bytes, privateKeys: contents.protected ? null : contents.privateKeys });
		} catch (cause) {
			setError(errorMessage(cause));
		}
	};

	const start = async (creds: DecryptCredentials) => {
		const choice = await chooseSaveLocation('decrypt', props.files);

		if (choice.location) {
			props.onStart(
				startJob({ mode: 'decrypt', files: props.files, credentials: creds, save: choice.location })
			);
		} else if (choice.reason === 'needs-gesture') {
			setPhase('needs-click');
		} else {
			if (choice.reason === 'unsupported') setError(strings.unsupported);

			if (choice.reason === 'save-failed') setError(strings.errors['save-failed']);
			setPhase('idle');
		}
	};

	// Check the header first (scrypt, in a worker) so a wrong passphrase fails
	// here, before the save picker. If the check outlasts the click's user
	// activation, the picker is refused and we ask for one more click.
	const submit = async (event: FormEvent) => {
		event.preventDefault();

		if (!credentials) return;
		setPhase('checking');
		setError(null);

		try {
			await checkCredentials(props.files[0]!, credentials);
		} catch (cause) {
			setError(errorMessage(cause));
			setPhase('idle');

			return;
		}

		await start(credentials);
	};

	return (
		<Card>
			<form onSubmit={submit}>
				<Kicker>{strings.selection.decrypting(props.files.length)}</Kicker>
				<FileLines files={props.files} />
				<TextButton className="mt-3 text-neutral-500" onClick={props.onBack}>
					{strings.selection.other}
				</TextButton>

				<div className="mt-8">
					<Headline>
						{props.unlock === 'passphrase'
							? strings.decrypt.lockedPassphrase
							: strings.decrypt.lockedKey}
					</Headline>
				</div>

				{props.unlock === 'passphrase' ? (
					<LineField
						id="decrypt-passphrase"
						label={strings.decrypt.passphrase}
						input={{
							type: 'password',
							autoComplete: 'current-password',
							autoFocus: true,
							value: passphrase,
							onChange: (e) => {
								setPassphrase(e.target.value);
								setError(null);
							}
						}}
					/>
				) : (
					<>
						<button
							type="button"
							onClick={() => keyInput.current?.click()}
							className="mt-6 flex w-full items-baseline justify-between gap-4 border-b-2 border-black pb-2 text-left text-lg dark:border-white"
						>
							<span>{keyFile ? keyFile.name : strings.decrypt.keyFile}</span>
							<span className="text-sm text-neutral-500">
								{keyFile?.privateKeys
									? strings.decrypt.keysLoaded(keyFile.name)
									: strings.decrypt.keyFileHint}
							</span>
						</button>
						<input
							ref={keyInput}
							type="file"
							hidden
							aria-label={strings.decrypt.keyFile}
							onChange={async (event) => {
								const file = event.currentTarget.files?.[0];
								event.currentTarget.value = '';

								if (file) await loadKeyFile(file.name, new Uint8Array(await file.arrayBuffer()));
							}}
						/>
						{keyFile && !keyFile.privateKeys && (
							<LineField
								id="decrypt-key-passphrase"
								label={strings.decrypt.keyFilePassphrase}
								input={{
									type: 'password',
									autoFocus: true,
									value: keyFilePassphrase,
									onChange: (e) => setKeyFilePassphrase(e.target.value),
									onKeyDown: (e) => {
										if (e.key === 'Enter') {
											e.preventDefault();
											void loadKeyFile(keyFile.name, keyFile.bytes, keyFilePassphrase);
										}
									}
								}}
								action={
									<TextButton
										onClick={() => void loadKeyFile(keyFile.name, keyFile.bytes, keyFilePassphrase)}
									>
										{strings.decrypt.unlockKeyFile}
									</TextButton>
								}
							/>
						)}
					</>
				)}

				{error && <Hint tone="error">{error}</Hint>}
				<Warnings mode="decrypt" files={props.files} />
				{phase === 'needs-click' && credentials ? (
					<BigButton onClick={() => void start(credentials)}>
						{strings.decrypt.chooseSave}
					</BigButton>
				) : (
					<BigButton
						type="submit"
						disabled={!credentials || phase === 'checking' || props.disabled}
					>
						{phase === 'checking' ? strings.decrypt.checking : strings.decrypt.submit}
					</BigButton>
				)}
			</form>
		</Card>
	);
}
