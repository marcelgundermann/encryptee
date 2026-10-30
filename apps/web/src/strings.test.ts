import { EngineError, type EngineErrorCode } from '@encryptee/engine';
import { expect, test } from 'vite-plus/test';
import { errorMessage, strings } from './strings.ts';

test.each<EngineErrorCode>(['wrong-credentials', 'corrupted', 'storage-full'])(
	'an engine error shows the text for its code, %s, not its message for developers',
	(code) => {
		expect(errorMessage(new EngineError(code, 'detail for the logs'))).toBe(strings.errors[code]);
	}
);

test.each([new Error('boom'), 'a thrown string', undefined])(
	'anything thrown that isn’t an engine error shows the generic text: %s',
	(cause) => {
		expect(errorMessage(cause)).toBe(strings.errors.internal);
	}
);
