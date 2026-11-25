import { uploadImageToCloudinary } from '../services/cloudinaryService';

const BRIDGE_DB_NAME = 'malosha_studio_makala_bridge_v1';
const BRIDGE_DB_VERSION = 1;
const BRIDGE_STORE = 'studio_items';
const BRIDGE_INDEX_KEY = 'malosha_studio_makala_index_v1';
const PENDING_IMPORT_KEY = 'malosha_pending_studio_makala_import_v1';
export const STUDIO_MAKALA_EVENT = 'malosha-studio-makala-updated';

export type StudioMakalaSource = 'poster' | 'cartoon';

export interface StudioMakalaItem {
  id: string;
  source: StudioMakalaSource;
  title: string;
  subheadline: string;
  bodyDraft: string;
  ribbonText?: string;
  locationTag?: string;
  tags: string[];
  imageBlob: Blob | null;
  uploadedImageUrl?: string;
  updatedAt: number;
}

interface StudioMakalaMeta {
  id: string;
  source: StudioMakalaSource;
  title: string;
  subheadline: string;
  bodyDraft: string;
  ribbonText?: string;
  locationTag?: string;
  tags: string[];
  uploadedImageUrl?: string;
  updatedAt: number;
}

function openBridgeDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(BRIDGE_DB_NAME, BRIDGE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BRIDGE_STORE)) {
        db.createObjectStore(BRIDGE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open bridge DB'));
  });
}

function dispatchBridgeUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(STUDIO_MAKALA_EVENT));
  }
}

function readLocalIndex(): StudioMakalaMeta[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(BRIDGE_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalIndex(items: StudioMakalaMeta[]) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(BRIDGE_INDEX_KEY, JSON.stringify(items.slice(0, 10)));
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function buildStudioMakalaBody(params: {
  headline?: string;
  subheadline?: string;
  xCardEnabled?: boolean;
  xCardBody?: string;
  xCardAuthor?: string;
  ribbonText?: string;
  locationTag?: string;
  bubbles?: string[];
}): string {
  const parts: string[] = [];
  const prefixParts = [params.locationTag?.trim(), params.ribbonText?.trim()].filter(Boolean);
  const lead = params.subheadline?.trim() || '';

  if (lead) {
    parts.push(prefixParts.length > 0 ? `**${prefixParts.join(' · ')}** — ${lead}` : lead);
  }

  if (params.xCardEnabled && params.xCardBody?.trim()) {
    const quoteAuthor = params.xCardAuthor?.trim() ? ` — ${params.xCardAuthor.trim()}` : '';
    parts.push(`> "${params.xCardBody.trim()}"${quoteAuthor}`);
  }

  if (Array.isArray(params.bubbles) && params.bubbles.length > 0) {
    const cleanBubbles = params.bubbles
      .map((b) => b.trim())
      .filter((b) => b && b !== params.headline?.trim());
    if (cleanBubbles.length > 0) {
      parts.push(cleanBubbles.map((b) => `> "${b}"`).join('\n\n'));
    }
  }

  if (parts.length === 0 && params.headline?.trim()) {
    parts.push(params.headline.trim());
  }

  return parts.join('\n\n');
}

export async function saveStudioMakalaSnapshot(
  item: StudioMakalaItem,
  options?: { saveHistory?: boolean }
): Promise<void> {
  const saveRecord = async (record: StudioMakalaItem) => {
    try {
      const db = await openBridgeDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(BRIDGE_STORE, 'readwrite');
        tx.objectStore(BRIDGE_STORE).put(record, record.id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Failed to write bridge item'));
      });
      db.close();
    } catch {
      // Fallback handled by local index
    }
  };

  const toMeta = (record: StudioMakalaItem): StudioMakalaMeta => ({
    id: record.id,
    source: record.source,
    title: record.title,
    subheadline: record.subheadline,
    bodyDraft: record.bodyDraft,
    ribbonText: record.ribbonText,
    locationTag: record.locationTag,
    tags: record.tags,
    uploadedImageUrl: record.uploadedImageUrl,
    updatedAt: record.updatedAt,
  });

  await saveRecord(item);

  let nextMetaList = [toMeta(item), ...readLocalIndex().filter((m) => m.id !== item.id)];

  if (options?.saveHistory) {
    const historyRecord: StudioMakalaItem = {
      ...item,
      id: `history_${item.source}_${item.updatedAt}`,
    };
    await saveRecord(historyRecord);
    const historyItems = nextMetaList
      .filter((m) => m.id.startsWith('history_'))
      .slice(0, 5);
    const liveItems = nextMetaList.filter((m) => !m.id.startsWith('history_'));
    nextMetaList = [toMeta(historyRecord), ...liveItems, ...historyItems].filter(
      (m, idx, arr) => arr.findIndex((x) => x.id === m.id) === idx
    );
  }

  nextMetaList.sort((a, b) => b.updatedAt - a.updatedAt);
  writeLocalIndex(nextMetaList);
  dispatchBridgeUpdated();
}

export async function listStudioMakalaItems(): Promise<StudioMakalaItem[]> {
  try {
    const db = await openBridgeDb();
    const allItems = await new Promise<StudioMakalaItem[]>((resolve, reject) => {
      const tx = db.transaction(BRIDGE_STORE, 'readonly');
      const req = tx.objectStore(BRIDGE_STORE).getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => reject(req.error || new Error('Failed to list bridge items'));
    });
    db.close();

    if (allItems.length > 0) {
      return allItems
        .filter((item) => item && (item.title.trim() || item.bodyDraft.trim() || item.imageBlob || item.uploadedImageUrl))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 8);
    }
  } catch {
    // Fallback to local index
  }

  return readLocalIndex()
    .map((meta) => ({ ...meta, imageBlob: null }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 8);
}

export async function updateStudioMakalaUploadedUrl(id: string, uploadedImageUrl: string): Promise<void> {
  if (!id || !uploadedImageUrl) return;
  try {
    const db = await openBridgeDb();
    const existing = await new Promise<StudioMakalaItem | null>((resolve) => {
      const tx = db.transaction(BRIDGE_STORE, 'readonly');
      const req = tx.objectStore(BRIDGE_STORE).get(id);
      req.onsuccess = () => resolve((req.result as StudioMakalaItem) ?? null);
      req.onerror = () => resolve(null);
    });
    if (existing) {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(BRIDGE_STORE, 'readwrite');
        tx.objectStore(BRIDGE_STORE).put({ ...existing, uploadedImageUrl }, id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }
    db.close();
  } catch {
    // Ignore DB cache errors
  }

  const nextMeta = readLocalIndex().map((m) =>
    m.id === id ? { ...m, uploadedImageUrl } : m
  );
  writeLocalIndex(nextMeta);
}

export async function ensureStudioItemUploadedUrl(item: StudioMakalaItem): Promise<string> {
  if (item.uploadedImageUrl && item.uploadedImageUrl.startsWith('https://')) {
    return item.uploadedImageUrl;
  }
  if (!item.imageBlob || item.imageBlob.size === 0) {
    throw new Error('Hakuna picha iliyohifadhiwa kwa chapisho hili la Studio.');
  }
  const safeSlug = (item.title || 'studio-art')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  const file = new File([item.imageBlob], `malosha-${safeSlug || 'studio'}.png`, {
    type: item.imageBlob.type || 'image/png',
  });
  const url = await uploadImageToCloudinary(file);
  await updateStudioMakalaUploadedUrl(item.id, url);
  return url;
}

export function setPendingStudioMakalaImportId(id: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PENDING_IMPORT_KEY, id);
    }
  } catch {
    // Ignore
  }
}

export function hasPendingStudioMakalaImport(): boolean {
  try {
    if (typeof localStorage !== 'undefined') {
      return Boolean(localStorage.getItem(PENDING_IMPORT_KEY));
    }
  } catch {
    // Ignore
  }
  return false;
}

export function consumePendingStudioMakalaImportId(): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      const id = localStorage.getItem(PENDING_IMPORT_KEY);
      if (id) {
        localStorage.removeItem(PENDING_IMPORT_KEY);
        return id;
      }
    }
  } catch {
    // Ignore
  }
  return null;
}
