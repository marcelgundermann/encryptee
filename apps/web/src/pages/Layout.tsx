import type { ReactNode } from 'react';
import { SiteHeader } from '../SiteHeader.tsx';

/**
 * Shell for the content pages, in the same "Drop" look as the tool.
 */
export function Layout({ children }: { children: ReactNode }) {
	return (
		<div className="flex min-h-dvh flex-col">
			<SiteHeader />
			<main className="mx-auto w-full max-w-2xl flex-1 px-6 pt-12 pb-24 text-lg [&_a]:underline [&_a]:underline-offset-2">
				{children}
			</main>
			<footer className="mx-auto w-full max-w-2xl px-6 py-8 text-sm text-muted">
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
		<h1 className="mb-10 text-5xl leading-[0.95] font-semibold tracking-tighter text-balance sm:text-7xl">
			{children}
		</h1>
	);
}

export function H2({ children, id }: { children: ReactNode; id?: string }) {
	return (
		<h2 id={id} className="mt-14 mb-3 text-2xl font-semibold tracking-tight text-balance">
			{children}
		</h2>
	);
}

export function P({ children }: { children: ReactNode }) {
	return <p className="my-3 leading-relaxed">{children}</p>;
}

export function Code({ children }: { children: ReactNode }) {
	return (
		<pre className="my-4 overflow-x-auto rounded-2xl bg-surface p-4 text-sm">
			<code>{children}</code>
		</pre>
	);
}
