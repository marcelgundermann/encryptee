import type { DecryptResult, EncryptResult, WebWorkerIncomingMessage } from './types';

onmessage = async (event: MessageEvent<WebWorkerIncomingMessage>) => {
	const { type, file, password } = event.data;

	if (!file || !password) {
		throw new Error('File and password must be provided');
	}

	if (type === 'encrypt') {
		const { encryptedBlob, fileName } = await encryptFile(file, password);
		postMessage({ type, result: { encryptedBlob, fileName } });
	} else if (type === 'decrypt') {
		const result = await decryptFile(file, password);
		postMessage({ type, result });
	}
};

const encryptFile = async (file: File, password: string): Promise<EncryptResult> => {
	if (!file || !password) {
		throw new Error('File and password must be provided');
	}

	const arrayBuffer = await file.arrayBuffer();
	const fileNameArrayBuffer = new TextEncoder().encode(file.name);

	const combinedArrayBuffer = new ArrayBuffer(fileNameArrayBuffer.byteLength + 1 + arrayBuffer.byteLength);
	const combinedView = new Uint8Array(combinedArrayBuffer);
	combinedView.set(fileNameArrayBuffer, 0);
	combinedView.set([0], fileNameArrayBuffer.byteLength);
	combinedView.set(new Uint8Array(arrayBuffer), fileNameArrayBuffer.byteLength + 1);

	const salt = crypto.getRandomValues(new Uint8Array(16));
	const key = await deriveKey(password, salt);
	const iv = crypto.getRandomValues(new Uint8Array(12));

	const encryptedBuffer = await crypto.subtle.encrypt(
		{
			name: 'AES-GCM',
			iv
		},
		key,
		combinedArrayBuffer
	);

	const encryptedBlob = new Blob([salt, iv, encryptedBuffer]);
	const randomBytes = crypto.getRandomValues(new Uint8Array(24));
	const randomFileName = btoa(String.fromCharCode(...randomBytes)) + '.cre';
	return {
		encryptedBlob,
		fileName: randomFileName
	};
};

const decryptFile = async (file: File, password: string): Promise<DecryptResult> => {
	if (!file || !password) {
		throw new Error('File and password must be provided');
	}

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

	const decryptedUint8Array = new Uint8Array(decryptedBuffer);
	let nullIndex = decryptedUint8Array.indexOf(0);
	if (nullIndex === -1) {
		throw new Error('File name not found in decrypted data');
	}

	const fileNameArrayBuffer = decryptedBuffer.slice(0, nullIndex);
	const fileContentArrayBuffer = decryptedBuffer.slice(nullIndex + 1);

	const fileName = new TextDecoder().decode(fileNameArrayBuffer);
	const decryptedBlob = new Blob([fileContentArrayBuffer], { type: file.type });

	return {
		decryptedBlob,
		fileName,
		type: 'success'
	};
};

const deriveKey = async (password: string, salt: Uint8Array): Promise<CryptoKey> => {
	const passwordEncoder = new TextEncoder();
	const passwordBuffer = passwordEncoder.encode(password);

	const importedPassword = await crypto.subtle.importKey('raw', passwordBuffer, 'PBKDF2', false, ['deriveKey']);

	return crypto.subtle.deriveKey(
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

