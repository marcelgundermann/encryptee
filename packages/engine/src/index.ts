// The engine's public surface. The UI never touches workers, chunks or formats.
export { startJob, outputName } from './job.ts';

export type {
	FileOutput,
	FileStatus,
	Job,
	JobFile,
	JobInput,
	JobOptions,
	JobSnapshot,
	JobStatus,
	SaveTarget
} from './job.ts';

export type { DecryptCredentials, EncryptCredentials } from './format/header.ts';

export { EngineError } from './errors.ts';

export type { EngineErrorCode, SerializedError } from './errors.ts';

export {
	chooseSink,
	defaultTuning,
	detectCapabilities,
	sizeLimit,
	SIZE_LIMITS
} from './capabilities.ts';

export type { BrowserFamily, Capabilities, SinkChoice } from './capabilities.ts';

export { preflight } from './preflight.ts';

export type { Preflight, PreflightWarning } from './preflight.ts';

export { inspectFile } from './inspect.ts';

export type { FileInfo } from './inspect.ts';

export type { FileKind } from './format/age.ts';

export { clearStagingArea } from './sinks/download.ts';

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
