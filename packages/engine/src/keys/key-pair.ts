/** `pq` is the ML-KEM-768 + X25519 hybrid (`age1pq1…`, D20); `x25519` is classic age. */
export type KeyType = 'pq' | 'x25519';

export interface KeyPair {
	type: KeyType;
	publicKey: string;
	privateKey: string;
}

/**
 * ML-KEM-768 + X25519 (`age1pq1…`) and ML-KEM-768 + P-256 tag (`age1tagpq1…`).
 * Bech32 data never contains `1`, so no other key can start with either prefix.
 */
function isPostQuantum(publicKey: string): boolean {
	return publicKey.startsWith('age1pq1') || publicKey.startsWith('age1tagpq1');
}

/**
 * age's guidance: mixing post-quantum and classic recipients loses PQ protection.
 * Every other public key `validatePublicKeys` accepts is classic: X25519 (`age1…`,
 * including the rare one whose data starts with `tag`) and P-256 tag (`age1tag1…`).
 */
export function mixesPqAndClassic(publicKeys: string[]): boolean {
	const postQuantum = publicKeys.filter(isPostQuantum).length;

	return postQuantum > 0 && postQuantum < publicKeys.length;
}

/** An age identity file, as written by `age-keygen`. */
export function keyFileText(pair: KeyPair, createdAt = new Date()): string {
	return (
		`# created: ${createdAt.toISOString().replace(/\.\d{3}Z$/, 'Z')}\n` +
		`# public key: ${pair.publicKey}\n` +
		`${pair.privateKey}\n`
	);
}
