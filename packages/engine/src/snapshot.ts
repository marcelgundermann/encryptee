import type { SerializedError } from './errors.ts';
import type { Backend } from './payload/cipher.ts';
import type { FileOutput } from './sinks/sink.ts';

/** What every file of a job has, whatever happened to it. */
interface FileProgress {
	name: string;
	size: number;
	outputName: string;
	/** Input bytes its step processed: the check, then the decrypt, for a file checked first. */
	bytesDone: number;
	/** Set once the header checked out and the output was opened; the file can still fail after. */
	outputSize: number | null;
}

/**
 * One file of a job: where it stands, with the output once it's done and the
 * error once it failed. In a job that `checksFirst`, a file is `checking`, read
 * whole with nothing saved, before it's `running`.
 */
export type JobFile = FileProgress &
	(
		| { status: 'waiting' | 'checking' | 'running' | 'cancelled' }
		| { status: 'done'; output: FileOutput }
		| { status: 'failed'; error: SerializedError }
	);

export type FileStatus = JobFile['status'];

export type JobStatus = 'running' | 'done' | 'failed' | 'cancelled';

/** Immutable; a new object on every change, for `useSyncExternalStore`. */
export interface JobSnapshot {
	mode: 'encrypt' | 'decrypt';
	status: JobStatus;
	/** Every file is checked whole before its output opens (`checksFirst` in `sinks/sink.ts`). */
	checksFirst: boolean;
	files: readonly JobFile[];
	/** The files' sizes added up. */
	bytesTotal: number;
	/** How far the step that runs has got through the files: the ones before it, and its file's `bytesDone`. */
	bytesDone: number;
	/** The bytes the job reads: `bytesTotal`, twice if it checks first. */
	workTotal: number;
	/** Of `workTotal`, the bytes read so far. It only grows; the percent, the rate and the time left come from it. */
	workDone: number;
	startedAt: number;
	/** When this snapshot was produced; with `startedAt` it gives the throughput. */
	updatedAt: number;
	backend: Backend | null;
}

/*
 * The only ways a snapshot changes. Each returns a new snapshot and keeps
 * `updatedAt`, which the job stamps. The files run one at a time, so the job's
 * `bytesDone` is the files before this one plus this file's `bytesDone`.
 */

export function startSnapshot(
	mode: JobSnapshot['mode'],
	files: ReadonlyArray<{ name: string; size: number; outputName: string }>,
	now: number,
	checksFirst: boolean
): JobSnapshot {
	const bytesTotal = files.reduce((sum, file) => sum + file.size, 0);

	return {
		mode,
		status: 'running',
		checksFirst,
		files: files.map(({ name, size, outputName }) => ({
			name,
			size,
			outputName,
			status: 'waiting',
			bytesDone: 0,
			outputSize: null
		})),
		bytesTotal,
		bytesDone: 0,
		workTotal: checksFirst ? 2 * bytesTotal : bytesTotal,
		workDone: 0,
		startedAt: now,
		updatedAt: now,
		backend: null
	};
}

/** The file's first step starts: its check if the job checks first, else its encrypt or decrypt. */
export function fileStarted(snapshot: JobSnapshot, index: number): JobSnapshot {
	const status = snapshot.checksFirst ? 'checking' : 'running';

	return withFile(snapshot, index, { ...progressOf(fileAt(snapshot, index)), status });
}

/**
 * The header checked out, and every chunk did for a file `checking`, and the
 * output opened, `outputSize` bytes long. A file `checking` is `running` from
 * here, reading the file again from its start, and its check counts in full.
 */
export function fileOpened(
	snapshot: JobSnapshot,
	index: number,
	outputSize: number,
	backend: Backend
): JobSnapshot {
	const file = fileAt(snapshot, index);
	const opened = { ...snapshot, backend };

	if (file.status !== 'checking') return withFile(opened, index, { ...file, outputSize });

	return withFile(
		opened,
		index,
		{ ...progressOf(file), status: 'running', outputSize, bytesDone: 0 },
		{ bytes: -file.bytesDone, work: file.size - file.bytesDone }
	);
}

export function fileProgress(snapshot: JobSnapshot, index: number, bytes: number): JobSnapshot {
	const file = fileAt(snapshot, index);
	const added = bytes - file.bytesDone;

	return withFile(snapshot, index, { ...file, bytesDone: bytes }, { bytes: added, work: added });
}

export function fileDone(snapshot: JobSnapshot, index: number, output: FileOutput): JobSnapshot {
	const file = fileAt(snapshot, index);

	return withFile(
		snapshot,
		index,
		{ ...progressOf(file), status: 'done', output, bytesDone: file.size },
		rest(file)
	);
}

/**
 * The file failed, or, with a `cancelled` error, was cancelled. The job's
 * progress counts all of it, both steps for a file failed while `checking`;
 * the file's own `bytesDone` says how far its step got.
 */
export function fileFailed(
	snapshot: JobSnapshot,
	index: number,
	error: SerializedError
): JobSnapshot {
	const file = fileAt(snapshot, index);
	const progress = progressOf(file);

	return withFile(
		snapshot,
		index,
		error.code === 'cancelled'
			? { ...progress, status: 'cancelled' }
			: { ...progress, status: 'failed', error },
		rest(file)
	);
}

/**
 * The job ended. A file still checking or running failed with `crash`, which
 * interrupted it; the files that never started are cancelled. It's done if
 * every file is, else cancelled if the user or the browser cancelled, else failed.
 */
export function jobEnded(
	snapshot: JobSnapshot,
	crash: SerializedError | null,
	cancelled: boolean
): JobSnapshot {
	const files = snapshot.files.map((file): JobFile => {
		if (file.status === 'checking' || file.status === 'running') {
			return {
				...progressOf(file),
				status: 'failed',
				error: crash ?? { code: 'internal', message: 'the job ended while the file ran' }
			};
		}

		return file.status === 'waiting' ? { ...progressOf(file), status: 'cancelled' } : file;
	});

	const status: JobStatus = files.every((file) => file.status === 'done')
		? 'done'
		: cancelled
			? 'cancelled'
			: 'failed';

	return { ...snapshot, files, status };
}

/** Every transition is about a file the job has. */
const fileAt = (snapshot: JobSnapshot, index: number): JobFile => snapshot.files[index]!;

function progressOf({ name, size, outputName, bytesDone, outputSize }: JobFile): FileProgress {
	return { name, size, outputName, bytesDone, outputSize };
}

/** How far a change moves the job's `bytesDone` and `workDone`. */
interface Moved {
	bytes: number;
	work: number;
}

/** What a file that ends now adds to the job: the rest of its step, and of its work. */
function rest(file: JobFile): Moved {
	const bytes = file.size - file.bytesDone;

	return { bytes, work: file.status === 'checking' ? bytes + file.size : bytes };
}

/** `snapshot` with file `index` replaced, and the job's `bytesDone` and `workDone` moved by `added`. */
function withFile(
	snapshot: JobSnapshot,
	index: number,
	file: JobFile,
	added: Moved = { bytes: 0, work: 0 }
): JobSnapshot {
	return {
		...snapshot,
		files: snapshot.files.with(index, file),
		bytesDone: snapshot.bytesDone + added.bytes,
		workDone: snapshot.workDone + added.work
	};
}
