const STORES = ['dwell', 'switches', 'sessions'];
const open = () => new Promise<IDBDatabase>((res, rej) => {
  const r = indexedDB.open('tabflow', 1);
  r.onupgradeneeded = () => STORES.forEach((s) => r.result.createObjectStore(s, { keyPath: 'id', autoIncrement: true }));
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
async function run<T>(store: string, mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((res, rej) => {
    const q = f(db.transaction(store, mode).objectStore(store));
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
export const add = (s: string, v: object) => run(s, 'readwrite', (st) => st.add(v));
export const all = <T>(s: string) => run<T[]>(s, 'readonly', (st) => st.getAll());
export const del = (s: string, id: number) => run(s, 'readwrite', (st) => st.delete(id));
export const clear = (s: string) => run(s, 'readwrite', (st) => st.clear());
export const clearAll = () => Promise.all(STORES.map(clear));
