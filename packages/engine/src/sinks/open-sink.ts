import { EngineError, type SerializedError } from '../errors.ts';
import { OPFS_STAGING_DIR, type ByteSink, type SinkDescriptor, type SinkResult } from './sink.ts';
import { SW_MAX_MESSAGE_BYTES, type DownloadPortMessage } from './sw-protocol.ts';

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
			// SAFETY: `remove()` is a Chromium extension the typings lack; it stays
			// optional here and is only called through `?.`.
			const removable = this.handle as FileSystemFileHandle & { remove?: () => Promise<void> };
			await removable.remove?.().catch(() => {});
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

		return { kind: 'opfs', path: [OPFS_STAGING_DIR, this.name] };
	}

	async abort(): Promise<void> {
		try {
			this.access.close();
		} catch {}

		await this.directory.removeEntry(this.name).catch(() => {});
	}
}

/**
 * Feeds the service worker's download stream. Each message is at most 256 KiB
 * (Safari drops larger ones) and waits for a credit from the SW, so a slow disk
 * on the download side throttles the whole pipeline.
 */
class SwDownloadSink implements ByteSink {
	private credits = 0;
	private waiting: (() => void) | null = null;
	private cancelled = false;

	constructor(private readonly port: MessagePort) {
		port.onmessage = ({ data }: MessageEvent<DownloadPortMessage>) => {
			if (data.type === 'credit') this.credits += data.credits;

			if (data.type === 'cancelled') this.cancelled = true;
			this.waiting?.();
			this.waiting = null;
		};

		port.start();
	}

	async write(chunk: Uint8Array<ArrayBuffer>): Promise<void> {
		for (let offset = 0; offset < chunk.length; offset += SW_MAX_MESSAGE_BYTES) {
			while (this.credits === 0 && !this.cancelled) {
				await new Promise<void>((resolve) => (this.waiting = resolve));
			}

			if (this.cancelled) throw new EngineError('cancelled', 'the download was cancelled');
			this.credits--;
			const piece = chunk.slice(offset, offset + SW_MAX_MESSAGE_BYTES).buffer;
			this.post({ type: 'chunk', data: piece }, [piece]);
		}
	}

	async close(): Promise<SinkResult> {
		this.post({ type: 'end' });
		this.port.close();

		return { kind: 'saved' };
	}

	async abort(reason: SerializedError): Promise<void> {
		this.post({ type: 'abort', message: reason.message });
		this.port.close();
	}

	private post(message: DownloadPortMessage, transfer: Transferable[] = []): void {
		this.port.postMessage(message, transfer);
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
