import { deserializeError } from './errors.ts';
import { keyFileText, type KeyPair } from './keys/key-pair.ts';
import { downloadBlob } from './sinks/download.ts';
import type {
	ToolArgs,
	ToolName,
	ToolRequest,
	ToolResponse,
	ToolResult
} from './workers/tools-protocol.ts';

/**
 * Key operations (key generation, scrypt for key files) run in a worker like
 * all other crypto. One worker is started on first use and kept.
 */
let worker: Worker | null = null;

/** The key tool `name` from `keys/keys.ts`, run in the tools worker. */
function tool<K extends ToolName>(name: K) {
	return (...args: ToolArgs[K]): Promise<ToolResult[K]> => {
		worker ??= new Worker(new URL('./workers/typage.worker.ts', import.meta.url), {
			type: 'module',
			name: 'encryptee-tools'
		});

		// Each call gets its own channel, so the one response on it is this call's.
		const { port1, port2 } = new MessageChannel();
		const request: ToolRequest<K> = { type: 'tool', tool: name, args, port: port2 };

		const response = new Promise<ToolResult[K]>((resolve, reject) => {
			port1.onmessage = ({ data }: MessageEvent<ToolResponse<K>>) => {
				port1.close();

				if (data.ok) resolve(data.value);
				else reject(deserializeError(data.error));
			};
		});

		worker.postMessage(request, [port2]);

		return response;
	};
}

export const generateKeyPair = tool('generateKeyPair');

export const readKeyFile = tool('readKeyFile');

export const validatePublicKeys = tool('validatePublicKeys');

const protectKeyFile = tool('protectKeyFile');

/**
 * Saves `pair`'s key file to the downloads, protected with `passphrase` as
 * `key.age`, or plain as `key.txt`. Resolves with the name it saved.
 */
export async function saveKeyFile(pair: KeyPair, passphrase: string | null): Promise<string> {
	const text = keyFileText(pair);

	if (passphrase === null) {
		downloadBlob(new Blob([text]), 'key.txt');

		return 'key.txt';
	}

	// A Blob takes only ArrayBuffer-backed views; copy into one.
	downloadBlob(new Blob([new Uint8Array(await protectKeyFile(text, passphrase))]), 'key.age');

	return 'key.age';
}
