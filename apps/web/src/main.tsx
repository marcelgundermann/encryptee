import './trusted-types.ts';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { routeTree } from './routeTree.gen.ts';

// Content pages were at `/faq/` before; links and bookmarks to them still open them, at `/faq`.
if (location.pathname !== '/' && location.pathname.endsWith('/')) {
	history.replaceState(
		history.state,
		'',
		location.pathname.replace(/\/+$/, '') + location.search + location.hash
	);
}

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router;
	}
}

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>
);

// Keeps the tool and the content pages working offline and streams downloads. A new
// version takes over once every Encryptee tab has closed. The dev server has none.
if (import.meta.env.PROD) void navigator.serviceWorker?.register('/sw.js');
