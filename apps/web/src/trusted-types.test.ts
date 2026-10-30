import { expect, test, vi } from 'vite-plus/test';
import headers from '../public/_headers?raw';

/**
 * The policies `trusted-types.ts` creates, by name. Vitest runs this before
 * the imports, so the module finds a page at https://encryptee.io/.
 */
const policies = vi.hoisted(() => {
	const created = new Map<string, { createScriptURL(input: string): string }>();

	vi.stubGlobal('location', new URL('https://encryptee.io/'));
	vi.stubGlobal('window', {
		trustedTypes: {
			createPolicy(name: string, rules: { createScriptURL(input: string): string }) {
				created.set(name, rules);
			}
		}
	});

	return created;
});

// Imported for what it does, like the app's entry does.
import './trusted-types.ts';

/** The CSP's directives every page gets, from the `/*` rule in `_headers`, by name. */
function cspDirectives(): Map<string, string[]> {
	const csp = /^\s+Content-Security-Policy: (.+)$/m.exec(headers)?.[1] ?? '';

	return new Map(
		csp.split(';').map((directive) => {
			const [name = '', ...values] = directive.trim().split(/\s+/);

			return [name, values];
		})
	);
}

test('the CSP requires Trusted Types for scripts', () => {
	expect(cspDirectives().get('require-trusted-types-for')).toEqual(["'script'"]);
});

test('the CSP allows exactly the policies trusted-types.ts creates', () => {
	const allowed = cspDirectives()
		.get('trusted-types')
		?.filter((value) => !value.startsWith("'"));

	expect(allowed).toEqual([...policies.keys()]);
});

test.each([
	['/assets/coordinator.worker.js', 'https://encryptee.io/assets/coordinator.worker.js'],
	['sw.js', 'https://encryptee.io/sw.js'],
	['https://encryptee.io/assets/crypto.worker.js', 'https://encryptee.io/assets/crypto.worker.js']
])('the default policy lets a same-origin script URL through, made absolute: %s', (input, url) => {
	expect(policies.get('default')?.createScriptURL(input)).toBe(url);
});

test.each(['https://cdn.example/worker.js', '//cdn.example/worker.js', 'data:text/javascript,1'])(
	'the default policy rejects a script URL from anywhere else: %s',
	(input) => {
		expect(() => policies.get('default')?.createScriptURL(input)).toThrow(TypeError);
	}
);
