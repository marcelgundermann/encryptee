import { serializeError } from '../errors.ts';
import * as keys from '../keys/keys.ts';
import type {
	ToolArgs,
	ToolName,
	ToolRequest,
	ToolResponse,
	ToolResult
} from './tools-protocol.ts';

const tools: {
	[K in ToolName]: (...args: ToolArgs[K]) => ToolResult[K] | Promise<ToolResult[K]>;
} = keys;

/** Runs a key tool, and answers on the request's port. */
export async function answerTool(request: ToolRequest): Promise<void> {
	request.port.postMessage(await respond(request));
	request.port.close();
}

async function respond<K extends ToolName>(request: ToolRequest<K>): Promise<ToolResponse<K>> {
	try {
		return { ok: true, value: await tools[request.tool](...request.args) };
	} catch (error) {
		return { ok: false, error: serializeError(error) };
	}
}
