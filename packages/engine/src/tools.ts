import { deserializeError } from './errors.ts';
import type {
	ToolName,
	ToolRequest,
	ToolResponse,
	Tools,
	ToolValue
} from './workers/tools-protocol.ts';

/**
 * Key operations (key generation, scrypt for key files) run in a worker like
 * all other crypto. One worker is started on first use and kept.
 */
let worker: Worker | null = null;

function call<T extends ToolName>(tool: T, ...args: Parameters<Tools[T]>): Promise<ToolValue<T>> {
	worker ??= new Worker(new URL('./workers/tools.worker.ts', import.meta.url), {
		type: 'module',
		name: 'encryptee-tools'
	});

	// Each call gets its own channel, so the one response on it is `tool`'s.
	const { port1, port2 } = new MessageChannel();
	const request: ToolRequest<T> = { tool, args, port: port2 };

	const response = new Promise<ToolValue<T>>((resolve, reject) => {
		port1.onmessage = ({ data }: MessageEvent<ToolResponse<T>>) => {
			port1.close();

			if (data.ok) resolve(data.value);
			else reject(deserializeError(data.error));
		};
	});

	worker.postMessage(request, [port2]);

	return response;
}

/** Generates a key pair: post-quantum hybrid by default (D20). */
export const generateKeyPair: Tools['generateKeyPair'] = (...args) =>
	call('generateKeyPair', ...args);

/** Encrypts an identity file to a passphrase (scrypt runs in the worker). */
export const protectKeyFile: Tools['protectKeyFile'] = (...args) => call('protectKeyFile', ...args);

/** Reads a plain or protected key file. */
export const readKeyFile: Tools['readKeyFile'] = (...args) => call('readKeyFile', ...args);

/** Trims pasted public keys and checks each one; rejects with `invalid-public-key`. */
export const validatePublicKeys: Tools['validatePublicKeys'] = (...args) =>
	call('validatePublicKeys', ...args);

/** Checks a passphrase or private keys against a file's header (scrypt runs in the worker). */
export const checkCredentials: Tools['checkCredentials'] = (...args) =>
	call('checkCredentials', ...args);
