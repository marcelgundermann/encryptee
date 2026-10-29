// The engine's public surface. The UI never touches workers, chunks or formats.
export { startJob } from './job.ts';

export type {
	FileStatus,
	Job,
	JobFile,
	JobInput,
	JobOptions,
	JobSnapshot,
	JobStatus
} from './job.ts';

export { chooseSaveLocation, whereToSave } from './sinks/save-location.ts';

export type { FileOutput, SaveChoice, SaveLocation, SavePlan } from './sinks/save-location.ts';

export type { DecryptCredentials, EncryptCredentials } from './format/header.ts';

export { EngineError } from './errors.ts';

export type { EngineErrorCode, SerializedError } from './errors.ts';

export { defaultTuning } from './capabilities.ts';

export type { Tuning } from './capabilities.ts';

export { preflight } from './preflight.ts';

export type { Preflight, PreflightWarning } from './preflight.ts';

export { inspectFile } from './inspect.ts';

export type { FileInfo } from './inspect.ts';

export type { FileKind } from './format/age.ts';

export { nativeChaChaAvailable } from './payload/cipher.ts';

export type { Backend } from './payload/cipher.ts';

export {
	checkCredentials,
	generateKeyPair,
	protectKeyFile,
	readKeyFile,
	validatePublicKeys
} from './tools.ts';

export { keyFileText, mixesPqAndClassic, publicKeyType } from './keys/key-pair.ts';

export type { KeyPair, KeyType } from './keys/key-pair.ts';

export type { KeyFileContents } from './keys/keys.ts';

export { generatePassphrase } from './keys/passphrase.ts';

export { buildShareLink, parseShareLink } from './keys/share-link.ts';

export { deleteContact, listContacts, renameContact, saveContact } from './keys/contacts.ts';

export type { Contact } from './keys/contacts.ts';
