import './trusted-types.ts';
import { RouterProvider } from '@tanstack/react-router';
import { createRoot } from 'react-dom/client';
import { getRouter } from './router.ts';

createRoot(document.getElementById('root')!).render(<RouterProvider router={getRouter()} />);

// Keeps the tool and the content pages working offline and streams downloads. A new
// version takes over once every Encryptee tab has closed. The dev server has none.
if (import.meta.env.PROD) void navigator.serviceWorker?.register('/sw.js');
