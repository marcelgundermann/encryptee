import { createRootRoute, Outlet, useMatches } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useLaunchQueue } from '#/launched-files.ts';
import { strings } from '#/strings.ts';
import '#/styles.css';

declare module '@tanstack/react-router' {
	interface StaticDataRouteOption {
		/** The document's title while the route shows; the tool's if no route on the way sets one. */
		title?: string;
	}
}

export const Route = createRootRoute({ component: Root });

function Root() {
	const title = useMatches({ select: (matches) => matches.at(-1)?.staticData.title });

	useLaunchQueue();

	useEffect(() => {
		document.title = title ?? strings.titles.tool;
	}, [title]);

	return <Outlet />;
}
