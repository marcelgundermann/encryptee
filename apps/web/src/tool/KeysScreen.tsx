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
	StableLabel,
	TextButton,
	touchScreen,
	useCopy
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
	/**
	 * A saved or opened key: show the public half. `pair` is set if we can save
	 * it again, `savedAs` if we just saved it.
	 */
	| { kind: 'show'; publicKey: string; pair: KeyPair | null; savedAs: string | null };

type Pending = 'create' | 'save' | 'open';

export function KeysScreen() {
	const [stage, setStage] = useState<Stage>({ kind: 'start' });
	const [type, setType] = useState<KeyType>('pq');
	const [protect, setProtect] = useState(true);
	const { passphrase, field: passphraseField } = usePassphraseChoice('keys');
	const [opening, setOpening] = useState<{ name: string; bytes: Uint8Array } | null>(null);
	const [openPassphrase, setOpenPassphrase] = useState('');
	// Key generation and scrypt take a moment: one click, one result.
	const [pending, setPending] = useState<Pending | null>(null);
	const [error, setError] = useState<string | null>(null);
	const fileInput = useRef<HTMLInputElement>(null);

	const create = async () => {
		setPending('create');
		setError(null);

		try {
			setStage({ kind: 'save', pair: await generateKeyPair(type) });
		} catch (cause) {
			setError(errorMessage(cause));
		} finally {
			setPending(null);
		}
	};

	const save = async (pair: KeyPair) => {
		setPending('save');
		setError(null);
		const text = keyFileText(pair);
		const name = protect ? 'key.age' : 'key.txt';

		try {
			// A Blob takes only ArrayBuffer-backed views; copy into one.
			saveSmallFile(protect ? new Uint8Array(await protectKeyFile(text, passphrase!)) : text, name);
			setStage({ kind: 'show', publicKey: pair.publicKey, pair, savedAs: name });
		} catch (cause) {
			setError(errorMessage(cause));
		} finally {
			setPending(null);
		}
	};

	const open = async (name: string, bytes: Uint8Array, pass?: string) => {
		setPending('open');
		setError(null);

		try {
			const contents = await readKeyFile(bytes, pass);

			if (contents.protected) {
				setOpening({ name, bytes });

				return;
			}

			setOpening(null);
			setStage({ kind: 'show', publicKey: contents.publicKeys[0]!, pair: null, savedAs: null });
		} catch (cause) {
			setError(errorMessage(cause));
		} finally {
			setPending(null);
		}
	};

	const submitOpening = () => {
		if (opening && pending === null) void open(opening.name, opening.bytes, openPassphrase);
	};

	return (
		<Card>
			<Kicker>{strings.keys.kicker}</Kicker>

			{stage.kind === 'start' && (
				<>
					<Headline>{strings.keys.title}</Headline>
					<Segmented
						label={strings.keys.type}
						value={type}
						onChange={setType}
						options={[
							{ value: 'pq', label: strings.keys.postQuantum },
							{ value: 'x25519', label: strings.keys.classic }
						]}
					/>
					<Hint>{strings.keys.typeHint}</Hint>
					<BigButton disabled={pending !== null} onClick={() => void create()}>
						{pending === 'create' ? strings.keys.creating : strings.keys.create}
					</BigButton>
					<TextButton tone="muted" className="mt-4" onClick={() => fileInput.current?.click()}>
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
								autoFocus: !touchScreen(),
								value: openPassphrase,
								onChange: (e) => setOpenPassphrase(e.target.value),
								onKeyDown: (e) => {
									if (e.key === 'Enter') submitOpening();
								}
							}}
							action={
								<TextButton onClick={submitOpening}>
									<StableLabel
										current={
											pending === 'open' ? strings.decrypt.checking : strings.decrypt.applyKeyFile
										}
										labels={[strings.decrypt.applyKeyFile, strings.decrypt.checking]}
									/>
								</TextButton>
							}
						/>
					)}
				</>
			)}

			{stage.kind === 'save' && (
				<>
					<Headline>{strings.keys.saveTitle}</Headline>
					<label className="mt-8 flex min-h-11 cursor-pointer items-center gap-3 text-sm">
						<input
							type="checkbox"
							className="size-4 accent-fg"
							checked={protect}
							onChange={(e) => setProtect(e.target.checked)}
						/>
						{strings.keys.protect}
					</label>
					{protect && passphraseField}
					<BigButton
						disabled={(protect && passphrase === null) || pending !== null}
						onClick={() => void save(stage.pair)}
					>
						{pending === 'save' ? strings.keys.saving : strings.keys.save}
					</BigButton>
					<Hint>{strings.keys.privateNote}</Hint>
				</>
			)}

			{stage.kind === 'show' && (
				<ShowKey
					stage={stage}
					pending={pending}
					onSave={save}
					onRestart={() => setStage({ kind: 'start' })}
				/>
			)}

			{error && <Hint tone="error">{error}</Hint>}
		</Card>
	);
}

function ShowKey(props: {
	stage: Extract<Stage, { kind: 'show' }>;
	pending: Pending | null;
	onSave: (pair: KeyPair) => Promise<void>;
	onRestart: () => void;
}) {
	const { publicKey, pair, savedAs } = props.stage;
	const { isCopied, copy } = useCopy();
	const box = useRef<HTMLParagraphElement>(null);

	return (
		<>
			<Headline>{strings.keys.title}</Headline>
			{savedAs && <Hint>{strings.keys.savedTo(savedAs)}</Hint>}
			<MonoBox ref={box} label={strings.keys.publicKey}>
				{publicKey}
			</MonoBox>
			<div className="mt-4 grid">
				<OutlineButton onClick={() => void copy(publicKey, box.current)}>
					{isCopied(publicKey) ? strings.keys.copied : strings.keys.copyKey}
				</OutlineButton>
			</div>
			<Hint>{strings.keys.privateNote}</Hint>
			<div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
				{pair && (
					<TextButton
						tone="muted"
						disabled={props.pending !== null}
						onClick={() => void props.onSave(pair)}
					>
						{props.pending === 'save' ? strings.keys.saving : strings.keys.saveAgain}
					</TextButton>
				)}
				<TextButton tone="muted" onClick={props.onRestart}>
					{strings.keys.another}
				</TextButton>
			</div>
		</>
	);
}
