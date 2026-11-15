import type { SerializedError } from './errors.ts';
import type { Backend } from './payload/cipher.ts';
import type { FileOutput } from './sinks/sink.ts';

/** What every file of a job has, whatever happened to it. */
interface FileProgress {
	name: string;
	size: number;
	outputName: string;
	/** Input bytes processed. */
	bytesDone: number;
	/** Set once the header checked out and the output was opened; the file can still fail after. */
	outputSize: number | null;
}

/** One file of a job: where it stands, with the output once it's done and the error once it failed. */
export type JobFile = FileProgress &
	(
		| { status: 'waiting' | 'running' | 'cancelled' }
		| { status: 'done'; output: FileOutput }
		| { status: 'failed'; error: SerializedError }
	);

export type FileStatus = JobFile['status'];

export type JobStatus = 'running' | 'done' | 'failed' | 'cancelled';

/** Immutable; a new object on every change, for `useSyncExternalStore`. */
export interface JobSnapshot {
	mode: 'encrypt' | 'decrypt';
	status: JobStatus;
	files: readonly JobFile[];
	bytesTotal: number;
	bytesDone: number;
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
	now: number
): JobSnapshot {
	return {
		mode,
		status: 'running',
		files: files.map(({ name, size, outputName }) => ({
			name,
			size,
			outputName,
			status: 'waiting',
			bytesDone: 0,
			outputSize: null
		})),
		bytesTotal: files.reduce((sum, file) => sum + file.size, 0),
		bytesDone: 0,
		startedAt: now,
		updatedAt: now,
		backend: null
	};
}

export function fileStarted(snapshot: JobSnapshot, index: number): JobSnapshot {
	return withFile(snapshot, index, { ...progressOf(fileAt(snapshot, index)), status: 'running' });
}

/** The header checked out and the output opened, `outputSize` bytes long. */
export function fileOpened(
	snapshot: JobSnapshot,
	index: number,
	outputSize: number,
	backend: Backend
): JobSnapshot {
	const file = fileAt(snapshot, index);

	return { ...withFile(snapshot, index, { ...file, outputSize }), backend };
}

export function fileProgress(snapshot: JobSnapshot, index: number, bytes: number): JobSnapshot {
	const file = fileAt(snapshot, index);

	return withFile(snapshot, index, { ...file, bytesDone: bytes }, bytes - file.bytesDone);
}

export function fileDone(snapshot: JobSnapshot, index: number, output: FileOutput): JobSnapshot {
	const file = fileAt(snapshot, index);

	return withFile(
		snapshot,
		index,
		{ ...progressOf(file), status: 'done', output, bytesDone: file.size },
		file.size - file.bytesDone
	);
}

/**
 * The file failed, or, with a `cancelled` error, was cancelled. The job's
 * progress counts all of it; the file's own `bytesDone` says how far it got.
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
		file.size - file.bytesDone
	);
}

/**
 * The job ended. A file still running failed with `crash`, which interrupted
 * it; the files that never started are cancelled. It's done if every file is,
 * else cancelled if the user or the browser cancelled, else failed.
 */
export function jobEnded(
	snapshot: JobSnapshot,
	crash: SerializedError | null,
	cancelled: boolean
): JobSnapshot {
	const files = snapshot.files.map((file): JobFile => {
		if (file.status === 'running') {
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

/** `snapshot` with file `index` replaced, and the job's `bytesDone` moved by `added`. */
function withFile(snapshot: JobSnapshot, index: number, file: JobFile, added = 0): JobSnapshot {
	return {
		...snapshot,
		files: snapshot.files.with(index, file),
		bytesDone: snapshot.bytesDone + added
	};
}
