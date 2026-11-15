import { deserializeError } from '../errors.ts';
import type { HeaderRequest, HeaderResponse, Prepared, Source, TaskOperation } from './protocol.ts';

/** The coordinator's view of the header worker, which prepares one header at a time, in order. */
export class HeaderQueue {
	private readonly pending = new Map<number, PromiseWithResolvers<Prepared>>();
	private nextRequest = 0;

	constructor(private readonly port: MessagePort) {
		port.onmessage = ({ data }: MessageEvent<HeaderResponse>) => {
			const pending = this.pending.get(data.request);

			if (!pending) return;
			this.pending.delete(data.request);

			if (data.type === 'prepared') pending.resolve(data.prepared);
			else pending.reject(deserializeError(data.error));
		};

		port.start();
	}

	/** Seals a new header, or opens the file's header with its credentials. */
	prepare(operation: TaskOperation, source: Source, batchChunks: number): Promise<Prepared> {
		const request = this.nextRequest++;
		const pending = Promise.withResolvers<Prepared>();
		this.pending.set(request, pending);

		this.port.postMessage({
			type: 'prepare',
			request,
			source,
			operation,
			batchChunks
		} satisfies HeaderRequest);

		return pending.promise;
	}
}
