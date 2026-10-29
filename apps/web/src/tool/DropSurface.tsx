import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { strings } from '../strings.ts';

/**
 * Makes the whole window a drop target. Returns whether files are being
 * dragged over it, so the UI can show the drop surface on top of any step.
 */
export function useWindowDrop(onFiles: (files: File[]) => void, enabled: boolean): boolean {
	const [dragging, setDragging] = useState(false);
	const depth = useRef(0);
	const receive = useEffectEvent((files: File[]) => {
		if (enabled && files.length > 0) onFiles(files);
	});

	useEffect(() => {
		const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;
		const onEnter = (event: DragEvent) => {
			if (!hasFiles(event)) return;
			depth.current++;
			setDragging(true);
		};
		const onLeave = (event: DragEvent) => {
			if (!hasFiles(event)) return;
			depth.current = Math.max(0, depth.current - 1);
			if (depth.current === 0) setDragging(false);
		};
		const onOver = (event: DragEvent) => {
			if (hasFiles(event)) event.preventDefault();
		};
		const onDrop = (event: DragEvent) => {
			event.preventDefault();
			depth.current = 0;
			setDragging(false);
			receive([...(event.dataTransfer?.files ?? [])]);
		};
		addEventListener('dragenter', onEnter);
		addEventListener('dragleave', onLeave);
		addEventListener('dragover', onOver);
		addEventListener('drop', onDrop);
		return () => {
			removeEventListener('dragenter', onEnter);
			removeEventListener('dragleave', onLeave);
			removeEventListener('dragover', onOver);
			removeEventListener('drop', onDrop);
		};
	}, []);

	return dragging && enabled;
}

/** The empty state: the page is one big drop surface that also opens the file chooser. */
export function DropSurface(props: { onFiles: (files: File[]) => void; dragging: boolean }) {
	const input = useRef<HTMLInputElement>(null);
	return (
		<>
			<button
				type="button"
				onClick={() => input.current?.click()}
				className={`group flex h-[60vh] w-full max-w-5xl flex-col items-start justify-end rounded-[2rem] border-2 border-dashed p-8 text-left transition focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-black sm:p-10 dark:focus-visible:outline-white ${
					props.dragging
						? 'border-black bg-neutral-50 dark:border-white dark:bg-neutral-900'
						: 'border-neutral-300 hover:border-black dark:border-neutral-700 dark:hover:border-white'
				}`}
			>
				<span className="text-5xl leading-[0.95] font-semibold tracking-tighter sm:text-8xl">
					{strings.drop.title}
					<br />
					<span className="text-neutral-300 group-hover:text-neutral-400 dark:text-neutral-700 dark:group-hover:text-neutral-500">
						{props.dragging ? strings.drop.release : strings.drop.subtitle}
					</span>
				</span>
				<span className="mt-8 text-sm text-neutral-500">
					<span className="underline underline-offset-2">{strings.drop.choose}</span> ·{' '}
					{strings.drop.facts}
				</span>
			</button>
			<input
				ref={input}
				type="file"
				multiple
				hidden
				aria-label={strings.drop.choose}
				onChange={(event) => {
					props.onFiles([...(event.currentTarget.files ?? [])]);
					event.currentTarget.value = '';
				}}
			/>
		</>
	);
}

/** Full-window drop target shown while dragging over any other step. */
export function DropOverlay() {
	return (
		<div className="pointer-events-none fixed inset-4 z-40 flex items-end rounded-[2rem] border-2 border-dashed border-black bg-white/90 p-10 dark:border-white dark:bg-neutral-950/90">
			<span className="text-5xl font-semibold tracking-tighter sm:text-8xl">
				{strings.drop.release}
			</span>
		</div>
	);
}
