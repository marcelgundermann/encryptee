import type { SerializedError } from '../errors.ts';
import type * as keys from '../keys/keys.ts';

/** The key tools: every function `keys.ts` exports, run in the tools worker. */
type Tools = typeof keys;

export type ToolName = keyof Tools;

export type ToolArgs = { [K in ToolName]: Parameters<Tools[K]> };

/** Each tool's result, as posted back. */
export type ToolResult = { [K in ToolName]: Awaited<ReturnType<Tools[K]>> };

/**
 * One call of tool `K`, posted to the worker, which answers on `port`. For a
 * generic `K`, `tools[request.tool]` takes `request.args`.
 */
export type ToolRequest<K extends ToolName = ToolName> = {
	[P in K]: { tool: P; args: ToolArgs[P]; port: MessagePort };
}[K];

export type ToolResponse<K extends ToolName> =
	| { ok: true; value: ToolResult[K] }
	| { ok: false; error: SerializedError };
