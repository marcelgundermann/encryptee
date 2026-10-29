import { serializeError, type SerializedError } from '../errors.ts';
import { STAGED_DOWNLOAD_MS, SwDownload, downloadStagedFile } from './download.ts';
import { OPFS_STAGING_DIR, type SinkDescriptor, type SinkResult } from './sink.ts';

/** Where a job's output files end up. Pickers must be shown inside the user gesture. */
export type SaveLocation =
	/** A file the user picked; the job has exactly one input. */
	| { kind: 'file'; handle: FileSystemFileHandle }
	/** A folder the user picked; each input gets a new file in it. */
	| { kind: 'directory'; handle: FileSystemDirectoryHandle }
	/** The browser's downloads, streamed through the service worker. */
	| { kind: 'sw-download' }
	/** The browser's downloads, staged in the origin private file system first. */
	| { kind: 'opfs' }
	/** Collected into a Blob (tests and small files only). */
	| { kind: 'memory' }
	/** Dropped after counting (benchmarks). */
	| { kind: 'discard' };

/** Where one output file ended up: what its sink handed back, or the browser's downloads. */
export type FileOutput = SinkResult | { kind: 'downloaded' };

/**
 * The main-thread half of one output file; the coordinator opens its worker
 * half, a `ByteSink`, from `sink`. Any step may throw, and the job fails the
 * file with `saveError` of what was thrown.
 */
export interface Output {
	readonly sink: SinkDescriptor;
	readonly transfer: Transferable[];
	/** The header checked out and the sink is open; `size` bytes will follow. */
	opened(size: number): void;
	finish(result: SinkResult): Promise<FileOutput>;
	/** Lets go of what the output holds after a failure or cancel. Never throws. */
	release(): void;
}

/** Prepares the output for the file named `name` at `location`. */
export async function openOutput(location: SaveLocation, name: string): Promise<Output> {
	switch (location.kind) {
		case 'file':
			return sinkOnly({ kind: 'fsa-file', handle: location.handle });
		case 'directory':
			return sinkOnly({ kind: 'fsa-directory', handle: location.handle, name });
		case 'sw-download':
			return streamedOutput(name);
		case 'opfs':
			return stagedOutput(name);
		case 'memory':
		case 'discard':
			return sinkOnly({ kind: location.kind });
	}
}

/** A failure while saving: its own code (`storage-full`, `cancelled`, …) or `save-failed`. */
export function saveError(cause: unknown): SerializedError {
	const error = serializeError(cause);

	return error.code === 'internal' ? { code: 'save-failed', message: error.message } : error;
}

/** Outputs whose sink does all the work. */
function sinkOnly(sink: SinkDescriptor): Output {
	return {
		sink,
		transfer: [],
		opened() {},
		finish: async (result) => result,
		release() {}
	};
}

function streamedOutput(name: string): Output {
	const download = new SwDownload(name);

	return {
		sink: { kind: 'sw-download', port: download.port },
		transfer: [download.port],
		opened: (size) => download.begin(size),
		async finish() {
			download.end();

			return { kind: 'downloaded' };
		},
		release: () => download.end()
	};
}

/**
 * Stages the output in OPFS, then downloads it from there. Each staged file is
 * held under a Web Lock until its download has had time to finish, and every
 * new staging first deletes the files nobody holds: leftovers from closed tabs
 * and from downloads that are long done.
 */
async function stagedOutput(name: string): Promise<Output> {
	void navigator.storage.persist?.();
	const root = await navigator.storage.getDirectory();
	const staging = await root.getDirectoryHandle(OPFS_STAGING_DIR, { create: true });
	const staged = `${crypto.randomUUID()}.part`;
	const unlock = await holdStagingLock(staged);
	await sweepStaging(staging);

	return {
		sink: { kind: 'opfs', name: staged },
		transfer: [],
		opened() {},
		async finish() {
			await downloadStagedFile(staging, staged, name);
			setTimeout(unlock, STAGED_DOWNLOAD_MS);

			return { kind: 'downloaded' };
		},
		release: unlock
	};
}

const stagingLock = (staged: string) => `${OPFS_STAGING_DIR}/${staged}`;

/** Resolves once the lock on `staged` is held, with the function that lets it go. */
function holdStagingLock(staged: string): Promise<() => void> {
	return new Promise((held, failed) => {
		navigator.locks
			.request(stagingLock(staged), () => new Promise<void>((release) => held(() => release())))
			.catch(failed);
	});
}

async function sweepStaging(staging: FileSystemDirectoryHandle): Promise<void> {
	const staged: string[] = [];

	try {
		for await (const name of staging.keys()) staged.push(name);
	} catch {
		// Housekeeping only: a staging area we can't list is no reason to fail the save.
		return;
	}

	for (const name of staged) {
		await navigator.locks.request(stagingLock(name), { ifAvailable: true }, async (lock) => {
			if (lock) await staging.removeEntry(name).catch(() => {});
		});
	}
}
