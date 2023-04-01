import type { Config } from 'tailwindcss';

export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			fontFamily: {
				cal: 'Cal Sans'
			}
		}
	},
	plugins: []
} satisfies Config;
