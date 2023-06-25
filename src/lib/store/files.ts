import { derived, get, writable } from 'svelte/store';
import type { CipherOperationState } from '$lib/types';

export const files$ = writable<FileList | null>();
export const supportsFileSystemAccess$ = writable<boolean>(true);
export const password$ = writable<string>('');
export const cipherOperationState$ = writable<CipherOperationState>('encrypt');

export const addFiles = (newFiles: FileList) => {
	const existingFiles = Array.from(get(files$) ?? []);

	const newDroppedFiles = Array.from(newFiles).filter(
		(newFiles) =>
			!existingFiles.some((existingFile) => existingFile.name === newFiles.name && existingFile.size === newFiles.size)
	);

	const combinedFiles = [...existingFiles, ...newDroppedFiles];
	const filesToAdd = new DataTransfer();
	const fileExtensionSet = new Set<string>();

	for (const file of combinedFiles) {
		filesToAdd.items.add(file);
		fileExtensionSet.add(file.name.substring(file.name.lastIndexOf('.')).toLowerCase());
	}

	if (fileExtensionSet.size === 1 && fileExtensionSet.has('.cre')) cipherOperationState$.set('decrypt');
	if (fileExtensionSet.size > 1 && fileExtensionSet.has('.cre')) cipherOperationState$.set('mixed');

	files$.set(filesToAdd.files);
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

/**
 * Determines the mode (encrypt or decrypt) based on the file extensions in the given FileList.
 * If all files have the '.cre' extension, the mode is set to 'decrypt'.
 * If there are mixed extensions or none of them is '.cre', the mode is set to 'encrypt'.
 * If no files are provided, the default mode is 'encrypt'.
 *
 * @param {FileList | null} files - The list of files to determine the mode from.
 *
 * @returns {CipherOperationState} - The determined mode ('encrypt' or 'decrypt').
 */
export const cryptoMode$ = derived(files$, (files): CipherOperationState => {
	if (!files) return 'encrypt';

	const fileExtensionSet = new Set<string>();

	for (const { name } of files) {
		fileExtensionSet.add(name.substring(name.lastIndexOf('.')).toLowerCase());
	}

	if (fileExtensionSet.size === 1 && fileExtensionSet.has('.cre')) return 'decrypt';
	if (fileExtensionSet.size > 1 && fileExtensionSet.has('.cre')) return 'mixed';

	return 'encrypt';
});
