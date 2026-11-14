import { serializeError } from '../errors.ts';
import * as keys from '../keys/keys.ts';
import type {
	ToolArgs,
	ToolName,
	ToolRequest,
	ToolResponse,
	ToolResult
} from './tools-protocol.ts';

declare const self: DedicatedWorkerGlobalScope;

const tools: {
	[K in ToolName]: (...args: ToolArgs[K]) => ToolResult[K] | Promise<ToolResult[K]>;
} = keys;

self.onmessage = async ({ data }: MessageEvent<ToolRequest>) => {
	data.port.postMessage(await respond(data));
	data.port.close();
};

async function respond<K extends ToolName>(request: ToolRequest<K>): Promise<ToolResponse<K>> {
	try {
		return { ok: true, value: await tools[request.tool](...request.args) };
	} catch (error) {
		return { ok: false, error: serializeError(error) };
	}
}
