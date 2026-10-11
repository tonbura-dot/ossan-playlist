// ネタ帳のデータ置き場（ブラウザの IndexedDB）。データはこの端末の中だけにあり、どこにも送らない。

export type Neta = {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  memo: string;
  place: string;
  category: string;
  photoIds: string[];
  done: boolean; // 記事にしたか
  createdAt: number;
  updatedAt: number;
};

export type Photo = { id: string; blob: Blob };

const DB_NAME = 'ossan-neta';
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, VERSION);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('neta')) db.createObjectStore('neta', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('blocked'));
  });
  dbPromise.catch(() => (dbPromise = null));
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function result<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function available(): Promise<boolean> {
  try {
    await open();
    return true;
  } catch {
    return false;
  }
}

export async function listNeta(): Promise<Neta[]> {
  const db = await open();
  const all = await result(db.transaction('neta').objectStore('neta').getAll() as IDBRequest<Neta[]>);
  return all.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

export async function getPhoto(id: string): Promise<Photo | undefined> {
  const db = await open();
  return result(db.transaction('photos').objectStore('photos').get(id) as IDBRequest<Photo | undefined>);
}

/** ネタを保存。新しい写真を足し、使われなくなった写真は消す */
export async function saveNeta(neta: Neta, newPhotos: Photo[], removedPhotoIds: string[]): Promise<void> {
  const db = await open();
  const tx = db.transaction(['neta', 'photos'], 'readwrite');
  const photos = tx.objectStore('photos');
  for (const p of newPhotos) photos.put(p);
  for (const id of removedPhotoIds) photos.delete(id);
  tx.objectStore('neta').put(neta);
  await done(tx);
}

export async function deleteNeta(neta: Neta): Promise<void> {
  const db = await open();
  const tx = db.transaction(['neta', 'photos'], 'readwrite');
  for (const id of neta.photoIds) tx.objectStore('photos').delete(id);
  tx.objectStore('neta').delete(neta.id);
  await done(tx);
}

export async function setDone(neta: Neta, value: boolean): Promise<Neta> {
  const updated = { ...neta, done: value, updatedAt: Date.now() };
  const db = await open();
  const tx = db.transaction('neta', 'readwrite');
  tx.objectStore('neta').put(updated);
  await done(tx);
  return updated;
}

// ---- バックアップ（写真ごと1つのファイルに） ----

type Backup = {
  app: 'ossan-neta';
  version: 1;
  exportedAt: string;
  neta: Neta[];
  photos: { id: string; type: string; data: string }[];
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function base64ToBlob(data: string, type: string): Blob {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function exportBackup(): Promise<Blob> {
  const neta = await listNeta();
  const photos: Backup['photos'] = [];
  for (const n of neta) {
    for (const id of n.photoIds) {
      const p = await getPhoto(id);
      if (p) photos.push({ id, type: p.blob.type || 'image/jpeg', data: await blobToBase64(p.blob) });
    }
  }
  const backup: Backup = { app: 'ossan-neta', version: 1, exportedAt: new Date().toISOString(), neta, photos };
  return new Blob([JSON.stringify(backup)], { type: 'application/json' });
}

/** バックアップを読み込む。同じ id のネタは上書き、それ以外は足す。読み込んだ件数を返す */
export async function importBackup(file: Blob): Promise<number> {
  const data = JSON.parse(await file.text()) as Backup;
  if (data?.app !== 'ossan-neta' || !Array.isArray(data.neta)) throw new Error('not a backup');
  const db = await open();
  const tx = db.transaction(['neta', 'photos'], 'readwrite');
  for (const p of data.photos ?? []) tx.objectStore('photos').put({ id: p.id, blob: base64ToBlob(p.data, p.type) });
  for (const n of data.neta) tx.objectStore('neta').put(n);
  await done(tx);
  return data.neta.length;
}
