import { expect, test } from 'vite-plus/test';
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

	const opened = fileOpened(fileStarted(startSnapshot('encrypt', files, 0), 0), 0, 140, 'noble');

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
