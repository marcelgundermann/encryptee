import { generateKeyPair, saveKeyFile, type KeyPair, type KeyType } from '@encryptee/engine';
import { useRef, useState } from 'react';
import { errorMessage, strings } from '../strings.ts';
import { usePassphraseChoice } from './PassphraseChoice.tsx';
import {
	BigButton,
	Card,
	Headline,
	Hint,
	Kicker,
	MonoBox,
	OutlineButton,
	Segmented,
	TextButton,
	useCopy
} from './ui.tsx';
import { useKeyFile } from './useKeyFile.tsx';

type Stage =
	| { kind: 'start' }
	/** A fresh key pair that hasn't been saved yet: nothing else is shown until it is. */
	| { kind: 'save'; pair: KeyPair }
	/**
	 * A saved or opened key: show the public half. `pair` is set if we can save
	 * it again, `savedAs` if we just saved it.
	 */
	| { kind: 'show'; publicKey: string; pair: KeyPair | null; savedAs: string | null };

type Pending = 'create' | 'save';

export function KeysScreen() {
	const [stage, setStage] = useState<Stage>({ kind: 'start' });
	const [type, setType] = useState<KeyType>('pq');
	const [protect, setProtect] = useState(true);
	const { passphrase, field: passphraseField } = usePassphraseChoice('keys');
	// Key generation and scrypt take a moment: one click, one result.
	const [pending, setPending] = useState<Pending | null>(null);
	const [error, setError] = useState<string | null>(null);

	const keyFile = useKeyFile('keys', (keys) => {
		setError(null);

		if (keys) setStage({ kind: 'show', publicKey: keys.publicKeys[0]!, pair: null, savedAs: null });
	});

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

		try {
			const savedAs = await saveKeyFile(pair, protect ? passphrase! : null);
			setStage({ kind: 'show', publicKey: pair.publicKey, pair, savedAs });
		} catch (cause) {
			setError(errorMessage(cause));
		} finally {
			setPending(null);
		}
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
					<BigButton disabled={pending !== null || keyFile.reading} onClick={() => void create()}>
						{pending === 'create' ? strings.keys.creating : strings.keys.create}
					</BigButton>
					<TextButton tone="muted" className="mt-4" onClick={keyFile.choose}>
						{strings.keys.openExisting}
					</TextButton>
					{keyFile.field}
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
