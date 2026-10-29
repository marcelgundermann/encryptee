import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { prerenderPages } from './vite/prerender.ts';

/** Content pages, prerendered to HTML with no JavaScript. */
const PAGES = ['how-it-works', 'security', 'faq'];

/**
 * Build number: the commit time, so later commits on main always compare
 * greater. `/security.json` names the lowest build still safe to run.
 */
function buildNumber(): number {
	try {
		return Number(execFileSync('git', ['log', '-1', '--format=%ct'], { encoding: 'utf8' }).trim());
	} catch {
		return Math.floor(Date.now() / 1000);
	}
}

export default defineConfig({
	define: {
		__BUILD_NUMBER__: JSON.stringify(buildNumber())
	},
	plugins: [
		react(),
		babel({ presets: [reactCompilerPreset()] }),
		tailwindcss(),
		prerenderPages(resolve(import.meta.dirname, 'src/pages/render.tsx')),
		VitePWA({
			strategies: 'injectManifest',
			srcDir: 'src',
			filename: 'sw.ts',
			registerType: 'prompt',
			injectRegister: null,
			manifest: {
				name: 'Encryptee',
				short_name: 'Encryptee',
				description: 'Encrypt and decrypt files in your browser. Compatible with age.',
				start_url: '/',
				scope: '/',
				display: 'standalone',
				background_color: '#ffffff',
				theme_color: '#ffffff',
				icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
				file_handlers: [{ action: '/', accept: { 'application/octet-stream': ['.age'] } }],
				launch_handler: { client_mode: 'focus-existing' }
			},
			injectManifest: {
				globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm,webmanifest}'],
				// security.json must always come from the network.
				globIgnores: ['security.json', '_headers', 'robots.txt'],
				maximumFileSizeToCacheInBytes: 4 * 1024 * 1024
			}
		})
	],
	worker: { format: 'es' },
	build: {
		target: 'baseline-widely-available',
		rolldownOptions: {
			input: {
				tool: resolve(import.meta.dirname, 'index.html'),
				notFound: resolve(import.meta.dirname, '404.html'),
				...Object.fromEntries(
					PAGES.map((page) => [page, resolve(import.meta.dirname, page, 'index.html')])
				)
			}
		}
	}
});
