import type { SerializedError } from '../errors.ts';

/** OPFS directory for staged outputs (the fallback save path). */
export const OPFS_STAGING_DIR = 'encryptee-staging';

/**
 * Where one output file goes, by save location. A descriptor is created on the
 * main thread (where pickers need a user gesture) and posted to the
 * coordinator worker, which opens the matching `ByteSink` only after the
 * header checks out.
 */
export type SinkDescriptor =
	| { kind: 'file'; handle: FileSystemFileHandle }
	/** A new file named `name` inside the picked directory. */
	| { kind: 'directory'; handle: FileSystemDirectoryHandle; name: string }
	/** Streamed to the service worker's download route over `port`. */
	| { kind: 'sw-download'; port: MessagePort }
	/** Staged as `name` in the origin private file system, downloaded afterwards. */
	| { kind: 'opfs'; name: string }
	| { kind: 'memory' }
	| { kind: 'discard' };

/** What a finished sink hands back to the main thread. */
export type SinkResult =
	| { kind: 'saved' }
	| { kind: 'memory'; blob: Blob }
	| { kind: 'discarded'; bytes: number };

/** Where one output file ended up: what its sink handed back, or the browser's downloads. */
export type FileOutput = SinkResult | { kind: 'downloaded' };

/** The worker half of one output file, opened by the coordinator. */
export interface ByteSink {
	/** Resolves when the sink can take more; callers await it for backpressure. */
	write(chunk: Uint8Array<ArrayBuffer>): Promise<void>;
	close(): Promise<SinkResult>;
	/** Discards everything written so far. Never throws. */
	abort(reason: SerializedError): Promise<void>;
}

/**
 * The main-thread half of one output file; the coordinator opens its worker
 * half, a `ByteSink`, from `sink`. Any step may throw, and the job fails the
 * file with `saveError` of what was thrown.
 */
export interface Output {
	readonly sink: SinkDescriptor;
	readonly transfer: Transferable[];
	/** The header checked out and the sink is open; `size` bytes will follow. */
	opened(size: number): void;
	finish(result: SinkResult): Promise<FileOutput>;
	/** Lets go of what the output holds after a failure or cancel. Never throws. */
	release(): void;
}
