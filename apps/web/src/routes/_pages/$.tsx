import { createFileRoute, Link } from '@tanstack/react-router';
import { H1, P } from '#/pages/Layout.tsx';
import { strings } from '#/strings.ts';

/** Any address no other route takes. The server and the service worker answer every address with the app. */
export const Route = createFileRoute('/_pages/$')({
	staticData: { title: strings.titles.notFound },
	component: NotFound
});

function NotFound() {
	return (
		<>
			<H1>Page not found</H1>
			<P>
				<Link className="underline" to="/">
					Go to Encryptee
				</Link>
			</P>
		</>
	);
}
