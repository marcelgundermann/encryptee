<script lang="ts">
	import { estimatePasswordStrength, generateRandomPassword } from '$lib/password-helper';
	import { convertFileSize } from '$lib/helper';

	import { addFiles, files$, removeFile } from '$lib/store/files';
	import type { DecryptResult, EncryptResult, Mode, WebWorkerOutgoingMessage } from '$lib/types';
	import { get } from 'svelte/store';
	import { onMount } from 'svelte';

	onMount(() => {
		worker = new Worker(new URL('$lib/crypto.worker.ts', import.meta.url), {
			type: 'module'
		});
	});

	let worker: Worker;
	let fileInputRef: HTMLInputElement;
	let password = '';
	let passwordPlaceholder = '';
	let decryptionErrorMessage = '';

	let fileToDownload: Blob;
	let fileToDownloadName: string;

	const removeAllFiles = (): void => {
		files$.set(null);
		password = '';
	};

	const addFileHandler = (): void => {
		fileInputRef.click();
	};

	const removeFileHandler = (file: File): void => {
		removeFile(file);
		if (!$files$ || !$files$.length) password = '';
	};

	const fileChangedHandler = (event: Event): void => {
		const input = event.target as HTMLInputElement;
		if (!input.files) return;

		addFiles(input.files);
	};

	const copyPassword = async (): Promise<void> => {
		navigator.clipboard.writeText(password);
	};

	const submitHandler = async (): Promise<void> => {
		if (mode === 'encryption_done' || mode === 'decryption_done') {
			await downloadFile(fileToDownload, fileToDownloadName);
			return;
		}

		if (!password || !$files$) return;

		const files = get(files$);
		if (!files) return;

		if (mode === 'encrypt') {
			mode = 'encryption_in_progress';
			await encryptSubmitHandler(files);
		} else if (mode === 'decrypt') {
			mode = 'decryption_in_progress';
			await decryptSubmitHandler(files);
		}
	};

	const encryptSubmitHandler = async (files: FileList): Promise<void> => {
		worker.onmessage = async (event: MessageEvent<WebWorkerOutgoingMessage>) => {
			const { type, result } = event.data;
			if (type === 'encrypt') {
				const { encryptedBlob, fileName } = result as EncryptResult;
				fileToDownload = encryptedBlob;
				fileToDownloadName = fileName;
				mode = 'encryption_done';
			}
		};

		for (const file of files) {
			worker.postMessage({
				type: 'encrypt',
				file,
				password
			});
		}
	};

	const decryptSubmitHandler = async (files: FileList): Promise<void> => {
		worker.onmessage = async (event: MessageEvent<WebWorkerOutgoingMessage>) => {
			const { type, result } = event.data;
			if (type === 'decrypt') {
				const decryptedFile = result as DecryptResult;
				if (decryptedFile.type === 'error') {
					decryptionErrorMessage = decryptedFile.error;
					mode = 'decrypt';
					return;
				}

				const { decryptedBlob, fileName } = decryptedFile;
				fileToDownload = decryptedBlob;
				fileToDownloadName = fileName;
				decryptionErrorMessage = '';
				mode = 'decryption_done';
			}
		};

		for (const file of files) {
			worker.postMessage({
				type: 'decrypt',
				file,
				password
			});
		}
	};

	const downloadFile = async (blob: Blob, fileName: string) => {
		const dataUrl = URL.createObjectURL(blob);
		const response = await fetch(dataUrl);
		const url = response.url;
		const link = document.createElement('a');
		link.href = url;
		link.download = fileName;
		link.dispatchEvent(new MouseEvent('click'));
		URL.revokeObjectURL(url);
	};

	/**
	 * Determines the mode (encrypt or decrypt) based on the file extensions in the given FileList.
	 * If all files have the '.cre' extension, the mode is set to 'decrypt'.
	 * If there are mixed extensions or none of them is '.cre', the mode is set to 'encrypt'.
	 * If no files are provided, the default mode is 'encrypt'.
	 *
	 * @param {FileList | null} files - The list of files to determine the mode from.
	 *
	 * @returns {Mode} - The determined mode ('encrypt' or 'decrypt').
	 */
	const determineMode = (files: FileList | null): Mode => {
		if (!files) return 'encrypt';

		const fileExtensionSet = new Set<string>();

		for (const { name } of files) {
			fileExtensionSet.add(name.substring(name.lastIndexOf('.')).toLowerCase());
		}

		if (fileExtensionSet.size === 1 && fileExtensionSet.has('.cre')) return 'decrypt';
		if (fileExtensionSet.size > 1 && fileExtensionSet.has('.cre')) return 'mixed';

		return 'encrypt';
	};

	$: mode = determineMode($files$);
	$: if (mode === 'encrypt') {
		passwordPlaceholder = 'Enter a strong password';
	} else if (mode === 'decrypt') {
		passwordPlaceholder = 'Enter the decryption password';
	}
	$: passwordStrength = estimatePasswordStrength(password);
	$: pluralizedFilesLabel = $files$?.length === 1 ? 'File' : 'Files';
	$: totalSizeOfFiles = convertFileSize(Array.from($files$ ?? []).reduce((prev, curr) => prev + curr.size, 0));
	$: canEdit = mode === 'encrypt' || mode === 'decrypt';
</script>

<form class="max-w-screen-sm w-full space-y-8" on:submit|preventDefault={submitHandler}>
	<div>
		<div class="bg-neutral-800 rounded-lg w-full transition-all relative overflow-hidden">
			{#if $files$ && $files$.length > 0}
				<div class="max-h-80 overflow-y-auto overflow-x-hidden p-6 pb-20">
					<ul class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4 xl:gap-x-6">
						{#each $files$ as file}
							<li class="cursor-default">
								<div class="aspect-h-8 aspect-w-10 w-full rounded-lg bg-white/10">
									<div>
										<div class="flex justify-center items-center h-full">
											<p class="font-cal text-white/90 truncate px-2">
												{file.name.substring(file.name.lastIndexOf('.')).toUpperCase()}
											</p>
										</div>

										<button
											on:click={() => removeFileHandler(file)}
											type="button"
											class="absolute right-2 bottom-2 cursor-pointer hover:bg-white/10 rounded-lg p-1 transition-all"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												fill="none"
												viewBox="0 0 24 24"
												stroke-width="1.5"
												class="w-5 h-5 stroke-red-600"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
												/>
											</svg>
										</button>
									</div>
								</div>
								<div class="flex justify-between items-center mt-2">
									{#if file.name.substring(file.name.lastIndexOf('.')).toUpperCase() === '.CRE'}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											fill="none"
											viewBox="0 0 24 24"
											stroke-width="2.5"
											class="w-5 h-5 mr-1 stroke-red-500"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
											/>
										</svg>
									{/if}
									<p class="truncate text-sm text-white" title={file.name}>{file.name}</p>
								</div>
								<p class="text-xs font-light text-white/30">
									{convertFileSize(file.size)}
								</p>
							</li>
						{/each}
					</ul>
				</div>

				<div class="absolute left-0 bottom-0 w-full bg-black/5 backdrop-blur-md backdrop-filter">
					<div class="flex justify-between p-3">
						<button
							on:click={addFileHandler}
							type="button"
							class="rounded-lg bg-white px-3.5 py-2.5 text-sm text-black hover:bg-white/90 transition-all"
						>
							<input bind:this={fileInputRef} on:change={fileChangedHandler} type="file" multiple hidden />

							<div class="flex items-center">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke-width="1.5"
									stroke="currentColor"
									class="w-5 h-5 -ml-0.5 mr-1"
								>
									<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
								</svg>
								<span>Add files</span>
							</div>
						</button>
						<button
							on:click={removeAllFiles}
							type="button"
							class="rounded-lg bg-red-600 px-3.5 py-2.5 text-sm text-white hover:bg-red-600/90 transition-all"
						>
							<div class="flex items-center">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke-width="1.5"
									class="w-5 h-5 -ml-0.5 mr-1 stroke-white"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
									/>
								</svg>
								<span>Remove all files</span>
							</div>
						</button>
					</div>
				</div>
			{:else}
				{#if !$files$ || !$files$.length}
					<button on:click={addFileHandler} type="button" class="absolute left-0 top-0 cursor-pointer w-full h-full">
						<input bind:this={fileInputRef} on:change={fileChangedHandler} type="file" multiple hidden />
					</button>
				{/if}
				<div class="flex flex-col items-center justify-items-stretch space-y-5 p-12">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-10 w-10 stroke-white"
						width="24"
						height="24"
						viewBox="0 0 24 24"
						stroke-width="2"
						stroke="currentColor"
						fill="none"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path stroke="none" d="M0 0h24v24H0z" fill="none" />
						<path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
						<path d="M7 9l5 -5l5 5" />
						<path d="M12 4l0 12" />
					</svg>
					<p class="font-cal text-xl tracking-wide">Drag & Drop or browse files</p>
				</div>
			{/if}
		</div>

		{#if $files$ && $files$?.length > 0}
			<div class="flex justify-between text-xs text-white/40 mt-2">
				<p>{$files$.length} {pluralizedFilesLabel}</p>
				<p>Total size: {totalSizeOfFiles}</p>
			</div>
		{/if}

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
						<div>Please don't mix encrypted '.cre' files with unencrypted ones.</div>
						<div>
							Select either files to encrypt or decrypt at a time. Remove the conflicting files from your selection to
							proceed.
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>

	{#if mode !== 'mixed'}
		<div>
			<div class="flex justify-between items-center">
				<label for="password" class="text-sm leading-6 font-medium">Password</label>
				{#if (password && mode === 'encrypt') || mode === 'encryption_in_progress' || mode === 'encryption_done'}
					<button on:click={copyPassword} type="button">
						<span class="text-xs text-blue-500 hover:underline">Copy Password</span>
					</button>
				{/if}
			</div>
			<div class="relative mt-1 rounded-lg">
				<input
					bind:value={password}
					disabled={!canEdit}
					type="password"
					name="password"
					class="w-full rounded-lg px-3.5 py-3 pr-10 border-none text-sm focus:ring-0 bg-white/5 disabled:pointer-events-none"
					placeholder={passwordPlaceholder}
				/>
				<div class="absolute inset-y-0 right-0 flex items-center mr-2">
					{#if mode === 'encrypt'}
						<button
							type="button"
							disabled={!canEdit}
							class="hover:bg-white/10 rounded-lg p-1.5 disabled:pointer-events-none"
							on:click={() => (password = generateRandomPassword())}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="1.5"
								stroke="currentColor"
								class="w-5 h-5"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
								/>
							</svg>
						</button>
					{/if}
				</div>
			</div>
			{#if (password.length > 0 && mode === 'encrypt') || mode === 'encryption_in_progress' || mode === 'encryption_done'}
				<p class="mt-2 text-xs text-white/30">Password strength: <b>{passwordStrength}</b></p>
			{/if}
			{#if decryptionErrorMessage}
				<p class="mt-2 text-xs font-light text-red-600">
					{decryptionErrorMessage}
				</p>
			{/if}
		</div>
	{/if}

	{#if $files$ && password && mode !== 'mixed'}
		<button
			on:click={submitHandler}
			disabled={mode === 'encryption_in_progress' || mode === 'decryption_in_progress'}
			type="button"
			class="mt-2 inline-flex items-center justify-center w-full rounded-lg bg-white px-3.5 py-2.5 text-sm text-black hover:bg-white/90 transition-all"
		>
			{#if mode === 'encryption_in_progress' || mode === 'decryption_in_progress'}
				<svg
					class="animate-spin -ml-1 mr-2 h-4 w-4 text-black"
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
				>
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
					<path
						class="opacity-75"
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
					/>
				</svg>
			{:else if mode === 'encryption_done' || mode === 'decryption_done'}
				<svg
					class="-ml-1 mr-2 h-4 w-4 text-black"
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="2"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
					/>
				</svg>
			{/if}

			{#if mode === 'encrypt'}
				Encrypt Files
			{:else if mode === 'encryption_in_progress'}
				Encrypting Files...
			{:else if mode === 'encryption_done'}
				Download Encrypted Files
			{:else if mode === 'decrypt'}
				Decrypt Files
			{:else if mode === 'decryption_in_progress'}
				Decrypting Files...
			{:else if mode === 'decryption_done'}
				Download Decrypted Files
			{/if}
		</button>
	{/if}
</form>
