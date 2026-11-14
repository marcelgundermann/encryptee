import {
	checkCredentials,
	chooseSaveLocation,
	readKeyFile,
	type CheckedCredentials,
	type DecryptCredentials,
	type Job
} from '@encryptee/engine';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { errorMessage, strings } from '../strings.ts';
import { Warnings } from './Warnings.tsx';
import {
	Arrow,
	BigButton,
	Card,
	FileLines,
	Headline,
	Hint,
	Kicker,
	LineField,
	StableLabel,
	TextButton,
	touchScreen
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
	const [checking, setChecking] = useState(false);
	/** Credentials that opened the first header, waiting for a save location. */
	const [checked, setChecked] = useState<CheckedCredentials | null>(null);
	const [checkingKeyFile, setCheckingKeyFile] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const keyInput = useRef<HTMLInputElement>(null);
	const passphraseInput = useRef<HTMLInputElement>(null);

	const mounted = useRef(false);

	useEffect(() => {
		mounted.current = true;

		return () => {
			mounted.current = false;
		};
	}, []);

	// Stops the checked job's workers when it's replaced or the card goes away.
	useEffect(() => () => checked?.discard(), [checked]);

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
		setChecked(null);
		setCheckingKeyFile(true);

		try {
			const contents = await readKeyFile(bytes, pass);
			setKeyFile({ name, bytes, privateKeys: contents.protected ? null : contents.privateKeys });
		} catch (cause) {
			setError(errorMessage(cause));
		} finally {
			setCheckingKeyFile(false);
		}
	};

	const submitKeyFile = () => {
		if (keyFile && !checkingKeyFile)
			void loadKeyFile(keyFile.name, keyFile.bytes, keyFilePassphrase);
	};

	const start = async (handle: CheckedCredentials) => {
		const choice = await chooseSaveLocation('decrypt', props.files);

		if (choice.location) {
			props.onStart(handle.startJob(choice.location));
			setChecked(null);
		} else if (choice.reason !== 'needs-gesture') {
			if (choice.reason === 'unsupported') setError(strings.unsupported);

			if (choice.reason === 'save-failed') setError(strings.errors['save-failed']);
			setChecked(null);
		}
	};

	// Open the first header (scrypt, in the job's worker) so a wrong passphrase
	// fails here, before the save picker; the job reuses it. If the check
	// outlasts the click's user activation, the picker is refused and we ask
	// for one more click.
	const submit = async (event: FormEvent) => {
		event.preventDefault();

		if (!credentials) return;
		setChecked(null);
		setChecking(true);
		setError(null);
		let handle: CheckedCredentials;

		try {
			handle = await checkCredentials({ files: props.files, credentials });
		} catch (cause) {
			setError(errorMessage(cause));
			passphraseInput.current?.focus();
			passphraseInput.current?.select();

			return;
		} finally {
			setChecking(false);
		}

		// Back was pressed during the check: nothing will start this job.
		if (!mounted.current) {
			handle.discard();

			return;
		}

		setChecked(handle);
		await start(handle);
	};

	return (
		<Card>
			<form onSubmit={submit}>
				<Kicker>{strings.selection.decrypting(props.files.length)}</Kicker>
				<FileLines files={props.files} />
				<TextButton tone="muted" className="mt-3" onClick={props.onBack}>
					{strings.selection.other}
				</TextButton>

				<div className="mt-8">
					<Headline>
						{props.unlock === 'passphrase'
							? strings.decrypt.encryptedWithPassphrase
							: strings.decrypt.encryptedToKey}
					</Headline>
				</div>

				{props.unlock === 'passphrase' ? (
					<LineField
						id="decrypt-passphrase"
						label={strings.decrypt.passphrase}
						input={{
							ref: passphraseInput,
							type: 'password',
							autoComplete: 'current-password',
							autoFocus: !touchScreen(),
							value: passphrase,
							onChange: (e) => {
								setPassphrase(e.target.value);
								setError(null);
								setChecked(null);
							}
						}}
					/>
				) : (
					<>
						<button
							type="button"
							onClick={() => keyInput.current?.click()}
							className="focus-ring mt-6 flex w-full items-baseline justify-between gap-4 border-b-2 border-fg pb-2 text-left text-lg"
						>
							<span className="min-w-0 truncate">
								{keyFile ? keyFile.name : strings.decrypt.keyFile}
							</span>
							<span className="shrink-0 text-sm text-muted">
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
									autoFocus: !touchScreen(),
									value: keyFilePassphrase,
									onChange: (e) => setKeyFilePassphrase(e.target.value),
									onKeyDown: (e) => {
										if (e.key === 'Enter') {
											e.preventDefault();
											submitKeyFile();
										}
									}
								}}
								action={
									<TextButton onClick={submitKeyFile}>
										<StableLabel
											current={
												checkingKeyFile ? strings.decrypt.checking : strings.decrypt.applyKeyFile
											}
											labels={[strings.decrypt.applyKeyFile, strings.decrypt.checking]}
										/>
									</TextButton>
								}
							/>
						)}
					</>
				)}

				{error && <Hint tone="error">{error}</Hint>}
				<Warnings mode="decrypt" files={props.files} />
				{checked && <Hint>{strings.decrypt.checked}</Hint>}
				{/* The same button either way, so it keeps focus for the second press. */}
				{checked ? (
					<BigButton onClick={() => void start(checked)}>
						{strings.decrypt.chooseSave}
						<Arrow />
					</BigButton>
				) : (
					<BigButton type="submit" disabled={!credentials || checking || props.disabled}>
						{checking ? (
							strings.decrypt.checking
						) : (
							<>
								{strings.decrypt.submit}
								<Arrow />
							</>
						)}
					</BigButton>
				)}
			</form>
		</Card>
	);
}
