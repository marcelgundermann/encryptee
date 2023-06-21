<script lang="ts">
	import '../app.css';
	import 'cal-sans';
	import Header from '$lib/components/Header.svelte';
</script>

<main class="max-w-screen-xl mx-auto p-5 sm:p-10 h-screen">
	<Header />
	<slot />
</main>
