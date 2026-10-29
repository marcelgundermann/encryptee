/**
 * Share links carry a public key in the URL fragment only (`#to=age1…`), so it
 * never reaches a server or a log (D10).
 */
export function buildShareLink(publicKey: string, origin = location.origin): string {
	return `${origin}/#to=${publicKey}`;
}

/** The public key in a share link's fragment, or `null`. Accepts `#to=…` or a full URL. */
export function parseShareLink(input: string): string | null {
	const hash = input.includes('#') ? input.slice(input.indexOf('#') + 1) : input;
	const value = new URLSearchParams(hash).get('to')?.trim();
	return value && /^age1[0-9a-z]+$/.test(value) ? value : null;
}
