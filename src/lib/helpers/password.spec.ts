import { generateRandomPassword } from './password';
import { describe, test, expect } from 'vitest';

describe('generateRandomPassword', () => {
	test('should return a password with the specified length', () => {
		const length = 18;
		const password = generateRandomPassword();
		expect(password).toHaveLength(length);
	});

	test('should generate a unique password each time it is called', () => {
		const password1 = generateRandomPassword();
		const password2 = generateRandomPassword();
		expect(password1).not.toEqual(password2);
	});

	test('should generate a password that is base64 encoded', () => {
		const base64Regex = /^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
		const password = generateRandomPassword();
		expect(password).toMatch(base64Regex);
	});
});
