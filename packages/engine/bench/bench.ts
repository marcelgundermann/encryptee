import { detectCapabilities } from '../src/capabilities.ts';
import {
	startJob,
	type Job,
	type JobInput,
	type JobOptions,
	type SaveLocation
} from '../src/index.ts';
import { outputName } from '../src/format/names.ts';
import { nativeChaChaAvailable, type Backend } from '../src/payload/cipher.ts';

/**
 * Dev-only throughput bench (plan step 3). Not part of the app build; run with
 * `pnpm --filter @encryptee/engine bench`.
 */
const SCENARIOS = [
	'encrypt-discard',
	'encrypt-many',
	'encrypt-opfs',
	'decrypt-opfs',
	'encrypt-picker',
	'decrypt-picker'
] as const;

type Scenario = (typeof SCENARIOS)[number];

interface Row {
	scenario: Scenario;
	browser: string;
	backend: Backend | null;
	workers: number;
	batchChunks: number;
	headerWorkers: number;
	files: number;
	gib: number;
	seconds: number;
	mibps: number;
}

/** The size of each file of `encrypt-many`, where scrypt takes far longer than the payload. */
const SMALL_FILE = 1024 ** 2;

/** The element with `id` in bench/index.html, checked to be a `type`. */
function $<T extends HTMLElement>(id: string, type: new () => T): T {
	const element = document.getElementById(id);

	if (!(element instanceof type)) throw new Error(`bench/index.html has no matching #${id}`);

	return element;
}

const capabilities = detectCapabilities();
const native = await nativeChaChaAvailable();
const rows: Row[] = [];
let current: Job | null = null;
let stopped = false;

/** The OPFS file `encrypt-opfs` wrote, which `decrypt-opfs` reads. */
let encrypted: File | null = null;

$('env', HTMLElement).textContent =
	`${capabilities.browser}, ${capabilities.cores} cores, mobile: ${capabilities.mobile}, ` +
	`native ChaCha20-Poly1305: ${native}, save picker: ${capabilities.savePicker}`;

const list = (id: string) =>
	$(id, HTMLInputElement)
		.value.split(',')
		.map((v) => v.trim())
		.filter(Boolean);

$('stop', HTMLButtonElement).addEventListener('click', () => {
	stopped = true;
	current?.cancel();
});

$('form', HTMLFormElement).addEventListener('submit', async (event) => {
	event.preventDefault();
	stopped = false;
	const scenario = SCENARIOS.find((s) => s === $('scenario', HTMLSelectElement).value);

	if (!scenario) return;
	const size = Math.round(Number($('size', HTMLInputElement).value) * 1024 ** 3);
	const passphrase = $('passphrase', HTMLInputElement).value;

	const backends = list('backends').filter(
		(b): b is Backend => b === 'noble' || (b === 'webcrypto' && native)
	);

	// Pickers need the click's user activation, so ask once up front.
	let picked: File | null = null;
	let save: SaveLocation = { kind: 'discard' };

	if (scenario === 'encrypt-picker' || scenario === 'decrypt-picker') {
		const [handle] = await window.showOpenFilePicker();
		picked = await handle!.getFile();

		const name = outputName(scenario === 'encrypt-picker' ? 'encrypt' : 'decrypt', picked.name);
		save = { kind: 'file', handle: await window.showSaveFilePicker({ suggestedName: name }) };
	} else if (scenario === 'encrypt-opfs') {
		save = { kind: 'file', handle: await opfsFile() };
	}

	if (scenario === 'decrypt-opfs' && !encrypted) {
		$('status', HTMLElement).textContent = 'Run "Encrypt synthetic → OPFS" first.';

		return;
	}

	const count = scenario === 'encrypt-many' ? Number($('files', HTMLInputElement).value) : 1;

	const synthetic = (name: string): JobInput => ({
		name,
		size: scenario === 'encrypt-many' ? SMALL_FILE : size,
		synthetic: true
	});

	const real = picked ?? (scenario === 'decrypt-opfs' ? encrypted : null);

	const files = real
		? [real]
		: Array.from({ length: count }, (_, i) => synthetic(`synthetic ${i}`));

	for (const backend of backends) {
		for (const workers of list('workers').map(Number)) {
			for (const batchChunks of list('batches').map(Number)) {
				for (const headerWorkers of list('headers').map(Number)) {
					if (stopped) return;

					await runOne(scenario, {
						...(scenario.startsWith('decrypt')
							? { mode: 'decrypt', credentials: { kind: 'passphrase', passphrase } }
							: { mode: 'encrypt', credentials: { kind: 'passphrase', passphrase } }),
						files,
						save,
						tuning: { workers, batchChunks, headerWorkers, backend }
					});
				}
			}
		}
	}

	$('status', HTMLElement).textContent = 'Done.';
});

async function runOne(scenario: Scenario, options: JobOptions): Promise<void> {
	const started = performance.now();
	const job = startJob(options);
	current = job;
	job.subscribe(() => {
		const s = job.getSnapshot();
		$('status', HTMLElement).textContent =
			`${scenario} · ${options.tuning?.backend} · ${options.tuning?.workers} workers · ` +
			`${options.tuning?.batchChunks} chunks · ${options.tuning?.headerWorkers} header workers: ${((100 * s.workDone) / s.workTotal).toFixed(1)}%`;
	});
	const result = await job.done;
	current = null;

	if (result.status !== 'done') {
		const [first] = result.files;
		const error = first?.status === 'failed' ? first.error : null;
		console.error(`${scenario} ${result.status}`, error);
		$('status', HTMLElement).textContent = `${result.status}: ${error?.message ?? ''}`;
		stopped = true;

		return;
	}

	if (scenario === 'encrypt-opfs') encrypted = await (await opfsFile()).getFile();
	const seconds = (performance.now() - started) / 1000;

	const row: Row = {
		scenario,
		browser: capabilities.browser,
		backend: result.backend,
		workers: options.tuning!.workers!,
		batchChunks: options.tuning!.batchChunks!,
		headerWorkers: options.tuning!.headerWorkers!,
		files: result.files.length,
		gib: result.bytesTotal / 1024 ** 3,
		seconds,
		mibps: result.bytesTotal / 1024 ** 2 / seconds
	};

	rows.push(row);
	render();
}

/** Stands in for a picked file, so a disk write needs no picker. */
async function opfsFile(): Promise<FileSystemFileHandle> {
	const root = await navigator.storage.getDirectory();

	return root.getFileHandle('bench.age', { create: true });
}

const cells = (r: Row): string[] => [
	r.scenario,
	r.browser,
	r.backend ?? '',
	String(r.workers),
	String(r.batchChunks),
	String(r.headerWorkers),
	String(r.files),
	r.gib.toFixed(2),
	r.seconds.toFixed(1),
	r.mibps.toFixed(0)
];

function render(): void {
	$('results', HTMLElement).replaceChildren(
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
	$('markdown', HTMLElement).textContent = [
		'| Scenario | Browser | Backend | Workers | Batch | Headers | Files | GiB | Seconds | MiB/s |',
		'|---|---|---|---|---|---|---|---|---|---|',
		...rows.map((r) => `| ${cells(r).join(' | ')} |`)
	].join('\n');
}
