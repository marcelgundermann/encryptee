// The engine's public surface. The UI never touches workers, chunks or formats.
export { checkCredentials, startJob } from './job.ts';

export type {
	CheckedCredentials,
	FileStatus,
	Job,
	JobFile,
	JobInput,
	JobOptions,
	JobSnapshot,
	JobStatus
} from './job.ts';

export { chooseSaveLocation, whereToSave } from './sinks/save-location.ts';

export type { SaveChoice, SaveLocation, SavePlan } from './sinks/save-location.ts';

export type { FileOutput } from './sinks/sink.ts';

export type { DecryptCredentials, EncryptCredentials } from './format/header.ts';

export { EngineError } from './errors.ts';

export type { EngineErrorCode, SerializedError } from './errors.ts';

export { preflight } from './preflight.ts';

export type { PreflightWarning } from './preflight.ts';

export { inspectFile } from './inspect.ts';

export type { FileInfo } from './inspect.ts';

export { generateKeyPair, readKeyFile, saveKeyFile, validatePublicKeys } from './tools.ts';

export { mixesPqAndClassic } from './keys/key-pair.ts';

export type { KeyPair, KeyType } from './keys/key-pair.ts';

export type { KeyFileContents } from './keys/keys.ts';

export { generatePassphrase } from './keys/passphrase.ts';
