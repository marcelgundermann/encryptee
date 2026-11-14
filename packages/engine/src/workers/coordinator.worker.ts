import { EngineError, serializeError } from '../errors.ts';
import { prepare, runFileTask, type Prepared } from './pipeline.ts';
import { CryptoPool } from './pool.ts';
import type {
	CoordinatorEvent,
	CoordinatorInit,
	CoordinatorRequest,
	TaskOperation
} from './protocol.ts';

declare const self: DedicatedWorkerGlobalScope;

const emit = (event: CoordinatorEvent) => self.postMessage(event);

self.onmessage = ({ data: init }: MessageEvent<CoordinatorInit>) => {
	const pool = new CryptoPool(init.pool);
	const { tuning } = init;
	const running = new Map<number, AbortController>();
	/** Headers opened by `check`, kept for their file's `run`. */
	const checked = new Map<number, Prepared>();

	self.onmessage = async ({ data }: MessageEvent<CoordinatorRequest>) => {
		switch (data.type) {
			case 'check':
				try {
					const operation: TaskOperation = { mode: 'decrypt', credentials: data.credentials };
					checked.set(data.id, await prepare(operation, data.source, tuning.batchChunks));
					emit({ type: 'checked', id: data.id });
				} catch (error) {
					emit({ type: 'failed', id: data.id, error: serializeError(error) });
				}

				return;
			case 'cancel':
				running.get(data.id)?.abort(new EngineError('cancelled', 'cancelled'));

				return;
			case 'run': {
				const { task } = data;
				const controller = new AbortController();
				running.set(task.id, controller);

				const preparation =
					checked.get(task.id) ?? prepare(task.operation, task.source, tuning.batchChunks);

				checked.delete(task.id);

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
