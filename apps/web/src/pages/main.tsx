import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Faq, HowItWorks, NotFound, Security } from './content.tsx';
import { Layout } from './Layout.tsx';

const PAGES = new Map([
	['how-it-works', HowItWorks],
	['security', Security],
	['faq', Faq],
	['not-found', NotFound]
]);

/** Every content page's HTML entry names its page in `#root[data-page]`. */
const root = document.getElementById('root')!;
const Page = PAGES.get(root.dataset.page ?? '');

if (!Page) throw new Error(`unknown page ${root.dataset.page}`);

createRoot(root).render(
	<StrictMode>
		<Layout>
			<Page />
		</Layout>
	</StrictMode>
);
