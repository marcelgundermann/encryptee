/** `pq` is the ML-KEM-768 + X25519 hybrid (`age1pq1…`, D20); `x25519` is classic age. */
export type KeyType = 'pq' | 'x25519';

export interface KeyPair {
	type: KeyType;
	publicKey: string;
	privateKey: string;
}

export function publicKeyType(publicKey: string): KeyType | 'other' {
	if (publicKey.startsWith('age1pq1')) return 'pq';

	if (publicKey.startsWith('age1tag') || !publicKey.startsWith('age1')) return 'other';

	return 'x25519';
}

/** age's guidance: mixing post-quantum and classic recipients loses PQ protection (D20). */
export function mixesPqAndClassic(publicKeys: string[]): boolean {
	const types = new Set(publicKeys.map(publicKeyType));

	return types.has('pq') && types.has('x25519');
}

/** An age identity file, as written by `age-keygen`. */
export function keyFileText(pair: KeyPair, createdAt = new Date()): string {
	return (
		`# created: ${createdAt.toISOString().replace(/\.\d{3}Z$/, 'Z')}\n` +
		`# public key: ${pair.publicKey}\n` +
		`${pair.privateKey}\n`
	);
}
