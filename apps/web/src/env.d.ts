/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
/// <reference types="vite-plugin-pwa/info" />

/** Commit time of this build in Unix seconds; compared against `/security.json`. */
declare const __BUILD_NUMBER__: number;

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
