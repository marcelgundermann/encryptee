import {
	listContacts,
	mixesPqAndClassic,
	validatePublicKeys,
	type Contact,
	type Job
} from '@encryptee/engine';
import { useEffect, useState, type FormEvent } from 'react';
import { errorMessage, strings } from '../strings.ts';
import { asksWhereToSave, pickAndStart } from './job.ts';
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

type Method = 'passphrase' | 'people';

export function EncryptCard(props: {
	files: File[];
	/** A public key from a share link (`#to=`), added as a recipient. */
	presetKey: string | null;
	disabled: boolean;
	onStart: (job: Job) => void;
	onBack: () => void;
}) {
	const [method, setMethod] = useState<Method>(props.presetKey ? 'people' : 'passphrase');
	const { passphrase, field: passphraseField } = usePassphraseChoice('encrypt');
	const [contacts, setContacts] = useState<Contact[]>([]);
	const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
	const [pasted, setPasted] = useState<string[]>(props.presetKey ? [props.presetKey] : []);
	const [draft, setDraft] = useState('');
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		void listContacts().then(setContacts);
	}, []);

	const publicKeys = [
		...contacts.filter((c) => chosen.has(c.id)).map((c) => c.publicKey),
		...pasted
	];
	const ready = method === 'passphrase' ? passphrase !== null : publicKeys.length > 0;

	const addPasted = async () => {
		try {
			const keys = await validatePublicKeys(draft.split(/\s+/).filter(Boolean));
			setPasted((current) => [...new Set([...current, ...keys])]);
			setDraft('');
			setError(null);
		} catch (cause) {
			setError(errorMessage(cause));
		}
	};

	// Nothing is awaited before pickAndStart: the save picker needs this click.
	const submit = async (event: FormEvent) => {
		event.preventDefault();
		const result = await pickAndStart({
			mode: 'encrypt',
			files: props.files,
			credentials:
				method === 'passphrase'
					? { kind: 'passphrase', passphrase: passphrase! }
					: { kind: 'public-keys', publicKeys }
		});
		if (result.job) props.onStart(result.job);
		else if (result.reason === 'unsupported') setError(strings.unsupported);
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
						{ value: 'people', label: strings.encrypt.people }
					]}
				/>

				{method === 'passphrase' && passphraseField}

				{method === 'people' && (
					<>
						<ul className="mt-6 flex flex-wrap gap-2">
							{contacts.map((contact) => {
								const on = chosen.has(contact.id);
								return (
									<li key={contact.id}>
										<button
											type="button"
											aria-pressed={on}
											onClick={() =>
												setChosen((current) => {
													const next = new Set(current);
													if (on) next.delete(contact.id);
													else next.add(contact.id);
													return next;
												})
											}
											className={`rounded-full border-2 px-4 py-1.5 text-sm transition ${
												on
													? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black'
													: 'border-neutral-200 hover:border-black dark:border-neutral-800 dark:hover:border-white'
											}`}
										>
											{contact.name}
										</button>
									</li>
								);
							})}
							{pasted.map((key) => (
								<li key={key}>
									<button
										type="button"
										onClick={() => setPasted((current) => current.filter((k) => k !== key))}
										className="rounded-full border-2 border-black bg-black px-4 py-1.5 font-mono text-sm text-white dark:border-white dark:bg-white dark:text-black"
									>
										{key.slice(0, 12)}…{key.slice(-4)} ×
									</button>
								</li>
							))}
						</ul>
						{contacts.length === 0 && pasted.length === 0 && (
							<Hint>{strings.encrypt.noContacts}</Hint>
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
					{asksWhereToSave(props.files.length)
						? strings.encrypt.savePicker(props.files.length)
						: strings.encrypt.saveDownload}
				</p>
			</form>
		</Card>
	);
}
