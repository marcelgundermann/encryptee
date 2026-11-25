import { afterEach, expect, test } from 'vitest';
import { acquireJobGuards } from '../src/guards.ts';
import { startJob } from '../src/index.ts';
import { file, passphrase, randomBytes } from './helpers.ts';

/** Gives the page `wakeLock` in place of the browser's, until the test ends. */
function stubWakeLock(wakeLock?: { request(): Promise<{ release(): Promise<void> }> }): void {
	Object.defineProperty(navigator, 'wakeLock', { value: wakeLock, configurable: true });
}

afterEach(() => {
	Reflect.deleteProperty(navigator, 'wakeLock');
});

test('a job runs in a browser without wake locks', async () => {
	stubWakeLock();

	const result = await startJob({
		mode: 'encrypt',
		credentials: passphrase.encrypt,
		files: [file(randomBytes(10))],
		save: { kind: 'memory' }
	}).done;

	expect(result.status).toBe('done');
});

test('a wake lock granted after the job ended is released', async () => {
	let released = 0;

	const lock = {
		release: async () => {
			released++;
		}
	};

	const late = Promise.withResolvers<typeof lock>();
	const grants = [Promise.resolve(lock), late.promise];
	stubWakeLock({ request: () => grants.shift()! });

	const guards = await acquireJobGuards();
	// The tab comes back, the lock is asked for again, and the job ends meanwhile.
	document.dispatchEvent(new Event('visibilitychange'));
	guards.release();
	expect(released).toBe(1);

	late.resolve(lock);
	await expect.poll(() => released).toBe(2);
});
