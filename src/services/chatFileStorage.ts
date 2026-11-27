import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase';

export const FIRESTORE_CHAT_FILE_PREFIX = 'firestore://chat_files/';
const CHUNK_BINARY_BYTES = 360 * 1024; // ~480 KB UTF-8 base64 per Firestore doc (safely under 1 MB)
const MAX_STORED_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

interface CachedChatFile {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
}

const memoryFileCache = new Map<string, CachedChatFile>();

export function isFirestoreChatFileUrl(url?: string): boolean {
  return typeof url === 'string' && url.trim().startsWith(FIRESTORE_CHAT_FILE_PREFIX);
}

export function extractFirestoreChatFileId(url?: string): string {
  if (!isFirestoreChatFileUrl(url)) return '';
  const id = (url || '').trim().slice(FIRESTORE_CHAT_FILE_PREFIX.length).split('?')[0].trim();
  return /^[a-zA-Z0-9_-]{1,128}$/.test(id) ? id : '';
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const sliceLen = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += sliceLen) {
    const chunk = bytes.subarray(i, Math.min(i + sliceLen, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const len = binary.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export interface FirestoreFileUploadResult {
  url: string;
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export async function uploadFileToFirestore(
  file: File,
  uploaderId: string
): Promise<FirestoreFileUploadResult> {
  if (!uploaderId) {
    throw new Error('Ingia kwanza kwenye akaunti yako ili kupakia faili.');
  }
  if (file.size <= 0) {
    throw new Error('Faili halina maudhui.');
  }
  if (file.size > MAX_STORED_FILE_BYTES) {
    throw new Error('Faili ni kubwa sana. Ukubwa usizidi MB 15.');
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const totalChunks = Math.max(1, Math.ceil(bytes.length / CHUNK_BINARY_BYTES));

  const fileRef = doc(collection(db, 'chat_files'));
  const fileId = fileRef.id;
  const fileName = (file.name || 'nyaraka.pdf').slice(0, 140);
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const mimeType = (
    file.type || (ext === 'pdf' ? 'application/pdf' : 'application/octet-stream')
  ).slice(0, 120);

  await setDoc(fileRef, {
    fileId,
    uploaderId,
    fileName,
    fileSize: bytes.length,
    mimeType,
    chunkCount: totalChunks,
    createdAt: serverTimestamp(),
  });

  // Upload chunks in parallel batches of 4 for speed and reliability
  for (let start = 0; start < totalChunks; start += 4) {
    const end = Math.min(totalChunks, start + 4);
    const batchPromises: Promise<void>[] = [];
    for (let idx = start; idx < end; idx++) {
      const offset = idx * CHUNK_BINARY_BYTES;
      const slice = bytes.subarray(offset, Math.min(offset + CHUNK_BINARY_BYTES, bytes.length));
      const b64 = uint8ArrayToBase64(slice);
      batchPromises.push(
        setDoc(doc(db, 'chat_files', fileId, 'chunks', String(idx)), {
          fileId,
          uploaderId,
          chunkIndex: idx,
          data: b64,
        })
      );
    }
    await Promise.all(batchPromises);
  }

  memoryFileCache.set(fileId, {
    bytes,
    fileName,
    mimeType,
  });

  return {
    url: `${FIRESTORE_CHAT_FILE_PREFIX}${fileId}`,
    fileId,
    fileName,
    fileSize: bytes.length,
    mimeType,
  };
}

export async function readFirestoreChatFileBytes(
  fileUrl: string
): Promise<CachedChatFile> {
  const fileId = extractFirestoreChatFileId(fileUrl);
  if (!fileId) {
    throw new Error('Kiungo cha faili si sahihi.');
  }

  const cached = memoryFileCache.get(fileId);
  if (cached) {
    return cached;
  }

  const metaSnap = await getDoc(doc(db, 'chat_files', fileId));
  if (!metaSnap.exists()) {
    throw new Error('Faili halijapatikana kwenye hifadhi.');
  }

  const meta = metaSnap.data();
  const fileName = String(meta.fileName || 'nyaraka.pdf');
  const mimeType = String(meta.mimeType || 'application/pdf');
  const chunkCount = Math.max(1, Math.min(100, Number(meta.chunkCount || 1)));

  const chunkIndexes = Array.from({ length: chunkCount }, (_, i) => i);
  const chunkSnaps = await Promise.all(
    chunkIndexes.map((idx) => getDoc(doc(db, 'chat_files', fileId, 'chunks', String(idx))))
  );

  const decodedParts: Uint8Array[] = [];
  let totalLength = 0;
  for (const snap of chunkSnaps) {
    if (!snap.exists()) {
      throw new Error('Sehemu ya faili imekosekana kwenye hifadhi.');
    }
    const b64 = String(snap.data().data || '');
    const part = base64ToUint8Array(b64);
    decodedParts.push(part);
    totalLength += part.length;
  }

  const combined = new Uint8Array(totalLength);
  let cursor = 0;
  for (const part of decodedParts) {
    combined.set(part, cursor);
    cursor += part.length;
  }

  const result: CachedChatFile = {
    bytes: combined,
    fileName,
    mimeType,
  };
  memoryFileCache.set(fileId, result);
  return result;
}
