import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { redact } from '@tanstack/redact/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig, lazyPlugins } from 'vite-plus';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
	// Cached by Vite+ (`vp run`). e2e stays a package.json script, never cached:
	// it depends on wrangler and the browsers, which the cache can't fingerprint.
	run: {
		tasks: {
			build: 'vp build',
			test: 'vp test run',
			typecheck: 'tsc -p tsconfig.json && tsc -p tsconfig.sw.json && tsc -p tsconfig.node.json'
		}
	},
	plugins: lazyPlugins(() => [
		// Writes src/routeTree.gen.ts from src/routes/. It must come before react().
		tanstackRouter({ target: 'react' }),
		react(),
		babel({ presets: [reactCompilerPreset()] }),
		// Redact renders the app in React DOM's place. The app renders no
		// server HTML, and uses neither Activity nor Fragment refs.
		redact({
			environments: ['client'],
			features: { hydration: false, activity: false, fragmentRefs: false }
		}),
		tailwindcss(),
		VitePWA({
			strategies: 'injectManifest',
			srcDir: 'src',
			filename: 'sw.ts',
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
				icons: [
					{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
					{ src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
					{ src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
				],
				file_handlers: [{ action: '/', accept: { 'application/octet-stream': ['.age'] } }],
				launch_handler: { client_mode: 'focus-existing' }
			},
			injectManifest: {
				globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm,webmanifest}'],
				globIgnores: ['_headers', 'robots.txt'],
				maximumFileSizeToCacheInBytes: 4 * 1024 * 1024
			}
		})
	]),
	worker: { format: 'es' },
	// The browsers Encryptee supports. All of them preload modules themselves.
	build: {
		target: ['chrome140', 'edge140', 'firefox133', 'safari18.2', 'ios18.2'],
		modulePreload: { polyfill: false }
	}
});
