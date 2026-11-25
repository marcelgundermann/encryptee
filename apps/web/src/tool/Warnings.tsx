import { preflight } from '@encryptee/engine';
import { strings } from '#/strings.ts';
import { Hint } from './ui.tsx';

/** Pre-flight warnings for a selection: iPhone, size limits (D22, D23). */
export function Warnings({ files }: { files: File[] }) {
	return preflight(files.map((file) => file.size)).map((warning) => (
		<Hint key={warning.code} tone="warning">
			{strings.warnings[warning.code]}
		</Hint>
	));
}
