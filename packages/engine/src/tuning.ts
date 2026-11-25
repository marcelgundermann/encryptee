import type { Capabilities } from './capabilities.ts';
import { CHUNK_SIZE } from './format/age.ts';
import type { DecryptCredentials, EncryptCredentials } from './format/header.ts';
import type { Tuning } from './workers/protocol.ts';

/** More crypto workers than this don't make a job faster, by the bench. */
const MAX_CRYPTO_WORKERS = 8;

/** Cores from which a second header worker leaves enough for the crypto workers. */
const CORES_FOR_TWO_HEADERS = 8;

/** What a job's tuning depends on, besides the browser. */
interface TunedJob {
	files: ReadonlyArray<{ size: number }>;
	credentials: EncryptCredentials | DecryptCredentials;
	tuning?: Partial<Tuning>;
}

/** How a job runs in a browser with these capabilities; its own `tuning` wins. */
export function jobTuning({ cores, mobile }: Capabilities, job: TunedJob): Tuning {
	const { files, credentials, tuning = {} } = job;
	const batchChunks = tuning.batchChunks ?? (mobile ? 16 : 64);
	// The files run one at a time, so the largest has the most batches to share out.
	const largest = files.reduce((max, { size }) => Math.max(max, size), 0);
	const batches = Math.max(1, Math.ceil(largest / (batchChunks * CHUNK_SIZE)));

	const workers = tuning.workers ?? Math.min(MAX_CRYPTO_WORKERS, Math.max(1, cores - 1), batches);

	// Only scrypt is slow enough to run twice at once, at 256 MiB or more each.
	const scrypts = credentials.kind === 'passphrase' && files.length > 1;
	const headerWorkers = scrypts && !mobile && cores >= CORES_FOR_TWO_HEADERS ? 2 : 1;

	return { workers, batchChunks, window: 2 * workers, headerWorkers, ...tuning };
}
