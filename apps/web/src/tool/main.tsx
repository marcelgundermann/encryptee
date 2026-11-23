import '../trusted-types.ts';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<App />
	</StrictMode>
);

// Keeps the tool working offline and streams downloads. A new version takes
// over once every Encryptee tab has closed. The dev server has none.
if (import.meta.env.PROD) void navigator.serviceWorker?.register('/sw.js');
