import type { ReactNode } from 'react';

export function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<label className="flex flex-1 flex-col gap-1 text-sm [&_input:not([type=file])]:rounded [&_input:not([type=file])]:border [&_input:not([type=file])]:px-2 [&_input:not([type=file])]:py-1.5 [&_textarea]:rounded [&_textarea]:border [&_textarea]:p-2 [&_textarea]:font-mono">
			<span className="font-medium">{label}</span>
			{children}
		</label>
	);
}

export function PrimaryButton({ disabled, children }: { disabled?: boolean; children: ReactNode }) {
	return (
		<button
			type="submit"
			disabled={disabled}
			className="self-start rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
		>
			{children}
		</button>
	);
}

export function Notice({ tone, children }: { tone?: 'error'; children: ReactNode }) {
	return (
		<div
			role={tone === 'error' ? 'alert' : 'status'}
			className={
				tone === 'error'
					? 'rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
					: 'rounded border border-neutral-300 bg-neutral-50 p-3 text-sm dark:border-neutral-700 dark:bg-neutral-900'
			}
		>
			{children}
		</div>
	);
}
