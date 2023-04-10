<script lang="ts">
	import { addAbortedFiles, addFiles, isFastMode$ } from '$lib/store/files';
	import { onMount } from 'svelte';

	onMount(() => {
		// @ts-expect-error
		isChrome = !!window.chrome;

		window.addEventListener('drop', handleDrop);
		window.addEventListener('dragover', handleDragOver);
		window.addEventListener('dragenter', handleDragEnter);
		window.addEventListener('dragleave', handleDragLeave);

		return () => {
			window.removeEventListener('drop', handleDrop);
			window.removeEventListener('dragover', handleDragOver);
			window.removeEventListener('dragenter', handleDragEnter);
			window.removeEventListener('dragleave', handleDragLeave);
		};
	});

	let isChrome = false;
	let dragOver = false;

	const handleDragEnter = (event: DragEvent) => {
		event.preventDefault();
		event.stopPropagation();
		dragOver = true;
	};

	const handleDragLeave = (event: DragEvent) => {
		event.preventDefault();
		event.stopPropagation();
		if (!event.relatedTarget || (event.relatedTarget as HTMLElement).tagName === 'HTML') {
			dragOver = false;
		}
	};

	const handleDrop = (event: DragEvent) => {
		event.preventDefault();
		event.stopPropagation();
		dragOver = false;

		const droppedFiles = event.dataTransfer?.files;
		if (!droppedFiles) return;

		const filesToAdd = new DataTransfer();
		const abortedFiles: Array<string> = [];

		[...droppedFiles].forEach((file) => {
			const fileSize = file.size;

			if (fileSize < 1000000000) {
				filesToAdd.items.add(file);
			}

			if (fileSize > 1000000000) {
				filesToAdd.items.add(file);
				isFastMode$.set(true); // Refactor
			}
		});

		addFiles(filesToAdd.files);
		addAbortedFiles(abortedFiles);
	};

	const handleDragOver = (event: DragEvent) => {
		event.preventDefault();
		event.stopPropagation();
	};
</script>

<div
	class="{dragOver ? 'absolute' : 'hidden'} h-screen w-screen z-10 inset-0 bg-black/5 backdrop-blur-sm backdrop-filter"
>
	<div class="flex justify-center items-center h-full">
		<p class="font-cal text-3xl text-white drop-shadow">Drop files to encrypt/decrypt</p>
	</div>
</div>
