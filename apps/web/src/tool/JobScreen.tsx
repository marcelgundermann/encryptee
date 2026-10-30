import type { Job, JobSnapshot } from '@encryptee/engine';
import { formatBytes, formatDuration, strings } from '../strings.ts';
import { useJobSnapshot } from './job.ts';
import { BigButton, Card, Headline, Hint, TextButton } from './ui.tsx';

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
	const { bytesDone, bytesTotal } = snapshot;
	const percent = bytesTotal === 0 ? 0 : Math.floor((100 * bytesDone) / bytesTotal);
	const current = snapshot.files.find((file) => file.status === 'running') ?? snapshot.files[0]!;
	const seconds = (snapshot.updatedAt - snapshot.startedAt) / 1000;
	const rate = seconds > 1 && bytesDone > 0 ? bytesDone / seconds : null;

	return (
		<div className="w-full max-w-4xl" aria-live="polite">
			<progress className="sr-only" max={100} value={percent} />
			<p
				aria-hidden
				className="text-[7rem] leading-none font-semibold tracking-tighter tabular-nums sm:text-[14rem]"
			>
				{percent}
				<span className="text-neutral-300 dark:text-neutral-700">%</span>
			</p>
			<div className="mt-6 h-1 w-full bg-neutral-100 dark:bg-neutral-900">
				<div className="h-1 bg-black dark:bg-white" style={{ width: `${percent}%` }} />
			</div>
			<div className="mt-4 flex flex-wrap justify-between gap-x-6 gap-y-2 text-sm text-neutral-500 tabular-nums">
				<span className="min-w-0 truncate">
					{current.outputName} ·{' '}
					{bytesDone === 0
						? strings.job.preparing
						: strings.job.of(formatBytes(bytesDone), formatBytes(bytesTotal))}
				</span>
				<span>
					{rate && (
						<>
							{strings.job.rate(formatBytes(rate))} ·{' '}
							{strings.job.left(formatDuration((bytesTotal - bytesDone) / rate))} ·{' '}
						</>
					)}
					<TextButton className="text-black dark:text-white" onClick={onCancel}>
						{strings.job.cancel}
					</TextButton>
				</span>
			</div>
		</div>
	);
}

function Finished({ snapshot, onReset }: { snapshot: JobSnapshot; onReset: () => void }) {
	const total = snapshot.files.length;
	const done = snapshot.files.filter((file) => file.status === 'done');
	const failed = snapshot.files.filter((file) => file.status === 'failed');
	const encrypt = snapshot.mode === 'encrypt';
	const verb = encrypt ? 'encrypted' : 'decrypted';
	const downloaded = done.some((file) => file.output?.kind === 'downloaded');

	let headline: string;

	if (snapshot.status === 'cancelled') headline = strings.failed.cancelled;
	else if (done.length === total)
		headline = encrypt ? strings.done.encrypted(total) : strings.done.decrypted(total);
	else if (done.length > 0) headline = strings.done.partial(done.length, total, verb);
	else headline = encrypt ? strings.failed.encrypt : strings.failed.decrypt;
	const ok = snapshot.status === 'done';

	return (
		<Card>
			{ok && <p className="text-7xl">✓</p>}
			<div className={ok ? 'mt-6' : ''}>
				<Headline tone={ok || snapshot.status === 'cancelled' ? undefined : 'error'}>
					{headline}
				</Headline>
			</div>
			{snapshot.status === 'cancelled' && <Hint>{strings.failed.cancelledHint}</Hint>}
			{done.length > 0 && (
				<p className="mt-3 text-neutral-500">
					{downloaded ? strings.done.downloaded : strings.done.saved}
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
					{snapshot.files.map((file, i) => (
						<li key={`${i}-${file.name}`} className="flex justify-between gap-4">
							<span className="truncate">{file.outputName}</span>
							<span
								className={
									file.status === 'failed' ? 'text-red-600 dark:text-red-400' : 'text-neutral-400'
								}
							>
								{file.status === 'done'
									? '✓'
									: file.error
										? strings.errors[file.error.code]
										: strings.failed.cancelled}
							</span>
						</li>
					))}
				</ul>
			)}
			<BigButton onClick={onReset}>{ok ? strings.done.again : strings.failed.again}</BigButton>
		</Card>
	);
}
