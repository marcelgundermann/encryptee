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
	const length = 18;
	const randomBytes = new Uint8Array(Math.ceil((length * 3) / 4));

	crypto.getRandomValues(randomBytes);

	const base64Password = window.btoa(String.fromCharCode(...randomBytes));

	return base64Password.substring(0, length);
};

export const estimatePasswordStrength = (password: string): PasswordStrength => {
	if (typeof password !== 'string') throw new Error('Invalid input: Password must be a string');

	let score = 0;

	// Add points for password length
	score += 2 * password.length;

	// Add points for unique characters
	const uniqueChars = new Set(password);
	score += 5 * uniqueChars.size;

	// Add points for the presence of uppercase, lowercase, digits, and special characters
	const hasUpperCase = /[A-Z]/.test(password);
	const hasLowerCase = /[a-z]/.test(password);
	const hasDigits = /\d/.test(password);
	const hasSpecialChars = /[\W_]/.test(password);

	score += (+hasUpperCase + +hasLowerCase + +hasDigits + +hasSpecialChars) * 4;

	// Deduct points for repeated characters
	const charCounts = new Map<string, number>();
	for (const char of password) {
		charCounts.set(char, (charCounts.get(char) || 0) + 1);
	}
	for (const count of charCounts.values()) {
		if (count > 1) {
			score -= (count - 1) * 2;
		}
	}

	// Calculate strength based on score
	let strength: PasswordStrength = 'Very Weak';
	if (score >= 100) {
		strength = 'Very Strong';
	} else if (score >= 75) {
		strength = 'Strong';
	} else if (score >= 50) {
		strength = 'Moderate';
	} else if (score >= 25) {
		strength = 'Weak';
	}

	return strength;
};
