import {
	buildShareLink,
	deleteContact,
	generateKeyPair,
	generatePassphrase,
	keyFileText,
	listContacts,
	protectKeyFile,
	saveContact,
	type Contact,
	type KeyPair,
	type KeyType
} from '@encryptee/engine';
import { useEffect, useState, type FormEvent } from 'react';
import { strings } from '../strings.ts';
import { Field, Notice } from './ui.tsx';

/** Saves a small file through a blob URL. Key files are a few KB, so this is fine everywhere. */
function saveSmallFile(bytes: Uint8Array<ArrayBuffer> | string, name: string): void {
	const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = name;
	anchor.click();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function KeysPanel() {
	const [type, setType] = useState<KeyType>('pq');
	const [pair, setPair] = useState<KeyPair | null>(null);
	const [protect, setProtect] = useState(true);
	const [passphrase, setPassphrase] = useState('');
	const [saved, setSaved] = useState(false);

	const create = async () => {
		setPair(await generateKeyPair(type));
		setPassphrase(generatePassphrase());
		setSaved(false);
	};

	const save = async () => {
		if (!pair) return;
		const text = keyFileText(pair);
		if (protect)
			saveSmallFile((await protectKeyFile(text, passphrase)) as Uint8Array<ArrayBuffer>, 'key.age');
		else saveSmallFile(text, 'key.txt');
		setSaved(true);
	};

	return (
		<main className="flex flex-col gap-6">
			<section className="flex flex-col gap-3">
				<h2 className="text-xl font-semibold">{strings.keys.generate}</h2>
				<fieldset className="flex gap-4 text-sm">
					<label className="flex items-center gap-2">
						<input type="radio" checked={type === 'pq'} onChange={() => setType('pq')} />
						{strings.keys.postQuantum}
					</label>
					<label className="flex items-center gap-2">
						<input type="radio" checked={type === 'x25519'} onChange={() => setType('x25519')} />
						{strings.keys.classic}
					</label>
				</fieldset>
				<button className="self-start rounded border px-3 py-1.5" onClick={() => void create()}>
					{strings.keys.generate}
				</button>
				{pair && (
					<>
						<label className="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={protect}
								onChange={(e) => setProtect(e.target.checked)}
							/>
							{strings.keys.protect}
						</label>
						{protect && (
							<Field label={strings.encrypt.passphrase}>
								<input value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
							</Field>
						)}
						<button
							className="self-start rounded bg-neutral-900 px-4 py-2 text-white dark:bg-white dark:text-neutral-900"
							disabled={protect && passphrase === ''}
							onClick={() => void save()}
						>
							{strings.keys.save}
						</button>
						<Notice>{strings.keys.savedWarning}</Notice>
						{saved && (
							<>
								<CopyField label={strings.keys.publicKey} value={pair.publicKey} />
								<CopyField label={strings.keys.shareLink} value={buildShareLink(pair.publicKey)} />
							</>
						)}
					</>
				)}
			</section>
			<Contacts />
		</main>
	);
}

function CopyField({ label, value }: { label: string; value: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="flex flex-col gap-1 text-sm">
			<span className="font-medium">{label}</span>
			<div className="flex gap-2">
				<input
					readOnly
					value={value}
					className="flex-1 truncate rounded border px-2 py-1.5 font-mono"
				/>
				<button
					className="rounded border px-3"
					onClick={() => void navigator.clipboard.writeText(value).then(() => setCopied(true))}
				>
					{copied ? strings.keys.copied : strings.keys.copy}
				</button>
			</div>
		</div>
	);
}

function Contacts() {
	const [contacts, setContacts] = useState<Contact[]>([]);
	const [name, setName] = useState('');
	const [key, setKey] = useState('');
	const [error, setError] = useState<string | null>(null);
	const refresh = () => void listContacts().then(setContacts);

	useEffect(refresh, []);

	const add = async (event: FormEvent) => {
		event.preventDefault();
		try {
			await saveContact(name, key);
			setName('');
			setKey('');
			setError(null);
			refresh();
		} catch {
			setError(strings.errors['invalid-public-key']);
		}
	};

	return (
		<section className="flex flex-col gap-3">
			<h2 className="text-xl font-semibold">{strings.keys.contacts}</h2>
			{contacts.length === 0 && (
				<p className="text-sm text-neutral-500">{strings.keys.noContacts}</p>
			)}
			<ul className="flex flex-col gap-1 text-sm">
				{contacts.map((contact) => (
					<li key={contact.id} className="flex items-center gap-2">
						<span className="font-medium">{contact.name}</span>
						<code className="truncate text-neutral-500">{contact.publicKey.slice(0, 24)}…</code>
						<button
							className="underline"
							onClick={() => void deleteContact(contact.id).then(refresh)}
						>
							{strings.keys.remove}
						</button>
					</li>
				))}
			</ul>
			<form className="flex flex-col gap-2" onSubmit={add}>
				<Field label={strings.keys.contactName}>
					<input value={name} onChange={(e) => setName(e.target.value)} />
				</Field>
				<Field label={strings.keys.contactKey}>
					<textarea rows={2} value={key} onChange={(e) => setKey(e.target.value)} />
				</Field>
				{error && <Notice tone="error">{error}</Notice>}
				<button className="self-start rounded border px-3 py-1.5" disabled={!name || !key}>
					{strings.keys.addContact}
				</button>
			</form>
		</section>
	);
}
