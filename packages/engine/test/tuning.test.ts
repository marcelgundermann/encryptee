import { describe, expect, test } from 'vitest';
import type { Capabilities } from '../src/capabilities.ts';
import { jobTuning } from '../src/tuning.ts';
import { CHUNK, SMALL_BATCHES, passphrase } from './helpers.ts';

const MiB = 1024 ** 2;

const desktop: Capabilities = {
	browser: 'chromium',
	ios: false,
	mobile: false,
	cores: 10,
	savePicker: true,
	directoryPicker: true,
	serviceWorkerDownload: true
};

const phone: Capabilities = { ...desktop, mobile: true, cores: 8 };
const publicKeys = { kind: 'public-keys' as const, publicKeys: ['age1…'] };
const files = (...sizes: number[]) => sizes.map((size) => ({ size }));

describe('crypto workers', () => {
	test.each([
		['an empty file', desktop, files(0), 1],
		['a file of one batch', desktop, files(4 * MiB), 1],
		['a file just over two batches', desktop, files(8 * MiB + 1), 3],
		['many files of one batch, since they run one at a time', desktop, files(MiB, MiB, MiB), 1],
		['a large file, up to the most there are', desktop, files(1, 1024 * MiB), 8],
		['a large file on few cores', { ...desktop, cores: 4 }, files(1024 * MiB), 3],
		['a large file on one core', { ...desktop, cores: 1 }, files(1024 * MiB), 1],
		['a file of two of a phone’s smaller batches', phone, files(2 * MiB), 2]
	])('%s', (_, capabilities, inputs, workers) => {
		const tuning = jobTuning(capabilities, { files: inputs, credentials: publicKeys });

		expect(tuning.workers).toBe(workers);
		expect(tuning.window).toBe(2 * workers);
	});
});

describe('header workers', () => {
	test.each([
		['several files with a passphrase', desktop, files(1, 1), passphrase.encrypt, 2],
		['one file with a passphrase', desktop, files(1), passphrase.encrypt, 1],
		['several files for public keys, which need no scrypt', desktop, files(1, 1), publicKeys, 1],
		['a desktop with few cores', { ...desktop, cores: 4 }, files(1, 1), passphrase.encrypt, 1],
		['a phone, where scrypt’s memory is scarce', phone, files(1, 1), passphrase.encrypt, 1]
	])('%s', (_, capabilities, inputs, credentials, headerWorkers) => {
		expect(jobTuning(capabilities, { files: inputs, credentials }).headerWorkers).toBe(
			headerWorkers
		);
	});
});

test('a job’s own tuning wins', () => {
	const job = { files: files(CHUNK), credentials: publicKeys, tuning: SMALL_BATCHES };

	expect(jobTuning(desktop, job)).toMatchObject(SMALL_BATCHES);
});
