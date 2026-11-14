import { EngineError, serializeError } from '../errors.ts';
import { prepare, runFileTask, type Prepared } from './pipeline.ts';
import { CryptoPool } from './pool.ts';
import type { CoordinatorEvent, CoordinatorRequest } from './protocol.ts';

declare const self: DedicatedWorkerGlobalScope;

let pool: CryptoPool | null = null;
const running = new Map<number, AbortController>();

/** Headers opened by `check`, kept for their file's `run`. */
const checked = new Map<number, Prepared>();

const emit = (event: CoordinatorEvent) => self.postMessage(event);

self.onmessage = async ({ data }: MessageEvent<CoordinatorRequest>) => {
	switch (data.type) {
		case 'init':
			pool = new CryptoPool(data.pool);

			return;
		case 'check': {
			const operation = { mode: 'decrypt', credentials: data.credentials } as const;

			try {
				checked.set(data.id, await prepare(operation, data.source, data.batchChunks));
				emit({ type: 'checked', id: data.id });
			} catch (error) {
				emit({ type: 'failed', id: data.id, error: serializeError(error), opened: false });
			}

			return;
		}

		case 'cancel':
			running.get(data.id)?.abort(new EngineError('cancelled', 'cancelled'));

			return;
		case 'run': {
			const { task } = data;
			const prepared = checked.get(task.id);
			checked.delete(task.id);
			const controller = new AbortController();
			running.set(task.id, controller);
			let opened = false;

			const track = (event: CoordinatorEvent) => {
				if (event.type === 'opened') opened = true;
				emit(event);
			};

			try {
				if (!pool) throw new EngineError('internal', 'coordinator not initialized');
				const result = await runFileTask(task, pool, track, controller.signal, prepared);
				emit({ type: 'done', id: task.id, result });
			} catch (error) {
				emit({ type: 'failed', id: task.id, error: serializeError(error), opened });
			} finally {
				running.delete(task.id);
			}
		}
	}
};
