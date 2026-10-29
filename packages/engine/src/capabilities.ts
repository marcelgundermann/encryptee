export type BrowserFamily = 'chromium' | 'firefox' | 'safari' | 'other';

export interface Capabilities {
	browser: BrowserFamily;
	/** iPhone/iPad: every browser there is WebKit with a ~1.5 GB memory limit. */
	ios: boolean;
	mobile: boolean;
	cores: number;
	savePicker: boolean;
	directoryPicker: boolean;
	/** A service worker controls this page, so the streaming download route is reachable. */
	serviceWorkerDownload: boolean;
	opfs: boolean;
}

/** How one job's outputs get saved, decided before the job starts. */
export type SinkChoice =
	| 'file-picker'
	| 'directory-picker'
	| 'sw-download'
	| 'opfs'
	| 'unsupported';

/**
 * Largest input the non-Chromium save paths are trusted with until
 * benchmarks raise it (D23). `null` means no limit. Values come from
 * docs/research/2026-11-benchmarks.md once measured.
 */
export const SIZE_LIMITS: Record<BrowserFamily, number | null> = {
	chromium: null,
	firefox: 4 * 1024 ** 3,
	safari: 4 * 1024 ** 3,
	other: 2 * 1024 ** 3
};

export function detectCapabilities(): Capabilities {
	const ua = navigator.userAgent;
	const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);

	// SAFETY: the DOM typings lack User-Agent Client Hints; `userAgentData`
	// stays optional here, and Firefox and Safari leave it undefined.
	const brands = (
		navigator as Navigator & { userAgentData?: { brands: { brand: string }[]; mobile: boolean } }
	).userAgentData;

	let browser: BrowserFamily = 'other';

	if (ios || (/Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua))) browser = 'safari';
	else if (/Firefox\//.test(ua)) browser = 'firefox';
	else if (brands?.brands.some((b) => b.brand === 'Chromium') || /Chrome\//.test(ua))
		browser = 'chromium';

	return {
		browser,
		ios,
		mobile: brands?.mobile ?? (ios || /Android|Mobi/.test(ua)),
		cores: navigator.hardwareConcurrency || 2,
		savePicker: typeof window !== 'undefined' && 'showSaveFilePicker' in window,
		directoryPicker: typeof window !== 'undefined' && 'showDirectoryPicker' in window,
		serviceWorkerDownload: !!navigator.serviceWorker?.controller,
		// SyncAccessHandle is only exposed in dedicated workers, so it can't be
		// probed here; every browser with getDirectory has it there.
		opfs: !!navigator.storage?.getDirectory
	};
}

/** Picks the save path: native pickers on Chromium, else a streamed download, else OPFS staging. */
export function chooseSink(capabilities: Capabilities, fileCount: number): SinkChoice {
	if (fileCount === 1 && capabilities.savePicker) return 'file-picker';

	if (fileCount > 1 && capabilities.directoryPicker) return 'directory-picker';

	if (capabilities.serviceWorkerDownload) return 'sw-download';

	if (capabilities.opfs) return 'opfs';

	return 'unsupported';
}

/** Size limit for a save path in this browser; pickers write straight to disk and have none. */
export function sizeLimit(capabilities: Capabilities, sink: SinkChoice): number | null {
	if (sink === 'file-picker' || sink === 'directory-picker') return null;

	return SIZE_LIMITS[capabilities.browser];
}

export interface Tuning {
	/** Crypto workers. */
	workers: number;
	/** 64 KiB chunks per batch. */
	batchChunks: number;
	/** Batches in flight. */
	window: number;
}

/** Tuning from the plan: N = clamp(cores − 1, 1, 8), 4 MiB batches (1 MiB on mobile), 2N in flight. */
export function defaultTuning(capabilities: Capabilities): Tuning {
	const workers = Math.min(8, Math.max(1, capabilities.cores - 1));

	return { workers, batchChunks: capabilities.mobile ? 16 : 64, window: 2 * workers };
}
