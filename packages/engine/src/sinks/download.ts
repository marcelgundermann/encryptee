/** How long a download may read from its blob URL; large files need a while. */
export const BLOB_DOWNLOAD_MS = 10 * 60_000;

export function downloadBlob(blob: Blob, name: string): void {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = name;
	anchor.hidden = true;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(() => URL.revokeObjectURL(url), BLOB_DOWNLOAD_MS);
}
