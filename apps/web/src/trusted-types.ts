/**
 * The CSP requires Trusted Types for script sinks. `new Worker(url)` and
 * `serviceWorker.register(url)` are such sinks, so this default policy lets
 * same-origin script URLs through and rejects everything else. No HTML or
 * script policy exists, so `innerHTML`, `eval` and friends stay blocked.
 * Must be imported before anything that starts a worker.
 */
interface TrustedTypePolicyFactoryLike {
	createPolicy(name: string, rules: { createScriptURL(input: string): string }): void;
}

// SAFETY: the DOM typings lack Trusted Types; `trustedTypes` stays optional
// here, and browsers without it leave it undefined.
const factory = (globalThis as { trustedTypes?: TrustedTypePolicyFactoryLike }).trustedTypes;

factory?.createPolicy('default', {
	createScriptURL(input) {
		const url = new URL(input, location.href);

		if (url.origin !== location.origin) throw new TypeError(`blocked script URL: ${input}`);

		return url.href;
	}
});
