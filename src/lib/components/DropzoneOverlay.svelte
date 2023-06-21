<script lang="ts">
	import { addFiles, supportsFileSystemAccess$ } from '$lib/store/files';
	import { onMount } from 'svelte';

	onMount(() => {
		const supportsFileSystemAccess = 'showDirectoryPicker' in window;
		supportsFileSystemAccess$.set(supportsFileSystemAccess);

		if (!supportsFileSystemAccess) return;

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

		addFiles(droppedFiles);
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
