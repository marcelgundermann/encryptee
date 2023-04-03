<script lang="ts">
	import '../app.css';
	import 'cal-sans';

	import Header from '$lib/components/Header.svelte';
	import { addFiles } from '$lib/store/files';
	import { onMount } from 'svelte';

	onMount(() => {
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

<main class="max-w-screen-xl mx-auto p-5 sm:p-10 h-screen">
	<Header />
	<slot />
</main>

<div
	class="{dragOver ? 'absolute' : 'hidden'} h-screen w-screen z-10 inset-0 bg-black/5 backdrop-blur-sm backdrop-filter"
>
	<div class="flex justify-center items-center h-full">
		<p class="font-cal text-3xl text-white">Drop files to encrypt/decrypt</p>
	</div>
</div>
