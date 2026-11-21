const DB_NAME = 'malosha_studio_drafts_v1';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';

function openDraftDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
  });
}

export async function saveStudioDraft<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openDraftDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to save draft'));
    });
    db.close();
  } catch {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`malosha_fallback_${key}`, JSON.stringify(value));
      }
    } catch {
      // Ignore quota fallback error
    }
  }
}

export async function loadStudioDraft<T>(key: string): Promise<T | null> {
  try {
    const db = await openDraftDb();
    const res = await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => reject(req.error || new Error('Failed to load draft'));
    });
    db.close();
    if (res !== null) return res;
  } catch {
    // Fallback below
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(`malosha_fallback_${key}`);
      if (raw) return JSON.parse(raw) as T;
    }
  } catch {
    // Ignore parse error
  }
  return null;
}

export async function clearStudioDraft(key: string): Promise<void> {
  try {
    const db = await openDraftDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to delete draft'));
    });
    db.close();
  } catch {
    // Ignore
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`malosha_fallback_${key}`);
    }
  } catch {
    // Ignore
  }
}

export async function canvasToPngBlob(canvas: HTMLCanvasElement | null): Promise<Blob | null> {
  if (!canvas) return null;
  return new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    } catch {
      resolve(null);
    }
  });
}

export async function blobToImageElement(
  blob: Blob | null | undefined
): Promise<{ objectUrl: string; img: HTMLImageElement } | null> {
  if (!blob || blob.size === 0) return null;
  const objectUrl = URL.createObjectURL(blob);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ objectUrl, img });
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    img.src = objectUrl;
  });
}

export async function drawBlobOntoCanvas(
  blob: Blob | null | undefined,
  canvas: HTMLCanvasElement | null
): Promise<boolean> {
  if (!blob || !canvas) return false;
  const loaded = await blobToImageElement(blob);
  if (!loaded) return false;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(loaded.img, 0, 0, canvas.width, canvas.height);
  }
  URL.revokeObjectURL(loaded.objectUrl);
  return Boolean(ctx);
}
