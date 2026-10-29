import { runnerImport, type Plugin } from 'vite';

const MARKER = /<!--prerender:([a-z0-9-]+)-->/;

/**
 * Replaces `<!--prerender:name-->` in an HTML entry with the static markup of
 * that page, rendered by `render(name)` from `renderModule`. Pages that use
 * this ship no JavaScript.
 */
export function prerenderPages(renderModule: string): Plugin {
	return {
		name: 'encryptee:prerender',
		async transformIndexHtml(html) {
			const match = html.match(MARKER);
			if (!match) return html;
			const { module } = await runnerImport<{ render(page: string): string }>(renderModule, {
				configFile: false,
				logLevel: 'error'
			});
			return html.replace(MARKER, module.render(match[1]!));
		}
	};
}
