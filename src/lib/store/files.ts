// store.ts
import { writable } from 'svelte/store';

export const files$ = writable<FileList | null>();

export const addFiles = (newFiles: FileList) => {
	files$.update((store) => {
		if (!store) return newFiles;

		const existingFiles = Array.from(store);
		const newDroppedFiles = Array.from(newFiles).filter(
			(newFile) =>
				!existingFiles.some((existingFile) => existingFile.name === newFile.name && existingFile.size === newFile.size)
		);

		const combinedFiles = [...existingFiles, ...newDroppedFiles];
		const fileList = new DataTransfer();

		for (const file of combinedFiles) {
			fileList.items.add(file);
		}

		return fileList.files;
	});
};

export const removeFile = (fileToRemove: File) => {
	files$.update((store) => {
		if (!store) return null;

		const fileList = new DataTransfer();
		const existingFiles = Array.from(store);

		for (const file of existingFiles) {
			if (file.name !== fileToRemove.name || file.size !== fileToRemove.size) {
				fileList.items.add(file);
			}
		}

		return fileList.files;
	});
};
