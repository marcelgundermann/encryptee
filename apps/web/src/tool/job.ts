import {
	chooseSink,
	detectCapabilities,
	outputName,
	startJob,
	type Job,
	type JobOptions,
	type JobSnapshot,
	type SaveTarget
} from '@encryptee/engine';
import { useSyncExternalStore } from 'react';

const noSubscribe = () => () => {};
const noSnapshot = () => null;

/** The running job's snapshot, re-rendered at the engine's ~10 Hz progress rate. */
export function useJobSnapshot(job: Job | null): JobSnapshot | null {
	return useSyncExternalStore(job?.subscribe ?? noSubscribe, job?.getSnapshot ?? noSnapshot);
}

/**
 * Asks where to save and starts the job. Must be called directly from a click
 * handler: the pickers need the user gesture, so nothing is awaited before them.
 * Returns no job if the user dismissed the picker, or `needs-gesture` if the
 * browser refused the picker because the click's activation had expired
 * (e.g. after a slow passphrase check); ask for another click then.
 */
export async function pickAndStart(
	options: Omit<JobOptions, 'save'>
): Promise<{ job: Job } | { job: null; reason: 'dismissed' | 'unsupported' | 'needs-gesture' }> {
	const choice = chooseSink(detectCapabilities(), options.files.length);
	let save: SaveTarget;
	try {
		switch (choice) {
			case 'file-picker': {
				const name = outputName(options.mode, options.files[0]!.name);
				save = { kind: 'file', handle: await window.showSaveFilePicker({ suggestedName: name }) };
				break;
			}
			case 'directory-picker':
				save = {
					kind: 'directory',
					handle: await window.showDirectoryPicker({ mode: 'readwrite' })
				};
				break;
			case 'sw-download':
			case 'opfs':
				save = { kind: choice };
				break;
			case 'unsupported':
				return { job: null, reason: 'unsupported' };
		}
	} catch (error) {
		if (error instanceof DOMException && error.name === 'AbortError') {
			return { job: null, reason: 'dismissed' };
		}
		if (error instanceof DOMException && /NotAllowed|Security/.test(error.name)) {
			return { job: null, reason: 'needs-gesture' };
		}
		throw error;
	}
	return { job: startJob({ ...options, save } as JobOptions) };
}

/** Whether starting a job will open a save picker (Chromium) rather than download. */
export function asksWhereToSave(fileCount: number): boolean {
	const choice = chooseSink(detectCapabilities(), fileCount);
	return choice === 'file-picker' || choice === 'directory-picker';
}
