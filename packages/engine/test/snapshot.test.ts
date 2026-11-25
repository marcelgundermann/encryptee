import { expect, test } from 'vitest';
import {
	fileDone,
	fileFailed,
	fileOpened,
	fileProgress,
	fileStarted,
	jobEnded,
	startSnapshot,
	type JobSnapshot
} from '../src/snapshot.ts';

const corrupted = { code: 'corrupted', message: 'corrupted' } as const;

/** A job over a 100-byte and a 50-byte file whose first file has processed 40 bytes. */
function halfway(): JobSnapshot {
	const files = [
		{ name: 'a', size: 100, outputName: 'a.age' },
		{ name: 'b', size: 50, outputName: 'b.age' }
	];

	const opened = fileOpened(
		fileStarted(startSnapshot('encrypt', files, 0, false), 0),
		0,
		140,
		'noble'
	);

	return fileProgress(opened, 0, 40);
}

test('progress moves the job by the bytes the file processed since', () => {
	const snapshot = fileProgress(halfway(), 0, 70);

	expect(snapshot.files[0]!.bytesDone).toBe(70);
	expect(snapshot.bytesDone).toBe(70);
});

test('a file that fails counts all its bytes toward the job, and keeps how far it got', () => {
	const failed = fileFailed(halfway(), 0, corrupted);

	expect(failed.files[0]).toMatchObject({ status: 'failed', error: corrupted, bytesDone: 40 });
	expect(failed.bytesDone).toBe(100);
	expect(fileProgress(fileStarted(failed, 1), 1, 20).bytesDone).toBe(120);
});

test('a cancelled error cancels the file, without an error', () => {
	const cancelled = fileFailed(halfway(), 0, { code: 'cancelled', message: 'cancelled' });

	expect(cancelled.files[0]).toEqual({
		name: 'a',
		size: 100,
		outputName: 'a.age',
		status: 'cancelled',
		bytesDone: 40,
		outputSize: 140
	});
});

test('a crash fails the file it interrupted, cancels the files that never started, and adds no bytes', () => {
	const crash = { code: 'internal', message: 'a worker failed' } as const;
	const ended = jobEnded(halfway(), crash, false);

	expect(ended.status).toBe('failed');
	expect(ended.files.map((file) => file.status)).toEqual(['failed', 'cancelled']);
	expect(ended.files[0]).toMatchObject({ error: crash, bytesDone: 40 });
	expect(ended.bytesDone).toBe(40);
});

test('a file still running when the job ends without a crash fails as internal', () => {
	expect(jobEnded(halfway(), null, false).files[0]).toMatchObject({
		status: 'failed',
		error: { code: 'internal' }
	});
});

const output = { kind: 'saved' } as const;
const bothDone = (s: JobSnapshot) => fileDone(fileStarted(fileDone(s, 0, output), 1), 1, output);
const firstFailed = (s: JobSnapshot) => fileFailed(s, 0, corrupted);

test.each([
	['done', 'every file is done', bothDone, false],
	['done', 'every file is done, even after a late cancel', bothDone, true],
	['failed', 'a file failed', firstFailed, false],
	['cancelled', 'a file failed and then the job was cancelled', firstFailed, true]
])('a job ends %s when %s', (status, _, run, cancelled) => {
	expect(jobEnded(run(halfway()), null, cancelled).status).toBe(status);
});

test('a done file has its output and all its bytes', () => {
	const done = fileDone(halfway(), 0, output);

	expect(done.files[0]).toMatchObject({ status: 'done', output, bytesDone: 100, outputSize: 140 });
	expect(done.bytesDone).toBe(100);
	expect(done.backend).toBe('noble');
});

/** A job that checks first, over a 100-byte and a 50-byte file, whose first file checked its 90-byte payload. */
function checked(): JobSnapshot {
	const files = [
		{ name: 'a.age', size: 100, outputName: 'a' },
		{ name: 'b.age', size: 50, outputName: 'b' }
	];

	return fileProgress(fileStarted(startSnapshot('decrypt', files, 0, true), 0), 0, 90);
}

test('a job that checks first reads its files twice, and counts their sizes once', () => {
	const started = startSnapshot(
		'decrypt',
		[{ name: 'a.age', size: 100, outputName: 'a' }],
		0,
		true
	);

	expect(started).toMatchObject({ bytesTotal: 100, workTotal: 200 });
});

test('a file is checking before its output opens, and its check moves the job', () => {
	const snapshot = checked();

	expect(snapshot.files[0]).toMatchObject({ status: 'checking', bytesDone: 90, outputSize: null });
	expect(snapshot).toMatchObject({ bytesDone: 90, workDone: 90 });
});

test('once its output opens, a checked file runs from its start, and its check counts in full', () => {
	const opened = fileOpened(checked(), 0, 70, 'webcrypto');

	expect(opened.files[0]).toMatchObject({ status: 'running', bytesDone: 0, outputSize: 70 });
	expect(opened).toMatchObject({ bytesDone: 0, workDone: 100 });
	expect(fileProgress(opened, 0, 60)).toMatchObject({ bytesDone: 60, workDone: 160 });
});

test('a checked file that is done has counted its size twice', () => {
	const done = fileDone(fileOpened(checked(), 0, 70, 'webcrypto'), 0, output);

	expect(done).toMatchObject({ bytesDone: 100, workDone: 200 });
});

test('a file that fails its check counts both its steps toward the job', () => {
	const failed = fileFailed(checked(), 0, corrupted);

	expect(failed.files[0]).toMatchObject({ status: 'failed', error: corrupted, outputSize: null });
	expect(failed).toMatchObject({ bytesDone: 100, workDone: 200 });
	expect(fileStarted(failed, 1).files[1]!.status).toBe('checking');
});

test('a crash while a file is checked fails it', () => {
	const crash = { code: 'internal', message: 'a worker failed' } as const;

	expect(jobEnded(checked(), crash, false).files[0]).toMatchObject({
		status: 'failed',
		error: crash
	});
});
