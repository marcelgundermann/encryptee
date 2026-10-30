import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { playwright } from 'vite-plus/test/browser-playwright';
import { defineConfig } from 'vite-plus';
import type { BrowserCommand } from 'vite-plus/test/node';

/**
 * CLI interop runs the real `age` (≥ 1.3) from Node through browser commands.
 * Set AGE_BIN to the directory holding `age`, `age-keygen` and
 * `age-plugin-batchpass`; otherwise PATH is used and the tests skip if absent.
 */
const ageDir = process.env.AGE_BIN;
const env = { ...process.env, PATH: [ageDir, process.env.PATH].filter(Boolean).join(delimiter) };

function run(
	file: string,
	args: string[],
	options: { input?: Buffer; env?: Record<string, string> } = {}
): Promise<{ code: number; stdout: Buffer; stderr: string }> {
	return new Promise((resolve) => {
		const child = execFile(
			file,
			args,
			{ env: { ...env, ...options.env }, encoding: 'buffer', maxBuffer: 1 << 30 },
			(_error, stdout, stderr) =>
				resolve({
					// Null after a signal, a negative errno if the binary didn't start.
					code: child.exitCode ?? 1,
					stdout,
					stderr: stderr.toString()
				})
		);

		child.stdin?.end(options.input);
	});
}

const ageAvailable: BrowserCommand<[]> = async () => (await run('age', ['--version'])).code === 0;

const ageKeygen: BrowserCommand<[pq: boolean]> = async (_, pq) => {
	const { stdout } = await run('age-keygen', pq ? ['-pq'] : []);
	const text = stdout.toString();

	return {
		privateKey: text.match(/^AGE-SECRET-KEY-[^\n]+/m)![0],
		publicKey: text.match(/# public key: (\S+)/)![1]!
	};
};

const ageEncrypt: BrowserCommand<
	[options: { input: string; recipients?: string[]; passphrase?: string }]
> = async (_, { input, recipients = [], passphrase }) => {
	const args =
		passphrase !== undefined ? ['-e', '-j', 'batchpass'] : recipients.flatMap((r) => ['-r', r]);

	const result = await run('age', args, {
		input: Buffer.from(input, 'base64'),
		env:
			passphrase !== undefined
				? { AGE_PASSPHRASE: passphrase, AGE_PASSPHRASE_WORK_FACTOR: '10' }
				: {}
	});

	if (result.code !== 0) throw new Error(result.stderr);

	return result.stdout.toString('base64');
};

const ageDecrypt: BrowserCommand<
	[options: { input: string; identity?: string; passphrase?: string }]
> = async (_, { input, identity, passphrase }) => {
	const dir = await mkdtemp(join(tmpdir(), 'encryptee-age-'));

	try {
		const args = ['-d'];

		if (identity !== undefined) {
			await writeFile(join(dir, 'key.txt'), identity);
			args.push('-i', join(dir, 'key.txt'));
		}

		if (passphrase !== undefined) args.push('-j', 'batchpass');
		await writeFile(join(dir, 'in.age'), Buffer.from(input, 'base64'));
		args.push('-o', join(dir, 'out'), join(dir, 'in.age'));

		const result = await run('age', args, {
			env: passphrase !== undefined ? { AGE_PASSPHRASE: passphrase } : {}
		});

		if (result.code !== 0) return { ok: false as const, error: result.stderr };

		return { ok: true as const, output: (await readFile(join(dir, 'out'))).toString('base64') };
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
};

export const ageCommands = { ageAvailable, ageKeygen, ageEncrypt, ageDecrypt };

const ALL_BROWSERS = ['chromium', 'firefox', 'webkit'] as const;

/** `BROWSERS=chromium,webkit pnpm test` narrows the run; all three by default. */
const browsers = (process.env.BROWSERS?.split(',') ?? ALL_BROWSERS).map((name) => {
	const browser = ALL_BROWSERS.find((known) => known === name);

	if (!browser) throw new Error(`BROWSERS: unknown browser ${name}`);

	return browser;
});

export default defineConfig({
	optimizeDeps: {
		include: [
			'age-encryption',
			'@noble/ciphers/chacha.js',
			'@noble/hashes/hkdf.js',
			'@noble/hashes/scrypt.js',
			'@noble/hashes/sha2.js',
			'cctv-age'
		]
	},
	worker: { format: 'es' },
	test: {
		include: ['test/**/*.test.ts'],
		testTimeout: 60_000,
		browser: {
			enabled: true,
			headless: true,
			provider: playwright(),
			instances: browsers.map((browser) => ({ browser })),
			commands: ageCommands
		}
	}
});
