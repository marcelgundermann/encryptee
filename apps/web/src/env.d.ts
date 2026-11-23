/// <reference types="vite/client" />

/** Browser APIs the DOM typings lack; browsers without them leave them undefined. */
interface Window {
	/** Trusted Types, the part of it `trusted-types.ts` uses. */
	readonly trustedTypes?: {
		createPolicy(name: string, rules: { createScriptURL(input: string): string }): void;
	};
	/** Launch Handler API (PWA file handling, Chromium). */
	readonly launchQueue?: {
		setConsumer(consumer: (params: { files: readonly FileSystemHandle[] }) => void): void;
	};
}
