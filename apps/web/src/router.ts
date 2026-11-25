import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen.ts';

/** A function, since the router reads the address as it's created. */
export function getRouter() {
	return createRouter({ routeTree, scrollRestoration: true });
}

declare module '@tanstack/react-router' {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
