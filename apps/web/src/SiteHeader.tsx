import type { ReactNode } from 'react';
import { PAGES } from '../pages.ts';
import { strings } from './strings.ts';

const wordmarkClass = 'hit-area focus-ring font-semibold tracking-tight';

export const navItemClass =
	'hit-area focus-ring transition-colors hover:text-fg aria-[current=page]:text-fg';

/**
 * The header of the tool and of the content pages. In the tool the wordmark
 * is a button, since there it resets the tool, and the tool's own items come
 * first.
 */
export function SiteHeader({
	onWordmarkClick,
	children
}: {
	onWordmarkClick?: () => void;
	children?: ReactNode;
}) {
	return (
		<header className="flex items-center justify-between gap-4 px-6 py-5 text-sm">
			{onWordmarkClick ? (
				<button className={wordmarkClass} onClick={onWordmarkClick}>
					{strings.wordmark}
				</button>
			) : (
				<a href="/" className={wordmarkClass}>
					{strings.wordmark}
				</a>
			)}
			<nav className="flex gap-5 text-muted">
				{children}
				{PAGES.map((page) => (
					<a
						key={page}
						href={`/${page}/`}
						aria-current={location.pathname === `/${page}/` ? 'page' : undefined}
						// With the tool's own items there's no room for Security on a phone.
						className={`${navItemClass} ${children && page === 'security' ? 'hidden sm:inline' : ''}`}
					>
						{strings.nav[page]}
					</a>
				))}
			</nav>
		</header>
	);
}
