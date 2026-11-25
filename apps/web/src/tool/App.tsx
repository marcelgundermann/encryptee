import type { Job } from '@encryptee/engine';
import { useEffect, useReducer, useState } from 'react';
import { useLaunchedFiles } from '../launched-files.ts';
import { navItemClass, SiteHeader } from '../SiteHeader.tsx';
import { strings } from '../strings.ts';
import { DecryptCard } from './DecryptCard.tsx';
import { DropOverlay, DropSurface, useWindowDrop } from './DropSurface.tsx';
import { EncryptCard } from './EncryptCard.tsx';
import { useJobSnapshot } from './job.ts';
import { JobScreen } from './JobScreen.tsx';
import { KeysDialog } from './KeysScreen.tsx';
import { classify } from './selection.ts';
import { firstStep, nextStep, stepName } from './steps.ts';
import { Card, Headline, Hint, Message, TextButton } from './ui.tsx';

/**
 * The tool, in the "Drop" design (prototype variant A): one surface, one card
 * per step, the mode inferred from the files' headers.
 */
export function App() {
	const [steps, dispatch] = useReducer(nextStep, firstStep);
	const { step } = steps;
	const job = step.kind === 'job' ? step.job : null;
	const snapshot = useJobSnapshot(job);
	const running = snapshot?.status === 'running';
	const [keysOpen, setKeysOpen] = useState(false);

	// Leaving the tool for a content page ends a job that's still running.
	useEffect(() => () => job?.cancel(), [job]);

	// A running job keeps the screen: files dropped or opened meanwhile are ignored.
	// Files chosen while Keys is open close it, and the tool shows them.
	const choose = async (files: File[]) => {
		if (running || files.length === 0) return;
		setKeysOpen(false);
		dispatch({ type: 'chose', files });
		dispatch({ type: 'classified', files, selection: await classify(files) });
	};

	const dragging = useWindowDrop(choose) && !running;

	useLaunchedFiles(choose);

	const reset = () => dispatch({ type: 'reset' });
	const start = (started: Job) => dispatch({ type: 'started', job: started });

	const name = stepName(steps, snapshot?.status ?? null);
	// The page load neither animates nor moves focus; a step change after it does.
	const [shown, setShown] = useState({ name, changed: false });

	if (shown.name !== name) setShown({ name, changed: true });
	// The drop surface and the running job sit centered; a form sits high and
	// grows down, so nothing above the pointer moves when it changes height.
	const centered = name === 'none' || name === 'job-running';

	let content;

	if (job && snapshot)
		content = <JobScreen snapshot={snapshot} onCancel={job.cancel} onReset={reset} />;
	else if (step.kind === 'encrypt')
		content = <EncryptCard files={step.files} onStart={start} onBack={reset} />;
	else if (step.kind === 'decrypt')
		content = (
			<DecryptCard files={step.files} unlock={step.unlock} onStart={start} onBack={reset} />
		);
	else if (step.kind === 'invalid')
		content = (
			<Card>
				<Headline>{strings.selection.unusable(step.files.length)}</Headline>
				<Hint tone="error">
					<Message text={step.message} />
				</Hint>
				<TextButton className="mt-6" onClick={reset}>
					{strings.selection.other}
				</TextButton>
			</Card>
		);
	else content = <DropSurface onFiles={choose} dragging={dragging} returning={shown.changed} />;

	return (
		<div className="flex min-h-dvh flex-col">
			<SiteHeader onWordmarkClick={() => dispatch({ type: 'home' })}>
				<button className={navItemClass} aria-haspopup="dialog" onClick={() => setKeysOpen(true)}>
					{strings.nav.keys}
				</button>
			</SiteHeader>

			<main
				className={`flex flex-1 justify-center px-6 pb-24 ${centered ? 'items-center pt-8' : 'items-start pt-[12vh]'}`}
			>
				<div
					// Each selection gets a fresh card; a job keeps its own.
					key={job ? name : `${name} ${steps.selections}`}
					className={`flex w-full justify-center ${shown.changed ? 'motion-safe:animate-step-in' : ''}`}
				>
					{content}
				</div>
			</main>
			{dragging && name !== 'none' && <DropOverlay />}
			{keysOpen && <KeysDialog onClose={() => setKeysOpen(false)} />}
		</div>
	);
}
