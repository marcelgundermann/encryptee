/** What a drop on the window holds: its files, and whether a folder is among them. */
export interface Dropped {
	files: File[];
	folder: boolean;
}

/** The part of a drop's `DataTransfer` that tells its files from its folders. */
interface Transfer {
	readonly files: Iterable<File>;
	readonly items: Iterable<{ webkitGetAsEntry(): { readonly isDirectory: boolean } | null }>;
}

/**
 * What was dropped. A folder comes as a File too, and where the browser gives
 * it a size of 0 it reads like an empty file, so only its entry tells. The
 * entries are there only while the drop event is handled.
 */
export function droppedFiles({ files, items }: Transfer): Dropped {
	return {
		files: [...files],
		folder: [...items].some((item) => item.webkitGetAsEntry()?.isDirectory)
	};
}
