import type { WebWorkerIncomingMessageChunk, WebWorkerOutgoingMessageChunk } from './types';

import { SIGNATURE, SIGNATURE_BYTE_LENGTH, IV_BYTE_LENGTH, SALT_BYTE_LENGTH } from './constants';

onmessage = async (event: MessageEvent<WebWorkerIncomingMessageChunk>) => {
	const { type, chunk, isFirstChunk, isLastChunk, password, writerId } = event.data;

	if (type === 'encrypt') {
		if (isFirstChunk) {
			const encryptedChunk = await encryptFirstChunk(chunk, password);
			const message: WebWorkerOutgoingMessageChunk = {
				isLastChunk,
				chunk: encryptedChunk,
				type: 'encrypt',
				writerId
			};
			return postMessage(message);
		}
		const encryptedChunk = await encryptChunk(chunk, password);
		const message: WebWorkerOutgoingMessageChunk = {
			isLastChunk,
			chunk: encryptedChunk,
			type: 'encrypt',
			writerId
		};
		return postMessage(message);
	} else if (type === 'decrypt') {
		if (isFirstChunk) {
			const decryptedChunk = await decryptFirstChunk(chunk, password);
			const message: WebWorkerOutgoingMessageChunk = {
				isLastChunk,
				chunk: decryptedChunk,
				type: 'decrypt',
				writerId
			};
			return postMessage(message);
		}
		const decryptedChunk = await decryptChunk(chunk, password);
		const message: WebWorkerOutgoingMessageChunk = {
			isLastChunk,
			chunk: decryptedChunk,
			type: 'decrypt',
			writerId
		};
		return postMessage(message);
	}
};

const encryptFirstChunk = async (chunk: ArrayBuffer, password: string): Promise<ArrayBuffer> => {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTE_LENGTH));
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));
	const key = await deriveKey(password, salt);

	const encryptedChunk = await crypto.subtle.encrypt(
		{
			name: 'AES-GCM',
			iv
		},
		key,
		chunk
	);

	const encryptedBufferLength = SALT_BYTE_LENGTH + IV_BYTE_LENGTH + encryptedChunk.byteLength;
	const combinedArrayBuffer = new ArrayBuffer(encryptedBufferLength + SIGNATURE_BYTE_LENGTH);
	const combinedView = new Uint8Array(combinedArrayBuffer);
	combinedView.set(new TextEncoder().encode(SIGNATURE), 0);
	combinedView.set(salt, SIGNATURE_BYTE_LENGTH);
	combinedView.set(iv, SIGNATURE_BYTE_LENGTH + SALT_BYTE_LENGTH);
	combinedView.set(new Uint8Array(encryptedChunk), SIGNATURE_BYTE_LENGTH + SALT_BYTE_LENGTH + IV_BYTE_LENGTH);

	return combinedArrayBuffer;
};

const encryptChunk = async (chunk: ArrayBuffer, password: string): Promise<ArrayBuffer> => {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTE_LENGTH));
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));
	const key = await deriveKey(password, salt);

	const encryptedChunk = await crypto.subtle.encrypt(
		{
			name: 'AES-GCM',
			iv
		},
		key,
		chunk
	);

	const encryptedBufferLength = SALT_BYTE_LENGTH + IV_BYTE_LENGTH + encryptedChunk.byteLength;
	const combinedArrayBuffer = new ArrayBuffer(encryptedBufferLength);
	const combinedView = new Uint8Array(combinedArrayBuffer);
	combinedView.set(salt, 0);
	combinedView.set(iv, SALT_BYTE_LENGTH);
	combinedView.set(new Uint8Array(encryptedChunk), SALT_BYTE_LENGTH + IV_BYTE_LENGTH);

	return combinedArrayBuffer;
};

const decryptFirstChunk = async (chunk: ArrayBuffer, password: string): Promise<ArrayBuffer> => {
	const signature = new Uint8Array(chunk, 0, SIGNATURE_BYTE_LENGTH);

	const decodedSignature = new TextDecoder().decode(signature);
	if (decodedSignature !== SIGNATURE) throw new Error('Signature not valid.');

	const salt = new Uint8Array(chunk, SIGNATURE_BYTE_LENGTH, SALT_BYTE_LENGTH);
	const iv = new Uint8Array(chunk, SIGNATURE_BYTE_LENGTH + SALT_BYTE_LENGTH, IV_BYTE_LENGTH);
	const dataBuffer = chunk.slice(SIGNATURE_BYTE_LENGTH + SALT_BYTE_LENGTH + IV_BYTE_LENGTH, chunk.byteLength);

	const key = await deriveKey(password, salt);
	console.log(salt, password);

	try {
		const decryptedData = await crypto.subtle.decrypt(
			{
				name: 'AES-GCM',
				iv
			},
			key,
			dataBuffer
		);
		return decryptedData;
	} catch (error) {
		console.error('Decryption error:', error);
		throw error;
	}
};

const decryptChunk = async (chunk: ArrayBuffer, password: string): Promise<ArrayBuffer> => {
	const salt = new Uint8Array(chunk, 0, SALT_BYTE_LENGTH);
	const iv = new Uint8Array(chunk, SALT_BYTE_LENGTH, IV_BYTE_LENGTH);
	const dataBuffer = chunk.slice(SALT_BYTE_LENGTH + IV_BYTE_LENGTH, chunk.byteLength);

	const key = await deriveKey(password, salt);

	try {
		const decryptedData = await crypto.subtle.decrypt(
			{
				name: 'AES-GCM',
				iv
			},
			key,
			dataBuffer
		);
		return decryptedData;
	} catch (error) {
		console.error('Decryption error:', error);
		throw error;
	}
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
