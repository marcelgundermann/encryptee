export type Mode = 'encrypt' | 'decrypt' | 'mixed';

export type EncryptResult = {
	encryptedBlob: Blob;
	fileName: string;
};

export type DecryptResult = {
	decryptedBlob: Blob;
	fileName: string;
	fileExtension: string;
};

export type PasswordStrength = 'Very Weak' | 'Weak' | 'Moderate' | 'Strong' | 'Very Strong';
