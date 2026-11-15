import {
	checkCredentials,
	chooseSaveLocation,
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
	TextButton,
	touchScreen
} from './ui.tsx';
import { useKeyFile } from './useKeyFile.tsx';

export function DecryptCard(props: {
	files: File[];
	unlock: 'passphrase' | 'private-key';
	disabled: boolean;
	onStart: (job: Job) => void;
	onBack: () => void;
}) {
	const [passphrase, setPassphrase] = useState('');
	const [checking, setChecking] = useState(false);
	/** Credentials that opened the first header, waiting for a save location. */
	const [checked, setChecked] = useState<CheckedCredentials | null>(null);
	const [error, setError] = useState<string | null>(null);

	const keyFile = useKeyFile(
		'decrypt',
		() => {
			setError(null);
			setChecked(null);
		},
		props.disabled
	);

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
			: keyFile.picked?.keys
				? { kind: 'private-keys', privateKeys: keyFile.picked.keys.privateKeys }
				: null;

	const start = async (handle: CheckedCredentials) => {
		try {
			const choice = await chooseSaveLocation('decrypt', props.files);

			// The check outlasted the click's user activation: keep it for one more click.
			if (!choice.location && choice.reason === 'needs-gesture') return;

			if (choice.location) props.onStart(handle.startJob(choice.location));
		} catch (cause) {
			setError(errorMessage(cause));
		}

		setChecked(null);
	};

	// Open the first header (scrypt, in the job's worker) so a wrong passphrase
	// fails here, before the save picker; the job reuses it.
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
				<Kicker>{strings.selection.decrypt(props.files.length)}</Kicker>
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
							disabled={props.disabled}
							onClick={keyFile.choose}
							className="focus-ring mt-6 flex w-full items-baseline justify-between gap-4 border-b-2 border-fg pb-2 text-left text-lg disabled:cursor-not-allowed disabled:opacity-50"
						>
							<span className="min-w-0 truncate">
								{keyFile.picked?.name ?? strings.keyFile.choose}
							</span>
							<span className="shrink-0 text-sm text-muted">
								{keyFile.picked?.keys
									? strings.keyFile.loaded(keyFile.picked.name)
									: strings.keyFile.hint}
							</span>
						</button>
						{keyFile.field}
					</>
				)}

				{error && <Hint tone="error">{error}</Hint>}
				<Warnings mode="decrypt" files={props.files} />
				{checked && <Hint>{strings.decrypt.checked}</Hint>}
				{/* The same button either way, so it keeps focus for the second press. */}
				{checked ? (
					<BigButton disabled={props.disabled} onClick={() => void start(checked)}>
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
