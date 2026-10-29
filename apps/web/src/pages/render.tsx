import type { ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Faq, HowItWorks, NotFound, Security } from './content.tsx';
import { Layout } from './Layout.tsx';

const PAGES: Record<string, ComponentType> = {
	'how-it-works': HowItWorks,
	security: Security,
	faq: Faq,
	'not-found': NotFound
};

/** Renders a content page to static HTML at build time (see vite/prerender.ts). */
export function render(name: string): string {
	const Page = PAGES[name];
	if (!Page) throw new Error(`unknown page ${name}`);
	return renderToStaticMarkup(
		<Layout>
			<Page />
		</Layout>
	);
}
