import type { SerializedError } from '../errors.ts';
import type { DecryptCredentials, EncryptCredentials } from '../format/header.ts';
import type { Backend } from '../payload/cipher.ts';
import type { BatchPosition, PayloadLayout } from '../payload/layout.ts';
import type { SinkDescriptor, SinkResult } from '../sinks/sink.ts';

/** How a job runs: its crypto workers, and how the coordinator cuts and pipelines each file. */
export interface Tuning {
	workers: number;
	/** age chunks (64 KiB each) per batch message. */
	batchChunks: number;
	/** Batches read, in flight or awaiting their turn to be written. */
	window: number;
	/** The payload cipher; unset, native where the browser has it. */
	backend?: Backend;
}

/** Input of one file task. `synthetic` produces zero bytes without I/O (benchmarks). */
export type Source = { kind: 'blob'; blob: Blob } | { kind: 'synthetic'; size: number };

export type TaskOperation =
	| { mode: 'encrypt'; credentials: EncryptCredentials }
	| { mode: 'decrypt'; credentials: DecryptCredentials };

/** One input file → one output file. `id` is the file's index in its job. */
export interface FileTask {
	id: number;
	source: Source;
	sink: SinkDescriptor;
	operation: TaskOperation;
}

/** What a file needs before its payload: the layout, the payload key and, when sealing, the header. */
export interface Prepared {
	layout: PayloadLayout;
	payloadKey: Uint8Array<ArrayBuffer>;
	/** Header and payload nonce, written before the payload when sealing. */
	prefix: Uint8Array<ArrayBuffer> | null;
	outputSize: number;
}

/** Main thread → header or crypto worker, once: the port it serves the coordinator on. */
export type WorkerConnect = { type: 'connect'; port: MessagePort };

/** Main thread → coordinator, once, before anything else. */
export type CoordinatorInit = {
	type: 'init';
	pool: MessagePort[];
	header: MessagePort;
	tuning: Tuning;
};

/** Main thread → coordinator. */
export type CoordinatorRequest =
	/** Opens file `id`'s header ahead of its `run`, which then doesn't open it again. */
	| { type: 'check'; id: number; source: Source; credentials: DecryptCredentials }
	| { type: 'run'; task: FileTask }
	| { type: 'cancel'; id: number };

/** Coordinator → main thread. */
export type CoordinatorEvent =
	/** The header of a `check` opened with its credentials. */
	| { type: 'checked'; id: number }
	/**
	 * The header checked out, and every chunk did for a file `checksFirst`, and
	 * the sink is open; from here on bytes reach the sink.
	 */
	| { type: 'opened'; id: number; outputSize: number; backend: Backend }
	/** Input bytes processed so far, throttled; from zero again once a file checked first opens. */
	| { type: 'progress'; id: number; bytes: number }
	| { type: 'done'; id: number; result: SinkResult }
	| { type: 'failed'; id: number; error: SerializedError };

/** Coordinator → header worker. */
export type HeaderRequest = {
	type: 'prepare';
	request: number;
	source: Source;
	operation: TaskOperation;
	batchChunks: number;
};

/** Header worker → coordinator. */
export type HeaderResponse =
	| { type: 'prepared'; request: number; prepared: Prepared }
	| { type: 'failed'; request: number; error: SerializedError };

/** Coordinator → crypto worker. */
export type CryptoRequest =
	| { type: 'key'; key: Uint8Array<ArrayBuffer>; backend: Backend | undefined }
	| ({ type: 'seal' | 'open'; task: number; data: ArrayBuffer } & BatchPosition)
	| { type: 'forget' };

/** Crypto worker → coordinator. */
export type CryptoResponse =
	| { type: 'ready'; backend: Backend }
	| { type: 'key-failed'; error: SerializedError }
	| { type: 'result'; task: number; data: ArrayBuffer }
	| { type: 'error'; task: number; error: SerializedError };
