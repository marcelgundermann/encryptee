import { detectCapabilities, type Capabilities } from '../capabilities.ts';
import { EngineError } from '../errors.ts';
import { outputName } from '../format/names.ts';
import type { Output, SinkDescriptor } from './sink.ts';
import { streamedOutput } from './sw-download.ts';

/** Where a job's output files end up. In the app, `chooseSaveLocation` gives one. */
export type SaveLocation =
	/** A file the user picked; the job has exactly one input. */
	| { kind: 'file'; handle: FileSystemFileHandle }
	/** A folder the user picked; each input gets a new file in it. */
	| { kind: 'directory'; handle: FileSystemDirectoryHandle }
	/** The browser's downloads, streamed through the service worker. */
	| { kind: 'sw-download' }
	/** Collected into a Blob (tests). */
	| { kind: 'memory' }
	/** Dropped after counting (benchmarks). */
	| { kind: 'discard' };

/** What the UI can say before Start: it will ask where to save, or use the downloads. */
export type SavePlan = 'ask' | 'downloads';

export type SaveChoice =
	| { location: SaveLocation }
	/** The user closed the picker, or the click's user activation had run out. */
	| { location: null; reason: 'dismissed' | 'needs-gesture' };

/** What choosing a save location depends on: this browser, or a fake one in tests. */
export interface SaveEnvironment {
	capabilities: Capabilities;
	showSaveFilePicker(suggestedName: string): Promise<FileSystemFileHandle>;
	showDirectoryPicker(): Promise<FileSystemDirectoryHandle>;
}

/**
 * Largest input the downloads are trusted with in each browser until
 * measurements raise it. `null` means no limit.
 */
const SIZE_LIMITS: Record<Capabilities['browser'], number | null> = {
	chromium: null,
	firefox: 4 * 1024 ** 3,
	safari: 4 * 1024 ** 3,
	other: 2 * 1024 ** 3
};

/** How a browser saves a job, decided by its capabilities and the number of files. */
interface SaveRoute {
	kind: 'file' | 'directory' | 'sw-download';
	plan: SavePlan;
	/** Largest input it's trusted with; `null` for no limit. */
	sizeLimit: number | null;
}

/** Native pickers on Chromium, which write straight to disk, else a streamed download. */
export function saveRoute(capabilities: Capabilities, fileCount: number): SaveRoute {
	if (fileCount === 1 && capabilities.savePicker)
		return { kind: 'file', plan: 'ask', sizeLimit: null };

	if (fileCount > 1 && capabilities.directoryPicker)
		return { kind: 'directory', plan: 'ask', sizeLimit: null };

	return {
		kind: 'sw-download',
		plan: 'downloads',
		sizeLimit: SIZE_LIMITS[capabilities.browser]
	};
}

/** How a job over `fileCount` files would be saved in this browser. */
export function whereToSave(fileCount: number): SavePlan {
	return saveRoute(detectCapabilities(), fileCount).plan;
}

/**
 * Picks where a job's outputs go, showing a save picker where the browser has
 * one. Call it straight from the click handler, before awaiting anything: the
 * pickers need the click's user activation, and once it has expired the
 * choice is `needs-gesture`, so ask for another click. Rejects with
 * `unsupported` if a download is the only way to save and no service worker
 * controls the page to stream it, and `save-failed` if a picker breaks.
 */
export function chooseSaveLocation(
	mode: 'encrypt' | 'decrypt',
	files: readonly { name: string }[]
): Promise<SaveChoice> {
	return chooseSaveLocationIn(browserEnvironment(), mode, files);
}

/** `chooseSaveLocation` in a given browser; tests pass a fake one. */
export async function chooseSaveLocationIn(
	environment: SaveEnvironment,
	mode: 'encrypt' | 'decrypt',
	files: readonly { name: string }[]
): Promise<SaveChoice> {
	switch (saveRoute(environment.capabilities, files.length).kind) {
		case 'file':
			return pick(async () => ({
				kind: 'file',
				handle: await environment.showSaveFilePicker(outputName(mode, files[0]!.name))
			}));
		case 'directory':
			return pick(async () => ({
				kind: 'directory',
				handle: await environment.showDirectoryPicker()
			}));
		case 'sw-download':
			if (!environment.capabilities.serviceWorkerDownload) {
				throw new EngineError('unsupported', 'no service worker controls this page');
			}

			return { location: { kind: 'sw-download' } };
	}
}

async function pick(show: () => Promise<SaveLocation>): Promise<SaveChoice> {
	try {
		return { location: await show() };
	} catch (cause) {
		if (cause instanceof DOMException && cause.name === 'AbortError') {
			return { location: null, reason: 'dismissed' };
		}

		// The browser refused the picker: the click's activation had run out.
		if (cause instanceof DOMException && /NotAllowed|Security/.test(cause.name)) {
			return { location: null, reason: 'needs-gesture' };
		}

		throw new EngineError('save-failed', 'the save picker failed', { cause });
	}
}

function browserEnvironment(): SaveEnvironment {
	return {
		capabilities: detectCapabilities(),
		showSaveFilePicker: (suggestedName) => window.showSaveFilePicker({ suggestedName }),
		showDirectoryPicker: () => window.showDirectoryPicker({ mode: 'readwrite' })
	};
}

export async function openOutput(location: SaveLocation, name: string): Promise<Output> {
	switch (location.kind) {
		case 'file':
		case 'memory':
		case 'discard':
			return sinkOnly(location);
		case 'directory':
			return sinkOnly({ ...location, name });
		case 'sw-download':
			return streamedOutput(name);
	}
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
