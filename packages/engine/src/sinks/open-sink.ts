import { EngineError, type SerializedError } from '../errors.ts';
import { OPFS_STAGING_DIR, type ByteSink, type SinkDescriptor, type SinkResult } from './sink.ts';
import { SwDownloadSink } from './sw-stream.ts';

declare global {
	interface FileSystemHandle {
		/** A Chromium extension the typings lack; other browsers leave it undefined. */
		remove?(): Promise<void>;
	}
}

/** Opens the writer for a descriptor. Runs in the coordinator (a dedicated worker). */
export async function openSink(descriptor: SinkDescriptor): Promise<ByteSink> {
	switch (descriptor.kind) {
		case 'fsa-file':
			return FsaSink.open(descriptor.handle, null);
		case 'fsa-directory': {
			const name = await uniqueName(descriptor.handle, descriptor.name);
			const handle = await descriptor.handle.getFileHandle(name, { create: true });

			return FsaSink.open(handle, { directory: descriptor.handle, name });
		}

		case 'sw-download':
			return new SwDownloadSink(descriptor.port);
		case 'opfs':
			return OpfsSink.open(descriptor.name);
		case 'memory':
			return new MemorySink();
		case 'discard':
			return new DiscardSink();
	}
}

class FsaSink implements ByteSink {
	private constructor(
		private readonly handle: FileSystemFileHandle,
		private readonly writable: FileSystemWritableFileStream,
		/** Set when we created the file, so a failed job may delete it. */
		private readonly created: { directory: FileSystemDirectoryHandle; name: string } | null,
		private readonly wasEmpty: boolean
	) {}

	static async open(
		handle: FileSystemFileHandle,
		created: { directory: FileSystemDirectoryHandle; name: string } | null
	): Promise<FsaSink> {
		const wasEmpty = (await handle.getFile()).size === 0;
		const writable = await handle.createWritable({ keepExistingData: false });

		return new FsaSink(handle, writable, created, wasEmpty);
	}

	async write(chunk: Uint8Array<ArrayBuffer>): Promise<void> {
		await this.writable.write(chunk);
	}

	async close(): Promise<SinkResult> {
		await this.writable.close();

		return { kind: 'saved' };
	}

	async abort(reason: SerializedError): Promise<void> {
		// Nothing written through a writable is visible until close(), so
		// abort() leaves no partial plaintext or ciphertext behind.
		await this.writable.abort(reason).catch(() => {});

		if (this.created) {
			await this.created.directory.removeEntry(this.created.name).catch(() => {});
		} else if (this.wasEmpty) {
			// showSaveFilePicker creates an empty file up front. Remove it, but
			// never a file that had content before (abort kept that intact).
			await this.handle.remove?.().catch(() => {});
		}
	}
}

class OpfsSink implements ByteSink {
	private position = 0;

	private constructor(
		private readonly directory: FileSystemDirectoryHandle,
		private readonly name: string,
		private readonly access: FileSystemSyncAccessHandle
	) {}

	static async open(name: string): Promise<OpfsSink> {
		const root = await navigator.storage.getDirectory();
		const directory = await root.getDirectoryHandle(OPFS_STAGING_DIR, { create: true });
		const handle = await directory.getFileHandle(name, { create: true });
		const access = await handle.createSyncAccessHandle();
		access.truncate(0);

		return new OpfsSink(directory, name, access);
	}

	async write(chunk: Uint8Array<ArrayBuffer>): Promise<void> {
		const written = this.access.write(chunk, { at: this.position });

		if (written !== chunk.length) throw new EngineError('storage-full', 'short write to OPFS');
		this.position += written;
	}

	async close(): Promise<SinkResult> {
		this.access.flush();
		this.access.close();

		return { kind: 'saved' };
	}

	async abort(): Promise<void> {
		try {
			this.access.close();
		} catch {}

		await this.directory.removeEntry(this.name).catch(() => {});
	}
}

class MemorySink implements ByteSink {
	private readonly parts: Uint8Array<ArrayBuffer>[] = [];

	async write(chunk: Uint8Array<ArrayBuffer>): Promise<void> {
		this.parts.push(chunk);
	}

	async close(): Promise<SinkResult> {
		return { kind: 'memory', blob: new Blob(this.parts) };
	}

	async abort(): Promise<void> {
		this.parts.length = 0;
	}
}

class DiscardSink implements ByteSink {
	private bytes = 0;

	async write(chunk: Uint8Array<ArrayBuffer>): Promise<void> {
		this.bytes += chunk.length;
	}

	async close(): Promise<SinkResult> {
		return { kind: 'discarded', bytes: this.bytes };
	}

	async abort(): Promise<void> {}
}

/** `name`, or `stem (n).ext` if `name` already exists in `directory`. */
async function uniqueName(directory: FileSystemDirectoryHandle, name: string): Promise<string> {
	const dot = name.lastIndexOf('.', name.endsWith('.age') ? name.length - 5 : undefined);
	const stem = dot > 0 ? name.slice(0, dot) : name;
	const extension = dot > 0 ? name.slice(dot) : '';

	for (let n = 0; ; n++) {
		const candidate = n === 0 ? name : `${stem} (${n})${extension}`;

		try {
			await directory.getFileHandle(candidate);
		} catch {
			return candidate;
		}
	}
}
