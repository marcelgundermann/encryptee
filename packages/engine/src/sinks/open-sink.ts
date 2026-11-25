import { deserializeError, saveError, type SerializedError } from '../errors.ts';
import { numberedName } from '../format/names.ts';
import type { ByteSink, SinkDescriptor, SinkResult } from './sink.ts';
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
		case 'file':
			return saving(() => FsaSink.open(descriptor.handle, null));
		case 'directory':
			return saving(async () => {
				const name = await uniqueName(descriptor.handle, descriptor.name);
				const handle = await descriptor.handle.getFileHandle(name, { create: true });

				return FsaSink.open(handle, { directory: descriptor.handle, name });
			});

		case 'sw-download':
			return new SwDownloadSink(descriptor.port);
		case 'memory':
			return new MemorySink();
		case 'discard':
			return new DiscardSink();
	}
}

/** Runs a step that saves. What the browser throws in it is a failed save, not a bug. */
async function saving<T>(step: () => Promise<T>): Promise<T> {
	try {
		return await step();
	} catch (cause) {
		throw deserializeError(saveError(cause));
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
		await saving(() => this.writable.write(chunk));
	}

	async drain(): Promise<void> {}

	async close(): Promise<SinkResult> {
		await saving(() => this.writable.close());

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

class MemorySink implements ByteSink {
	private readonly parts: Uint8Array<ArrayBuffer>[] = [];

	async write(chunk: Uint8Array<ArrayBuffer>): Promise<void> {
		this.parts.push(chunk);
	}

	async drain(): Promise<void> {}

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

	async drain(): Promise<void> {}

	async close(): Promise<SinkResult> {
		return { kind: 'discarded', bytes: this.bytes };
	}

	async abort(): Promise<void> {}
}

/** `name`, or the first numbered name `directory` doesn't have yet. */
async function uniqueName(directory: FileSystemDirectoryHandle, name: string): Promise<string> {
	for (let n = 0; ; n++) {
		const candidate = numberedName(name, n);

		try {
			await directory.getFileHandle(candidate);
		} catch {
			return candidate;
		}
	}
}
