<script lang="ts">
	import { convertFileSize } from '$lib/helper';

	export let files: Array<File>;

	$: pluralizedFilesLabel = files?.length === 1 ? 'File' : 'Files';
	$: totalSizeOfFiles = convertFileSize(files.reduce((prev, curr) => prev + curr.size, 0));
</script>

{#if files.length}
	<div class="w-full flex justify-between text-xs text-white/40 mt-2">
		<p>{files.length} {pluralizedFilesLabel}</p>
		<p>Total size: {totalSizeOfFiles}</p>
	</div>
{/if}
