export type Mode =
	| 'encrypt'
	| 'encryption_in_progress'
	| 'encryption_done'
	| 'decrypt'
	| 'decryption_in_progress'
	| 'decryption_done'
	| 'mixed';

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

export type WebWorkerIncomingMessage = {
	type: Exclude<Mode, 'mixed'>;
	file: File;
	password: string;
};

export type WebWorkerOutgoingMessage = {
	type: Exclude<Mode, 'mixed'>;
	result: EncryptResult | DecryptResult;
};
