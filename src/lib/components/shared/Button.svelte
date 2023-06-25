<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Color = 'light' | 'dark' | 'green' | 'red' | 'red-invert';

	export let label = '';
	export let type: HTMLButtonAttributes['type'] = 'button';
	export let color: Color = 'dark';
</script>

<button
	on:click
	{type}
	{...$$restProps}
	class="button disabled:pointer-events-none {`button-${color}`} {$$props.class}"
>
	<slot name="leading-icon" />
	{#if label}<span>{label}</span>{/if}
	<slot name="trailing-icon" />
</button>

<style>
	.button {
		@apply p-4 leading-none text-sm font-medium rounded-md ring-1 flex justify-center items-center space-x-1.5 transition-all;
	}

	.button-light {
		@apply bg-white text-black ring-white;
	}

	.button-light:hover {
		@apply bg-black text-white ring-white;
	}

	.button-dark {
		@apply bg-black text-white ring-black;
	}

	.button-dark:hover {
		@apply bg-white text-black ring-black;
	}

	.button-green {
		@apply bg-green-600 text-white ring-transparent;
	}

	.button-green:hover {
		@apply bg-white text-green-600;
	}

	.button-red {
		@apply bg-red-600 text-white ring-transparent;
	}

	.button-red:hover {
		@apply bg-white text-red-600;
	}

	.button-red-invert {
		@apply bg-transparent text-red-600 ring-transparent;
	}

	.button-red-invert:hover {
		@apply bg-red-600 text-white;
	}
</style>
