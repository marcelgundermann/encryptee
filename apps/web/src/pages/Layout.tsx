import type { ReactNode } from 'react';

const NAV = [
	{ href: '/', label: 'Encrypt & decrypt' },
	{ href: '/how-it-works/', label: 'How it works' },
	{ href: '/security/', label: 'Security' },
	{ href: '/faq/', label: 'FAQ' }
];

/** Shell for the prerendered content pages. Static markup only: no state, no effects. */
export function Layout({ children }: { children: ReactNode }) {
	return (
		<div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4">
			<header className="flex flex-wrap items-center gap-x-6 gap-y-2 py-6">
				<a href="/" className="text-lg font-semibold">
					Encryptee
				</a>
				<nav className="flex flex-wrap gap-4 text-sm text-neutral-600 dark:text-neutral-400">
					{NAV.slice(1).map((item) => (
						<a key={item.href} href={item.href} className="hover:underline">
							{item.label}
						</a>
					))}
				</nav>
			</header>
			<main className="prose-like flex-1 pb-16">{children}</main>
			<footer className="border-t border-neutral-200 py-6 text-sm text-neutral-500 dark:border-neutral-800">
				Files encrypted with the old Encryptee (<code>.cre</code>) open at{' '}
				<a className="underline" href="https://v1.encryptee.io">
					v1.encryptee.io
				</a>
				.
			</footer>
		</div>
	);
}

export function H1({ children }: { children: ReactNode }) {
	return <h1 className="mb-6 text-3xl font-semibold tracking-tight">{children}</h1>;
}

export function H2({ children, id }: { children: ReactNode; id?: string }) {
	return (
		<h2 id={id} className="mt-10 mb-3 text-xl font-semibold">
			{children}
		</h2>
	);
}

export function P({ children }: { children: ReactNode }) {
	return <p className="my-3 leading-relaxed">{children}</p>;
}

export function Code({ children }: { children: ReactNode }) {
	return (
		<pre className="my-3 overflow-x-auto rounded-md bg-neutral-100 p-3 text-sm dark:bg-neutral-900">
			<code>{children}</code>
		</pre>
	);
}
