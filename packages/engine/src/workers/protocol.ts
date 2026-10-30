import type { SerializedError } from '../errors.ts';
import type { DecryptCredentials, EncryptCredentials } from '../format/header.ts';
import type { Backend } from '../payload/cipher.ts';
import type { SinkDescriptor, SinkResult } from '../sinks/sink.ts';

/** Input of one file task. `synthetic` produces zero bytes without I/O (benchmarks). */
export type Source = { kind: 'blob'; blob: Blob } | { kind: 'synthetic'; size: number };

type TaskOperation =
	| { mode: 'encrypt'; credentials: EncryptCredentials }
	| { mode: 'decrypt'; credentials: DecryptCredentials };

/** One input file → one output file. */
export interface FileTask {
	id: number;
	source: Source;
	sink: SinkDescriptor;
	operation: TaskOperation;
	/** age chunks (64 KiB each) per batch message. */
	batchChunks: number;
	/** Batches read, in flight or awaiting their turn to be written. */
	window: number;
	backend?: Backend;
}

/** Main thread → coordinator. */
export type CoordinatorRequest =
	| { type: 'init'; pool: MessagePort[] }
	| { type: 'run'; task: FileTask }
	| { type: 'cancel'; id: number };

/** Coordinator → main thread. */
export type CoordinatorEvent =
	/** The header checked out and the sink is open; from here on bytes reach the sink. */
	| { type: 'opened'; id: number; outputSize: number; backend: Backend }
	/** Input bytes processed so far (throttled to ~10 Hz). */
	| { type: 'progress'; id: number; bytes: number }
	| { type: 'done'; id: number; result: SinkResult }
	| { type: 'failed'; id: number; error: SerializedError; opened: boolean };

/** Main thread → crypto worker. */
export type CryptoConnect = { type: 'connect'; port: MessagePort };

/** Coordinator → crypto worker. */
export type CryptoRequest =
	| { type: 'key'; key: Uint8Array<ArrayBuffer>; backend?: Backend }
	| {
			type: 'seal' | 'open';
			task: number;
			firstChunk: number;
			final: boolean;
			data: ArrayBuffer;
	  }
	| { type: 'forget' };

/** Crypto worker → coordinator. */
export type CryptoResponse =
	| { type: 'ready'; backend: Backend }
	| { type: 'result'; task: number; data: ArrayBuffer }
	| { type: 'error'; task: number | null; error: SerializedError };
