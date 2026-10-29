import type { checkCredentials } from '../check.ts';
import type { SerializedError } from '../errors.ts';
import type {
	generateKeyPair,
	protectKeyFile,
	readKeyFile,
	validatePublicKeys
} from '../keys/keys.ts';

export interface Tools {
	checkCredentials: typeof checkCredentials;
	generateKeyPair: typeof generateKeyPair;
	protectKeyFile: typeof protectKeyFile;
	readKeyFile: typeof readKeyFile;
	validatePublicKeys: (...args: Parameters<typeof validatePublicKeys>) => Promise<string[]>;
}

export type ToolName = keyof Tools;

/** Result of tool `T`, as posted back. */
export type ToolValue<T extends ToolName = ToolName> = Awaited<ReturnType<Tools[T]>>;

/**
 * One call of tool `T`, posted to the worker, which answers on `port`. Without
 * `T` it is a union discriminated by `tool`, so checking `tool` narrows `args`.
 */
export type ToolRequest<T extends ToolName = ToolName> = {
	[K in T]: { tool: K; args: Parameters<Tools[K]>; port: MessagePort };
}[T];

export type ToolResponse<T extends ToolName = ToolName> =
	| { ok: true; value: ToolValue<T> }
	| { ok: false; error: SerializedError };
