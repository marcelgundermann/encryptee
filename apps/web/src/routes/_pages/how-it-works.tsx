import { createFileRoute } from '@tanstack/react-router';
import { H1, H2, P } from '../../pages/Layout.tsx';
import { strings } from '../../strings.ts';

export const Route = createFileRoute('/_pages/how-it-works')({
	staticData: { title: strings.titles.howItWorks },
	component: HowItWorks
});

function HowItWorks() {
	return (
		<>
			<H1>How Encryptee works</H1>
			<P>
				Encryptee encrypts and decrypts files inside your browser. Your files are read from your
				disk, encrypted on your device and written back to your disk. They are never uploaded:
				Encryptee has no server that could receive them.
			</P>
			<H2>The age format</H2>
			<P>
				Encrypted files use <a href="https://age-encryption.org">age</a>, an open, reviewed file
				encryption format. That means you are never locked in: anyone with the <code>age</code>{' '}
				command-line tool can open your files, with or without Encryptee.
			</P>
			<H2>Passphrase or public key</H2>
			<P>
				Encrypt a file with a passphrase when you will open it yourself or can share the passphrase
				safely. Encrypt it to one or more public keys when someone else should open it: only the
				matching private keys can decrypt it, and no secret needs to be shared.
			</P>
			<P>
				New key pairs are post-quantum by default: they combine ML-KEM-768 with X25519, so files
				stay protected even against a future quantum computer.
			</P>
			<H2>Large files</H2>
			<P>
				Files are processed in small pieces by several background workers at once, so even very
				large files never need to fit in memory. In Chrome and Edge, Encryptee writes straight to
				the file you choose. Other browsers save through a download; for very large files, use
				Chrome or Edge.
			</P>
			<H2>Works offline</H2>
			<P>
				After your first visit, Encryptee works without a connection. You can install it as an app.
			</P>
		</>
	);
}
