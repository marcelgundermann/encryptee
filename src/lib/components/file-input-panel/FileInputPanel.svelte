<script lang="ts">
	import { convertFileSize } from '$lib/helper';
	import { addFiles, files$, password$, removeFile } from '$lib/store/files';
	import Button from '../shared/Button.svelte';
	import FileInputPanelFooter from './FileInputPanelFooter.svelte';
	import FileInputPanelInfo from './FileInputPanelInfo.svelte';

	let fileInputRef: HTMLInputElement;

	/**
	 * Remove all files from the file list
	 * Reset the password
	 */
	const removeAllFilesHandler = (): void => {
		files$.set(null);
		password$.set('');
	};

	/**
	 * Trigger the fileInputRef and open the native file picker
	 */
	const addFileHandler = (): void => {
		fileInputRef.click();
	};

	/**
	 * Remove the selected file from the file list
	 * If there are no files left, reset the password
	 *
	 * @param file The file to remove
	 */
	const removeFileHandler = (file: File): void => {
		removeFile(file);
		if (!files || !files.length) password$.set('');
	};

	/**
	 * Handle the file change event of the file input
	 * Add the selected files to the file list
	 *
	 * @param event The file change event
	 */
	const fileChangedHandler = (event: Event): void => {
		const input = event.target as HTMLInputElement;
		if (!input.files) return;

		addFiles(input.files);
	};

	$: files = Array.from($files$ ?? []);
	$: hasFiles = files && files.length > 0;
</script>

<div class="w-full h-full">
	<div class="bg-neutral-900 rounded-md h-full relative max-h-72 overflow-hidden">
		{#if hasFiles}
			<div class="overflow-y-auto h-full overflow-x-hidden p-6 pb-20">
				<ul class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4 xl:gap-x-6">
					{#each files as file}
						<li class="cursor-default">
							<div class="aspect-h-8 aspect-w-10 w-full rounded-lg bg-white">
								<div>
									<div class="flex justify-center items-center h-full">
										<p class="text-black font-semibold truncate px-2">
											{file.name.substring(file.name.lastIndexOf('.')).toUpperCase()}
										</p>
									</div>

									<div class="absolute right-2 bottom-2">
										<Button color="red-invert" class="!p-1.5" on:click={() => removeFileHandler(file)}>
											<span slot="leading-icon">
												<svg
													xmlns="http://www.w3.org/2000/svg"
													fill="none"
													viewBox="0 0 24 24"
													stroke-width="2"
													stroke="currentColor"
													class="w-4 h-4"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
													/>
												</svg>
											</span>
										</Button>
									</div>
								</div>
							</div>
							<div class="flex justify-start items-center mt-2">
								{#if file.name.substring(file.name.lastIndexOf('.')).toUpperCase() === '.CRE'}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										stroke-width="2.5"
										class="w-4 h-4 mr-1 stroke-red-500 flex-shrink-0"
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
			<FileInputPanelFooter
				bind:fileInputRef
				{fileChangedHandler}
				on:addFileHandler={addFileHandler}
				on:removeAllFilesHandler={removeAllFilesHandler}
			/>
		{:else}
			<button on:click={addFileHandler} type="button" class="absolute left-0 top-0 cursor-pointer w-full h-full">
				<input bind:this={fileInputRef} on:change={fileChangedHandler} type="file" multiple hidden />
			</button>
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
				<p class="text-2xl font-semibold tracking-tight">Drag & Drop or browse files</p>
			</div>
		{/if}
	</div>
	<FileInputPanelInfo {files} />
</div>
