import { useNavigate } from '@tanstack/react-router';
import { useEffect, useEffectEvent } from 'react';

/*
 * `.age` files launched from the OS (PWA file handler, D15, Chromium) go to
 * the tool from any page. Launched on a content page, they wait here while
 * the tool opens.
 */
let waiting: File[] | null = null;
let toolListener: ((files: File[]) => void) | null = null;

/** The one consumer of the launch queue, in the root route. */
export function useLaunchQueue(): void {
	const navigate = useNavigate();

	const onLaunch = useEffectEvent((files: File[]) => {
		if (toolListener) {
			toolListener(files);
		} else {
			waiting = files;
			void navigate({ to: '/' });
		}
	});

	useEffect(() => {
		window.launchQueue?.setConsumer(async (params) => {
			const handles = params.files.filter((handle) => handle instanceof FileSystemFileHandle);

			// Opening the app without files is a launch too; it stays on its page.
			if (handles.length > 0)
				onLaunch(await Promise.all(handles.map((handle) => handle.getFile())));
		});
	}, []);
}

/** Gives the tool the files launched while it shows, and first those that opened it. */
export function useLaunchedFiles(onFiles: (files: File[]) => void): void {
	const receive = useEffectEvent(onFiles);

	useEffect(() => {
		const opened = waiting;

		waiting = null;
		toolListener = (files) => receive(files);

		if (opened) receive(opened);

		return () => {
			toolListener = null;
		};
	}, []);
}
