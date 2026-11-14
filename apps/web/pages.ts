/** Content pages, each its own HTML entry at `<page>/index.html`, served at `/<page>/`. */
export const PAGES = ['how-it-works', 'security', 'faq'] as const;

export type Page = (typeof PAGES)[number];
