import { serializeError } from '../errors.ts';
import { generateKeyPair, protectKeyFile, readKeyFile, validatePublicKeys } from '../keys/keys.ts';
import type { ToolRequest, ToolResponse } from './tools-protocol.ts';

declare const self: DedicatedWorkerGlobalScope;

const tools = { generateKeyPair, protectKeyFile, readKeyFile, validatePublicKeys };

self.onmessage = async ({ data }: MessageEvent<ToolRequest>) => {
	let response: ToolResponse;
	try {
		const run = tools[data.tool] as (...args: unknown[]) => Promise<unknown>;
		response = { id: data.id, ok: true, value: await run(...data.args) };
	} catch (error) {
		response = { id: data.id, ok: false, error: serializeError(error) };
	}
	self.postMessage(response);
};
