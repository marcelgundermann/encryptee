import { EngineError, serializeError } from '../errors.ts';
import { HeaderPool } from './headers.ts';
import { runFileTask } from './pipeline.ts';
import { CryptoPool } from './pool.ts';
import type {
	CoordinatorEvent,
	CoordinatorInit,
	CoordinatorRequest,
	Prepared,
	Source,
	TaskOperation
} from './protocol.ts';

declare const self: DedicatedWorkerGlobalScope;

const emit = (event: CoordinatorEvent) => self.postMessage(event);

self.onmessage = ({ data: init }: MessageEvent<CoordinatorInit>) => {
	const pool = new CryptoPool(init.pool);
	const headers = new HeaderPool(init.headers);
	const { tuning } = init;
	const running = new Map<number, AbortController>();
	/** Headers asked for ahead of their file's `run`, by `check` or `prepare`. */
	const prepared = new Map<number, Promise<Prepared>>();

	const prepare = (id: number, operation: TaskOperation, source: Source) => {
		const header = headers.prepare(operation, source, tuning.batchChunks);
		header.catch(() => {}); // Reported by its check or its run; no unhandled rejection before that.
		prepared.set(id, header);

		return header;
	};

	self.onmessage = async ({ data }: MessageEvent<CoordinatorRequest>) => {
		switch (data.type) {
			case 'check':
				try {
					await prepare(data.id, { mode: 'decrypt', credentials: data.credentials }, data.source);
					emit({ type: 'checked', id: data.id });
				} catch (error) {
					emit({ type: 'failed', id: data.id, error: serializeError(error) });
				}

				return;
			case 'prepare':
				void prepare(data.id, data.operation, data.source);

				return;
			case 'cancel':
				running.get(data.id)?.abort(new EngineError('cancelled', 'cancelled'));

				return;
			case 'run': {
				const { task } = data;
				const controller = new AbortController();
				running.set(task.id, controller);

				const preparation = prepared.get(task.id) ?? prepare(task.id, task.operation, task.source);

				prepared.delete(task.id);

				try {
					const { signal } = controller;
					const result = await runFileTask(task, preparation, pool, tuning, emit, signal);

					emit({ type: 'done', id: task.id, result });
				} catch (error) {
					emit({ type: 'failed', id: task.id, error: serializeError(error) });
				} finally {
					running.delete(task.id);
				}
			}
		}
	};
};
