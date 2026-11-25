import {
	chooseSaveLocation,
	mixesPqAndClassic,
	startJob,
	validatePublicKeys,
	whereToSave,
	type Job
} from '@encryptee/engine';
import { useState, type SubmitEvent } from 'react';
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

/** The keys in pasted text, separated by whitespace; rejects if any isn't valid. */
const parseKeys = (text: string) => validatePublicKeys(text.split(/\s+/).filter(Boolean));

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
	const [error, setError] = useState<string | null>(null);
	/** From the click until the job starts: one click, one job. */
	const [starting, setStarting] = useState(false);

	// Keys still in the paste field count: they're added on submit.
	const ready =
		method === 'passphrase' ? passphrase !== null : publicKeys.length > 0 || draft.trim() !== '';

	const addKeys = (keys: string[]) => {
		setPublicKeys((current) => [...new Set([...current, ...keys])]);
		setDraft('');
		setError(null);
	};

	const addDraft = async () => {
		try {
			addKeys(await parseKeys(draft));
		} catch (cause) {
			setError(errorMessage(cause));
		}
	};

	// Pasted keys that are all valid move from the field to the list; anything
	// else stays in the field, and Add or Encrypt says what's wrong with it.
	const addPasted = async (text: string) => {
		try {
			addKeys(await parseKeys(text));
		} catch {}
	};

	// Only the paste field's check, one worker round trip, comes before
	// chooseSaveLocation: the save picker needs this click's user activation.
	const submit = async (event: SubmitEvent) => {
		event.preventDefault();
		setStarting(true);

		try {
			let keys = publicKeys;

			if (method === 'public-keys' && draft.trim() !== '') {
				keys = [...new Set([...publicKeys, ...(await parseKeys(draft))])];
				addKeys(keys);
			}

			const choice = await chooseSaveLocation('encrypt', props.files);

			if (!choice.location) return;
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
		} catch (cause) {
			setError(errorMessage(cause));
		} finally {
			setStarting(false);
		}
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
					onChange={setMethod}
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
								onChange: (e) => setDraft(e.target.value),
								onPaste: (e) => {
									if (draft.trim() === '') void addPasted(e.clipboardData.getData('text'));
								},
								onKeyDown: (e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										void addDraft();
									}
								}
							}}
							action={
								<TextButton onClick={() => void addDraft()}>{strings.encrypt.addKey}</TextButton>
							}
						/>
						{mixesPqAndClassic(publicKeys) && (
							<Hint tone="warning">{strings.encrypt.mixedKeys}</Hint>
						)}
					</>
				)}

				{error && <Hint tone="error">{error}</Hint>}
				<Warnings files={props.files} />
				<BigButton type="submit" disabled={!ready || starting}>
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
