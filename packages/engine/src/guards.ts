const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();

/**
 * Keeps a running job alive: a screen wake lock (re-acquired when the tab
 * becomes visible again) and a `beforeunload` prompt. Never rejects.
 */
export async function acquireJobGuards(): Promise<{ release(): void }> {
	let lock: WakeLockSentinel | null = null;
	let released = false;

	const requestLock = async () => {
		if (document.visibilityState !== 'visible') return;
		// Some Firefox builds turn wake locks off; a job runs without one.
		const granted = (await navigator.wakeLock?.request('screen').catch(() => null)) ?? null;

		// The job may have ended while the browser granted it.
		if (released) void granted?.release().catch(() => {});
		else lock = granted;
	};

	const onVisibility = () => void requestLock();

	await requestLock();
	document.addEventListener('visibilitychange', onVisibility);
	addEventListener('beforeunload', onBeforeUnload);

	return {
		release() {
			released = true;
			void lock?.release().catch(() => {});
			document.removeEventListener('visibilitychange', onVisibility);
			removeEventListener('beforeunload', onBeforeUnload);
		}
	};
}
