<script lang="ts">
	import Dropzone from '$lib/components/Dropzone.svelte';
</script>

<svelte:head>
	<title>Encryptee - Encyrpt & Decrypt files</title>
	<meta
		name="description"
		content="Client-side file encryption and decryption using Web Crypto API. Easy-to-use, fast, and reliable."
	/>
</svelte:head>

<div class="w-full h-full flex flex-col items-center pt-20">
	<Dropzone />
</div>
