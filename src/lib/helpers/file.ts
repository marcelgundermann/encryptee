/**
 * Converts the given file size in bytes to a more readable format, including
 * a unit (KB, MB, or GB) and a maximum of 2 decimal places.
 *
 * @param fileSizeBytes - The file size in bytes (number).
 *
 * @returns A formatted string representing the file size with its appropriate unit.
 */
export const convertFileSize = (fileSizeBytes: File['size']) => {
	let fileSize: number;
	let unit: string;

	if (fileSizeBytes < 1024 * 1024) {
		fileSize = fileSizeBytes / 1024;
		unit = 'KB';
	} else if (fileSizeBytes < 1024 * 1024 * 1024) {
		fileSize = fileSizeBytes / (1024 * 1024);
		unit = 'MB';
	} else {
		fileSize = fileSizeBytes / (1024 * 1024 * 1024);
		unit = 'GB';
	}

	return (
		new Intl.NumberFormat(undefined, {
			style: 'decimal',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(fileSize) +
		' ' +
		unit
	);
};
