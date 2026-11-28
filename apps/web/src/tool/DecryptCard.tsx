import {
	checkCredentials,
	chooseSaveLocation,
	type CheckedCredentials,
	type DecryptCredentials,
	type Job
} from '@encryptee/engine';
import { useEffect, useEffectEvent, useRef, useState, type SubmitEvent } from 'react';
import { errorMessage, strings } from '#/strings.ts';
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
import { useKeyFile, type KeyFileReader } from './useKeyFile.tsx';

/** Where the card's check of the credentials stands. */
type Check =
	| { status: 'idle'; error: string | null }
	/** The first header opens with these credentials, in the job's workers: scrypt, for a passphrase. */
	| { status: 'checking'; credentials: DecryptCredentials }
	/** They opened it; the job waits for a save location. */
	| { status: 'checked'; handle: CheckedCredentials };

export function DecryptCard(props: {
	files: File[];
	unlock: 'passphrase' | 'private-key';
	onStart: (job: Job) => void;
	onBack: () => void;
}) {
	const [passphrase, setPassphrase] = useState('');
	const [check, setCheck] = useState<Check>({ status: 'idle', error: null });
	// New credentials make a new check: the one running or done goes.
	const edited = () => setCheck({ status: 'idle', error: null });
	const keyFile = useKeyFile('decrypt', edited);
	const passphraseInput = useRef<HTMLInputElement>(null);

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

			// The picker was dismissed, or the check outlasted the click's user
			// activation: the check stays, for one more click.
			if (choice.location) props.onStart(handle.startJob(choice.location));
		} catch (cause) {
			setCheck({ status: 'idle', error: errorMessage(cause) });
		}
	};

	const checked = useEffectEvent((handle: CheckedCredentials) => {
		setCheck({ status: 'checked', handle });
		void start(handle);
	});

	const refused = useEffectEvent((cause: unknown) => {
		setCheck({ status: 'idle', error: errorMessage(cause) });
		passphraseInput.current?.focus();
		passphraseInput.current?.select();
	});

	// The check holds the job's workers while it runs and once it's done, until
	// it's replaced, the card goes, or the job starts with them. Leaving the
	// check, with new credentials or Back, stops scrypt at once.
	useEffect(() => {
		if (check.status === 'checked') {
			const { handle } = check;

			return () => handle.discard();
		}

		if (check.status !== 'checking') return;
		const controller = new AbortController();
		const { signal } = controller;

		checkCredentials({ files: props.files, credentials: check.credentials, signal }).then(
			(handle) => (signal.aborted ? handle.discard() : checked(handle)),
			(cause: unknown) => {
				if (!signal.aborted) refused(cause);
			}
		);

		return () => controller.abort();
	}, [check, props.files]);

	// Open the first header so a wrong passphrase fails here, before the save
	// picker; the job reuses it.
	const submit = (event: SubmitEvent) => {
		event.preventDefault();

		if (credentials) setCheck({ status: 'checking', credentials });
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
								edited();
							}
						}}
					/>
				) : (
					<>
						<KeyFileButton keyFile={keyFile} />
						{keyFile.field}
					</>
				)}

				{check.status === 'idle' && check.error && <Hint tone="error">{check.error}</Hint>}
				<Warnings files={props.files} />
				{check.status === 'checked' && <Hint>{strings.decrypt.checked}</Hint>}
				{/* The same button either way, so it keeps focus for the second press. */}
				{check.status === 'checked' ? (
					<BigButton onClick={() => void start(check.handle)}>
						{strings.decrypt.chooseSave}
						<Arrow />
					</BigButton>
				) : (
					<BigButton type="submit" disabled={!credentials || check.status === 'checking'}>
						{check.status === 'checking' ? (
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

/** Chooses the key file, and shows the one chosen and whether its keys are loaded. */
function KeyFileButton({ keyFile }: { keyFile: KeyFileReader }) {
	return (
		<button
			type="button"
			onClick={keyFile.choose}
			className="focus-ring mt-6 flex w-full items-baseline justify-between gap-4 border-b-2 border-fg pb-2 text-left text-lg"
		>
			<span className="min-w-0 truncate">
				{keyFile.picked ? (
					<span translate="no">{keyFile.picked.name}</span>
				) : (
					strings.keyFile.choose
				)}
			</span>
			<span className="shrink-0 text-sm text-muted">
				{keyFile.picked?.keys ? strings.keyFile.loaded(keyFile.picked.name) : strings.keyFile.hint}
			</span>
		</button>
	);
}
