import type { ComponentProps, ReactNode } from 'react';
import { formatBytes } from '../strings.ts';

/*
 * Building blocks of the "Drop" design (variant A of the prototypes):
 * monochrome, oversized type, one centered card per step.
 */

export function Card({ children }: { children: ReactNode }) {
	return <div className="w-full max-w-lg">{children}</div>;
}

export function Kicker({ children }: { children: ReactNode }) {
	return (
		<p className="mb-4 text-sm font-medium tracking-wide text-neutral-400 uppercase">{children}</p>
	);
}

export function Headline({ children, tone }: { children: ReactNode; tone?: 'error' }) {
	return (
		<h1
			className={`text-3xl font-semibold tracking-tight sm:text-4xl ${tone === 'error' ? 'text-red-600 dark:text-red-400' : ''}`}
		>
			{children}
		</h1>
	);
}

export function FileLines({ files }: { files: ReadonlyArray<{ name: string; size: number }> }) {
	return (
		<ul className="space-y-1">
			{files.map((file, i) => (
				<li key={`${i}-${file.name}`} className="flex justify-between gap-4 text-xl">
					<span className="truncate">{file.name}</span>
					<span className="shrink-0 text-neutral-400 tabular-nums">{formatBytes(file.size)}</span>
				</li>
			))}
		</ul>
	);
}

export function BigButton({ className = '', ...props }: ComponentProps<'button'>) {
	return (
		<button
			type="button"
			{...props}
			className={`mt-8 w-full rounded-full bg-black py-4 text-lg font-medium text-white transition hover:bg-neutral-800 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-black disabled:cursor-not-allowed disabled:opacity-30 dark:bg-white dark:text-black dark:hover:bg-neutral-200 dark:focus-visible:outline-white ${className}`}
		/>
	);
}

export function OutlineButton({ className = '', ...props }: ComponentProps<'button'>) {
	return (
		<button
			type="button"
			{...props}
			className={`rounded-full border-2 border-black py-3 text-sm font-medium transition hover:bg-neutral-100 disabled:opacity-30 dark:border-white dark:hover:bg-neutral-900 ${className}`}
		/>
	);
}

export function TextButton({ className = '', ...props }: ComponentProps<'button'>) {
	return (
		<button
			type="button"
			{...props}
			className={`text-sm underline underline-offset-2 hover:text-neutral-500 ${className}`}
		/>
	);
}

/** Two-way pill switch, e.g. Passphrase | People, built on native radios. */
export function Segmented<T extends string>(props: {
	label: string;
	options: ReadonlyArray<{ value: T; label: string }>;
	value: T;
	onChange: (value: T) => void;
}) {
	return (
		<fieldset className="mt-8 grid grid-flow-col rounded-full bg-neutral-100 p-1 text-sm font-medium dark:bg-neutral-900">
			<legend className="sr-only">{props.label}</legend>
			{props.options.map((option) => (
				<label
					key={option.value}
					className="cursor-pointer rounded-full py-2 text-center text-neutral-500 transition hover:text-black has-checked:bg-white has-checked:text-black has-checked:shadow-sm has-focus-visible:outline-2 has-focus-visible:outline-black dark:hover:text-white dark:has-checked:bg-neutral-700 dark:has-checked:text-white"
				>
					<input
						type="radio"
						className="sr-only"
						name={props.label}
						value={option.value}
						checked={option.value === props.value}
						onChange={() => props.onChange(option.value)}
					/>
					{option.label}
				</label>
			))}
		</fieldset>
	);
}

/** A large input underlined in black, with an optional action on the right. */
export function LineField(props: {
	id: string;
	label: string;
	action?: ReactNode;
	input: ComponentProps<'input'>;
}) {
	return (
		<div className="mt-6">
			<label htmlFor={props.id} className="block text-sm text-neutral-500">
				{props.label}
			</label>
			<div className="mt-2 flex items-center gap-3 border-b-2 border-black pb-2 focus-within:border-neutral-500 dark:border-white">
				<input
					id={props.id}
					{...props.input}
					className={`w-full min-w-0 bg-transparent text-lg outline-none placeholder:text-neutral-300 dark:placeholder:text-neutral-700 ${props.input.className ?? ''}`}
				/>
				{props.action}
			</div>
		</div>
	);
}

export function Hint({ children, tone }: { children: ReactNode; tone?: 'error' | 'warning' }) {
	const color =
		tone === 'error'
			? 'text-red-600 dark:text-red-400'
			: tone === 'warning'
				? 'text-amber-700 dark:text-amber-400'
				: 'text-neutral-500';
	return (
		<p role={tone ? 'alert' : undefined} className={`mt-2 text-sm ${color}`}>
			{children}
		</p>
	);
}

export function MonoBox({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="mt-8 rounded-2xl bg-neutral-100 p-4 dark:bg-neutral-900">
			<p className="text-xs text-neutral-500">{label}</p>
			<p className="mt-2 font-mono text-xs break-all">{children}</p>
		</div>
	);
}
