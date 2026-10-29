import { deserializeError } from './errors.ts';
import type { ToolName, ToolRequest, ToolResponse, Tools } from './workers/tools-protocol.ts';

/**
 * Key operations (key generation, scrypt for key files) run in a worker like
 * all other crypto. One worker is started on first use and kept.
 */
let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function call<T extends ToolName>(tool: T, ...args: Parameters<Tools[T]>): ReturnType<Tools[T]> {
	if (!worker) {
		worker = new Worker(new URL('./workers/tools.worker.ts', import.meta.url), {
			type: 'module',
			name: 'encryptee-tools'
		});
		worker.onmessage = ({ data }: MessageEvent<ToolResponse>) => {
			const entry = pending.get(data.id);
			pending.delete(data.id);
			if (data.ok) entry?.resolve(data.value);
			else entry?.reject(deserializeError(data.error));
		};
	}
	const id = nextId++;
	const request: ToolRequest = { id, tool, args };
	return new Promise((resolve, reject) => {
		pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
		worker!.postMessage(request);
	}) as ReturnType<Tools[T]>;
}

/** Generates a key pair: post-quantum hybrid by default (D20). */
export const generateKeyPair: Tools['generateKeyPair'] = (...args) =>
	call('generateKeyPair', ...args);

/** Encrypts an identity file to a passphrase (scrypt runs in the worker). */
export const protectKeyFile: Tools['protectKeyFile'] = (...args) => call('protectKeyFile', ...args);

/** Reads a plain or protected key file. */
export const readKeyFile: Tools['readKeyFile'] = (...args) => call('readKeyFile', ...args);
