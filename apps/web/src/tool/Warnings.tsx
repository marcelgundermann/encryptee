import { preflight, type PreflightWarning } from '@encryptee/engine';
import { useEffect, useState } from 'react';
import { strings } from '../strings.ts';
import { Hint } from './ui.tsx';

/** Pre-flight warnings for a selection: iPhone, size limits, free space (D22, D23). */
export function Warnings({ mode, files }: { mode: 'encrypt' | 'decrypt'; files: File[] }) {
	const [warnings, setWarnings] = useState<PreflightWarning[]>([]);
	useEffect(() => {
		void preflight({ mode, sizes: files.map((file) => file.size) }).then((result) =>
			setWarnings(result.warnings)
		);
	}, [mode, files]);

	return warnings.map((warning) => (
		<Hint key={warning.code} tone="warning">
			{strings.warnings[warning.code]}
		</Hint>
	));
}
