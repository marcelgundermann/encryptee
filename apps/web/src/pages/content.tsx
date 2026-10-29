import { Code, H1, H2, P } from './Layout.tsx';

export function HowItWorks() {
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

export function Security() {
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
				Policy only allows code from encryptee.io itself. Updates are never applied while a file is
				being encrypted or decrypted.
			</P>
		</>
	);
}

export function Faq() {
	return (
		<>
			<H1>Frequently asked questions</H1>
			<H2 id="age-cli">How do I decrypt a file without Encryptee?</H2>
			<P>
				Install <a href="https://github.com/FiloSottile/age">age</a> (version 1.3 or newer for
				post-quantum keys), then:
			</P>
			<Code>
				{'# a file encrypted with a passphrase\nage -d -o photo.jpg photo.jpg.age\n\n'}
				{
					'# a file encrypted to your public key (key file from Encryptee)\nage -d -i key.age -o photo.jpg photo.jpg.age'
				}
			</Code>
			<P>A protected key file asks for its passphrase first.</P>
			<H2>Can I send a file to someone who doesn&rsquo;t use Encryptee?</H2>
			<P>
				Yes. Ask for their age public key (it starts with <code>age1</code>) and encrypt to it. They
				decrypt with the <code>age</code> tool.
			</P>
			<H2>What happened to my .cre files?</H2>
			<P>
				Files from the old Encryptee use a different format. Open them at{' '}
				<a className="underline" href="https://v1.encryptee.io">
					v1.encryptee.io
				</a>
				, which stays online.
			</P>
			<H2>Is there a size limit?</H2>
			<P>
				Not in Chrome and Edge on a computer, where files of 50 GB and more work. Firefox and Safari
				save through a download, which is reliable up to a smaller size; Encryptee tells you when a
				file is above it.
			</P>
			<H2>Do you see my files or passphrases?</H2>
			<P>No. Nothing you encrypt, and no passphrase or key, ever leaves your device.</P>
		</>
	);
}

export function NotFound() {
	return (
		<>
			<H1>Page not found</H1>
			<P>
				<a className="underline" href="/">
					Go to Encryptee
				</a>
			</P>
		</>
	);
}
