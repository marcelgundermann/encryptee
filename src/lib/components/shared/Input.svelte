<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	type Color = 'light' | 'dark';

	export let label: string;
	export let id: string;
	export let placeholder: string;
	export let value = '';
	export let type: HTMLInputAttributes['type'] = 'text';
	export let color: Color = 'dark';

	$: cornerHint = $$slots['corner-hint'];
	$: trailingIcon = $$slots['trailing-icon'];
</script>

<div class="w-full">
	<div class="flex justify-between">
		<label for={id} class="label">{label}</label>
		{#if cornerHint}
			<slot name="corner-hint" />
		{/if}
	</div>
	<div class="relative">
		<input
			{...{ type }}
			bind:value
			{id}
			name={id}
			{placeholder}
			class="input {`input-${color}`} {trailingIcon ? '!pr-12' : ''}"
		/>

		{#if trailingIcon}
			<div class="trailing-icon">
				<slot name="trailing-icon" />
			</div>
		{/if}
	</div>
</div>

<style>
	.label {
		@apply block mb-1 font-medium leading-6 text-white text-sm;
	}

	.input {
		@apply p-4 leading-none rounded-md w-full text-sm border-none ring-0;
	}

    .input:focus {
        @apply ring-0;
    }

	.input-light {
		@apply bg-white text-black;
	}

	.input-dark {
		@apply bg-neutral-900 text-white;
	}

	.input-dark::placeholder {
		@apply text-white/50;
	}

	.trailing-icon {
		@apply absolute inset-y-0 right-0 flex items-center pr-3;
	}
</style>
