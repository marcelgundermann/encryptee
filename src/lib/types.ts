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

export type ChunkMode =
	| {
			transferType: 'chunk';
			cryptoMode: 'encrypt';
	  }
	| {
			transferType: 'chunk';
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

interface AbstractWebWorkerMessage {
	type: Exclude<Mode, 'mixed'>;
	password: string;
}

interface AbstractWebWorkerMessageChunk extends AbstractWebWorkerMessage {
	chunk: ArrayBuffer;
	isLastChunk: boolean;
	writerId: string;
	index?: number;
}

export interface WebWorkerIncomingMessageChunk extends AbstractWebWorkerMessageChunk {
	isFirstChunk?: boolean;
}

export interface WebWorkerOutgoingMessageChunk extends Omit<AbstractWebWorkerMessageChunk, 'password'> {}

export interface ChunkData {
	buffer: ArrayBufferLike;
	isFirstChunk: boolean;
	isLastChunk: boolean;
}
