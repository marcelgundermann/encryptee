import { detectCapabilities } from './capabilities.ts';
import { sealedPayloadSize } from './format/age.ts';
import { saveRoute } from './sinks/save-location.ts';

/** Upper bound for an age header with a handful of PQ recipients. */
const HEADER_ALLOWANCE = 16 * 1024;

/** iPhone jobs above this get the keep-in-foreground warning. */
const IOS_LARGE_JOB = 1024 ** 3;

export type PreflightWarning =
	/** iPhone/iPad and a large job: keep the app in the foreground, check free space. */
	| { code: 'ios-large-job' }
	/** Above the size this browser's save path is verified for: suggest Chrome/Edge. */
	| { code: 'over-browser-limit'; limit: number }
	/** The storage estimate says the output may not fit. Only a hint. */
	| { code: 'low-storage'; needed: number; available: number }
	/** OPFS staging holds a full copy until the download finishes. */
	| { code: 'needs-double-space' };

/** Everything worth saying about a job over files of `sizes` before it starts. */
export async function preflight(input: {
	mode: 'encrypt' | 'decrypt';
	sizes: number[];
}): Promise<PreflightWarning[]> {
	const { mode, sizes } = input;
	const capabilities = detectCapabilities();
	const route = saveRoute(capabilities, sizes.length);
	const inputBytes = sizes.reduce((a, b) => a + b, 0);
	const warnings: PreflightWarning[] = [];

	if (capabilities.ios && inputBytes >= IOS_LARGE_JOB) warnings.push({ code: 'ios-large-job' });

	if (route.sizeLimit !== null && Math.max(0, ...sizes) > route.sizeLimit)
		warnings.push({ code: 'over-browser-limit', limit: route.sizeLimit });

	// Only OPFS staging lands in origin storage; estimate() is a hint at best.
	if (route.kind === 'opfs') {
		warnings.push({ code: 'needs-double-space' });

		const outputBytes =
			mode === 'encrypt'
				? sizes.reduce((sum, size) => sum + HEADER_ALLOWANCE + sealedPayloadSize(size), 0)
				: inputBytes;

		const { quota = 0, usage = 0 } = await navigator.storage
			.estimate()
			.catch((): StorageEstimate => ({}));

		const available = quota - usage;

		if (quota > 0 && available < outputBytes)
			warnings.push({ code: 'low-storage', needed: outputBytes, available });
	}

	return warnings;
}
