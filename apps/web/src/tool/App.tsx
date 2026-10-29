import {
	chooseSink,
	detectCapabilities,
	generatePassphrase,
	inspectFile,
	mixesPqAndClassic,
	parseShareLink,
	preflight,
	readKeyFile,
	type Job,
	type PreflightWarning
} from '@encryptee/engine';
import { useEffect, useEffectEvent, useState, type FormEvent, type ReactNode } from 'react';
import { formatBytes, strings } from '../strings.ts';
import { pickAndStart, useJobSnapshot } from './job.ts';
import { KeysPanel } from './KeysPanel.tsx';
import { Field, Notice, PrimaryButton } from './ui.tsx';
import { buildDate, useUpdates } from './updates.ts';

/*
 * Functional skeleton of the tool on the engine's Job API. The visual design
 * comes from the prototype chosen in plan step 5; keep logic out of markup so
 * it carries over.
 */

type Selection =
	| { kind: 'none' }
	| { kind: 'encrypt'; files: File[] }
	| { kind: 'decrypt'; files: File[]; unlock: 'passphrase' | 'private-key' }
	| { kind: 'error'; message: string };

async function classify(files: File[]): Promise<Selection> {
	if (files.length === 0) return { kind: 'none' };
	const infos = await Promise.all(files.map(inspectFile));
	if (infos.some((info) => info.kind === 'legacy'))
		return { kind: 'error', message: strings.files.legacy };
	if (infos.some((info) => info.kind === 'age-armored')) {
		return { kind: 'error', message: strings.files.armored };
	}
	const encrypted = infos.filter((info) => info.kind === 'age');
	if (encrypted.length === 0) return { kind: 'encrypt', files };
	if (encrypted.length !== files.length) return { kind: 'error', message: strings.files.mixed };
	const passphraseOnly = encrypted.every((info) => info.unlock === 'passphrase');
	return { kind: 'decrypt', files, unlock: passphraseOnly ? 'passphrase' : 'private-key' };
}

export function App() {
	const [tab, setTab] = useState<'tool' | 'keys'>('tool');
	const [selection, setSelection] = useState<Selection>({ kind: 'none' });
	// Share links: encryptee.io/#to=age1… open the encrypt form for that key (D10).
	const [presetKey] = useState(() => parseShareLink(location.hash));
	const [job, setJob] = useState<Job | null>(null);
	const snapshot = useJobSnapshot(job);
	const running = snapshot?.status === 'running';
	const { safety, updateReady, applyUpdate } = useUpdates(running);

	const select = useEffectEvent((files: File[]) => void classify(files).then(setSelection));
	const dropFiles = useEffectEvent((files: File[]) => {
		if (!running) select(files);
	});

	useEffect(() => {
		// The key now lives in state; drop it from the address bar.
		if (presetKey) history.replaceState(null, '', location.pathname);
	}, [presetKey]);

	useEffect(() => {
		// PWA file handler for .age files (D15, Chromium).
		const queue = (window as { launchQueue?: LaunchQueue }).launchQueue;
		queue?.setConsumer(async (params) => {
			const handles = params.files as FileSystemFileHandle[];
			select(await Promise.all(handles.map((handle) => handle.getFile())));
		});
	}, []);

	useEffect(() => {
		const onDrop = (event: DragEvent) => {
			event.preventDefault();
			if (event.dataTransfer) dropFiles([...event.dataTransfer.files]);
		};
		const onDragOver = (event: DragEvent) => event.preventDefault();
		addEventListener('drop', onDrop);
		addEventListener('dragover', onDragOver);
		return () => {
			removeEventListener('drop', onDrop);
			removeEventListener('dragover', onDragOver);
		};
	}, []);

	const reset = () => {
		setJob(null);
		setSelection({ kind: 'none' });
	};

	return (
		<div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-4 py-6">
			<header className="flex flex-wrap items-center gap-x-6 gap-y-2">
				<h1 className="text-lg font-semibold">{strings.appName}</h1>
				<nav className="flex flex-wrap gap-4 text-sm">
					<TabButton active={tab === 'tool'} onClick={() => setTab('tool')}>
						{strings.nav.tool}
					</TabButton>
					<TabButton active={tab === 'keys'} onClick={() => setTab('keys')}>
						{strings.nav.keys}
					</TabButton>
					<a href="/how-it-works/">{strings.nav.howItWorks}</a>
					<a href="/security/">{strings.nav.security}</a>
					<a href="/faq/">{strings.nav.faq}</a>
				</nav>
			</header>

			{updateReady && (
				<Notice>
					{strings.update.ready}{' '}
					<button className="underline" onClick={applyUpdate}>
						{strings.update.reload}
					</button>
				</Notice>
			)}
			{safety === 'unsafe' && <Notice tone="error">{strings.update.unsafe}</Notice>}
			{safety === 'unknown' && !navigator.onLine && (
				<Notice>{strings.update.offline(buildDate)}</Notice>
			)}

			{tab === 'keys' ? (
				<KeysPanel />
			) : job ? (
				<JobView job={job} onReset={reset} />
			) : (
				<main className="flex flex-col gap-6">
					<p className="text-neutral-600 dark:text-neutral-400">{strings.tagline}</p>
					<FilePicker onSelect={select} />
					{selection.kind === 'error' && <Notice tone="error">{selection.message}</Notice>}
					{selection.kind === 'encrypt' && (
						<EncryptForm
							files={selection.files}
							presetKey={presetKey}
							disabled={safety === 'unsafe'}
							onStart={setJob}
						/>
					)}
					{selection.kind === 'decrypt' && (
						<DecryptForm
							files={selection.files}
							unlock={selection.unlock}
							disabled={safety === 'unsafe'}
							onStart={setJob}
						/>
					)}
				</main>
			)}
		</div>
	);
}

interface LaunchQueue {
	setConsumer(consumer: (params: { files: readonly FileSystemHandle[] }) => void): void;
}

function FilePicker({ onSelect }: { onSelect: (files: File[]) => void }) {
	return (
		<label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed border-neutral-300 p-8 text-center dark:border-neutral-700">
			<span className="font-medium">{strings.files.choose}</span>
			<span className="text-sm text-neutral-500">{strings.files.drop}</span>
			<input
				type="file"
				multiple
				className="sr-only"
				onChange={(event) => onSelect([...(event.currentTarget.files ?? [])])}
			/>
		</label>
	);
}

function usePreflightWarnings(mode: 'encrypt' | 'decrypt', files: File[]): PreflightWarning[] {
	const [warnings, setWarnings] = useState<PreflightWarning[]>([]);
	useEffect(() => {
		const capabilities = detectCapabilities();
		void preflight({
			mode,
			sizes: files.map((file) => file.size),
			sink: chooseSink(capabilities, files.length),
			capabilities
		}).then((result) => setWarnings(result.warnings));
	}, [mode, files]);
	return warnings;
}

function FileSummary({ files, mode }: { files: File[]; mode: 'encrypt' | 'decrypt' }) {
	const warnings = usePreflightWarnings(mode, files);
	return (
		<>
			<ul className="text-sm">
				{files.map((file) => (
					<li key={file.name + file.size}>
						{file.name} · {formatBytes(file.size)}
					</li>
				))}
			</ul>
			{warnings.map((warning) => (
				<Notice key={warning.code}>{strings.warnings[warning.code]}</Notice>
			))}
		</>
	);
}

function EncryptForm(props: {
	files: File[];
	presetKey: string | null;
	disabled: boolean;
	onStart: (job: Job) => void;
}) {
	const [method, setMethod] = useState<'passphrase' | 'public-keys'>(
		props.presetKey ? 'public-keys' : 'passphrase'
	);
	const [passphrase, setPassphrase] = useState('');
	const [confirm, setConfirm] = useState('');
	const [generated, setGenerated] = useState(false);
	const [keysText, setKeysText] = useState(props.presetKey ?? '');
	const [error, setError] = useState<string | null>(null);
	const publicKeys = keysText.split(/\s+/).filter(Boolean);
	const mismatch =
		method === 'passphrase' && !generated && confirm !== '' && confirm !== passphrase;
	const ready =
		method === 'passphrase'
			? passphrase !== '' && (generated || confirm === passphrase)
			: publicKeys.length > 0;

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		const result = await pickAndStart({
			mode: 'encrypt',
			files: props.files,
			credentials:
				method === 'passphrase'
					? { kind: 'passphrase', passphrase }
					: { kind: 'public-keys', publicKeys }
		});
		if (result.job) props.onStart(result.job);
		else if (result.reason === 'unsupported') setError(strings.unsupported);
	};

	return (
		<form className="flex flex-col gap-4" onSubmit={submit}>
			<h2 className="text-xl font-semibold">{strings.encrypt.title}</h2>
			<FileSummary files={props.files} mode="encrypt" />
			<fieldset className="flex gap-4">
				<Radio checked={method === 'passphrase'} onChange={() => setMethod('passphrase')}>
					{strings.encrypt.withPassphrase}
				</Radio>
				<Radio checked={method === 'public-keys'} onChange={() => setMethod('public-keys')}>
					{strings.encrypt.withPublicKeys}
				</Radio>
			</fieldset>
			{method === 'passphrase' ? (
				<>
					<Field label={strings.encrypt.passphrase}>
						<input
							type={generated ? 'text' : 'password'}
							autoComplete="new-password"
							value={passphrase}
							onChange={(event) => {
								setPassphrase(event.target.value);
								setGenerated(false);
							}}
						/>
					</Field>
					{!generated && (
						<Field label={strings.encrypt.confirm}>
							<input
								type="password"
								autoComplete="new-password"
								value={confirm}
								onChange={(event) => setConfirm(event.target.value)}
							/>
						</Field>
					)}
					{mismatch && <p className="text-sm text-red-600">{strings.encrypt.mismatch}</p>}
					<button
						type="button"
						className="self-start text-sm underline"
						onClick={() => {
							setPassphrase(generatePassphrase());
							setGenerated(true);
						}}
					>
						{strings.encrypt.generate}
					</button>
					{generated && <Notice>{strings.encrypt.generatedHint}</Notice>}
				</>
			) : (
				<>
					<Field label={strings.encrypt.publicKeys}>
						<textarea
							rows={4}
							spellCheck={false}
							value={keysText}
							onChange={(event) => setKeysText(event.target.value)}
						/>
					</Field>
					{mixesPqAndClassic(publicKeys) && <Notice>{strings.encrypt.mixedKeys}</Notice>}
				</>
			)}
			{error && <Notice tone="error">{error}</Notice>}
			<PrimaryButton disabled={!ready || props.disabled}>{strings.encrypt.start}</PrimaryButton>
		</form>
	);
}

function DecryptForm(props: {
	files: File[];
	unlock: 'passphrase' | 'private-key';
	disabled: boolean;
	onStart: (job: Job) => void;
}) {
	const [passphrase, setPassphrase] = useState('');
	const [keyFile, setKeyFile] = useState<Uint8Array | null>(null);
	const [keyFileProtected, setKeyFileProtected] = useState(false);
	const [keyFilePassphrase, setKeyFilePassphrase] = useState('');
	const [privateKeys, setPrivateKeys] = useState<string[]>([]);
	const [error, setError] = useState<string | null>(null);

	const loadKeyFile = async (bytes: Uint8Array, pass?: string) => {
		setError(null);
		try {
			const contents = await readKeyFile(bytes, pass);
			setKeyFileProtected(contents.protected);
			setPrivateKeys(contents.protected ? [] : contents.privateKeys);
		} catch (cause) {
			const code = (cause as { code?: keyof typeof strings.errors }).code ?? 'internal';
			setError(strings.errors[code]);
		}
	};

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		const result = await pickAndStart({
			mode: 'decrypt',
			files: props.files,
			credentials:
				props.unlock === 'passphrase'
					? { kind: 'passphrase', passphrase }
					: { kind: 'private-keys', privateKeys }
		});
		if (result.job) props.onStart(result.job);
		else if (result.reason === 'unsupported') setError(strings.unsupported);
	};

	const ready = props.unlock === 'passphrase' ? passphrase !== '' : privateKeys.length > 0;

	return (
		<form className="flex flex-col gap-4" onSubmit={submit}>
			<h2 className="text-xl font-semibold">{strings.decrypt.title}</h2>
			<FileSummary files={props.files} mode="decrypt" />
			{props.unlock === 'passphrase' ? (
				<Field label={strings.decrypt.passphrase}>
					<input
						type="password"
						autoComplete="current-password"
						value={passphrase}
						onChange={(event) => setPassphrase(event.target.value)}
					/>
				</Field>
			) : (
				<>
					<Field label={strings.decrypt.keyFile}>
						<input
							type="file"
							onChange={async (event) => {
								const file = event.currentTarget.files?.[0];
								if (!file) return;
								const bytes = new Uint8Array(await file.arrayBuffer());
								setKeyFile(bytes);
								await loadKeyFile(bytes);
							}}
						/>
					</Field>
					{keyFileProtected && keyFile && (
						<div className="flex items-end gap-2">
							<Field label={strings.decrypt.keyFilePassphrase}>
								<input
									type="password"
									value={keyFilePassphrase}
									onChange={(event) => setKeyFilePassphrase(event.target.value)}
								/>
							</Field>
							<button
								type="button"
								className="rounded border px-3 py-1.5"
								onClick={() => void loadKeyFile(keyFile, keyFilePassphrase)}
							>
								OK
							</button>
						</div>
					)}
					{privateKeys.length > 0 && (
						<p className="text-sm text-green-700 dark:text-green-400">
							{strings.decrypt.keyFileLoaded(privateKeys.length)}
						</p>
					)}
				</>
			)}
			{error && <Notice tone="error">{error}</Notice>}
			<PrimaryButton disabled={!ready || props.disabled}>{strings.decrypt.start}</PrimaryButton>
		</form>
	);
}

function JobView({ job, onReset }: { job: Job; onReset: () => void }) {
	const snapshot = useJobSnapshot(job)!;
	const percent =
		snapshot.bytesTotal === 0 ? 100 : (100 * snapshot.bytesDone) / snapshot.bytesTotal;
	const status = {
		waiting: strings.job.waiting,
		running: '',
		done: strings.job.done,
		failed: strings.job.failed,
		cancelled: strings.job.cancelled
	};
	return (
		<main className="flex flex-col gap-4" aria-live="polite">
			<progress className="w-full" max={100} value={percent} />
			<p className="text-sm tabular-nums">
				{strings.job.progress(formatBytes(snapshot.bytesDone), formatBytes(snapshot.bytesTotal))}
			</p>
			<ul className="flex flex-col gap-1 text-sm" data-testid="job-files">
				{snapshot.files.map((file) => (
					<li key={file.name + file.size} data-status={file.status}>
						{file.outputName} · {status[file.status]}
						{file.output?.kind === 'saved' && ` · ${strings.job.saved}`}
						{file.output?.kind === 'downloaded' && ` · ${strings.job.downloaded}`}
						{file.error && ` · ${strings.errors[file.error.code]}`}
					</li>
				))}
			</ul>
			{snapshot.status === 'running' ? (
				<button className="self-start rounded border px-3 py-1.5" onClick={job.cancel}>
					{strings.job.cancel}
				</button>
			) : (
				<button className="self-start rounded border px-3 py-1.5" onClick={onReset}>
					{strings.job.again}
				</button>
			)}
		</main>
	);
}

function TabButton(props: { active: boolean; onClick: () => void; children: ReactNode }) {
	return (
		<button
			className={props.active ? 'font-semibold underline' : ''}
			aria-current={props.active ? 'page' : undefined}
			onClick={props.onClick}
		>
			{props.children}
		</button>
	);
}

function Radio(props: { checked: boolean; onChange: () => void; children: ReactNode }) {
	return (
		<label className="flex items-center gap-2 text-sm">
			<input type="radio" checked={props.checked} onChange={props.onChange} />
			{props.children}
		</label>
	);
}
