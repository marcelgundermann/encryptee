import type { Job, JobSnapshot } from '@encryptee/engine';
import { useSyncExternalStore } from 'react';

const noSubscribe = () => () => {};
const noSnapshot = () => null;

/** The running job's snapshot, re-rendered at the engine's ~10 Hz progress rate. */
export function useJobSnapshot(job: Job | null): JobSnapshot | null {
	return useSyncExternalStore(job?.subscribe ?? noSubscribe, job?.getSnapshot ?? noSnapshot);
}
