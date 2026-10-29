import { generatePassphrase } from '@encryptee/engine';
import { useState, type ReactNode } from 'react';
import { strings } from '../strings.ts';
import { Hint, LineField, TextButton } from './ui.tsx';

export interface PassphraseChoice {
	/** Null until usable. */
	passphrase: string | null;
	field: ReactNode;
}

/**
 * A generated passphrase by default (shown in full, so it can be written
 * down), or the user's own, typed twice.
 */
export function usePassphraseChoice(id: string): PassphraseChoice {
	const [generated, setGenerated] = useState(generatePassphrase);
	const [ownMode, setOwnMode] = useState(false);
	const [own, setOwn] = useState('');
	const [repeat, setRepeat] = useState('');
	const [copied, setCopied] = useState(false);

	const copy = async () => {
		await navigator.clipboard.writeText(generated);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const passphrase = ownMode ? (own !== '' && own === repeat ? own : null) : generated;

	const field = ownMode ? (
		<>
			<LineField
				id={`${id}-own`}
				label={strings.encrypt.passphrase}
				input={{
					type: 'password',
					autoComplete: 'new-password',
					value: own,
					onChange: (e) => setOwn(e.target.value)
				}}
			/>
			<LineField
				id={`${id}-repeat`}
				label={strings.encrypt.repeat}
				input={{
					type: 'password',
					autoComplete: 'new-password',
					value: repeat,
					onChange: (e) => setRepeat(e.target.value)
				}}
			/>
			{repeat !== '' && repeat !== own && <Hint tone="error">{strings.encrypt.mismatch}</Hint>}
			<TextButton className="mt-3 text-neutral-500" onClick={() => setOwnMode(false)}>
				{strings.encrypt.generatedPassphrase}
			</TextButton>
		</>
	) : (
		<>
			<div className="mt-6">
				<p id={`${id}-generated-label`} className="text-sm text-neutral-500">
					{strings.encrypt.passphrase}
				</p>
				<div className="mt-2 flex items-start gap-3 border-b-2 border-black pb-2 dark:border-white">
					<output
						id={`${id}-generated`}
						aria-labelledby={`${id}-generated-label`}
						className="min-w-0 flex-1 font-mono text-lg break-words"
					>
						{generated}
					</output>
					<TextButton className="mt-1" onClick={() => void copy()}>
						{copied ? strings.keys.copied : strings.encrypt.copy}
					</TextButton>
					<TextButton className="mt-1" onClick={() => setGenerated(generatePassphrase())}>
						{strings.encrypt.newPassphrase}
					</TextButton>
				</div>
			</div>
			<Hint>{strings.encrypt.generatedHint}</Hint>
			<TextButton className="mt-3 text-neutral-500" onClick={() => setOwnMode(true)}>
				{strings.encrypt.ownPassphrase}
			</TextButton>
		</>
	);

	return { passphrase, field };
}
