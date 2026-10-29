import {
	detectCapabilities,
	nativeChaChaAvailable,
	startJob,
	type Backend,
	type Job,
	type JobInput,
	type JobOptions,
	type SaveTarget
} from '../src/index.ts';

/**
 * Dev-only throughput bench (plan step 3). Not part of the app build; run with
 * `pnpm --filter @encryptee/engine bench`.
 */
type Scenario =
	| 'encrypt-discard'
	| 'encrypt-opfs'
	| 'decrypt-opfs'
	| 'encrypt-picker'
	| 'decrypt-picker';

interface Row {
	scenario: Scenario;
	browser: string;
	backend: Backend | null;
	workers: number;
	batchChunks: number;
	gib: number;
	seconds: number;
	mibps: number;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const capabilities = detectCapabilities();
const native = await nativeChaChaAvailable();
const rows: Row[] = [];
let current: Job | null = null;
let stopped = false;

/** The OPFS file encrypted by `encrypt-opfs`, reused by `decrypt-opfs`. */
let staged: File | null = null;

$('env').textContent =
	`${capabilities.browser}, ${capabilities.cores} cores, mobile: ${capabilities.mobile}, ` +
	`native ChaCha20-Poly1305: ${native}, save picker: ${capabilities.savePicker}`;

const list = (id: string) =>
	$<HTMLInputElement>(id)
		.value.split(',')
		.map((v) => v.trim())
		.filter(Boolean);

$('stop').addEventListener('click', () => {
	stopped = true;
	current?.cancel();
});

$<HTMLFormElement>('form').addEventListener('submit', async (event) => {
	event.preventDefault();
	stopped = false;
	const scenario = $<HTMLSelectElement>('scenario').value as Scenario;
	const size = Math.round(Number($<HTMLInputElement>('size').value) * 1024 ** 3);
	const passphrase = $<HTMLInputElement>('passphrase').value;
	const backends = list('backends').filter((b) => b === 'noble' || native) as Backend[];

	// Pickers need the click's user activation, so ask once up front.
	let picked: File | null = null;
	let save: SaveTarget = { kind: 'discard' };

	if (scenario === 'encrypt-picker' || scenario === 'decrypt-picker') {
		const [handle] = await window.showOpenFilePicker();
		picked = await handle!.getFile();

		const name =
			scenario === 'encrypt-picker' ? `${picked.name}.age` : picked.name.replace(/\.age$/, '');

		save = { kind: 'file', handle: await window.showSaveFilePicker({ suggestedName: name }) };
	}

	for (const backend of backends) {
		for (const workers of list('workers').map(Number)) {
			for (const batchChunks of list('batches').map(Number)) {
				if (stopped) return;

				const input: JobInput = picked ??
					(scenario === 'decrypt-opfs' ? staged : null) ?? {
						name: 'synthetic',
						size,
						synthetic: true
					};

				if (scenario === 'decrypt-opfs' && !staged) {
					$('status').textContent = 'Run "Encrypt synthetic → OPFS" first.';

					return;
				}

				const options: JobOptions = {
					...(scenario.startsWith('decrypt')
						? { mode: 'decrypt' as const, credentials: { kind: 'passphrase' as const, passphrase } }
						: {
								mode: 'encrypt' as const,
								credentials: { kind: 'passphrase' as const, passphrase }
							}),
					files: [input],
					save: scenario === 'encrypt-opfs' ? { kind: 'opfs' } : save,
					tuning: { workers, batchChunks, window: 2 * workers, backend }
				};

				await runOne(scenario, options);
			}
		}
	}

	$('status').textContent = 'Done.';
});

async function runOne(scenario: Scenario, options: JobOptions): Promise<void> {
	const started = performance.now();
	const job = startJob(options);
	current = job;
	job.subscribe(() => {
		const s = job.getSnapshot();
		$('status').textContent =
			`${scenario} · ${options.tuning?.backend} · ${options.tuning?.workers} workers · ` +
			`${options.tuning?.batchChunks} chunks: ${((100 * s.bytesDone) / s.bytesTotal).toFixed(1)}%`;
	});
	const result = await job.done;
	current = null;

	if (result.status !== 'done') {
		console.error(`${scenario} ${result.status}`, result.files[0]?.error);
		$('status').textContent = `${result.status}: ${result.files[0]?.error?.message ?? ''}`;
		stopped = true;

		return;
	}

	if (scenario === 'encrypt-opfs') staged = await latestStagedFile();
	const seconds = (performance.now() - started) / 1000;

	const row: Row = {
		scenario,
		browser: capabilities.browser,
		backend: result.backend,
		workers: options.tuning!.workers!,
		batchChunks: options.tuning!.batchChunks!,
		gib: result.bytesTotal / 1024 ** 3,
		seconds,
		mibps: result.bytesTotal / 1024 ** 2 / seconds
	};

	rows.push(row);
	render();
}

async function latestStagedFile(): Promise<File | null> {
	const root = await navigator.storage.getDirectory();
	const dir = await root.getDirectoryHandle('encryptee-staging');
	let latest: File | null = null;

	for await (const handle of dir.values()) {
		if (handle.kind !== 'file') continue;
		const file = await (handle as FileSystemFileHandle).getFile();

		if (!latest || file.lastModified > latest.lastModified) latest = file;
	}

	return latest;
}

const cells = (r: Row): string[] => [
	r.scenario,
	r.browser,
	r.backend ?? '',
	String(r.workers),
	String(r.batchChunks),
	r.gib.toFixed(2),
	r.seconds.toFixed(1),
	r.mibps.toFixed(0)
];

function render(): void {
	$('results').replaceChildren(
		...rows.map((r) => {
			const tr = document.createElement('tr');

			for (const text of cells(r)) {
				const td = document.createElement('td');
				td.textContent = text;
				tr.append(td);
			}

			return tr;
		})
	);
	$('markdown').textContent = [
		'| Scenario | Browser | Backend | Workers | Batch | GiB | Seconds | MiB/s |',
		'|---|---|---|---|---|---|---|---|',
		...rows.map((r) => `| ${cells(r).join(' | ')} |`)
	].join('\n');
}
