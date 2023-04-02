import { convertFileSize } from './helper';
import { describe, test, expect } from 'vitest';

describe('convertFileSize', () => {
	test('should return file size in KB', () => {
		const fileSizeBytes = 1024 * 5;
		const expectedResult = '5.00 KB';
		expect(convertFileSize(fileSizeBytes)).toEqual(expectedResult);
	});

	test('should return file size in MB', () => {
		const fileSizeBytes = 1024 * 1024 * 2.5;
		const expectedResult = '2.50 MB';
		expect(convertFileSize(fileSizeBytes)).toEqual(expectedResult);
	});

	test('should return file size in GB', () => {
		const fileSizeBytes = 1024 * 1024 * 1024 * 1.5;
		const expectedResult = '1.50 GB';
		expect(convertFileSize(fileSizeBytes)).toEqual(expectedResult);
	});

	test('should handle edge case with exactly 1 MB', () => {
		const fileSizeBytes = 1024 * 1024;
		const expectedResult = '1.00 MB';
		expect(convertFileSize(fileSizeBytes)).toEqual(expectedResult);
	});

	test('should handle edge case with exactly 1 GB', () => {
		const fileSizeBytes = 1024 * 1024 * 1024;
		const expectedResult = '1.00 GB';
		expect(convertFileSize(fileSizeBytes)).toEqual(expectedResult);
	});

	test('should handle edge case with 0 bytes', () => {
		const fileSizeBytes = 0;
		const expectedResult = '0.00 KB';
		expect(convertFileSize(fileSizeBytes)).toEqual(expectedResult);
	});
});
