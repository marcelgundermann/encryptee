export type CryptoMode = 'encrypt' | 'decrypt';

export type CipherOperationState =
	| 'encrypt'
	| 'encryption_in_progress'
	| 'encryption_last_chunk'
	| 'encryption_done'
	| 'decrypt'
	| 'decryption_in_progress'
	| 'decryption_last_chunk'
	| 'decryption_done'
	| 'mixed';

export type ChunkMode =
	| {
			transferType: 'chunk';
			cryptoMode: 'encrypt';
	  }
	| {
			transferType: 'chunk';
			cryptoMode: 'decrypt';
	  };

interface AbstractWebWorkerMessage {
	type: Exclude<CipherOperationState, 'mixed'>;
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
