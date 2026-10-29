import { WORDS } from './wordlist.ts';

/**
 * A random passphrase of `words` BIP39 words joined by hyphens, like the ones
 * `age -p` generates. Ten words carry 110 bits of entropy.
 */
export function generatePassphrase(words = 10): string {
	// 65536 is a multiple of 2048, so masking 11 bits is unbiased.
	const random = crypto.getRandomValues(new Uint16Array(words));
	return Array.from(random, (n) => WORDS[n & 2047]).join('-');
}
