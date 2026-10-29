import { sizeLimit, type Capabilities, type SinkChoice } from './capabilities.ts';
import { sealedPayloadSize } from './format/age.ts';

/** Upper bound for an age header with a handful of PQ recipients. */
const HEADER_ALLOWANCE = 16 * 1024;
/** iPhone jobs above this get the keep-in-foreground warning (D22). */
const IOS_LARGE_JOB = 1024 ** 3;

/**
 * Conservative throughput guesses (bytes/s) for the time estimate, until
 * docs/research/2026-11-benchmarks.md has measured numbers.
 */
const ASSUMED_THROUGHPUT: Record<Capabilities['browser'], number> = {
	chromium: 400 * 1024 ** 2,
	firefox: 250 * 1024 ** 2,
	safari: 250 * 1024 ** 2,
	other: 150 * 1024 ** 2
};

export type PreflightWarning =
	/** iPhone/iPad and a large job: keep the app in the foreground, check free space (D22). */
	| { code: 'ios-large-job' }
	/** Above the size this browser's save path is verified for: suggest Chrome/Edge (D23). */
	| { code: 'over-browser-limit'; limit: number }
	/** The storage estimate says the output may not fit. Only a hint. */
	| { code: 'low-storage'; needed: number; available: number }
	/** OPFS staging holds a full copy until the download finishes. */
	| { code: 'needs-double-space' };

export interface Preflight {
	inputBytes: number;
	/** Exact for decrypt once headers are read; an upper bound before that. */
	outputBytes: number;
	estimatedSeconds: number;
	warnings: PreflightWarning[];
}

export async function preflight(input: {
	mode: 'encrypt' | 'decrypt';
	sizes: number[];
	sink: SinkChoice;
	capabilities: Capabilities;
}): Promise<Preflight> {
	const { mode, sizes, sink, capabilities } = input;
	const inputBytes = sizes.reduce((a, b) => a + b, 0);
	const outputBytes =
		mode === 'encrypt'
			? sizes.reduce((sum, size) => sum + HEADER_ALLOWANCE + sealedPayloadSize(size), 0)
			: inputBytes;
	const warnings: PreflightWarning[] = [];

	if (capabilities.ios && inputBytes >= IOS_LARGE_JOB) warnings.push({ code: 'ios-large-job' });
	const limit = sizeLimit(capabilities, sink);
	if (limit !== null && Math.max(0, ...sizes) > limit)
		warnings.push({ code: 'over-browser-limit', limit });
	if (sink === 'opfs') warnings.push({ code: 'needs-double-space' });

	// Only OPFS staging lands in origin storage; estimate() is a hint at best.
	if (sink === 'opfs' && navigator.storage?.estimate) {
		const { quota = 0, usage = 0 } = await navigator.storage
			.estimate()
			.catch(() => ({}) as StorageEstimate);
		const available = quota - usage;
		if (quota > 0 && available < outputBytes)
			warnings.push({ code: 'low-storage', needed: outputBytes, available });
	}

	return {
		inputBytes,
		outputBytes,
		estimatedSeconds: inputBytes / ASSUMED_THROUGHPUT[capabilities.browser],
		warnings
	};
}
