export type Mode = 'encrypt' | 'decrypt' | 'mixed';

export type EncryptResult = {
	encryptedBlob: Blob;
	fileName: string;
};

export type DecryptResult =
	| {
			type: 'success';
			decryptedBlob: Blob;
			fileName: string;
			fileExtension: string;
	  }
	| {
			type: 'error';
			error: string;
	  };

export type PasswordStrength = 'Very Weak' | 'Weak' | 'Moderate' | 'Strong' | 'Very Strong';
