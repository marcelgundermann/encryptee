import type { SerializedError } from '../errors.ts';

/** OPFS directory for staged outputs (the fallback save path). */
export const OPFS_STAGING_DIR = 'encryptee-staging';

/**
 * Where one output file goes. A descriptor is created on the main thread
 * (where pickers need a user gesture) and posted to the coordinator worker,
 * which opens the matching `ByteSink` only after the header checks out.
 */
export type SinkDescriptor =
	/** A file the user picked with `showSaveFilePicker` (Chromium). */
	| { kind: 'fsa-file'; handle: FileSystemFileHandle }
	/** A new file named `name` inside a picked directory (Chromium). */
	| { kind: 'fsa-directory'; handle: FileSystemDirectoryHandle; name: string }
	/** Streamed to the service worker's download route over `port`. */
	| { kind: 'sw-download'; port: MessagePort }
	/** Staged as `name` in the origin private file system, downloaded afterwards. */
	| { kind: 'opfs'; name: string }
	/** Collected into a Blob (tests and small files only). */
	| { kind: 'memory' }
	/** Dropped after counting (benchmarks). */
	| { kind: 'discard' };

export type SinkKind = SinkDescriptor['kind'];

/** What a finished sink hands back to the main thread. */
export type SinkResult =
	| { kind: 'saved' }
	| { kind: 'memory'; blob: Blob }
	| { kind: 'discarded'; bytes: number };

export interface ByteSink {
	/** Resolves when the sink can take more; callers await it for backpressure. */
	write(chunk: Uint8Array<ArrayBuffer>): Promise<void>;
	close(): Promise<SinkResult>;
	/** Discards everything written so far. Never throws. */
	abort(reason: SerializedError): Promise<void>;
}
