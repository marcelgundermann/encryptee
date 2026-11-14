declare global {
	interface Navigator {
		/** User-Agent Client Hints, which the DOM typings lack. Chromium only. */
		readonly userAgentData?: { brands: { brand: string }[]; mobile: boolean };
	}
}

type BrowserFamily = 'chromium' | 'firefox' | 'safari' | 'other';

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
}

export function detectCapabilities(): Capabilities {
	const ua = navigator.userAgent;
	const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);

	const brands = navigator.userAgentData;

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
		savePicker: 'showSaveFilePicker' in window,
		directoryPicker: 'showDirectoryPicker' in window,
		serviceWorkerDownload: !!navigator.serviceWorker?.controller
	};
}
