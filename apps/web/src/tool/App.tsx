import { parseShareLink, type Job } from '@encryptee/engine';
import { useEffect, useEffectEvent, useState } from 'react';
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
	const [job, setJob] = useState<Job | null>(null);
	// Share links: encryptee.io/#to=age1… preselect that public key (D10).
	const [presetKey] = useState(() => parseShareLink(location.hash));
	const snapshot = useJobSnapshot(job);
	const running = snapshot?.status === 'running';
	const { safety, updateReady, applyUpdate } = useUpdates(running);

	const choose = (files: File[]) => {
		setJob(null);
		setView('tool');
		void classify(files).then(setSelection);
	};

	const onLaunch = useEffectEvent(choose);
	const dragging = useWindowDrop(choose, !running);

	useEffect(() => {
		// The key now lives in state; drop it from the address bar.
		if (presetKey) history.replaceState(null, '', location.pathname);
	}, [presetKey]);

	useEffect(() => {
		// PWA file handler for .age files (D15, Chromium).
		const queue = (window as { launchQueue?: LaunchQueue }).launchQueue;
		queue?.setConsumer(async (params) => {
			const handles = params.files as FileSystemFileHandle[];
			onLaunch(await Promise.all(handles.map((handle) => handle.getFile())));
		});
	}, []);

	const reset = () => {
		setJob(null);
		setSelection({ kind: 'none' });
	};

	let content;

	if (view === 'keys') content = <KeysScreen />;
	else if (job) content = <JobScreen job={job} onReset={reset} />;
	else if (selection.kind === 'encrypt')
		content = (
			<EncryptCard
				files={selection.files}
				presetKey={presetKey}
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
				<Headline tone="error">{selection.message}</Headline>
				<TextButton className="mt-6" onClick={reset}>
					{strings.selection.other}
				</TextButton>
			</Card>
		);
	else content = <DropSurface onFiles={choose} dragging={dragging} />;

	return (
		<div className="flex min-h-dvh flex-col">
			<header className="flex items-center justify-between gap-4 px-6 py-5 text-sm">
				<button
					className="font-semibold tracking-tight"
					onClick={() => {
						setView('tool');

						if (!running && !job) reset();
					}}
				>
					{strings.wordmark}
				</button>
				<nav className="flex gap-5 text-neutral-500">
					<button
						className={
							view === 'keys'
								? 'text-black dark:text-white'
								: 'hover:text-black dark:hover:text-white'
						}
						aria-current={view === 'keys' ? 'page' : undefined}
						onClick={() => setView(view === 'keys' ? 'tool' : 'keys')}
					>
						{strings.nav.keys}
					</button>
					<a className="hover:text-black dark:hover:text-white" href="/how-it-works/">
						{strings.nav.howItWorks}
					</a>
					<a className="hidden hover:text-black sm:inline dark:hover:text-white" href="/security/">
						{strings.nav.security}
					</a>
					<a className="hover:text-black dark:hover:text-white" href="/faq/">
						{strings.nav.faq}
					</a>
				</nav>
			</header>

			{(updateReady || safety === 'unsafe' || (safety === 'unknown' && !navigator.onLine)) && (
				<div className="px-6 text-center text-sm" aria-live="polite">
					{updateReady && (
						<p>
							{strings.update.ready}{' '}
							<TextButton onClick={applyUpdate}>{strings.update.reload}</TextButton>
						</p>
					)}
					{safety === 'unsafe' && <Hint tone="error">{strings.update.unsafe}</Hint>}
					{safety === 'unknown' && !navigator.onLine && (
						<p className="text-neutral-500">{strings.update.offline(buildDate)}</p>
					)}
				</div>
			)}

			<main className="flex flex-1 items-center justify-center px-6 pt-8 pb-24">{content}</main>
			{dragging && (selection.kind !== 'none' || view === 'keys' || job) && <DropOverlay />}
		</div>
	);
}

interface LaunchQueue {
	setConsumer(consumer: (params: { files: readonly FileSystemHandle[] }) => void): void;
}
