import type { SerializedError } from '../errors.ts';
import type { generateKeyPair, protectKeyFile, readKeyFile } from '../keys/keys.ts';

export interface Tools {
	generateKeyPair: typeof generateKeyPair;
	protectKeyFile: typeof protectKeyFile;
	readKeyFile: typeof readKeyFile;
}

export type ToolName = keyof Tools;

export type ToolRequest = { id: number; tool: ToolName; args: unknown[] };

export type ToolResponse =
	| { id: number; ok: true; value: unknown }
	| { id: number; ok: false; error: SerializedError };
