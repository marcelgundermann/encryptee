import { checkCredentials } from '../check.ts';
import { serializeError } from '../errors.ts';
import { generateKeyPair, protectKeyFile, readKeyFile, validatePublicKeys } from '../keys/keys.ts';
import type { ToolRequest, ToolResponse } from './tools-protocol.ts';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async ({ data }: MessageEvent<ToolRequest>) => {
	data.port.postMessage(await respond(data));
	data.port.close();
};

/**
 * Runs the tool `request` names. Each case narrows `args` to that tool's
 * parameters, and a tool without a case fails to compile.
 */
async function respond(request: ToolRequest): Promise<ToolResponse> {
	try {
		switch (request.tool) {
			case 'checkCredentials':
				return { ok: true, value: await checkCredentials(...request.args) };
			case 'generateKeyPair':
				return { ok: true, value: await generateKeyPair(...request.args) };
			case 'protectKeyFile':
				return { ok: true, value: await protectKeyFile(...request.args) };
			case 'readKeyFile':
				return { ok: true, value: await readKeyFile(...request.args) };
			case 'validatePublicKeys':
				return { ok: true, value: validatePublicKeys(...request.args) };
		}
	} catch (error) {
		return { ok: false, error: serializeError(error) };
	}
}
