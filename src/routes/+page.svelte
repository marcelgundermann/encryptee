<script lang="ts">
	import DropzoneOverlay from '$lib/components/DropzoneOverlay.svelte';
	import CryptoPanel from '$lib/components/crypto-panel/CryptoPanel.svelte';
</script>

<svelte:head>
	<title>Encryptee - Encyrpt & Decrypt files</title>
	<meta
		name="description"
		content="Client-side file encryption and decryption using Web Crypto API. Easy-to-use, fast, and reliable."
	/>
</svelte:head>

<div class="max-w-screen-sm mx-auto">
	<h1
		class="py-8 md:text-3xl tracking-tighter text-xl font-bold !leading-[1.2] bg-gradient-to-br from-white to-neutral-700 inline-block text-transparent bg-clip-text text-center"
	>
		Encrypt and Decrypt files fast and secure in your browser
	</h1>

	<div class="space-y-8 flex flex-col items-center">
		<CryptoPanel />
	</div>
</div>

<DropzoneOverlay />
