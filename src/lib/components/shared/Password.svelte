<script lang="ts">
	import { generateRandomPassword } from '$lib/helpers/password';
	import { applicationMode$, cryptoMode$ } from '$lib/store/files';
	import type { Mode } from '$lib/types';
	import type { HTMLInputAttributes } from 'svelte/elements';
	import Input from './Input.svelte';

	export let password: string;

	let passwordPlaceholder = '';
	let inputType: HTMLInputAttributes['type'] = 'password';

	const copyPassword = async (): Promise<void> => {
		navigator.clipboard.writeText(password);
	};

	const canEditPassword = (mode: Mode): boolean => {
		return mode === 'encrypt' || mode === 'decrypt';
	};

	const passwordPlaceholderText = (mode: Mode): string => {
		if (mode === 'encrypt') {
			return 'Enter a strong password';
		} else if (mode === 'decrypt') {
			return 'Enter the decryption password';
		}
		return '';
	};

	const toggleShowPassword = () => {
		inputType = inputType === 'password' ? 'text' : 'password';
	};

	$: canEdit = canEditPassword($applicationMode$);
	$: showCopyPasswordButton =
		(password && $applicationMode$ === 'encrypt') ||
		$applicationMode$ === 'encryption_in_progress' ||
		$applicationMode$ === 'encryption_done';
	$: passwordPlaceholder = passwordPlaceholderText($applicationMode$);
</script>

<Input bind:value={password} bind:type={inputType} label="Password" placeholder={passwordPlaceholder} id="password">
	<span slot="corner-hint">
		{#if showCopyPasswordButton}
			<button on:click={copyPassword} type="button">
				<span class="text-xs text-blue-500 hover:underline">Copy Password</span>
			</button>
		{/if}
	</span>

	<span slot="trailing-icon">
		{#if password}
			<button
				on:click={toggleShowPassword}
				type="button"
				class="hover:bg-white/10 rounded-lg p-1.5 disabled:pointer-events-none active:scale-95"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="w-5 h-5"
				>
					{#if inputType === 'password'}
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
						/>
						<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
					{:else}
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
						/>
					{/if}
				</svg>
			</button>
		{/if}
		{#if $cryptoMode$ === 'encrypt'}
			<button
				type="button"
				disabled={!canEdit}
				class="hover:bg-white/10 rounded-lg p-1.5 disabled:pointer-events-none active:scale-95"
				on:click={() => (password = generateRandomPassword())}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="w-5 h-5"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
					/>
				</svg>
			</button>
		{/if}
	</span>
</Input>
