import type { PasswordStrength } from '$lib/types';

/**
 * Generates a cryptographically secure random password of the specified length
 * using the Web Crypto API.
 *
 * The resulting password is a base64-encoded string.
 *
 * @param length - The desired length of the generated password (number).
 *
 * @returns A base64-encoded random string of the specified length.
 */
export const generateRandomPassword = (): string => {
	const length = 24;

	const randomBytes = crypto.getRandomValues(new Uint8Array(length));
	const base64Password = window.btoa(String.fromCharCode(...randomBytes));

	return base64Password.substring(0, length);
};
