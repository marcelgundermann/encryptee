<script lang="ts">
	type AlertType = 'error' | 'warning';

	export let title: string;
	export let type: AlertType = 'error';
</script>

<div class="{type === 'error' ? 'bg-red-600' : 'bg-yellow-500'} p-4 rounded-lg mt-4">
	<div class="flex">
		<div class="flex-shrink-0">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="2"
				stroke="currentColor"
				class="w-5 h-5"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
				/>
			</svg>
		</div>
		<div class="ml-3 text-sm space-y-2">
			<div class="font-semibold">{title}</div>
			<slot />
		</div>
	</div>
</div>
