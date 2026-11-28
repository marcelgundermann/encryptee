import {
	chooseSaveLocation,
	mixesPqAndClassic,
	startJob,
	validatePublicKeys,
	whereToSave,
	type Job
} from '@encryptee/engine';
import { useEffect, useEffectEvent, useState, type SubmitEvent } from 'react';
import { errorMessage, strings } from '#/strings.ts';
import { usePassphraseChoice } from './PassphraseChoice.tsx';
import { Warnings } from './Warnings.tsx';
import {
	Arrow,
	BigButton,
	Card,
	FileLines,
	Hint,
	Kicker,
	LineField,
	Segmented,
	TextButton
} from './ui.tsx';

type Method = 'passphrase' | 'public-keys';

/**
 * Where the card's latest attempt stands. A new attempt or a switch of method
 * leaves it behind, and so does an edit of the paste field, unless the job
 * failed to start. An attempt left behind drops whatever it was still waiting
 * for.
 */
type Attempt =
	| { status: 'idle' }
	/** Add or Enter: the paste field's keys join the list once they're all valid. */
	| { status: 'adding'; pasted: string }
	/** Encrypt: the paste field's keys, if any, are checked, then the save location chosen and the job started. One click, one job. */
	| { status: 'starting'; pasted: string }
	/** The paste field's text isn't valid, shown under it, or choosing the save location or starting the job failed. */
	| { status: 'failed'; kind: 'paste' | 'job'; message: string };

const IDLE: Attempt = { status: 'idle' };

/** The keys in pasted text, separated by whitespace; rejects if any isn't valid. Text with no keys resolves at once, with no worker. */
const parseKeys = async (text: string): Promise<string[]> => {
	const keys = text.split(/\s+/).filter(Boolean);

	return keys.length === 0 ? [] : validatePublicKeys(keys);
};

const withKeys = (list: string[], keys: string[]) => [...new Set([...list, ...keys])];

const shortKey = (key: string) => `${key.slice(0, 12)}…${key.slice(-4)}`;

export function EncryptCard(props: {
	files: File[];
	onStart: (job: Job) => void;
	onBack: () => void;
}) {
	const [method, setMethod] = useState<Method>('passphrase');
	const { passphrase, field: passphraseField } = usePassphraseChoice('encrypt');
	const [publicKeys, setPublicKeys] = useState<string[]>([]);
	const [draft, setDraft] = useState('');
	const [attempt, setAttempt] = useState<Attempt>(IDLE);

	// Keys still in the paste field count: they're added on submit.
	const ready =
		method === 'passphrase' ? passphrase !== null : publicKeys.length > 0 || draft.trim() !== '';

	const failed = attempt.status === 'failed' ? attempt : null;
	const pasteError = failed?.kind === 'paste' ? failed.message : null;

	// Every field keeps what's in it; the attempt belonged to the method left behind.
	const chooseMethod = (next: Method) => {
		setMethod(next);
		setAttempt(IDLE);
	};

	const addKeys = (keys: string[]) => {
		setPublicKeys((current) => withKeys(current, keys));
		setDraft('');
	};

	// Pasted keys that are all valid move from the field to the list; anything
	// else stays in the field, and Add or Encrypt says what's wrong with it.
	const addPasted = async (text: string) => {
		try {
			addKeys(await parseKeys(text));
		} catch {}
	};

	// Only the paste field's check, one worker round trip, comes before
	// chooseSaveLocation: the save picker needs the click's user activation.
	const start = async (keys: string[], signal: AbortSignal) => {
		try {
			const choice = await chooseSaveLocation('encrypt', props.files);

			if (signal.aborted) return;

			if (choice.location) {
				props.onStart(
					startJob({
						mode: 'encrypt',
						files: props.files,
						save: choice.location,
						credentials:
							method === 'passphrase'
								? { kind: 'passphrase', passphrase: passphrase! }
								: { kind: 'public-keys', publicKeys: keys }
					})
				);
			}

			setAttempt(IDLE);
		} catch (cause) {
			if (!signal.aborted) {
				setAttempt({ status: 'failed', kind: 'job', message: errorMessage(cause) });
			}
		}
	};

	// Every pasted key is valid: they join the list, and Encrypt goes on.
	const checked = useEffectEvent(
		(status: 'adding' | 'starting', keys: string[], signal: AbortSignal) => {
			if (signal.aborted) return;

			if (keys.length > 0) addKeys(keys);

			if (status === 'adding') setAttempt(IDLE);
			else void start(withKeys(publicKeys, keys), signal);
		}
	);

	const refused = useEffectEvent((cause: unknown) => {
		setAttempt({ status: 'failed', kind: 'paste', message: errorMessage(cause) });
	});

	// The attempt owns what it's waiting for: once it's left behind, the
	// answers count for nothing.
	useEffect(() => {
		if (attempt.status !== 'adding' && attempt.status !== 'starting') return;
		const controller = new AbortController();
		const { signal } = controller;
		const { status } = attempt;

		parseKeys(attempt.pasted).then(
			(keys) => checked(status, keys, signal),
			(cause: unknown) => {
				if (!signal.aborted) refused(cause);
			}
		);

		return () => controller.abort();
	}, [attempt]);

	const submit = (event: SubmitEvent) => {
		event.preventDefault();
		setAttempt({ status: 'starting', pasted: method === 'public-keys' ? draft : '' });
	};

	return (
		<Card>
			<form onSubmit={submit}>
				<Kicker heading>{strings.selection.encrypt(props.files.length)}</Kicker>
				<FileLines files={props.files} />
				<TextButton tone="muted" className="mt-3" onClick={props.onBack}>
					{strings.selection.other}
				</TextButton>

				<Segmented
					label={strings.encrypt.whoCanOpen}
					value={method}
					onChange={chooseMethod}
					options={[
						{ value: 'passphrase', label: strings.encrypt.passphrase },
						{ value: 'public-keys', label: strings.encrypt.publicKeys }
					]}
				/>

				{method === 'passphrase' && passphraseField}

				{method === 'public-keys' && (
					<>
						{publicKeys.length > 0 && (
							<ul className="mt-6 flex flex-wrap gap-2">
								{publicKeys.map((key) => (
									<li
										key={key}
										className="flex items-center gap-1 rounded-full bg-fg py-1 pr-1 pl-4 font-mono text-sm text-canvas"
									>
										{shortKey(key)}
										<button
											type="button"
											aria-label={strings.encrypt.removeKey(shortKey(key))}
											onClick={() => setPublicKeys((current) => current.filter((k) => k !== key))}
											className="hit-area grid size-8 place-items-center rounded-full transition-colors outline-hidden hover:bg-canvas/20 focus-visible:bg-canvas focus-visible:text-fg"
										>
											<svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5">
												<path
													d="M4 4l8 8M12 4l-8 8"
													stroke="currentColor"
													strokeWidth="1.75"
													strokeLinecap="round"
												/>
											</svg>
										</button>
									</li>
								))}
							</ul>
						)}
						<LineField
							id="encrypt-paste"
							label={strings.encrypt.pasteKey}
							input={{
								value: draft,
								spellCheck: false,
								autoComplete: 'off',
								className: 'font-mono text-base',
								'aria-invalid': pasteError !== null || undefined,
								'aria-describedby': pasteError === null ? undefined : 'encrypt-paste-error',
								onChange: (e) => {
									setDraft(e.target.value);
									// New text leaves behind a check of the old and the error about it;
									// a job that failed to start keeps its error.
									setAttempt((current) =>
										current.status === 'failed' && current.kind === 'job' ? current : IDLE
									);
								},
								onPaste: (e) => {
									if (draft.trim() === '') void addPasted(e.clipboardData.getData('text'));
								},
								onKeyDown: (e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										setAttempt({ status: 'adding', pasted: draft });
									}
								}
							}}
							action={
								<TextButton onClick={() => setAttempt({ status: 'adding', pasted: draft })}>
									{strings.encrypt.addKey}
								</TextButton>
							}
						/>
						{pasteError !== null && (
							<Hint id="encrypt-paste-error" tone="error">
								{pasteError}
							</Hint>
						)}
						{mixesPqAndClassic(publicKeys) && (
							<Hint tone="warning">{strings.encrypt.mixedKeys}</Hint>
						)}
					</>
				)}

				{failed?.kind === 'job' && <Hint tone="error">{failed.message}</Hint>}
				<Warnings files={props.files} />
				<BigButton type="submit" disabled={!ready || attempt.status === 'starting'}>
					{strings.encrypt.submit(props.files.length)}
					<Arrow />
				</BigButton>
				<p className="mt-3 text-center text-sm text-muted">
					{whereToSave(props.files.length) === 'ask'
						? strings.encrypt.savePicker(props.files.length)
						: strings.encrypt.saveDownload}
				</p>
			</form>
		</Card>
	);
}
