import { generatePassphrase } from '@encryptee/engine';
import { useRef, useState, type ReactNode } from 'react';
import { strings } from '#/strings.ts';
import { Hint, LineField, StableLabel, TextButton, useCopy } from './ui.tsx';

export interface PassphraseChoice {
	/** Null until usable. */
	passphrase: string | null;
	field: ReactNode;
}

/**
 * A generated passphrase by default (shown in full, so it can be written
 * down), or the user's own, typed twice. Its fields' ids start with `id`;
 * the e2e tests use them.
 */
export function usePassphraseChoice(id: string): PassphraseChoice {
	const [generated, setGenerated] = useState(generatePassphrase);
	const [ownMode, setOwnMode] = useState(false);
	const [own, setOwn] = useState('');
	const [repeat, setRepeat] = useState('');
	// A mismatch shows once the repeat is complete or left, then updates live.
	const [checkRepeat, setCheckRepeat] = useState(false);
	const { isCopied, copy } = useCopy();
	const output = useRef<HTMLOutputElement>(null);

	const passphrase = ownMode ? (own !== '' && own === repeat ? own : null) : generated;
	const mismatch = checkRepeat && repeat !== '' && repeat !== own;

	const field = (
		<>
			{ownMode ? (
				<>
					<LineField
						id={`${id}-own`}
						label={strings.passphrase.label}
						input={{
							type: 'password',
							autoComplete: 'new-password',
							// Only ever mounts on "Use my own", so typing is what comes next.
							autoFocus: true,
							value: own,
							onChange: (e) => setOwn(e.target.value)
						}}
					/>
					<LineField
						id={`${id}-repeat`}
						label={strings.passphrase.repeat}
						input={{
							type: 'password',
							autoComplete: 'new-password',
							value: repeat,
							'aria-invalid': mismatch || undefined,
							'aria-describedby': mismatch ? `${id}-mismatch` : undefined,
							onChange: (e) => {
								setRepeat(e.target.value);

								if (e.target.value.length >= own.length) setCheckRepeat(true);
							},
							onBlur: () => setCheckRepeat(true)
						}}
					/>
					{mismatch && (
						<Hint id={`${id}-mismatch`} tone="error">
							{strings.passphrase.mismatch}
						</Hint>
					)}
				</>
			) : (
				<>
					<div className="mt-6">
						<p id={`${id}-generated-label`} className="text-sm text-muted">
							{strings.passphrase.label}
						</p>
						<div className="mt-2 flex items-start gap-4 border-b-2 border-fg pb-2">
							<output
								ref={output}
								id={`${id}-generated`}
								aria-labelledby={`${id}-generated-label`}
								// Page translation can run in the cloud; the passphrase never leaves the device.
								translate="no"
								className="min-w-0 flex-1 font-mono text-lg break-words select-all"
							>
								{generated}
							</output>
							<TextButton className="mt-1" onClick={() => void copy(generated, output.current)}>
								<StableLabel
									labels={[strings.passphrase.copy, strings.passphrase.copied]}
									shown={isCopied(generated) ? 1 : 0}
								/>
							</TextButton>
							<TextButton className="mt-1" onClick={() => setGenerated(generatePassphrase())}>
								{strings.passphrase.new}
							</TextButton>
						</div>
					</div>
					<Hint>{strings.passphrase.generatedHint}</Hint>
				</>
			)}
			{/* One button for both ways, so it keeps focus when it's pressed. */}
			<TextButton tone="muted" className="mt-3" onClick={() => setOwnMode(!ownMode)}>
				{ownMode ? strings.passphrase.generated : strings.passphrase.own}
			</TextButton>
		</>
	);

	return { passphrase, field };
}
