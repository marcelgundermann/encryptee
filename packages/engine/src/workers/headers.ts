import { deserializeError } from '../errors.ts';
import type { HeaderRequest, HeaderResponse, Prepared, Source, TaskOperation } from './protocol.ts';

interface Member {
	port: MessagePort;
	busy: number;
}

/** The coordinator's view of the header workers, each of which prepares one header at a time. */
export class HeaderPool {
	private readonly members: Member[];
	private readonly pending = new Map<number, PromiseWithResolvers<Prepared>>();
	private nextRequest = 0;

	constructor(ports: MessagePort[]) {
		this.members = ports.map((port) => ({ port, busy: 0 }));

		for (const member of this.members) {
			member.port.onmessage = ({ data }: MessageEvent<HeaderResponse>) => {
				member.busy--;
				this.receive(data);
			};

			member.port.start();
		}
	}

	/** Seals a new header, or opens the file's header with its credentials, on the least busy worker. */
	prepare(operation: TaskOperation, source: Source, batchChunks: number): Promise<Prepared> {
		const member = this.members.reduce((a, b) => (b.busy < a.busy ? b : a));
		const request = this.nextRequest++;
		const pending = Promise.withResolvers<Prepared>();
		this.pending.set(request, pending);
		member.busy++;

		member.port.postMessage({
			type: 'prepare',
			request,
			source,
			operation,
			batchChunks
		} satisfies HeaderRequest);

		return pending.promise;
	}

	private receive(response: HeaderResponse): void {
		const pending = this.pending.get(response.request);

		if (!pending) return;
		this.pending.delete(response.request);

		if (response.type === 'prepared') pending.resolve(response.prepared);
		else pending.reject(deserializeError(response.error));
	}
}
