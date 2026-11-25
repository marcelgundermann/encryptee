import { createFileRoute } from '@tanstack/react-router';
import { Layout } from '../pages/Layout.tsx';

/** The content pages, without a segment of their own in the address. */
export const Route = createFileRoute('/_pages')({ component: Layout });
