<script lang="ts">
	import CryptoActionButton from '$lib/components/CryptoActionButton.svelte';
	import Password from '$lib/components/shared/Password.svelte';
	import { processChunks } from '$lib/utils/chunk';
	import { cipherOperationState$, cryptoMode$, files$, isFastMode$, isFastModeSupported$ } from '$lib/store/files';
	import type { WebWorkerOutgoingMessageChunk, WebWorkerOutgoingMessageFile } from '$lib/types';

	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import FileInputPanel from '../file-input-panel/FileInputPanel.svelte';
	import AlertPanel from '../shared/AlertPanel.svelte';

	let worker: Worker;
	const writerMap = new Map<string, WritableStreamDefaultWriter>();

	let password = '';
	let fileSize = 0;
	let progress = 0;
	let saveDirectory = '';

	onMount(() => {
		worker = new Worker(new URL('$lib/crypto.worker.ts', import.meta.url), {
			type: 'module'
		});

		worker.addEventListener('message', async (event: MessageEvent<WebWorkerOutgoingMessageChunk | WebWorkerOutgoingMessageFile>) => {
			const { transferType, type } = event.data;

			if (transferType === 'chunk') {
				const { chunk, isLastChunk, writerId } = event.data;

				if (!writerMap.has(writerId)) throw new Error('Writer not found');
				const writer = await writerMap.get(writerId)!;

				await writer.write(chunk);
				progress += chunk.byteLength;

				if (isLastChunk) {
					cipherOperationState$.set(type === 'encrypt' ? 'chunk_encryption_last_chunk' : 'chunk_decryption_last_chunk');
					await writer.close();
					writerMap.delete(writerId);
					cipherOperationState$.set(type === 'encrypt' ? 'chunk_encryption_done' : 'chunk_decryption_done');
				}
				return;
			}

			if (transferType === 'file') {
				const { blob, fileName } = event.data;
				// ...
			}
		});

		worker.addEventListener('message', async (event: MessageEvent<WebWorkerOutgoingMessageChunk | WebWorkerOutgoingMessageFile>) => {
			console.log(event);
			
		});
	});

	const submitHandler = async (): Promise<void> => {
		const files = get(files$);
		if (!files) return;
		const mode = get(cryptoMode$);

		if (mode === 'encrypt') {
			processFiles(files, 'encrypt');
		} else if (mode === 'decrypt') {
			processFiles(files, 'decrypt');
		}
	};

	const processFiles = async (files: FileList, operationType: 'encrypt' | 'decrypt'): Promise<void> => {
		const directoryHandle = await showDirectoryPicker({
			mode: 'readwrite',
			startIn: 'desktop'
		});

		const granted = await directoryHandle.queryPermission({ mode: 'readwrite' });
		if (!granted) throw new Error('Permission not granted');

		saveDirectory = directoryHandle.name;
		fileSize = [...files].map((file) => file.size).reduce((a, b) => a + b, 0);

		cipherOperationState$.set(
			operationType === 'encrypt' ? 'chunk_encryption_in_progress' : 'chunk_decryption_in_progress'
		);
		for await (const file of files) {
			const newDirectory = await directoryHandle.getDirectoryHandle('Encryptee', { create: true });
			const newFileHandle = await newDirectory.getFileHandle(
				operationType === 'encrypt' ? `${file.name}.cre` : `${file.name.slice(0, -4)}`,
				{ create: true }
			);
			const filestream = await newFileHandle.createWritable();
			const writerId = crypto.randomUUID();
			writerMap.set(writerId, filestream.getWriter());

			await processChunks({
				file,
				password,
				worker,
				type: operationType,
				writerId
			});
		}
	};

	$: showCryptoActionButton = $files$ && $files$.length && password;
</script>

<FileInputPanel />

{#if $isFastMode$ && !$isFastModeSupported$}
	<AlertPanel title="Your browser cannot encrypt or decrypt files over 2GB." type="warning">
		<div>To process files larger than 2GB, consider using one of the following compatible browsers:</div>

		<ul class="list-disc list-inside">
			<li>Google Chrome (version 86 or later)</li>
			<li>Microsoft Edge (version 86 or later)</li>
			<li>Opera (version 72 or later)</li>
		</ul>
	</AlertPanel>
{/if}

{#if $cryptoMode$ === 'mixed'}
	<AlertPanel title="Please don't mix encrypted '.cre' files with unencrypted ones.">
		<div>
			Select either files to encrypt or decrypt at a time. Remove the conflicting files from your selection to proceed.
		</div>
	</AlertPanel>
{/if}

<Password bind:password errorMessage={''} />

{#if showCryptoActionButton}
	<div class="w-full">
		<CryptoActionButton on:click={submitHandler} bind:fileSize bind:progress />
		{#if $cipherOperationState$ === 'chunk_encryption_done' || $cipherOperationState$ === 'chunk_decryption_done'}
			<div class="text-xs text-white/40 mt-2">
				All files have been saved into the directory: <span class="font-semibold">{saveDirectory}/Encryptee</span>
			</div>
		{/if}
	</div>
{/if}
