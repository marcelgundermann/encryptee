import { expect, test } from 'vitest';
import { EngineError, saveError } from '../src/errors.ts';

test.each([
	// What `close()` rejects with when the browser's own checks turn a file down.
	['an AbortError', new DOMException('blocked', 'AbortError'), 'save-failed'],
	['a full disk', new DOMException('full', 'QuotaExceededError'), 'storage-full'],
	['anything else the browser throws', new TypeError('broken'), 'save-failed'],
	['a cancelled download', new EngineError('cancelled', 'cancelled'), 'cancelled']
])('while saving, %s fails as $2', (_, cause, code) => {
	expect(saveError(cause).code).toBe(code);
});
