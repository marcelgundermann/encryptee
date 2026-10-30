import {
	generateKeyPair,
	keyFileText,
	protectKeyFile,
	readKeyFile,
	type KeyPair,
	type KeyType
} from '@encryptee/engine';
import { useRef, useState } from 'react';
import { errorMessage, strings } from '../strings.ts';
import { usePassphraseChoice } from './PassphraseChoice.tsx';
import {
	BigButton,
	Card,
	Headline,
	Hint,
	Kicker,
	LineField,
	MonoBox,
	OutlineButton,
	Segmented,
	TextButton
} from './ui.tsx';

/** Saves a small file through a blob URL. Key files are a few KB, so this works everywhere. */
function saveSmallFile(contents: Uint8Array<ArrayBuffer> | string, name: string): void {
	const url = URL.createObjectURL(new Blob([contents], { type: 'application/octet-stream' }));
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = name;
	anchor.click();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

type Stage =
	| { kind: 'start' }
	/** A fresh key pair that hasn't been saved yet: nothing else is shown until it is. */
	| { kind: 'save'; pair: KeyPair }
	/** A saved or opened key: show the public half. `pair` is set if we can save it again. */
	| { kind: 'show'; publicKey: string; pair: KeyPair | null };

export function KeysScreen() {
	const [stage, setStage] = useState<Stage>({ kind: 'start' });
	const [type, setType] = useState<KeyType>('pq');
	const [protect, setProtect] = useState(true);
	const { passphrase, field: passphraseField } = usePassphraseChoice('keys');
	const [opening, setOpening] = useState<{ name: string; bytes: Uint8Array } | null>(null);
	const [openPassphrase, setOpenPassphrase] = useState('');
	const [error, setError] = useState<string | null>(null);
	const fileInput = useRef<HTMLInputElement>(null);

	const save = async (pair: KeyPair) => {
		const text = keyFileText(pair);

		if (protect) {
			// A Blob takes only ArrayBuffer-backed views; copy into one.
			saveSmallFile(new Uint8Array(await protectKeyFile(text, passphrase!)), 'key.age');
		} else {
			saveSmallFile(text, 'key.txt');
		}

		setStage({ kind: 'show', publicKey: pair.publicKey, pair });
	};

	const open = async (name: string, bytes: Uint8Array, pass?: string) => {
		setError(null);

		try {
			const contents = await readKeyFile(bytes, pass);

			if (contents.protected) {
				setOpening({ name, bytes });

				return;
			}

			setOpening(null);
			setStage({ kind: 'show', publicKey: contents.publicKeys[0]!, pair: null });
		} catch (cause) {
			setError(errorMessage(cause));
		}
	};

	return (
		<Card>
			<Kicker>{strings.keys.kicker}</Kicker>

			{stage.kind === 'start' && (
				<>
					<Headline>{strings.keys.title}</Headline>
					<Segmented
						label={strings.keys.kicker}
						value={type}
						onChange={setType}
						options={[
							{ value: 'pq', label: strings.keys.postQuantum },
							{ value: 'x25519', label: strings.keys.classic }
						]}
					/>
					<Hint>{strings.keys.typeHint}</Hint>
					<BigButton
						onClick={async () => setStage({ kind: 'save', pair: await generateKeyPair(type) })}
					>
						{strings.keys.create}
					</BigButton>
					<TextButton className="mt-4 text-neutral-500" onClick={() => fileInput.current?.click()}>
						{strings.keys.openExisting}
					</TextButton>
					<input
						ref={fileInput}
						type="file"
						hidden
						aria-label={strings.keys.openExisting}
						onChange={async (event) => {
							const file = event.currentTarget.files?.[0];
							event.currentTarget.value = '';

							if (file) await open(file.name, new Uint8Array(await file.arrayBuffer()));
						}}
					/>
					{opening && (
						<LineField
							id="keys-open-passphrase"
							label={strings.decrypt.keyFilePassphrase}
							input={{
								type: 'password',
								autoFocus: true,
								value: openPassphrase,
								onChange: (e) => setOpenPassphrase(e.target.value),
								onKeyDown: (e) => {
									if (e.key === 'Enter') void open(opening.name, opening.bytes, openPassphrase);
								}
							}}
							action={
								<TextButton onClick={() => void open(opening.name, opening.bytes, openPassphrase)}>
									{strings.decrypt.unlockKeyFile}
								</TextButton>
							}
						/>
					)}
				</>
			)}

			{stage.kind === 'save' && (
				<>
					<Headline>{strings.keys.saveTitle}</Headline>
					<label className="mt-8 flex items-center gap-3 text-sm">
						<input
							type="checkbox"
							className="size-4 accent-black dark:accent-white"
							checked={protect}
							onChange={(e) => setProtect(e.target.checked)}
						/>
						{strings.keys.protect}
					</label>
					{protect && passphraseField}
					<BigButton
						disabled={protect && passphrase === null}
						onClick={() => void save(stage.pair)}
					>
						{strings.keys.save}
					</BigButton>
					<Hint>{strings.keys.privateNote}</Hint>
				</>
			)}

			{stage.kind === 'show' && (
				<>
					<Headline>{strings.keys.title}</Headline>
					<MonoBox label={strings.keys.publicKey}>{stage.publicKey}</MonoBox>
					<div className="mt-4 grid">
						<CopyButton label={strings.keys.copyKey} value={stage.publicKey} />
					</div>
					<Hint>{strings.keys.privateNote}</Hint>
					{stage.pair && (
						<TextButton className="mt-4 text-neutral-500" onClick={() => void save(stage.pair!)}>
							{strings.keys.saveAgain}
						</TextButton>
					)}
				</>
			)}

			{error && <Hint tone="error">{error}</Hint>}
		</Card>
	);
}

function CopyButton({ label, value }: { label: string; value: string }) {
	const [copied, setCopied] = useState(false);

	const copy = async () => {
		await navigator.clipboard.writeText(value);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<OutlineButton onClick={() => void copy()}>
			{copied ? strings.keys.copied : label}
		</OutlineButton>
	);
}
