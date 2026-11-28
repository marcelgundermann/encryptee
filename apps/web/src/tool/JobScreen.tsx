import type { JobFile, JobSnapshot } from '@encryptee/engine';
import { formatBytes, formatDuration, strings } from '#/strings.ts';
import { rowKey } from './row-key.ts';
import { BigButton, Card, Headline, Hint, OutlineButton, shownFiles, StepHeading } from './ui.tsx';

/** A running job as one giant number; afterwards, what happened to each file. */
export function JobScreen({
	snapshot,
	onCancel,
	onReset
}: {
	snapshot: JobSnapshot;
	onCancel: () => void;
	onReset: () => void;
}) {
	return snapshot.status === 'running' ? (
		<Running snapshot={snapshot} onCancel={onCancel} />
	) : (
		<Finished snapshot={snapshot} onReset={onReset} />
	);
}

function Running({ snapshot, onCancel }: { snapshot: JobSnapshot; onCancel: () => void }) {
	const { workDone, workTotal } = snapshot;
	const fraction = workTotal === 0 ? 0 : workDone / workTotal;
	const percent = Math.floor(100 * fraction);

	const current =
		snapshot.files.find((file) => file.status === 'checking' || file.status === 'running') ??
		snapshot.files[0]!;

	const seconds = (snapshot.updatedAt - snapshot.startedAt) / 1000;
	const rate = seconds > 1 && workDone > 0 ? workDone / seconds : null;
	const count = snapshot.files.length;
	const step = stepLine(snapshot, current);

	// No live region: at ~10 updates a second it would talk over everything.
	// The progress bar carries the numbers for anyone who asks.
	return (
		<div className="w-full max-w-4xl">
			<StepHeading className="sr-only">{strings.selection[snapshot.mode](count)}</StepHeading>
			<progress
				className="sr-only"
				max={100}
				value={percent}
				aria-label={strings.job.progress}
				aria-valuetext={strings.job.progressText(percent, step)}
			/>
			<p
				aria-hidden="true"
				className="text-[7rem] leading-none font-semibold tracking-tighter tabular-nums sm:text-[14rem]"
			>
				{percent}
				<span className="text-ghost">%</span>
			</p>
			<div className="mt-6 h-1 w-full overflow-hidden bg-surface">
				<div
					className="h-1 origin-left bg-fg motion-safe:transition-transform motion-safe:duration-100 motion-safe:ease-linear"
					style={{ transform: `scaleX(${fraction})` }}
				/>
			</div>
			<div className="mt-4 flex flex-wrap justify-between gap-x-6 gap-y-2 text-sm text-muted tabular-nums">
				<span className="min-w-0 truncate">
					<span translate="no">{current.outputName}</span> · {step}
				</span>
				{rate && (
					<span>
						{strings.job.rate(formatBytes(rate))} ·{' '}
						{strings.job.left(formatDuration((workTotal - workDone) / rate))}
					</span>
				)}
			</div>
			<OutlineButton className="mt-10 px-8" onClick={onCancel}>
				{strings.job.cancel}
			</OutlineButton>
		</div>
	);
}

/**
 * The step `current` is on, where a job has two, and how far that step has got
 * through the job's files, in their real sizes.
 */
function stepLine(snapshot: JobSnapshot, current: JobFile): string {
	const { bytesDone, bytesTotal } = snapshot;

	const bytes =
		bytesDone === 0 ? null : strings.job.of(formatBytes(bytesDone), formatBytes(bytesTotal));

	const step =
		current.status === 'checking'
			? strings.job.checking
			: current.status === 'running' && snapshot.checksFirst
				? strings.job.decrypting
				: null;

	if (!step) return bytes ?? strings.job.preparing;

	return bytes ? `${step} ${bytes}` : step;
}

/** What the job came to, for its headline: cancelled, or how many of its files are done. */
function finishedHeadline(snapshot: JobSnapshot, done: number): string {
	const total = snapshot.files.length;

	if (snapshot.status === 'cancelled') return strings.failed.cancelled;

	if (done === total) return strings.done[snapshot.mode](total);

	if (done > 0) return strings.done.partial[snapshot.mode](done, total);

	return strings.failed[snapshot.mode];
}

function Finished({ snapshot, onReset }: { snapshot: JobSnapshot; onReset: () => void }) {
	const total = snapshot.files.length;
	const done = snapshot.files.filter((file) => file.status === 'done');
	const failed = snapshot.files.filter((file) => file.status === 'failed');
	const downloaded = done.some((file) => file.output.kind === 'downloaded');
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
				<Headline tone={snapshot.status === 'failed' ? 'error' : undefined}>
					{finishedHeadline(snapshot, done.length)}
				</Headline>
			</div>
			{snapshot.status === 'cancelled' && done.length === 0 && (
				<Hint>{strings.failed.cancelledHint}</Hint>
			)}
			{done.length > 0 && (
				<p className="mt-3 break-words text-muted">
					{total === 1 ? (
						<>
							<span className="text-fg" translate="no">
								{done[0]!.outputName}
							</span>{' '}
							· {savedTo}
						</>
					) : (
						savedTo
					)}
				</p>
			)}
			{failed.length > 0 && (
				<>
					{total === 1 ? (
						<p className="mt-3 text-lg">{strings.errors[failed[0]!.error.code]}</p>
					) : null}
					{failed.some((file) => file.error.code === 'corrupted') && (
						<Hint>{strings.failed.integrityHint}</Hint>
					)}
				</>
			)}
			{(total > 1 || failed.length > 0) && <JobFileLines files={snapshot.files} />}
			<BigButton onClick={onReset}>{ok ? strings.done.again : strings.failed.again}</BigButton>
		</Card>
	);
}

const order = { failed: 0, cancelled: 1, checking: 1, running: 1, waiting: 1, done: 2 } as const;

/** What happened to each file, failures first, so they're never behind the "and N more" line. */
function JobFileLines({ files }: { files: readonly JobFile[] }) {
	const listed = files.toSorted((a, b) => order[a.status] - order[b.status]);
	const shown = shownFiles(listed);

	return (
		<ul className="mt-6 space-y-1 text-sm">
			{shown.map((file) => (
				<li key={rowKey(file)} className="flex justify-between gap-4">
					<span className="truncate" translate="no">
						{file.outputName}
					</span>
					<span className={file.status === 'failed' ? 'text-danger' : 'text-muted'}>
						{file.status === 'done'
							? strings.done.file
							: file.status === 'failed'
								? strings.errors[file.error.code]
								: strings.failed.cancelled}
					</span>
				</li>
			))}
			{shown.length < listed.length && (
				<li className="text-muted">{strings.selection.more(listed.length - shown.length)}</li>
			)}
		</ul>
	);
}
