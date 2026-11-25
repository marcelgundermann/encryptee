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
			return saving(() => FsaSink.intoFile(descriptor.handle));
		case 'directory':
			return saving(() => FsaSink.intoDirectory(descriptor.handle, descriptor.name));
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

/** Writes to the user's disk through a `FileSystemWritableFileStream`. */
class FsaSink implements ByteSink {
	private constructor(
		private readonly writable: FileSystemWritableFileStream,
		/** Removes the file the save made, if it made one. Runs after a failure, and may throw. */
		private readonly discard: () => Promise<void>
	) {}

	static async intoFile(handle: FileSystemFileHandle): Promise<FsaSink> {
		// showSaveFilePicker creates an empty file up front. Remove that, but
		// never a file that had content before (abort keeps it intact).
		const wasEmpty = (await handle.getFile()).size === 0;

		return new FsaSink(await handle.createWritable({ keepExistingData: false }), async () => {
			if (wasEmpty) await handle.remove?.();
		});
	}

	/** Into a new file in `directory` named `name`, or numbered if that's taken. */
	static async intoDirectory(directory: FileSystemDirectoryHandle, name: string): Promise<FsaSink> {
		const unique = await uniqueName(directory, name);
		const handle = await directory.getFileHandle(unique, { create: true });

		return new FsaSink(await handle.createWritable({ keepExistingData: false }), () =>
			directory.removeEntry(unique)
		);
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
		await this.discard().catch(() => {});
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

/** `name`, or the first numbered name no file or folder in `directory` has yet. */
async function uniqueName(directory: FileSystemDirectoryHandle, name: string): Promise<string> {
	for (let n = 0; ; n++) {
		const candidate = numberedName(name, n);

		try {
			await directory.getFileHandle(candidate);
		} catch (cause) {
			const error = cause instanceof DOMException ? cause.name : null;

			if (error === 'NotFoundError') return candidate;

			// TypeMismatchError: a folder has the name.
			if (error !== 'TypeMismatchError') throw cause;
		}
	}
}
