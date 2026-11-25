import { createFileRoute } from '@tanstack/react-router';
import { H1, H2, P } from '../../pages/Layout.tsx';
import { strings } from '../../strings.ts';

export const Route = createFileRoute('/_pages/security')({
	staticData: { title: strings.titles.security },
	component: Security
});

function Security() {
	return (
		<>
			<H1>Security</H1>
			<H2>What Encryptee protects</H2>
			<P>
				The contents of your files. Each file gets its own random key. Every 64 KiB piece of the
				file is sealed with ChaCha20-Poly1305, numbered, and the last piece is marked as last. Any
				change, reordering or truncation is detected, and Encryptee refuses to output anything it
				cannot verify.
			</P>
			<H2>What it doesn&rsquo;t hide</H2>
			<P>
				The approximate size of the file, and its name if you keep the default name (
				<code>photo.jpg.age</code>). Rename encrypted files if the name itself is sensitive.
			</P>
			<H2>Passphrases</H2>
			<P>
				Passphrases are stretched with scrypt, which makes guessing slow, but a short passphrase can
				still be guessed. Use the generated passphrase, or at least five random words.
			</P>
			<H2>Private keys</H2>
			<P>
				Encryptee never stores your private key. When you create a key pair you save a key file,
				protected with a passphrase by default. Keep it safe: if you lose it, files encrypted to
				that key cannot be recovered by anyone, including us.
			</P>
			<H2>The code you run</H2>
			<P>
				Encryptee loads no third-party scripts and has no analytics. A strict Content Security
				Policy only allows code from encryptee.io itself. The source code is open, under the MIT
				license, on{' '}
				<a className="underline" href="https://github.com/marcelgundermann/encryptee">
					GitHub
				</a>
				.
			</P>
		</>
	);
}
