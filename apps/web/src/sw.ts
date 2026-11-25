/// <reference lib="webworker" />
import { DOWNLOAD_ROUTE, handleDownloadFetch, handleDownloadMessage } from '@encryptee/engine/sw';
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

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

precacheAndRoute(self.__WB_MANIFEST);

// Every other page is the app too, which routes it, so content pages open offline. A
// download is a navigation in a hidden iframe, answered by the download route alone.
registerRoute(
	new NavigationRoute(createHandlerBoundToURL('index.html'), {
		denylist: [new RegExp(`^${DOWNLOAD_ROUTE}`)]
	})
);
