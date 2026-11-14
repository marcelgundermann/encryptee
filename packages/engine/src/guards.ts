const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();

/**
 * Keeps a running job alive: a screen wake lock (re-acquired when the tab
 * becomes visible again) and a `beforeunload` prompt.
 */
export async function acquireJobGuards(): Promise<{ release(): void }> {
	let lock: WakeLockSentinel | null = null;
	let released = false;

	const requestLock = async () => {
		if (released || document.visibilityState !== 'visible') return;
		lock = await navigator.wakeLock.request('screen').catch(() => null);
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
