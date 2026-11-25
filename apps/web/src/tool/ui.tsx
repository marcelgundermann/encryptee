import { useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { formatBytes, strings } from '#/strings.ts';

/*
 * Building blocks of the "Drop" design (variant A of the prototypes):
 * monochrome, oversized type, one centered card per step.
 */

/** A phone or tablet: no autofocus there, since it would pop the keyboard up. */
export const touchScreen = () => matchMedia('(pointer: coarse)').matches;

/**
 * Focuses the element on mount if focus fell back to the page, as it does
 * when the control that had it unmounts with the step before. Never takes
 * focus from anything else, like an input that autofocused.
 */
export function useFocusIfLost<T extends HTMLElement>(enabled = true) {
	const ref = useRef<T>(null);

	useEffect(() => {
		if (enabled && document.activeElement === document.body) {
			ref.current?.focus();
		}
	}, [enabled]);

	return ref;
}

/** Copies text, which then counts as copied for two seconds. */
export function useCopy() {
	const [copied, setCopied] = useState<string | null>(null);

	const copy = async (text: string) => {
		await navigator.clipboard.writeText(text);
		setCopied(text);
		setTimeout(() => setCopied((current) => (current === text ? null : current)), 2000);
	};

	// Per text, so a new passphrase never shows as copied.
	return { isCopied: (text: string) => copied === text, copy };
}

export function Card({ children }: { children: ReactNode }) {
	return <div className="w-full max-w-lg">{children}</div>;
}

/** The step's h1. It takes focus when focus fell back to the page with the step before. */
export function StepHeading({ children, className }: { children: ReactNode; className: string }) {
	const ref = useFocusIfLost<HTMLHeadingElement>();

	return (
		<h1 ref={ref} tabIndex={-1} className={`focus:outline-hidden ${className}`}>
			{children}
		</h1>
	);
}

/** A small label over a step; `heading` makes it the step's h1 when there's no Headline. */
export function Kicker({ children, heading = false }: { children: ReactNode; heading?: boolean }) {
	const className = 'mb-4 text-sm font-medium tracking-wide text-muted uppercase';

	return heading ? (
		<StepHeading className={className}>{children}</StepHeading>
	) : (
		<p className={className}>{children}</p>
	);
}

export function Headline({ children, tone }: { children: ReactNode; tone?: 'error' }) {
	return (
		<StepHeading
			className={`text-3xl font-semibold tracking-tight text-balance sm:text-4xl ${tone === 'error' ? 'text-danger' : ''}`}
		>
			{children}
		</StepHeading>
	);
}

const SHOWN_FILES = 5;

/** The files a list shows before "and N more"; one more is shown rather than "and 1 more file". */
export function shownFiles<T>(files: readonly T[]) {
	return files.length > SHOWN_FILES + 1 ? files.slice(0, SHOWN_FILES) : files;
}

/** The first few files, then a count, so a big selection never pushes the button away. */
export function FileLines({ files }: { files: ReadonlyArray<{ name: string; size: number }> }) {
	const shown = shownFiles(files);

	return (
		<ul className="space-y-1">
			{shown.map((file, i) => (
				<li key={`${i}-${file.name}`} className="flex justify-between gap-4 text-xl">
					<span className="truncate" translate="no">
						{file.name}
					</span>
					<span className="shrink-0 text-muted tabular-nums">{formatBytes(file.size)}</span>
				</li>
			))}
			{shown.length < files.length && (
				<li className="text-xl text-muted">
					{strings.selection.more(files.length - shown.length)}
				</li>
			)}
		</ul>
	);
}

/** The arrow on a button that moves to the next step, kept out of its name. */
export function Arrow() {
	return <span aria-hidden="true">{' →'}</span>;
}

export function BigButton({ className = '', ...props }: ComponentProps<'button'>) {
	return (
		<button
			type="button"
			{...props}
			className={`focus-ring mt-8 w-full rounded-full bg-fg py-4 text-lg font-medium text-canvas transition-[scale,background-color] duration-150 ease-out enabled:hover:bg-fg/85 disabled:cursor-not-allowed disabled:opacity-30 motion-safe:enabled:active:scale-[0.97] ${className}`}
		/>
	);
}

export function OutlineButton({ className = '', ...props }: ComponentProps<'button'>) {
	return (
		<button
			type="button"
			{...props}
			className={`focus-ring rounded-full border-2 border-fg py-3 text-sm font-medium transition-[scale,background-color] duration-150 ease-out enabled:hover:bg-surface disabled:opacity-30 motion-safe:enabled:active:scale-[0.97] ${className}`}
		/>
	);
}

export function TextButton({
	className = '',
	tone,
	...props
}: ComponentProps<'button'> & { tone?: 'muted' }) {
	const color = tone === 'muted' ? 'text-muted hover:text-fg' : 'hover:text-muted';

	return (
		<button
			type="button"
			{...props}
			className={`hit-area focus-ring text-sm underline underline-offset-2 transition-colors disabled:opacity-50 ${color} ${className}`}
		/>
	);
}

/** `labels[shown]`, in the width of the widest label, so swapping them moves nothing. */
export function StableLabel({ labels, shown }: { labels: readonly string[]; shown: number }) {
	return (
		<span className="inline-grid">
			{labels.map((label, i) => (
				<span key={label} className={`col-start-1 row-start-1 ${i === shown ? '' : 'invisible'}`}>
					{label}
				</span>
			))}
		</span>
	);
}

/** A pill switch, e.g. Passphrase | Public keys, built on native radios. */
export function Segmented<T extends string>(props: {
	label: string;
	options: ReadonlyArray<{ value: T; label: string }>;
	value: T;
	onChange: (value: T) => void;
}) {
	const name = useId();
	const index = props.options.findIndex((option) => option.value === props.value);

	return (
		<fieldset className="relative mt-8 grid auto-cols-fr grid-flow-col rounded-full bg-surface p-1 text-sm font-medium">
			<legend className="sr-only">{props.label}</legend>
			{/* The pill slides to the chosen option, so the switch reads as one control. */}
			<span
				aria-hidden="true"
				className="absolute inset-y-1 left-1 rounded-full bg-raised shadow-sm motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.32,0.72,0,1)]"
				style={{
					width: `calc((100% - 0.5rem) / ${props.options.length})`,
					transform: `translateX(${index * 100}%)`
				}}
			/>
			{props.options.map((option) => (
				<label
					key={option.value}
					className="relative cursor-pointer rounded-full py-3 text-center text-muted transition-colors hover:text-fg has-checked:text-fg has-focus-visible:outline-2 has-focus-visible:outline-fg"
				>
					<input
						type="radio"
						className="sr-only"
						name={name}
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
			<label htmlFor={props.id} className="block text-sm text-muted">
				{props.label}
			</label>
			{/* Focus thickens the underline to 4px with a shadow, which moves nothing. */}
			<div className="mt-2 flex items-center gap-4 border-b-2 border-fg pb-2 focus-within:shadow-[0_2px_0_0_var(--color-fg)]">
				<input
					id={props.id}
					{...props.input}
					className={`w-full min-w-0 bg-transparent text-lg outline-hidden placeholder:text-ghost ${props.input.className ?? ''}`}
				/>
				{props.action}
			</div>
		</div>
	);
}

export function Hint({
	children,
	tone,
	id
}: {
	children: ReactNode;
	tone?: 'error' | 'warning';
	id?: string;
}) {
	const color =
		tone === 'error' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-muted';

	return (
		<p id={id} role={tone ? 'alert' : undefined} className={`mt-2 text-sm ${color}`}>
			{children}
		</p>
	);
}

export function MonoBox({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="mt-8 rounded-2xl bg-surface p-4">
			<p className="text-xs text-muted">{label}</p>
			<p className="mt-2 font-mono text-sm break-all select-all">{children}</p>
		</div>
	);
}
