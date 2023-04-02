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
