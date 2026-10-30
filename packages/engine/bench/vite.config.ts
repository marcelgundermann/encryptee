import { defineConfig } from 'vite-plus';

// Dev-only bench page; never part of the app build.
export default defineConfig({
	root: import.meta.dirname,
	worker: { format: 'es' },
	server: { port: 5174 }
});
