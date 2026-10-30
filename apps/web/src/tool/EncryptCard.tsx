import {
	chooseSaveLocation,
	mixesPqAndClassic,
	startJob,
	validatePublicKeys,
	whereToSave,
	type Job
} from '@encryptee/engine';
import { useState, type FormEvent } from 'react';
import { errorMessage, strings } from '../strings.ts';
import { usePassphraseChoice } from './PassphraseChoice.tsx';
import { Warnings } from './Warnings.tsx';
import {
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

export function EncryptCard(props: {
	files: File[];
	disabled: boolean;
	onStart: (job: Job) => void;
	onBack: () => void;
}) {
	const [method, setMethod] = useState<Method>('passphrase');
	const { passphrase, field: passphraseField } = usePassphraseChoice('encrypt');
	const [publicKeys, setPublicKeys] = useState<string[]>([]);
	const [draft, setDraft] = useState('');
	const [error, setError] = useState<string | null>(null);

	const ready = method === 'passphrase' ? passphrase !== null : publicKeys.length > 0;

	const addPasted = async () => {
		try {
			const keys = await validatePublicKeys(draft.split(/\s+/).filter(Boolean));
			setPublicKeys((current) => [...new Set([...current, ...keys])]);
			setDraft('');
			setError(null);
		} catch (cause) {
			setError(errorMessage(cause));
		}
	};

	// Nothing is awaited before chooseSaveLocation: the save picker needs this click.
	const submit = async (event: FormEvent) => {
		event.preventDefault();
		const choice = await chooseSaveLocation('encrypt', props.files);

		if (choice.location) {
			props.onStart(
				startJob({
					mode: 'encrypt',
					files: props.files,
					save: choice.location,
					credentials:
						method === 'passphrase'
							? { kind: 'passphrase', passphrase: passphrase! }
							: { kind: 'public-keys', publicKeys }
				})
			);
		} else if (choice.reason === 'unsupported') setError(strings.unsupported);
		else if (choice.reason === 'save-failed') setError(strings.errors['save-failed']);
	};

	return (
		<Card>
			<form onSubmit={submit}>
				<Kicker>{strings.selection.encrypting(props.files.length)}</Kicker>
				<FileLines files={props.files} />
				<TextButton className="mt-3 text-neutral-500" onClick={props.onBack}>
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
									<li key={key}>
										<button
											type="button"
											onClick={() => setPublicKeys((current) => current.filter((k) => k !== key))}
											className="rounded-full border-2 border-black bg-black px-4 py-1.5 font-mono text-sm text-white dark:border-white dark:bg-white dark:text-black"
										>
											{key.slice(0, 12)}…{key.slice(-4)} ×
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
								onKeyDown: (e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										void addPasted();
									}
								}
							}}
							action={
								<TextButton disabled={draft.trim() === ''} onClick={() => void addPasted()}>
									{strings.encrypt.addKey}
								</TextButton>
							}
						/>
						{mixesPqAndClassic(publicKeys) && (
							<Hint tone="warning">{strings.encrypt.mixedKeys}</Hint>
						)}
					</>
				)}

				{error && <Hint tone="error">{error}</Hint>}
				<Warnings mode="encrypt" files={props.files} />
				<BigButton type="submit" disabled={!ready || props.disabled}>
					{strings.encrypt.submit(props.files.length)}
				</BigButton>
				<p className="mt-3 text-center text-xs text-neutral-400">
					{whereToSave(props.files.length) === 'ask'
						? strings.encrypt.savePicker(props.files.length)
						: strings.encrypt.saveDownload}
				</p>
			</form>
		</Card>
	);
}
