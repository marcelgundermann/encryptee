/// <reference lib="webworker" />
import { handleDownloadFetch, handleDownloadMessage } from '@encryptee/engine/sw';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & {
	__WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// The download route must see fetches before the precache router does.
self.addEventListener('fetch', (event) => {
	handleDownloadFetch(event);
});

self.addEventListener('message', (event) => {
	handleDownloadMessage(event);
});

// Take control on first install so the first visit can already stream
// downloads. A later version waits until every Encryptee tab has closed.
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

cleanupOutdatedCaches();

precacheAndRoute(self.__WB_MANIFEST, { cleanURLs: true, directoryIndex: 'index.html' });
