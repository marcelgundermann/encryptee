import { detectCapabilities } from './capabilities.ts';
import { saveRoute } from './sinks/save-location.ts';

/** iPhone jobs above this get the keep-in-foreground warning. */
const IOS_LARGE_JOB = 1024 ** 3;

export type PreflightWarning =
	/** iPhone/iPad and a large job: keep the app in the foreground, check free space. */
	| { code: 'ios-large-job' }
	/** Above the size this browser's save path is verified for: suggest Chrome/Edge. */
	| { code: 'over-browser-limit'; limit: number };

/** Everything worth saying about a job over files of `sizes` before it starts. */
export function preflight(sizes: readonly number[]): PreflightWarning[] {
	const capabilities = detectCapabilities();
	const { sizeLimit } = saveRoute(capabilities, sizes.length);
	const inputBytes = sizes.reduce((a, b) => a + b, 0);
	const warnings: PreflightWarning[] = [];

	if (capabilities.ios && inputBytes >= IOS_LARGE_JOB) warnings.push({ code: 'ios-large-job' });

	if (sizeLimit !== null && Math.max(0, ...sizes) > sizeLimit)
		warnings.push({ code: 'over-browser-limit', limit: sizeLimit });

	return warnings;
}
