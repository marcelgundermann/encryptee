# Encryptee

Encryptee encrypts and decrypts files in the browser, entirely on the user's device. Its files are standard age files, so anyone with the `age` command-line tool can open them too.

## Files

**Plaintext file**:
A file as the user has it before encryption or after decryption.
_Avoid_: Original, clear file, raw file

**Encrypted file**:
A file in the age format, usually named `<name>.age`. Encryptee writes one encrypted file per plaintext file.
_Avoid_: Encrypted archive, container, `.age` file (in UI copy)

**Legacy file**:
A file encrypted by Encryptee v1, with the `.cre` extension. v2 cannot open it; the user opens it on v1.encryptee.io.
_Avoid_: Old file, v1 file

## Actions

**Encrypt**:
Turn plaintext files into encrypted files, for a passphrase or for one or more recipients.
_Avoid_: Lock, protect, secure

**Decrypt**:
Turn encrypted files back into plaintext files, with a passphrase or a private key.
_Avoid_: Unlock, open, unprotect

**Job**:
One encrypt or decrypt run over the files the user selected, from start until every file is done, failed or cancelled.
_Avoid_: Task, operation, process

**Save location**:
Where a job's output files end up: a file or folder the user picked, or the browser's downloads.
_Avoid_: Destination, target, output folder

## Secrets and keys

**Passphrase**:
A secret phrase that encrypts a file on its own, without keys. A file encrypted with a passphrase has no recipients.
_Avoid_: Password, PIN

**Public key**:
The shareable half of a key pair; anyone can encrypt files for its owner with it. age calls it a recipient.
_Avoid_: Recipient (in UI copy), address, ID

**Private key**:
The secret half of a key pair; only its holder can decrypt files encrypted to the matching public key. age calls it an identity.
_Avoid_: Secret key, identity (in UI copy), master key

**Key pair**:
A public key and its matching private key, either post-quantum (the default) or classic.
_Avoid_: Keys, account, identity

**Key file**:
A file holding one or more private keys. A protected key file is itself encrypted with a passphrase; a plain key file is readable text.
_Avoid_: Keystore, wallet, backup

**Recipient**:
A public key chosen to open one particular encrypted file. A file can have several recipients.
_Avoid_: Receiver, addressee
