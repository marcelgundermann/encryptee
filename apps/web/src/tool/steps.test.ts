import type { Job, JobSnapshot } from '@encryptee/engine';
import { expect, test } from 'vite-plus/test';
import { firstStep, nextStep, stepName, type StepEvent, type Steps } from './steps.ts';

const snapshot: JobSnapshot = {
	mode: 'encrypt',
	status: 'running',
	checksFirst: false,
	files: [],
	bytesTotal: 0,
	bytesDone: 0,
	workTotal: 0,
	workDone: 0,
	startedAt: 0,
	updatedAt: 0,
	backend: null
};

const job: Job = {
	getSnapshot: () => snapshot,
	subscribe: () => () => {},
	cancel: () => {},
	done: Promise.resolve(snapshot)
};

const files = [new File(['hello'], 'a.txt')];
const others = [new File(['hello'], 'b.txt')];

const run = (...events: StepEvent[]): Steps => events.reduce(nextStep, firstStep);
const chose = (chosen: File[]): StepEvent => ({ type: 'chose', files: chosen });

const classified = (chosen: File[]): StepEvent => ({
	type: 'classified',
	files: chosen,
	selection: { kind: 'encrypt', files: chosen }
});

test('choosing files changes nothing on screen until they’re read', () => {
	const finished = run(chose(files), classified(files), { type: 'started', job });

	expect(nextStep(finished, chose(others)).step).toEqual({ kind: 'job', job });
});

test('files once read replace the step, each selection with a fresh card', () => {
	const steps = run(chose(files), classified(files), chose(others), classified(others));

	expect(steps.step).toEqual({ kind: 'encrypt', files: others });
	expect(steps.selections).toBe(2);
});

test('a later choice replaces one still being read', () => {
	const steps = run(chose(files), chose(others), classified(others), classified(files));

	expect(steps.step).toEqual({ kind: 'encrypt', files: others });
});

test.each<[string, StepEvent]>([
	['a job that started', { type: 'started', job }],
	['Back', { type: 'reset' }],
	['the wordmark', { type: 'home' }]
])('%s drops files still being read', (_, event) => {
	const before = run(chose(files), classified(files), chose(others), event);

	expect(nextStep(before, classified(others))).toBe(before);
});

test('the wordmark keeps a job on screen, and clears a card', () => {
	const working = run(chose(files), classified(files), { type: 'started', job });

	expect(nextStep(working, { type: 'home' }).step).toEqual({ kind: 'job', job });
	expect(run(chose(files), classified(files), { type: 'home' }).step).toEqual({ kind: 'none' });
});

test('files chosen on the Keys screen return to the tool once they’re read', () => {
	const keys = run({ type: 'toggled-keys' }, chose(files));

	expect(keys.view).toBe('keys');
	expect(nextStep(keys, classified(files)).view).toBe('tool');
});

test.each<[string, Steps, JobSnapshot['status'] | null]>([
	['keys', run({ type: 'toggled-keys' }), null],
	['none', firstStep, null],
	['encrypt', run(chose(files), classified(files)), null],
	['job-running', run(chose(files), classified(files), { type: 'started', job }), 'running'],
	['job-done', run(chose(files), classified(files), { type: 'started', job }), 'done']
])('the step is named %s', (name, steps, status) => {
	expect(stepName(steps, status)).toBe(name);
});
