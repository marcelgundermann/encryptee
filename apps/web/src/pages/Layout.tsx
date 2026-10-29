import type { ReactNode } from 'react';

const NAV = [
	{ href: '/how-it-works/', label: 'How it works' },
	{ href: '/security/', label: 'Security' },
	{ href: '/faq/', label: 'FAQ' }
];

/**
 * Shell for the content pages, in the same "Drop" look as the tool.
 */
export function Layout({ children }: { children: ReactNode }) {
	return (
		<div className="flex min-h-dvh flex-col">
			<header className="flex items-center justify-between gap-4 px-6 py-5 text-sm">
				<a href="/" className="font-semibold tracking-tight">
					encryptee
				</a>
				<nav className="flex gap-5 text-neutral-500">
					{NAV.map((item) => (
						<a key={item.href} href={item.href} className="hover:text-black dark:hover:text-white">
							{item.label}
						</a>
					))}
				</nav>
			</header>
			<main className="mx-auto w-full max-w-2xl flex-1 px-6 pt-12 pb-24 text-lg [&_a]:underline [&_a]:underline-offset-2">
				{children}
			</main>
			<footer className="mx-auto w-full max-w-2xl px-6 py-8 text-sm text-neutral-500">
				Files encrypted with the old Encryptee (<code>.cre</code>) open at{' '}
				<a className="underline underline-offset-2" href="https://v1.encryptee.io">
					v1.encryptee.io
				</a>
				.
			</footer>
		</div>
	);
}

export function H1({ children }: { children: ReactNode }) {
	return (
		<h1 className="mb-10 text-5xl leading-[0.95] font-semibold tracking-tighter sm:text-7xl">
			{children}
		</h1>
	);
}

export function H2({ children, id }: { children: ReactNode; id?: string }) {
	return (
		<h2 id={id} className="mt-14 mb-3 text-2xl font-semibold tracking-tight">
			{children}
		</h2>
	);
}

export function P({ children }: { children: ReactNode }) {
	return <p className="my-3 leading-relaxed">{children}</p>;
}

export function Code({ children }: { children: ReactNode }) {
	return (
		<pre className="my-4 overflow-x-auto rounded-2xl bg-neutral-100 p-4 text-sm dark:bg-neutral-900">
			<code>{children}</code>
		</pre>
	);
}
