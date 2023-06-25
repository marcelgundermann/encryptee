<script lang="ts">
	import { convertFileSize } from '$lib/helpers/file';
	import { cipherOperationState$ } from '$lib/store/files';
	import type { CipherOperationChunkState, CipherOperationFileState } from '$lib/types';
	import Button from './shared/Button.svelte';

	export let fileSize: number;
	export let progress: number;

	let inProgressModes: Array<CipherOperationChunkState | CipherOperationFileState> = [
		'encryption_in_progress',
		'decryption_in_progress',
		'chunk_encryption_in_progress',
		'chunk_decryption_in_progress',
		'chunk_encryption_last_chunk',
		'chunk_decryption_last_chunk'
	];

	let isLastChunkModes: Array<CipherOperationChunkState | CipherOperationFileState> = [
		'encryption_last_chunk',
		'decryption_last_chunk',
		'chunk_encryption_last_chunk',
		'chunk_decryption_last_chunk'
	];

	let isDoneModes: Array<CipherOperationChunkState | CipherOperationFileState> = [
		'encryption_done',
		'decryption_done',
		'chunk_encryption_done',
		'chunk_decryption_done'
	];

	const buttonLabel = (progress: number, mode: CipherOperationChunkState | CipherOperationFileState | null): string => {
		switch (mode) {
			case 'chunk_encryption_in_progress':
				return `${convertFileSize(progress)} / ${convertFileSize(fileSize)} encrypted`;
			case 'chunk_encryption_last_chunk':
				return 'Finish Encryption...';
			case 'chunk_encryption_done':
				return 'Files successfully encrypted';
			case 'chunk_decryption_in_progress':
				return `${convertFileSize(progress)} / ${convertFileSize(fileSize)} decrypted`;
			case 'chunk_decryption_last_chunk':
				return 'Finish Decryption...';
			case 'chunk_decryption_done':
				return 'Files successfully decrypted';
			default:
				break;
		}

		return 'Select Directory to Save Encrypted Files';
	};

	$: label = buttonLabel(progress, $cipherOperationState$);

	$: inProgess = inProgressModes.includes($cipherOperationState$!);
	$: isLastChunk = isLastChunkModes.includes($cipherOperationState$!);
	$: isDone = isDoneModes.includes($cipherOperationState$!);

	$: disabled = inProgess || isLastChunk || isDone;
</script>

<Button {label} color="light" class="w-full" on:click {disabled}>
	<span slot="leading-icon">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			stroke-width="2"
			stroke="currentColor"
			class="w-4 h-4 {inProgess ? 'animate-spin' : ''}"
		>
			{#if isDone}
				<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
			{:else if inProgess}
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
				/>
			{:else}
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776"
				/>
			{/if}
		</svg>
	</span>
</Button>
