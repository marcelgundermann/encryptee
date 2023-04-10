<script lang="ts">
	import Dropzone from '$lib/components/Dropzone.svelte';
	import DropzoneOverlay from '$lib/components/DropzoneOverlay.svelte';
</script>

<svelte:head>
	<title>Encryptee - Encyrpt & Decrypt files</title>
	<meta
		name="description"
		content="Client-side file encryption and decryption using Web Crypto API. Easy-to-use, fast, and reliable."
	/>
</svelte:head>

<div class="max-w-screen-sm mx-auto w-full h-full flex flex-col items-center pt-28">
	<h1 class="pb-10 md:text-lg text-white/70 font-cal tracking-wide text-center">
		Encrypt and Decrypt your files in the browser fast and secure
	</h1>
	<Dropzone />
</div>

<DropzoneOverlay />
