<script lang="ts">
	import type { CipherOperationState } from '$lib/types';

	export let mode: CipherOperationState;
</script>

{#if mode === 'mixed'}
	<div class="bg-red-600 p-4 rounded-lg mt-4">
		<div class="flex">
			<div class="flex-shrink-0">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="2"
					stroke="currentColor"
					class="w-5 h-5"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
					/>
				</svg>
			</div>
			<div class="ml-3 text-sm text-red-100 space-y-2">
				<div class="font-semibold">Please don't mix encrypted '.cre' files with unencrypted ones.</div>
				<div>
					Select either files to encrypt or decrypt at a time. Remove the conflicting files from your selection to
					proceed.
				</div>
			</div>
		</div>
	</div>
{/if}
