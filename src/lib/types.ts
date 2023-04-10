export type CryptoMode = 'encrypt' | 'decrypt';

export type Mode =
	| 'fast_single_encryption'
	| 'fast_multi_encryption'
	| 'encrypt'
	| 'encryption_in_progress'
	| 'encryption_done'
	| 'decrypt'
	| 'decryption_in_progress'
	| 'decryption_done'
	| 'chunk_encryption_in_progress'
	| 'chunk_encryption_last_chunk'
	| 'chunk_encryption_done'
	| 'chunk_decryption_in_progress'
	| 'chunk_decryption_last_chunk'
	| 'chunk_decryption_done'
	| 'mixed';

export type CipherOperationFileState =
	| 'encryption_in_progress'
	| 'encryption_last_chunk'
	| 'encryption_done'
	| 'decryption_in_progress'
	| 'decryption_last_chunk'
	| 'decryption_done';

export type CipherOperationChunkState =
	| 'chunk_encryption_in_progress'
	| 'chunk_encryption_last_chunk'
	| 'chunk_encryption_done'
	| 'chunk_decryption_in_progress'
	| 'chunk_decryption_last_chunk'
	| 'chunk_decryption_done';

export type TransferType = 'chunk' | 'file' | 'is_valid_password';

export type ChunkMode =
	| {
			transferType: 'chunk';
			cryptoMode: 'encrypt';
	  }
	| {
			transferType: 'chunk';
			cryptoMode: 'decrypt';
	  };

export type FileMode =
	| {
			transferType: 'file';
			cryptoMode: 'encrypt';
	  }
	| {
			transferType: 'file';
			cryptoMode: 'decrypt';
	  };

export type EncryptResult = {
	encryptedBlob: Blob;
	fileName: string;
};

export type DecryptResult =
	| {
			type: 'success';
			decryptedBlob: Blob;
			fileName: string;
	  }
	| {
			type: 'error';
			error: string;
	  };

export type PasswordStrength = 'Very Weak' | 'Weak' | 'Moderate' | 'Strong' | 'Very Strong';

interface AbstractWebWorkerMessage {
	type: Exclude<Mode, 'mixed'>;
	transferType: TransferType;
	password: string;
}

interface AbstractWebWorkerMessageChunk extends AbstractWebWorkerMessage {
	chunk: ArrayBuffer;
	transferType: 'chunk';
	isLastChunk: boolean;
	writerId: string;
	index?: number;
}

interface AbstractWebWorkerIncomingMessageFile extends AbstractWebWorkerMessage {
	transferType: 'file';
}

export interface WebWorkerIncomingMessageChunk extends AbstractWebWorkerMessageChunk {
	isFirstChunk?: boolean;
}

export interface WebWorkerOutgoingMessageChunk extends Omit<AbstractWebWorkerMessageChunk, 'password'> {}

export interface WebWorkerIncomingMessageFile extends AbstractWebWorkerIncomingMessageFile {
	file: File;
}

export interface WebWorkerOutgoingMessageFile extends Omit<AbstractWebWorkerIncomingMessageFile, 'password'> {
	blob: Blob;
	fileName: string;
}
