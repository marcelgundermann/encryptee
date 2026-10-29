import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const UPDATE_CHECK_MS = 60 * 60 * 1000;

export type Safety = 'ok' | 'unsafe' | 'unknown';

/**
 * Fails closed on known-bad builds: `/security.json` (never cached) names the
 * oldest build still safe to run. Offline, the result is `unknown` and the
 * app keeps working with the build date shown.
 */
export async function checkSafety(): Promise<Safety> {
	try {
		const response = await fetch('/security.json', { cache: 'no-store' });
		const { minSafeBuild }: { minSafeBuild?: unknown } = await response.json();

		// Anything but a number is treated as a build we can't vouch for.
		return Number.isFinite(minSafeBuild) && __BUILD_NUMBER__ >= Number(minSafeBuild)
			? 'ok'
			: 'unsafe';
	} catch {
		return 'unknown';
	}
}

export const buildDate = new Date(__BUILD_NUMBER__ * 1000).toLocaleDateString();

/**
 * Service-worker updates are offered, never forced, and only while no job
 * runs: swapping code mid-job could break a 50 GB run.
 */
export function useUpdates(jobRunning: boolean) {
	const [safety, setSafety] = useState<Safety>('unknown');

	const {
		needRefresh: [needRefresh],
		updateServiceWorker
	} = useRegisterSW({
		onRegisteredSW(_url, registration) {
			if (!registration) return;

			const check = () => {
				if (navigator.onLine && !registration.installing) void registration.update();
				void checkSafety().then(setSafety);
			};

			setInterval(check, UPDATE_CHECK_MS);
			document.addEventListener('visibilitychange', () => {
				if (document.visibilityState === 'visible') check();
			});
		}
	});

	useEffect(() => {
		void checkSafety().then(setSafety);
	}, []);

	return {
		safety,
		updateReady: needRefresh && !jobRunning,
		applyUpdate: () => updateServiceWorker(true)
	};
}
