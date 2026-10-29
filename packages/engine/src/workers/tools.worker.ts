import { checkCredentials } from '../check.ts';
import { serializeError } from '../errors.ts';
import { generateKeyPair, protectKeyFile, readKeyFile, validatePublicKeys } from '../keys/keys.ts';
import type { ToolArgs, ToolRequest, ToolResponse, ToolValue } from './tools-protocol.ts';

declare const self: DedicatedWorkerGlobalScope;

const tools = {
	checkCredentials,
	generateKeyPair,
	protectKeyFile,
	readKeyFile,
	validatePublicKeys
};

self.onmessage = async ({ data }: MessageEvent<ToolRequest>) => {
	let response: ToolResponse;

	try {
		// SAFETY: `call` in tools.ts types `args` as `Parameters<Tools[tool]>`,
		// so they fit the function picked by the same `tool`.
		const run = tools[data.tool] as (...args: ToolArgs) => Promise<ToolValue>;
		response = { id: data.id, ok: true, value: await run(...data.args) };
	} catch (error) {
		response = { id: data.id, ok: false, error: serializeError(error) };
	}

	self.postMessage(response);
};
