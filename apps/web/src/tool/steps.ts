import type { Job, JobStatus } from '@encryptee/engine';
import type { Selection } from './selection.ts';

/** What the tool shows: what the chosen files are, or the job they became. */
type Step = Selection | { kind: 'job'; job: Job };

export interface Steps {
	step: Step;
	/** Files whose headers are being read; their selection replaces the step when it's ready. */
	reading: File[] | null;
	/** Counts the selections, so each one gets a fresh card. */
	selections: number;
}

export type StepEvent =
	/** Files were dropped, opened or launched, and their headers are being read. */
	| { type: 'chose'; files: File[] }
	| { type: 'classified'; files: File[]; selection: Selection }
	| { type: 'started'; job: Job }
	/** Back, "Choose other files" or "Do another". */
	| { type: 'reset' }
	/** The wordmark. */
	| { type: 'home' };

export const firstStep: Steps = {
	step: { kind: 'none' },
	reading: null,
	selections: 0
};

/**
 * The only way the tool's step changes. Choosing files changes nothing on
 * screen until they're read, and then only if nothing replaced them meanwhile:
 * a later choice, a job, Back or the wordmark.
 */
export function nextStep(steps: Steps, event: StepEvent): Steps {
	switch (event.type) {
		case 'chose':
			return { ...steps, reading: event.files };
		case 'classified':
			if (event.files !== steps.reading) return steps;

			return {
				step: event.selection,
				reading: null,
				selections: steps.selections + 1
			};
		case 'started':
			return { ...steps, step: { kind: 'job', job: event.job }, reading: null };
		case 'reset':
			return { ...steps, step: { kind: 'none' }, reading: null };
		case 'home':
			return {
				...steps,
				step: steps.step.kind === 'job' ? steps.step : { kind: 'none' },
				reading: null
			};
	}
}

/**
 * The step's name, for the layout and the card's key: a job's `job-<status>`,
 * or the selection's kind.
 */
export function stepName(steps: Steps, jobStatus: JobStatus | null): string {
	return steps.step.kind === 'job' ? `job-${jobStatus}` : steps.step.kind;
}
