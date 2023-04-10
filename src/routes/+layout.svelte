<script lang="ts">
	import '../app.css';
	import 'cal-sans';

	import { onMount } from 'svelte';
	import { isFastModeSupported$ } from '$lib/store/files';
	import Header from '$lib/components/Header.svelte';

	onMount(() => {
		isFastModeSupported$.set('showDirectoryPicker' in window);
	});
</script>

<main class="max-w-screen-xl mx-auto p-5 sm:p-10 h-screen">
	<Header />
	<slot />
</main>
