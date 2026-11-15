import type { Job } from '@encryptee/engine';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { navItemClass, SiteHeader } from '../SiteHeader.tsx';
import { strings } from '../strings.ts';
import { DecryptCard } from './DecryptCard.tsx';
import { DropOverlay, DropSurface, useWindowDrop } from './DropSurface.tsx';
import { EncryptCard } from './EncryptCard.tsx';
import { useJobSnapshot } from './job.ts';
import { JobScreen } from './JobScreen.tsx';
import { KeysScreen } from './KeysScreen.tsx';
import { classify, type Selection } from './selection.ts';
import { Card, Headline, Hint, TextButton } from './ui.tsx';
import { buildDate, useUpdates } from './updates.ts';

/**
 * The tool, in the "Drop" design (prototype variant A): one surface, one card
 * per step, the mode inferred from the files' headers.
 */
export function App() {
	const [view, setView] = useState<'tool' | 'keys'>('tool');
	const [selection, setSelection] = useState<Selection>({ kind: 'none' });
	/** Counts the selections, so each one gets a fresh card. */
	const [selections, setSelections] = useState(0);
	const [job, setJob] = useState<Job | null>(null);
	const snapshot = useJobSnapshot(job);
	const running = snapshot?.status === 'running';
	const { safety, updateReady, applyUpdate } = useUpdates(running);
	const latest = useRef<File[]>([]);

	// A running job keeps the screen: files dropped or opened meanwhile are ignored.
	const choose = async (files: File[]) => {
		if (running || files.length === 0) return;
		latest.current = files;
		setJob(null);
		setView('tool');
		const chosen = await classify(files);

		// A later choice replaced this one while it was read.
		if (latest.current !== files) return;
		setSelection(chosen);
		setSelections((n) => n + 1);
	};

	const onLaunch = useEffectEvent(choose);
	const dragging = useWindowDrop(choose) && !running;

	useEffect(() => {
		// PWA file handler for .age files (D15, Chromium).
		window.launchQueue?.setConsumer(async (params) => {
			const handles = params.files.filter((handle) => handle instanceof FileSystemFileHandle);
			onLaunch(await Promise.all(handles.map((handle) => handle.getFile())));
		});
	}, []);

	const reset = () => {
		setJob(null);
		setSelection({ kind: 'none' });
	};

	const step = view === 'keys' ? 'keys' : job ? `job-${snapshot?.status}` : selection.kind;
	// The page load neither animates nor moves focus; a step change after it does.
	const [shown, setShown] = useState({ step, changed: false });

	if (shown.step !== step) setShown({ step, changed: true });
	// The drop surface and the running job sit centered; a form sits high and
	// grows down, so nothing above the pointer moves when it changes height.
	const centered = step === 'none' || step === 'job-running';

	let content;

	if (view === 'keys') content = <KeysScreen disabled={safety === 'unsafe'} />;
	else if (job && snapshot)
		content = <JobScreen snapshot={snapshot} onCancel={job.cancel} onReset={reset} />;
	else if (selection.kind === 'encrypt')
		content = (
			<EncryptCard
				files={selection.files}
				disabled={safety === 'unsafe'}
				onStart={setJob}
				onBack={reset}
			/>
		);
	else if (selection.kind === 'decrypt')
		content = (
			<DecryptCard
				files={selection.files}
				unlock={selection.unlock}
				disabled={safety === 'unsafe'}
				onStart={setJob}
				onBack={reset}
			/>
		);
	else if (selection.kind === 'invalid')
		content = (
			<Card>
				<Headline>{strings.selection.unusable(selection.files.length)}</Headline>
				<Hint tone="error">{selection.message}</Hint>
				<TextButton className="mt-6" onClick={reset}>
					{strings.selection.other}
				</TextButton>
			</Card>
		);
	else content = <DropSurface onFiles={choose} dragging={dragging} returning={shown.changed} />;

	return (
		<div className="flex min-h-dvh flex-col">
			<SiteHeader
				onWordmarkClick={() => {
					setView('tool');

					if (!job) reset();
				}}
			>
				<button
					className={navItemClass}
					aria-current={view === 'keys' ? 'page' : undefined}
					onClick={() => setView(view === 'keys' ? 'tool' : 'keys')}
				>
					{strings.nav.keys}
				</button>
			</SiteHeader>

			{/* Always mounted: a live region only announces what changes inside it. */}
			<div className="px-6 text-center text-sm" aria-live="polite">
				{updateReady && (
					<p>
						{strings.update.ready}{' '}
						<TextButton onClick={applyUpdate}>{strings.update.reload}</TextButton>
					</p>
				)}
				{safety === 'unsafe' && <Hint tone="error">{strings.update.unsafe}</Hint>}
				{safety === 'unknown' && !navigator.onLine && (
					<p className="text-muted">{strings.update.offline(buildDate)}</p>
				)}
			</div>

			<main
				className={`flex flex-1 justify-center px-6 pb-24 ${centered ? 'items-center pt-8' : 'items-start pt-[12vh]'}`}
			>
				<div
					// Each selection gets a fresh card; the Keys screen and a job keep theirs.
					key={view === 'keys' || job ? step : `${step} ${selections}`}
					className={`flex w-full justify-center ${shown.changed ? 'motion-safe:animate-step-in' : ''}`}
				>
					{content}
				</div>
			</main>
			{dragging && step !== 'none' && <DropOverlay />}
		</div>
	);
}
