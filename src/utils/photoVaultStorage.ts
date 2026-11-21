const DB_NAME = 'malosha_owner_photo_vault_v1';
const DB_VERSION = 1;
const STORE_CACHE = 'photo_cache';
const STORE_QUEUE = 'upload_queue';

export interface CachedVaultPhotoEntry {
  fileHash: string;
  thumbBlob?: Blob;
  viewBlob?: Blob;
  thumbBytes: number;
  viewBytes: number;
  cachedAt: number;
}

export type PersistedUploadStatus = 'pending' | 'uploading' | 'failed';

export interface PersistedVaultUploadItem {
  queueId: string;
  ownerUid: string;
  targetFolderId: string;
  targetFolderName: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileBlob: Blob;
  useDataSaver: boolean;
  status: PersistedUploadStatus;
  errorMsg?: string;
  createdAt: number;
}

function openVaultDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB haipatikani kwenye kifaa hiki.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, { keyPath: 'fileHash' });
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        const qStore = db.createObjectStore(STORE_QUEUE, { keyPath: 'queueId' });
        qStore.createIndex('by_owner', 'ownerUid', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Imeshindwa kufungua IndexedDB.'));
  });
}

function runTx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openVaultDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('IndexedDB transaction failed'));
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
      })
  );
}

export async function getCachedVaultPhoto(
  fileHash: string
): Promise<CachedVaultPhotoEntry | null> {
  if (!fileHash) return null;
  try {
    const res = await runTx<CachedVaultPhotoEntry | undefined>(
      STORE_CACHE,
      'readonly',
      (store) => store.get(fileHash)
    );
    return res || null;
  } catch {
    return null;
  }
}

export async function putCachedVaultPhoto(
  fileHash: string,
  patch: { thumbBlob?: Blob; viewBlob?: Blob }
): Promise<void> {
  if (!fileHash || (!patch.thumbBlob && !patch.viewBlob)) return;
  try {
    const existing = await getCachedVaultPhoto(fileHash);
    const thumbBlob = patch.thumbBlob || existing?.thumbBlob;
    const viewBlob = patch.viewBlob || existing?.viewBlob;
    const entry: CachedVaultPhotoEntry = {
      fileHash,
      thumbBlob,
      viewBlob,
      thumbBytes: thumbBlob ? thumbBlob.size : 0,
      viewBytes: viewBlob ? viewBlob.size : 0,
      cachedAt: Date.now(),
    };
    await runTx(STORE_CACHE, 'readwrite', (store) => store.put(entry));
  } catch {
    // Best-effort offline cache; never block UI if storage quota is tight
  }
}

export async function deleteCachedVaultPhoto(fileHash: string): Promise<void> {
  if (!fileHash) return;
  try {
    await runTx(STORE_CACHE, 'readwrite', (store) => store.delete(fileHash));
  } catch {
    // Ignore
  }
}

export async function clearAllVaultPhotoCache(): Promise<void> {
  try {
    await runTx(STORE_CACHE, 'readwrite', (store) => store.clear());
  } catch {
    // Ignore
  }
}

export async function getVaultCacheStats(): Promise<{
  count: number;
  totalBytes: number;
  cachedHashes: Set<string>;
}> {
  try {
    const all = await runTx<CachedVaultPhotoEntry[]>(
      STORE_CACHE,
      'readonly',
      (store) => store.getAll()
    );
    let totalBytes = 0;
    const cachedHashes = new Set<string>();
    for (const item of all || []) {
      totalBytes += (item.thumbBytes || 0) + (item.viewBytes || 0);
      if (item.fileHash) cachedHashes.add(item.fileHash);
    }
    return {
      count: cachedHashes.size,
      totalBytes,
      cachedHashes,
    };
  } catch {
    return { count: 0, totalBytes: 0, cachedHashes: new Set<string>() };
  }
}

export async function generateLocalVaultBlobs(
  file: Blob
): Promise<{ thumbBlob?: Blob; viewBlob?: Blob }> {
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') {
    return {};
  }
  try {
    const bitmap = await createImageBitmap(file);
    const makeResizedBlob = async (maxDim: number, quality: number): Promise<Blob | undefined> => {
      const scale = Math.min(1, maxDim / Math.max(bitmap.width || 1, bitmap.height || 1));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return undefined;
      ctx.drawImage(bitmap, 0, 0, w, h);
      const webp = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/webp', quality)
      );
      if (webp && webp.size > 0) return webp;
      const jpeg = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', quality)
      );
      return jpeg || undefined;
    };

    const thumbBlob = await makeResizedBlob(280, 0.72);
    const viewBlob = await makeResizedBlob(1280, 0.8);
    bitmap.close();
    return { thumbBlob, viewBlob };
  } catch {
    return {};
  }
}

export async function enqueuePersistedVaultUpload(
  item: PersistedVaultUploadItem
): Promise<void> {
  await runTx(STORE_QUEUE, 'readwrite', (store) => store.put(item));
}

export async function listPersistedVaultUploads(
  ownerUid: string
): Promise<PersistedVaultUploadItem[]> {
  try {
    const db = await openVaultDb();
    return await new Promise<PersistedVaultUploadItem[]>((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, 'readonly');
      const store = tx.objectStore(STORE_QUEUE);
      const index = store.index('by_owner');
      const req = index.getAll(ownerUid);
      req.onsuccess = () => {
        const list = (req.result || []) as PersistedVaultUploadItem[];
        list.sort((a, b) => a.createdAt - b.createdAt);
        resolve(list);
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    });
  } catch {
    return [];
  }
}

export async function updatePersistedVaultUploadStatus(
  queueId: string,
  status: PersistedUploadStatus,
  errorMsg?: string
): Promise<void> {
  try {
    const existing = await runTx<PersistedVaultUploadItem | undefined>(
      STORE_QUEUE,
      'readonly',
      (store) => store.get(queueId)
    );
    if (!existing) return;
    existing.status = status;
    existing.errorMsg = errorMsg || '';
    await runTx(STORE_QUEUE, 'readwrite', (store) => store.put(existing));
  } catch {
    // Ignore
  }
}

export async function removePersistedVaultUpload(queueId: string): Promise<void> {
  try {
    await runTx(STORE_QUEUE, 'readwrite', (store) => store.delete(queueId));
  } catch {
    // Ignore
  }
}

export async function clearPersistedVaultUploadsForOwner(ownerUid: string): Promise<void> {
  try {
    const items = await listPersistedVaultUploads(ownerUid);
    for (const item of items) {
      await removePersistedVaultUpload(item.queueId);
    }
  } catch {
    // Ignore
  }
}
