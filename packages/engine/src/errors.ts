/**
 * Every failure the engine reports carries a stable code. The UI maps codes to
 * user-facing strings; messages here are for developers and logs.
 */
export type EngineErrorCode =
	/** No passphrase or private key matched the file's header. */
	| 'wrong-credentials'
	/** The input does not start with an age header. */
	| 'not-encrypted'
	/** The input is a v1 `.cre` file; open it on v1.encryptee.io. */
	| 'legacy-file'
	/** ASCII-armored age (`-----BEGIN AGE ENCRYPTED FILE-----`); not supported. */
	| 'armored'
	/** Authentication failed: the file was modified, truncated or reordered. */
	| 'corrupted'
	| 'invalid-public-key'
	| 'invalid-key-file'
	| 'cancelled'
	| 'save-failed'
	| 'storage-full'
	| 'unsupported'
	| 'internal';

export interface SerializedError {
	code: EngineErrorCode;
	message: string;
}

export class EngineError extends Error {
	override name = 'EngineError';

	constructor(
		readonly code: EngineErrorCode,
		message: string,
		options?: ErrorOptions
	) {
		super(message, options);
	}

	toJSON(): SerializedError {
		return { code: this.code, message: this.message };
	}
}

export function serializeError(error: unknown): SerializedError {
	if (error instanceof EngineError) return error.toJSON();

	if (error instanceof DOMException) {
		if (error.name === 'AbortError') return { code: 'cancelled', message: error.message };

		if (error.name === 'QuotaExceededError')
			return { code: 'storage-full', message: error.message };
	}

	const message = error instanceof Error ? error.message : String(error);

	return { code: 'internal', message };
}

export function deserializeError(error: SerializedError): EngineError {
	return new EngineError(error.code, error.message);
}
