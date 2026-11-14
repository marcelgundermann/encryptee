import { BLOB_DOWNLOAD_MS, downloadBlob } from './download.ts';
import { OPFS_STAGING_DIR, type Output } from './sink.ts';

/**
 * Stages the output in OPFS, then downloads it from there. Each staged file is
 * held under a Web Lock until its download has had time to finish, and every
 * new staging first deletes the files nobody holds: leftovers from closed tabs
 * and from downloads that are long done.
 */
export async function stagedOutput(name: string): Promise<Output> {
	void navigator.storage.persist();
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
			// The staged File stays on disk; its blob URL doesn't read it into memory.
			downloadBlob(await (await staging.getFileHandle(staged)).getFile(), name);
			setTimeout(unlock, BLOB_DOWNLOAD_MS);

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
