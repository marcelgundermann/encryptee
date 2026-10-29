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

export type ToolRequest = { id: number; tool: ToolName; args: unknown[] };

export type ToolResponse =
	| { id: number; ok: true; value: unknown }
	| { id: number; ok: false; error: SerializedError };
