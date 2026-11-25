import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { strings } from './strings.ts';

/** The content pages the header links to, in its order. */
const PAGES = ['/how-it-works', '/security', '/faq'] as const;

const wordmarkClass = 'hit-area focus-ring font-semibold tracking-tight';

/** The router marks the link to the page that shows with `aria-current="page"`. */
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
				<Link to="/" className={wordmarkClass}>
					{strings.wordmark}
				</Link>
			)}
			<nav className="flex gap-5 text-muted">
				{children}
				{PAGES.map((page) => (
					<Link
						key={page}
						to={page}
						// With the tool's own items there's no room for Security on a phone.
						className={`${navItemClass} ${children && page === '/security' ? 'hidden sm:inline' : ''}`}
					>
						{strings.nav[page]}
					</Link>
				))}
			</nav>
		</header>
	);
}
