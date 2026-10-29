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

/** Arguments of some tool, as posted to the worker. */
export type ToolArgs = Parameters<Tools[ToolName]>;

/** Result of some tool, as posted back. */
export type ToolValue = Awaited<ReturnType<Tools[ToolName]>>;

export type ToolRequest = { id: number; tool: ToolName; args: ToolArgs };

export type ToolResponse =
	| { id: number; ok: true; value: ToolValue }
	| { id: number; ok: false; error: SerializedError };
