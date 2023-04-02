import type { PasswordStrength } from '$lib/types';

export const estimatePasswordStrength = (password: string): PasswordStrength => {
	if (typeof password !== 'string') {
		throw new Error('Invalid input: Password must be a string');
	}

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
