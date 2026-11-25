/**
 * Every failure the engine reports carries a stable code. The UI maps codes to
 * user-facing strings; messages here are for developers and logs.
 */
export type EngineErrorCode =
	/** No passphrase or private key matched the file's header. */
	| 'wrong-credentials'
	/** The input does not start with an age header. */
	| 'not-encrypted'
	/** ASCII-armored age (`-----BEGIN AGE ENCRYPTED FILE-----`); not supported. */
	| 'armored'
	/** Authentication failed: the file was modified, truncated or reordered. */
	| 'corrupted'
	| 'invalid-public-key'
	| 'invalid-key-file'
	| 'cancelled'
	/** The input couldn't be read, or gave less than it had when it was chosen. */
	| 'read-failed'
	| 'save-failed'
	| 'storage-full'
	/**
	 * No service worker controls the page to stream a download, or this browser
	 * lacks a cipher backend a benchmark or test forced.
	 */
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

	if (cause instanceof DOMException && cause.name === 'QuotaExceededError')
		return { code: 'storage-full', message: cause.message };

	const message = cause instanceof Error ? cause.message : String(cause);

	return { code: 'internal', message };
}

/** A failure while saving: its own code (`storage-full`, `cancelled`, …) or `save-failed`. */
export function saveError(cause: unknown): SerializedError {
	const error = serializeError(cause);

	return error.code === 'internal' ? { code: 'save-failed', message: error.message } : error;
}

export function deserializeError(error: SerializedError): EngineError {
	return new EngineError(error.code, error.message);
}
