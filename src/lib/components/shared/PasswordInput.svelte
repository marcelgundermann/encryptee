<script lang="ts">
	import { estimatePasswordStrength, generateRandomPassword } from '$lib/password-helper';
	import type { Mode } from '$lib/types';

	export let mode: Mode;
	export let canEdit: boolean;
	export let password: string;
	export let errorMessage: string;

	let passwordPlaceholder = '';

	const copyPassword = async (): Promise<void> => {
		navigator.clipboard.writeText(password);
	};

	$: passwordStrength = estimatePasswordStrength(password);
	$: if (mode === 'encrypt') {
		passwordPlaceholder = 'Enter a strong password';
	} else if (mode === 'decrypt') {
		passwordPlaceholder = 'Enter the decryption password';
	}
</script>

{#if mode !== 'mixed'}
	<div>
		<div class="flex justify-between items-center">
			<label for="password" class="text-sm leading-6 font-medium">Password</label>
			{#if (password && mode === 'encrypt') || mode === 'encryption_in_progress' || mode === 'encryption_done'}
				<button on:click={copyPassword} type="button">
					<span class="text-xs text-blue-500 hover:underline">Copy Password</span>
				</button>
			{/if}
		</div>
		<div class="relative mt-1 rounded-lg">
			<input
				bind:value={password}
				disabled={!canEdit}
				type="password"
				name="password"
				class="w-full rounded-lg px-3.5 py-3 pr-10 border-none text-sm focus:ring-0 bg-white/5 disabled:pointer-events-none"
				placeholder={passwordPlaceholder}
			/>
			<div class="absolute inset-y-0 right-0 flex items-center mr-2">
				{#if mode === 'encrypt'}
					<button
						type="button"
						disabled={!canEdit}
						class="hover:bg-white/10 rounded-lg p-1.5 disabled:pointer-events-none"
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
			</div>
		</div>
		{#if (password.length > 0 && mode === 'encrypt') || mode === 'encryption_in_progress' || mode === 'encryption_done'}
			<p class="mt-2 text-xs text-white/30">Password strength: <b>{passwordStrength}</b></p>
		{/if}
		{#if errorMessage}
			<p class="mt-2 text-xs font-light text-red-600">
				{errorMessage}
			</p>
		{/if}
	</div>
{/if}
