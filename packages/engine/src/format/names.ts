const AGE = '.age';

/** The name of the file a job writes for the input named `name`. */
export function outputName(mode: 'encrypt' | 'decrypt', name: string): string {
	if (mode === 'encrypt') return name + AGE;

	return /\.age$/i.test(name) && name.length > AGE.length
		? name.slice(0, -AGE.length)
		: `${name}.decrypted`;
}

/**
 * The `n`th name for a file named `name` in a folder that has one already:
 * `photo (1).jpg`, and `photo (1).jpg.age` for an encrypted file. `name` itself for 0.
 */
export function numberedName(name: string, n: number): string {
	if (n === 0) return name;
	const encrypted = name.length > AGE.length && name.endsWith(AGE) ? AGE : '';
	const base = name.slice(0, name.length - encrypted.length);
	const dot = base.lastIndexOf('.');
	const stem = dot > 0 ? base.slice(0, dot) : base;

	return `${stem} (${n})${base.slice(stem.length)}${encrypted}`;
}
