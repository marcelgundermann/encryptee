import { describe, expect, test } from 'vitest';
import {
	generatePassphrase,
	generateKeyPair,
	mixesPqAndClassic,
	readKeyFile,
	validatePublicKeys
} from '../src/index.ts';
import { keyFileText } from '../src/keys/key-pair.ts';
import { protectKeyFile } from '../src/keys/keys.ts';
import { TEST_LOG_N } from './helpers.ts';

const pqKey = (await generateKeyPair('pq')).publicKey;
const x25519Key = (await generateKeyPair('x25519')).publicKey;

// Public keys the app can't create but accepts and encrypts to, made with the
// libraries typage uses: p256tag is classic, mlkem768p256tag post-quantum.
const P256_TAG = 'age1tag1qd2dakxt5sn9f8x2ah70cxhrewhjfxpzx0csul479vunwnj0d6lx54p6hwf';

const PQ_TAG =
	'age1tagpq13eg454zqredgzz2wc5xjzhxqkpg6um6f0c06kmgcv297vuwtgksp9pjxc700vgc6sywdpcqj9esqdraypkxz0twneg8a2cgalzkqdnd2yjdazgk2jw9sf9uk3hf43v7n9djgqyx2xz6zxkzve8ukalsewnluyk745txxszqh5252wzyvttfqwpwvmdw6ndk0g6z8mxnefy5pvtt6xzukw4z7ury9fwqnk98t9v79kgjaenrr52mfjwjmq0vhjnuq5j3xt72lh7gz5dv92e2x57akaj6l8nx2lkj88zw8z9adhyjpqpaur2t0ey467rtpn6d3gfq6vu3xv9e6w8nylkvc89e95fe9jqqvpsaq832uk2pyfdm8k8qn7kvs92aj3uq3nxygx2hhzjrjvsmvmxzpflqg7v05c9vhxjwjjnxj454qwzrnyncfh9g65ypsutyq02e8hg4hcl8vzq9djjklh93ljguscycxfp53qxchzds2uam26ktzj3qk3zy809wzfjpfd2d4cenlw8et3ewst24j8t4lmxs6jf5urwg5qkef0aurkfxtug657fpxnrps492scau7rfe6rqjuuvgctlfux6qpcqsv5a92w7hvrs48vcz3hkhfrs23zgyck4pj3vcspyr24zd4hcxgdswjxnxyhx5ynaft9t5xw2g5ff9ucaw2p26m76u5fnj3dqvcycderw00lq5423cfj2v42fcg2zwwxdt0s3qt03ghflu829gtttm09qj3wjrexk933uwrzy235jhncufje96gvejzlvzcsqcpn0zway0zgt9ajzk9hmz30lgg5hg0sx8n659cqt6stt55ffdqxwqfxyufxpk004cg0r068ky9nz8ttsj8nf27nf2kxkdeshzmqe9dzjpwnckya44953j4razwhrxsvsmzhw2q65pmgavqzqtfwmnsg6u0djncyh4hwyhgjp4nqywpynp0yqcg50g9qwx4cw6jxd2wjenm7zfqjv2jhngcerdnr29anweyagajpmsrmqwgzl23ygcv6vsu72vs23qvcn8vn87aed837cutr6dd4ft9k7ujvsp25rn0xs9svgekghyxfpwvvtzjklv0mq8l7e52lunqkv9hykysjwyegq44kk7d4dz3kcyghsmgzlsw27jw2f2msg3xu7dttkzu0g0gw7a0kjw98mfgyj0ctt3zcvvu5a2anjw2nu6q5l3jdq7kj4mn0fgkyu4kf492xr4cxqgcfj7ayd9ty5n9gy3rp7utygxwdyjgt3jxvfer4n4r7nmewl2vknuwyzlr2xclu5wp0ggrfp5vnjgkt8ph5pw9wsgknjlks8s43r54q7px45qp404t60wt9a5ck48lq5ahnwde4xe92vygkp65pjl2usqlrkz5htnk3gl3zmet2qmnpp0zx2a6mwcndw59dlhhkfk24p6v87jqjqakld5tj99akgfzdzu9d5eqghgzkeum0l6ntf6tg3qj7nps0tdcx345j9drx9v9lv98gly7r9rgfu0f2dulpnzw2y4t509905ejflzr39g609ffuyh90waqf6mmytncrh56g6kkq5puzs27tgjfyrg50pr9ryffffudhv4cvvy2j6zqxxudht7qzy6e8vn4sjykx9fu4gtjcgql2v3rdk42yh9tt0dkhuf5w3dew69snqjel4xfwme5sh30f0cgp9apkcd2zqcvdswzpy36t83jqgtjuep8ndu8nwwksghchx4cguy9sgftapg42cltcpzj4fdd668u36v8q2w2x736r8svscqxl2tup74ldfsv27cuvvwhvze6nwzee0eyfr8ay680ajqhlauk2py8qcdvfg8dzafp2z43zu5s63dq4ygy8yrfdgmxln7qvn93hu3h8yjtrfnmd92fzal9v8p9wq2dk5najqyq7kfzu4hq6t3hw33qu25krdpm3afj7wsn0d3hm7yy56addkrvmdc48agq5';

/** A classic X25519 key whose bech32 data happens to start with "tag" (about 1 in 32,768). */
const X25519_STARTING_AGE1TAG = 'age1tag7jv7ulauxgtgqwdl98js359gsr999vnnu2rh20c3wazngffwsdccs44';

describe('key pairs', () => {
	test('post-quantum hybrid by default, classic X25519 on request', async () => {
		const pq = await generateKeyPair();
		expect(pq.type).toBe('pq');
		expect(pq.publicKey).toMatch(/^age1pq1/);
		expect(pq.privateKey).toMatch(/^AGE-SECRET-KEY-PQ-1/);
		const classic = await generateKeyPair('x25519');
		expect(classic.publicKey).toMatch(/^age1/);
		expect(classic.publicKey).not.toMatch(/^age1pq1/);
	});

	test.each([
		['post-quantum and X25519', [pqKey, x25519Key]],
		['post-quantum and P-256 tag', [pqKey, P256_TAG]],
		['post-quantum tag and X25519', [PQ_TAG, x25519Key]],
		['post-quantum tag and P-256 tag', [PQ_TAG, P256_TAG]],
		['post-quantum and an X25519 key that starts with age1tag', [pqKey, X25519_STARTING_AGE1TAG]]
	])('warns about mixing post-quantum and classic public keys: %s', (_, publicKeys) => {
		expect(mixesPqAndClassic(publicKeys)).toBe(true);
	});

	test.each([
		['one post-quantum key', [pqKey]],
		['post-quantum and post-quantum tag', [pqKey, PQ_TAG]],
		['X25519 and P-256 tag', [x25519Key, P256_TAG]],
		['an X25519 key that starts with age1tag', [X25519_STARTING_AGE1TAG]]
	])('doesn’t warn when every public key is the same kind: %s', (_, publicKeys) => {
		expect(mixesPqAndClassic(publicKeys)).toBe(false);
	});

	test('validates pasted public keys', async () => {
		const pair = await generateKeyPair();
		expect(await validatePublicKeys([`  ${pair.publicKey}\n`])).toEqual([pair.publicKey]);
		await expect(validatePublicKeys(['age1qqqq'])).rejects.toMatchObject({
			code: 'invalid-public-key'
		});
	});
});

describe('key files', () => {
	test('plain key files use the age-keygen format', async () => {
		const pair = await generateKeyPair('x25519');
		const text = keyFileText(pair, new Date('2026-10-29T12:00:00.123Z'));
		expect(text).toBe(
			`# created: 2026-10-29T12:00:00Z\n# public key: ${pair.publicKey}\n${pair.privateKey}\n`
		);
		expect(await readKeyFile(new TextEncoder().encode(text))).toEqual({
			protected: false,
			privateKeys: [pair.privateKey],
			publicKeys: [pair.publicKey]
		});
	});

	test('protected key files need their passphrase', async () => {
		const pair = await generateKeyPair();
		const sealed = await protectKeyFile(keyFileText(pair), 'pass', TEST_LOG_N);
		expect(await readKeyFile(sealed)).toEqual({ protected: true });
		await expect(readKeyFile(sealed, 'nope')).rejects.toMatchObject({ code: 'wrong-credentials' });
		expect(await readKeyFile(sealed, 'pass')).toMatchObject({ privateKeys: [pair.privateKey] });
	});

	test('rejects files without a key', async () => {
		await expect(readKeyFile(new TextEncoder().encode('hello'))).rejects.toMatchObject({
			code: 'invalid-key-file'
		});
	});
});

describe('generated passphrases', () => {
	test('are ten hyphenated BIP39 words and differ each time', async () => {
		const { WORDS } = await import('../src/keys/wordlist.ts');
		expect(WORDS).toHaveLength(2048);
		const passphrase = generatePassphrase();
		const words = passphrase.split('-');
		expect(words).toHaveLength(10);
		expect(words.every((word) => WORDS.includes(word))).toBe(true);
		expect(generatePassphrase()).not.toBe(passphrase);
	});
});
