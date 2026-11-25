import { createFileRoute } from '@tanstack/react-router';
import { Code, H1, H2, P } from '#/pages/Layout.tsx';
import { strings } from '#/strings.ts';

export const Route = createFileRoute('/_pages/faq')({
	staticData: { title: strings.titles.faq },
	component: Faq
});

function Faq() {
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
				Not in Chrome and Edge on a computer, which write straight to the file you choose. Firefox
				and Safari save through a download, which is reliable up to a smaller size; Encryptee tells
				you when a file is above it.
			</P>
			<H2>Do you see my files or passphrases?</H2>
			<P>No. Nothing you encrypt, and no passphrase or key, ever leaves your device.</P>
		</>
	);
}
