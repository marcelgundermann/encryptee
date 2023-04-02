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
	plugins: [require('@tailwindcss/forms'), require('@tailwindcss/aspect-ratio')]
} satisfies Config;
