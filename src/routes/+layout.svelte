<script lang="ts">
	import '../app.css';
	import 'cal-sans';

	import Header from '$lib/components/Header.svelte';
	import { addFiles } from '$lib/store/files';
	import { onMount } from 'svelte';

	onMount(() => {
		window.addEventListener('drop', handleDrop);
		window.addEventListener('dragover', handleDragOver);

		return () => {
			window.removeEventListener('drop', handleDrop);
			window.removeEventListener('dragover', handleDragOver);
		};
	});

	let dragOver = false;

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
		dragOver = true;
	};
</script>

<main class="max-w-screen-lg mx-auto p-5 sm:p-10 h-screen">
	<Header />
	<slot />
</main>

<div
	class="{dragOver ? 'absolute' : 'hidden'} h-screen w-screen z-10 inset-0 bg-black/5 backdrop-blur-sm backdrop-filter"
>
	<div class="flex justify-center items-center h-full">
		<p class="font-cal text-3xl text-white/90">Drop files to encrypt</p>
	</div>
</div>
