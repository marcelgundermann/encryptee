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

export function serializeError(cause: unknown): SerializedError {
	if (cause instanceof EngineError) return cause.toJSON();

	if (cause instanceof DOMException) {
		if (cause.name === 'AbortError') return { code: 'cancelled', message: cause.message };

		if (cause.name === 'QuotaExceededError')
			return { code: 'storage-full', message: cause.message };
	}

	const message = cause instanceof Error ? cause.message : String(cause);

	return { code: 'internal', message };
}

export function deserializeError(error: SerializedError): EngineError {
	return new EngineError(error.code, error.message);
}
