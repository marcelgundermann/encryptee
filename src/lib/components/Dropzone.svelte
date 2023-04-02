<script lang="ts">
	import { decryptFile, encryptFile } from '$lib/crypto/crypto';
	import { estimatePasswordStrength, generateRandomPassword } from '$lib/crypto/password-helper';
	import { convertFileSize } from '$lib/helper';

	import { addFiles, files$, removeFile } from '$lib/store/files';
	import type { Mode } from '$lib/types';
	import { get } from 'svelte/store';

	let fileInputRef: HTMLInputElement;
	let password = '';
	let passwordPlaceholder = '';

	const removeAllFiles = (): void => {
		files$.set(null);
	};

	const addFileHandler = (): void => {
		fileInputRef.click();
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
		const files = get(files$);
		if (!files) return;

		for await (const file of files) {
			const { encryptedBlob, fileName } = await encryptFile(file, password);
			try {
				await downloadFile(encryptedBlob, `${fileName}.cre`);
			} catch (e) {
				throw new Error(String(e));
			}
		}
	};

	const decryptSubmitHandler = async (): Promise<void> => {
		const files = get(files$);
		if (!files) return;

		for await (const file of files) {
			const { decryptedBlob, fileName } = await decryptFile(file, password);
			try {
				await downloadFile(decryptedBlob, fileName);
			} catch (e) {
				throw new Error(String(e));
			}
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
</script>

<div class="max-w-screen-sm w-full space-y-8">
	<div>
		<div class="bg-neutral-800 rounded-lg w-full transition-all relative overflow-hidden">
			{#if $files$ && $files$.length > 0}
				<div class="max-h-80 overflow-y-auto p-6 pb-20">
					<ul class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4 xl:gap-x-8">
						{#each $files$ as file}
							<li class="cursor-default">
								<div class="aspect-h-7 aspect-w-10 w-full rounded-lg bg-white/10">
									<div>
										<div class="flex justify-center items-center h-full">
											<p class="font-cal text-xl text-white/90">
												{file.name.substring(file.name.lastIndexOf('.')).toUpperCase()}
											</p>
										</div>

										<button
											on:click={() => removeFile(file)}
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
								<p class="mt-2 truncate text-sm font-medium text-white" title={file.name}>{file.name}</p>
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
							class="rounded-lg bg-red-500 px-3.5 py-2.5 text-sm text-white hover:bg-red-500/90 transition-all"
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
				{#if !$files$}
					<button on:click={addFileHandler} type="button" class="absolute left-0 top-0 cursor-pointer w-full h-full">
						<input bind:this={fileInputRef} on:change={fileChangedHandler} type="file" multiple hidden />
					</button>
				{/if}
				<div class="flex flex-col items-center justify-items-stretch space-y-5 p-6">
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
					<p class="font-semibold">Drag & Drop or browse files</p>
				</div>
			{/if}
		</div>

		{#if mode === 'mixed'}
			<div class="bg-red-600 p-4 rounded-lg mt-2">
				<p class="text-sm font-light text-red-100">
					Please don't mix encrypted '.cre' files with unencrypted ones.
					<br />
					Select either files to encrypt or decrypt at a time. Remove the conflicting files from your selection to proceed.
				</p>
			</div>
		{/if}

		{#if $files$ && $files$?.length > 0}
			<div class="flex justify-between">
				<p class="mt-2 text-xs text-white/20">{$files$.length} {pluralizedFilesLabel}</p>
				<p class="mt-2 text-xs text-white/20">Total size: {totalSizeOfFiles}</p>
			</div>
		{/if}
	</div>

	<div>
		<div class="flex justify-between items-center">
			<label for="password" class="text-sm leading-6 font-medium">Password</label>
			{#if password && mode === 'encrypt'}
				<button on:click={copyPassword} type="button">
					<span class="text-xs text-blue-500 hover:underline">Copy Password</span>
				</button>
			{/if}
		</div>
		<div class="relative mt-1 rounded-lg">
			<input
				bind:value={password}
				type="password"
				name="password"
				class="w-full rounded-lg px-3.5 py-3 pr-10 border-none text-sm focus:ring-0 bg-white/5"
				placeholder={passwordPlaceholder}
			/>
			<div class="absolute inset-y-0 right-0 flex items-center mr-2">
				<button class="hover:bg-white/10 rounded-lg p-1.5" on:click={() => (password = generateRandomPassword())}>
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
			</div>
		</div>
		{#if password.length > 0 && mode === 'encrypt'}
			<p class="mt-2 text-xs text-white/30">Password strength: <b>{passwordStrength}</b></p>
		{/if}
	</div>

	{#if $files$ && password}
		{#if mode === 'encrypt'}
			<button
				on:click={submitHandler}
				disabled={!$files$ || !password}
				type="button"
				class="mt-2 w-full rounded-lg bg-white px-3.5 py-2.5 text-sm text-black hover:bg-white/90 transition-all disabled:cursor-not-allowed"
			>
				Download Encrypted Files
			</button>
		{:else if mode === 'decrypt'}
			<button
				on:click={decryptSubmitHandler}
				type="button"
				class="mt-2 w-full rounded-lg bg-white px-3.5 py-2.5 text-sm text-black hover:bg-white/90 transition-all disabled:pointer-events-none"
			>
				Download Decrypted Files
			</button>
		{/if}
	{/if}
</div>
