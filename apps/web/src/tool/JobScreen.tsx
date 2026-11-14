import type { Job, JobSnapshot } from '@encryptee/engine';
import { formatBytes, formatDuration, strings } from '../strings.ts';
import { useJobSnapshot } from './job.ts';
import {
	BigButton,
	Card,
	Headline,
	Hint,
	OutlineButton,
	shownFiles,
	useFocusIfLost
} from './ui.tsx';

/** A running job as one giant number; afterwards, what happened to each file. */
export function JobScreen({ job, onReset }: { job: Job; onReset: () => void }) {
	const snapshot = useJobSnapshot(job)!;

	return snapshot.status === 'running' ? (
		<Running snapshot={snapshot} onCancel={job.cancel} />
	) : (
		<Finished snapshot={snapshot} onReset={onReset} />
	);
}

function Running({ snapshot, onCancel }: { snapshot: JobSnapshot; onCancel: () => void }) {
	const heading = useFocusIfLost<HTMLHeadingElement>();
	const { bytesDone, bytesTotal } = snapshot;
	const fraction = bytesTotal === 0 ? 0 : bytesDone / bytesTotal;
	const percent = Math.floor(100 * fraction);
	const current = snapshot.files.find((file) => file.status === 'running') ?? snapshot.files[0]!;
	const seconds = (snapshot.updatedAt - snapshot.startedAt) / 1000;
	const rate = seconds > 1 && bytesDone > 0 ? bytesDone / seconds : null;
	const count = snapshot.files.length;

	// No live region: at ~10 updates a second it would talk over everything.
	// The progress bar carries the numbers for anyone who asks.
	return (
		<div className="w-full max-w-4xl">
			<h1 ref={heading} tabIndex={-1} className="sr-only">
				{snapshot.mode === 'encrypt'
					? strings.selection.encrypting(count)
					: strings.selection.decrypting(count)}
			</h1>
			<progress
				className="sr-only"
				max={100}
				value={percent}
				aria-label={strings.job.progress}
				aria-valuetext={strings.job.progressText(
					percent,
					formatBytes(bytesDone),
					formatBytes(bytesTotal)
				)}
			/>
			<p
				aria-hidden="true"
				className="text-[7rem] leading-none font-semibold tracking-tighter tabular-nums sm:text-[14rem]"
			>
				{percent}
				<span className="text-ghost">%</span>
			</p>
			<div className="mt-6 h-1 w-full overflow-hidden bg-surface">
				{/* Scaled, not resized, and eased over one update so it glides. */}
				<div
					className="h-1 origin-left bg-fg motion-safe:transition-transform motion-safe:duration-100 motion-safe:ease-linear"
					style={{ transform: `scaleX(${fraction})` }}
				/>
			</div>
			<div className="mt-4 flex flex-wrap justify-between gap-x-6 gap-y-2 text-sm text-muted tabular-nums">
				<span className="min-w-0 truncate">
					{current.outputName} ·{' '}
					{bytesDone === 0
						? strings.job.preparing
						: strings.job.of(formatBytes(bytesDone), formatBytes(bytesTotal))}
				</span>
				{rate && (
					<span>
						{strings.job.rate(formatBytes(rate))} ·{' '}
						{strings.job.left(formatDuration((bytesTotal - bytesDone) / rate))}
					</span>
				)}
			</div>
			<OutlineButton className="mt-10 px-8" onClick={onCancel}>
				{strings.job.cancel}
			</OutlineButton>
		</div>
	);
}

const order = { failed: 0, cancelled: 1, running: 1, waiting: 1, done: 2 } as const;

function Finished({ snapshot, onReset }: { snapshot: JobSnapshot; onReset: () => void }) {
	const total = snapshot.files.length;
	const done = snapshot.files.filter((file) => file.status === 'done');
	const failed = snapshot.files.filter((file) => file.status === 'failed');
	const encrypt = snapshot.mode === 'encrypt';
	const verb = encrypt ? 'encrypted' : 'decrypted';
	const downloaded = done.some((file) => file.output?.kind === 'downloaded');
	// Failures first, so they're never behind the "and N more" line.
	const listed = snapshot.files.toSorted((a, b) => order[a.status] - order[b.status]);
	const shown = shownFiles(listed);

	let headline: string;

	if (snapshot.status === 'cancelled') headline = strings.failed.cancelled;
	else if (done.length === total)
		headline = encrypt ? strings.done.encrypted(total) : strings.done.decrypted(total);
	else if (done.length > 0) headline = strings.done.partial(done.length, total, verb);
	else headline = encrypt ? strings.failed.encrypt : strings.failed.decrypt;
	const ok = snapshot.status === 'done';
	const savedTo = downloaded ? strings.done.downloaded : strings.done.saved;

	return (
		<Card>
			{ok && (
				<svg aria-hidden="true" viewBox="0 0 64 64" className="size-16">
					<path
						d="M14 33l12 12 24-26"
						fill="none"
						stroke="currentColor"
						strokeWidth="5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			)}
			<div className={ok ? 'mt-6' : ''}>
				<Headline tone={ok || snapshot.status === 'cancelled' ? undefined : 'error'}>
					{headline}
				</Headline>
			</div>
			{snapshot.status === 'cancelled' && <Hint>{strings.failed.cancelledHint}</Hint>}
			{done.length > 0 && (
				<p className="mt-3 break-words text-muted">
					{total === 1 ? (
						<>
							<span className="text-fg">{done[0]!.outputName}</span> · {savedTo}
						</>
					) : (
						savedTo
					)}
				</p>
			)}
			{failed.length > 0 && (
				<>
					{total === 1 ? (
						<p className="mt-3 text-lg">{strings.errors[failed[0]!.error!.code]}</p>
					) : null}
					{failed.some((file) => file.error?.code === 'corrupted') && (
						<Hint>{strings.failed.integrityHint}</Hint>
					)}
				</>
			)}
			{(total > 1 || failed.length > 0) && (
				<ul className="mt-6 space-y-1 text-sm">
					{shown.map((file, i) => (
						<li key={`${i}-${file.name}`} className="flex justify-between gap-4">
							<span className="truncate">{file.outputName}</span>
							<span className={file.status === 'failed' ? 'text-danger' : 'text-muted'}>
								{file.status === 'done'
									? '✓'
									: file.error
										? strings.errors[file.error.code]
										: strings.failed.cancelled}
							</span>
						</li>
					))}
					{shown.length < listed.length && (
						<li className="text-muted">{strings.selection.more(listed.length - shown.length)}</li>
					)}
				</ul>
			)}
			<BigButton onClick={onReset}>{ok ? strings.done.again : strings.failed.again}</BigButton>
		</Card>
	);
}
