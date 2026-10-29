import { EngineError, deserializeError } from '../errors.ts';
import type { BatchPosition } from '../payload/batch.ts';
import type { Backend } from '../payload/cipher.ts';
import type { CryptoRequest, CryptoResponse } from './protocol.ts';

interface Member {
	port: MessagePort;
	busy: number;
}

interface Pending {
	member: Member;
	resolve: (data: Uint8Array<ArrayBuffer>) => void;
	reject: (error: Error) => void;
}

/** The coordinator's view of the crypto workers, one MessagePort each. */
export class CryptoPool {
	private readonly members: Member[];
	private readonly pending = new Map<number, Pending>();
	private ready: Array<{ resolve: (b: Backend) => void; reject: (e: Error) => void }> = [];
	private nextTask = 0;

	constructor(ports: MessagePort[]) {
		if (ports.length === 0) throw new EngineError('internal', 'empty crypto pool');
		this.members = ports.map((port) => ({ port, busy: 0 }));

		for (const member of this.members) {
			member.port.onmessage = ({ data }: MessageEvent<CryptoResponse>) => this.receive(data);
			member.port.start();
		}
	}

	get size(): number {
		return this.members.length;
	}

	/** Hands every worker the payload key; resolves with the backend they chose. */
	async setKey(key: Uint8Array, backend?: Backend): Promise<Backend> {
		const replies = this.members.map(
			(member) =>
				new Promise<Backend>((resolve, reject) => {
					this.ready.push({ resolve, reject });
					this.post(member, { type: 'key', key, backend });
				})
		);

		const backends = await Promise.all(replies);

		return backends[0]!;
	}

	/** Runs one batch on the least busy worker. Transfers `data`. */
	run(
		mode: 'seal' | 'open',
		position: BatchPosition,
		data: ArrayBuffer
	): Promise<Uint8Array<ArrayBuffer>> {
		const member = this.members.reduce((a, b) => (b.busy < a.busy ? b : a));
		const task = this.nextTask++;
		member.busy++;

		return new Promise((resolve, reject) => {
			this.pending.set(task, { member, resolve, reject });
			this.post(member, { type: mode, task, ...position, data }, [data]);
		});
	}

	/** Drops the key in every worker. */
	forget(): void {
		for (const member of this.members) this.post(member, { type: 'forget' });
	}

	private receive(message: CryptoResponse): void {
		if (message.type === 'ready') {
			this.ready.shift()?.resolve(message.backend);

			return;
		}

		if (message.type === 'error' && message.task === null) {
			this.ready.shift()?.reject(deserializeError(message.error));

			return;
		}

		const pending = this.pending.get(message.task!);

		if (!pending) return;
		this.pending.delete(message.task!);
		pending.member.busy--;

		if (message.type === 'result') pending.resolve(new Uint8Array(message.data));
		else pending.reject(deserializeError(message.error));
	}

	private post(member: Member, message: CryptoRequest, transfer: Transferable[] = []): void {
		member.port.postMessage(message, transfer);
	}
}
