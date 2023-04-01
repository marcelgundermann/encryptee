<script>
	import '../app.css';
	import 'cal-sans';

	import Header from '$lib/components/Header.svelte';
</script>

<main class="max-w-screen-lg mx-auto py-8">
	<Header />
	<slot />
</main>
