import { validatePublicKeys } from './keys.ts';

/** A saved public key with a name. Contacts never hold private keys (D9, D10). */
export interface Contact {
	id: string;
	name: string;
	publicKey: string;
	addedAt: number;
}

const DB_NAME = 'encryptee';
const STORE = 'contacts';

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => {
			const store = request.result.createObjectStore(STORE, { keyPath: 'id' });
			store.createIndex('publicKey', 'publicKey', { unique: true });
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function transact<T>(
	mode: IDBTransactionMode,
	run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
	const db = await openDb();
	try {
		return await new Promise<T>((resolve, reject) => {
			const request = run(db.transaction(STORE, mode).objectStore(STORE));
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	} finally {
		db.close();
	}
}

export async function listContacts(): Promise<Contact[]> {
	const contacts = await transact<Contact[]>('readonly', (store) => store.getAll());
	return contacts.toSorted((a, b) => a.name.localeCompare(b.name));
}

export async function saveContact(name: string, publicKey: string): Promise<Contact> {
	const [key] = validatePublicKeys([publicKey]);
	const contact: Contact = {
		id: crypto.randomUUID(),
		name: name.trim(),
		publicKey: key!,
		addedAt: Date.now()
	};
	await transact('readwrite', (store) => store.add(contact));
	return contact;
}

export async function renameContact(id: string, name: string): Promise<void> {
	const contact = await transact<Contact | undefined>('readonly', (store) => store.get(id));
	if (!contact) return;
	await transact('readwrite', (store) => store.put({ ...contact, name: name.trim() }));
}

export async function deleteContact(id: string): Promise<void> {
	await transact('readwrite', (store) => store.delete(id));
}
