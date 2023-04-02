import type { DecryptResult, EncryptResult } from '$lib/types';

export const encryptFile = async (file: File, password: string): Promise<EncryptResult> => {
	if (!file || !password) {
		throw new Error('File and password must be provided');
	}

	if (!(window.crypto && window.crypto.subtle)) {
		throw new Error('Web Crypto API not supported in this browser');
	}

	const arrayBuffer = await file.arrayBuffer();
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const key = await deriveKey(password, salt);
	const iv = crypto.getRandomValues(new Uint8Array(12));

	const encryptedBuffer = await window.crypto.subtle.encrypt(
		{
			name: 'AES-GCM',
			iv
		},
		key,
		arrayBuffer
	);

	const encryptedBlob = new Blob([salt, iv, encryptedBuffer]);

	return {
		encryptedBlob,
		fileName: file.name
	};
};

export const decryptFile = async (file: File, password: string): Promise<DecryptResult> => {
	if (!file || !password) {
		throw new Error('File and password must be provided');
	}

	if (!(window.crypto && window.crypto.subtle)) {
		throw new Error('Web Crypto API not supported in this browser');
	}

	const getFileExtension = (fileName: string): string => {
		const fileParts = fileName.split('.');
		return fileParts.length > 1 ? fileParts.pop() || '' : '';
	};

	const encryptedBuffer = await file.arrayBuffer();
	const salt = new Uint8Array(encryptedBuffer.slice(0, 16));
	const iv = new Uint8Array(encryptedBuffer.slice(16, 28));
	const dataBuffer = encryptedBuffer.slice(28);
	const key = await deriveKey(password, salt);

	let decryptedBuffer: ArrayBuffer;
	try {
		decryptedBuffer = await crypto.subtle.decrypt(
			{
				name: 'AES-GCM',
				iv
			},
			key,
			dataBuffer
		);
	} catch (error) {
		if (error instanceof Error) {
			if (error.name === 'OperationError')
				return {
					error: 'Invalid Password',
					type: 'error'
				};
		}
		throw new Error(String(error));
	}

	const originalFileName = file.name.replace(/\.cre$/, '');
	const fileExtension = getFileExtension(originalFileName);
	const decryptedBlob = new Blob([decryptedBuffer], { type: file.type });

	return {
		decryptedBlob,
		fileName: originalFileName,
		fileExtension,
		type: 'success'
	};
};

export const deriveKey = async (password: string, salt: Uint8Array): Promise<CryptoKey> => {
	const passwordEncoder = new TextEncoder();
	const passwordBuffer = passwordEncoder.encode(password);

	const importedPassword = await window.crypto.subtle.importKey('raw', passwordBuffer, 'PBKDF2', false, ['deriveKey']);

	return window.crypto.subtle.deriveKey(
		{
			name: 'PBKDF2',
			salt,
			iterations: 100000,
			hash: 'SHA-256'
		},
		importedPassword,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
};
