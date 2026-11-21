import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  Folder,
  FolderInput,
  FolderLock,
  FolderOpen,
  FolderPlus,
  HardDrive,
  ImagePlus,
  Info,
  KeyRound,
  Loader2,
  Lock,
  Pause,
  Play,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Unlock,
  UploadCloud,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import {
  prepareDataSaverImageFile,
  prepareSharedImageFile,
  uploadImageToCloudinaryWithProgress,
} from '../services/cloudinaryService';
import {
  computeFileSha256,
  createOwnerPhotoFolder,
  deleteOwnerPhotoFolder,
  deleteOwnerPrivatePhoto,
  listOwnerPhotoFolders,
  listOwnerPrivatePhotos,
  ownerPrivatePhotoExists,
  renameOwnerPhotoFolder,
  saveOwnerPrivatePhotoRecord,
  updateOwnerPhotoFolderPin,
  updateOwnerPrivatePhotoMeta,
} from '../services/forumService';
import { OwnerPhotoFolder, OwnerPrivatePhoto } from '../types';
import {
  clearAllVaultPhotoCache,
  deleteCachedVaultPhoto,
  enqueuePersistedVaultUpload,
  generateLocalVaultBlobs,
  getCachedVaultPhoto,
  getVaultCacheStats,
  listPersistedVaultUploads,
  PersistedVaultUploadItem,
  putCachedVaultPhoto,
  removePersistedVaultUpload,
  updatePersistedVaultUploadStatus,
} from '../utils/photoVaultStorage';
import { createZipBlob, ZipInputEntry } from '../utils/zipBuilder';

interface OwnerPrivatePhotoVaultProps {
  ownerUid: string;
  onToast: (message: string) => void;
}

interface MergedFolder {
  folderId: string;
  name: string;
  parentId: string;
  pinHash: string;
  isVirtual: boolean;
}

interface UploadBatchResult {
  uploaded: number;
  duplicates: number;
  failed: number;
}

function formatBytesCompact(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function buildCloudinaryThumbUrl(imageUrl: string, width = 240): string {
  const clean = (imageUrl || '').trim();
  const marker = '/image/upload/';
  if (!clean.startsWith('https://res.cloudinary.com/') || !clean.includes(marker)) {
    return clean;
  }
  const idx = clean.indexOf(marker);
  const after = clean.slice(idx + marker.length);
  if (/^(?:[a-z_]+:[^/]+,?)+(\/|$)/i.test(after) || after.startsWith('f_')) {
    return clean;
  }
  return `${clean.slice(0, idx + marker.length)}f_auto,q_auto:eco,w_${width},c_limit/${after}`;
}

async function hashFolderPin(pin: string, ownerUid: string): Promise<string> {
  const cleanPin = pin.trim();
  if (!cleanPin) return '';
  return computeFileSha256(new Blob([`malosha_vault_pin_v1:${ownerUid}:${cleanPin}`]));
}

async function readImageDimensions(file: Blob): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      const dims = { width: bmp.width || 0, height: bmp.height || 0 };
      bmp.close();
      return dims;
    } catch {
      // fallback to Image element
    }
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const dims = { width: img.naturalWidth || 0, height: img.naturalHeight || 0 };
      URL.revokeObjectURL(url);
      resolve(dims);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 0, height: 0 });
    };
    img.src = url;
  });
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 45_000);
}

const SW_MONTHS = [
  'Januari',
  'Februari',
  'Machi',
  'Aprili',
  'Mei',
  'Juni',
  'Julai',
  'Agosti',
  'Septemba',
  'Oktoba',
  'Novemba',
  'Desemba',
];

const EN_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function getDayKeyAndLabel(
  tsMs: number,
  tr: (sw: string, en: string) => string
): { key: string; label: string } {
  if (!tsMs) {
    return { key: 'unknown', label: tr('Tarehe Haijulikani', 'Unknown Date') };
  }
  const d = new Date(tsMs);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const itemStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((todayStart - itemStart) / 86_400_000);

  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;

  if (diffDays === 0) {
    return { key, label: tr('Leo', 'Today') };
  }
  if (diffDays === 1) {
    return { key, label: tr('Jana', 'Yesterday') };
  }
  const monthSw = SW_MONTHS[d.getMonth()] || '';
  const monthEn = EN_MONTHS[d.getMonth()] || '';
  return {
    key,
    label: tr(
      `${d.getDate()} ${monthSw} ${d.getFullYear()}`,
      `${monthEn} ${d.getDate()}, ${d.getFullYear()}`
    ),
  };
}

interface CachedVaultImageProps {
  photo: OwnerPrivatePhoto;
  variant: 'thumb' | 'view' | 'original';
  alt: string;
  className?: string;
  onOfflineHit?: () => void;
  onNetworkBytesLoaded?: (bytes: number) => void;
  onCacheUpdated?: (fileHash: string) => void;
  onSourceMode?: (mode: 'offline' | 'eco' | 'original') => void;
}

const CachedVaultImage: React.FC<CachedVaultImageProps> = ({
  photo,
  variant,
  alt,
  className = '',
  onOfflineHit,
  onNetworkBytesLoaded,
  onCacheUpdated,
  onSourceMode,
}) => {
  const [resolvedSrc, setResolvedSrc] = useState<string>('');
  const [failed, setFailed] = useState(false);

  const callbacksRef = useRef({
    onOfflineHit,
    onNetworkBytesLoaded,
    onCacheUpdated,
    onSourceMode,
  });
  callbacksRef.current = {
    onOfflineHit,
    onNetworkBytesLoaded,
    onCacheUpdated,
    onSourceMode,
  };

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    const load = async () => {
      setFailed(false);
      setResolvedSrc('');

      if (variant !== 'original') {
        const cached = await getCachedVaultPhoto(photo.fileHash);
        const hitBlob =
          variant === 'thumb'
            ? cached?.thumbBlob || cached?.viewBlob
            : cached?.viewBlob;
        if (!cancelled && hitBlob && hitBlob.size > 0) {
          objectUrl = URL.createObjectURL(hitBlob);
          setResolvedSrc(objectUrl);
          callbacksRef.current.onOfflineHit?.();
          callbacksRef.current.onSourceMode?.('offline');
          return;
        }
      }

      const targetUrl =
        variant === 'thumb'
          ? buildCloudinaryThumbUrl(photo.imageUrl, 240)
          : variant === 'view'
            ? buildCloudinaryThumbUrl(photo.imageUrl, 1080)
            : photo.imageUrl;

      try {
        const res = await fetch(targetUrl, { mode: 'cors', credentials: 'omit' });
        if (!res.ok) throw new Error('Fetch failed');
        const blob = await res.blob();
        if (cancelled) return;

        callbacksRef.current.onNetworkBytesLoaded?.(blob.size);
        callbacksRef.current.onSourceMode?.(variant === 'original' ? 'original' : 'eco');

        if (variant === 'thumb') {
          await putCachedVaultPhoto(photo.fileHash, { thumbBlob: blob });
          callbacksRef.current.onCacheUpdated?.(photo.fileHash);
        } else if (variant === 'view') {
          await putCachedVaultPhoto(photo.fileHash, { viewBlob: blob });
          callbacksRef.current.onCacheUpdated?.(photo.fileHash);
        }

        if (!cancelled) {
          objectUrl = URL.createObjectURL(blob);
          setResolvedSrc(objectUrl);
        }
      } catch {
        if (!cancelled) {
          setResolvedSrc(targetUrl);
          callbacksRef.current.onSourceMode?.(variant === 'original' ? 'original' : 'eco');
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [photo.fileHash, photo.imageUrl, variant]);

  if (failed || !resolvedSrc) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">
        {failed ? (
          <WifiOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        )}
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};

export const OwnerPrivatePhotoVault: React.FC<OwnerPrivatePhotoVaultProps> = ({
  ownerUid,
  onToast,
}) => {
  const { tr } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [photos, setPhotos] = useState<OwnerPrivatePhoto[]>([]);
  const [folders, setFolders] = useState<OwnerPhotoFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);

  // Strict folder-first privacy navigation
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [unlockedFolderIds, setUnlockedFolderIds] = useState<Set<string>>(new Set());
  const [pinPromptFolder, setPinPromptFolder] = useState<MergedFolder | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [verifyingPin, setVerifyingPin] = useState(false);

  // Folder create / rename / PIN management modals
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderPin, setNewFolderPin] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);

  const [renameTarget, setRenameTarget] = useState<MergedFolder | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [savingFolderEdit, setSavingFolderEdit] = useState(false);

  const [pinSettingsTarget, setPinSettingsTarget] = useState<MergedFolder | null>(null);
  const [pinSettingsValue, setPinSettingsValue] = useState('');

  // Zero-MB Local Cache & Session Data Usage Meter
  const [cacheStats, setCacheStats] = useState<{
    count: number;
    totalBytes: number;
    cachedHashes: Set<string>;
  }>({ count: 0, totalBytes: 0, cachedHashes: new Set() });
  const [offlineHits, setOfflineHits] = useState(0);
  const [sessionNetworkBytes, setSessionNetworkBytes] = useState(0);
  const [precachingFolder, setPrecachingFolder] = useState<{
    done: number;
    total: number;
  } | null>(null);

  // Resumable Persistent Upload Queue (IndexedDB-backed)
  const [uploadPanelOpen, setUploadPanelOpen] = useState(false);
  const [uploadTargetFolderId, setUploadTargetFolderId] = useState<string>('');
  const [dataSaverUpload, setDataSaverUpload] = useState(true);
  const [queueItems, setQueueItems] = useState<PersistedVaultUploadItem[]>([]);
  const [isQueueRunning, setIsQueueRunning] = useState(false);
  const [isQueuePaused, setIsQueuePaused] = useState(false);
  const [currentItemPct, setCurrentItemPct] = useState(0);
  const [batchStats, setBatchStats] = useState<{
    totalQueued: number;
    doneCount: number;
    uploaded: number;
    duplicates: number;
    failed: number;
    currentFileName: string;
    totalBytes: number;
    completedBytes: number;
  } | null>(null);
  const [lastBatchResult, setLastBatchResult] = useState<UploadBatchResult | null>(null);

  const pauseRequestedRef = useRef(false);
  const workerActiveRef = useRef(false);
  const autoResumedCheckedRef = useRef(false);

  // Inside-folder search, multi-select, move & download
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveDestFolderId, setMoveDestFolderId] = useState('');
  const [movingBusy, setMovingBusy] = useState(false);

  const [downloadingSingleId, setDownloadingSingleId] = useState<string | null>(null);
  const [zipBusy, setZipBusy] = useState<{ done: number; total: number } | null>(null);

  // Fullscreen Google Photos Lightbox
  const [lightboxPhoto, setLightboxPhoto] = useState<OwnerPrivatePhoto | null>(null);
  const [lightboxVariant, setLightboxVariant] = useState<'view' | 'original'>('view');
  const [lightboxSourceMode, setLightboxSourceMode] = useState<'offline' | 'eco' | 'original'>(
    'offline'
  );
  const [lightboxShowInfo, setLightboxShowInfo] = useState(false);
  const [editFolderId, setEditFolderId] = useState('');
  const [editCaption, setEditCaption] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);

  // Confirm delete states
  const [confirmDeletePhotoId, setConfirmDeletePhotoId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<MergedFolder | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const refreshCacheStats = useCallback(async () => {
    const stats = await getVaultCacheStats();
    setCacheStats(stats);
  }, []);

  const loadVault = useCallback(async () => {
    setLoading(true);
    try {
      const [photoList, folderList] = await Promise.all([
        listOwnerPrivatePhotos(),
        listOwnerPhotoFolders(),
      ]);
      setPhotos(photoList);
      setFolders(folderList);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kupakia kabati la picha.', 'Failed to load photo vault.');
      onToast(msg);
    } finally {
      setLoading(false);
    }
  }, [onToast, tr]);

  useEffect(() => {
    void loadVault();
    void refreshCacheStats();
  }, [loadVault, refreshCacheStats]);

  // Build unified folder tree (Firestore folders + virtual fallback folders for legacy album strings)
  const mergedFolders = useMemo<MergedFolder[]>(() => {
    const map = new Map<string, MergedFolder>();
    for (const f of folders) {
      map.set(f.folderId, {
        folderId: f.folderId,
        name: f.name,
        parentId: f.parentId || '',
        pinHash: f.pinHash || '',
        isVirtual: false,
      });
    }
    for (const p of photos) {
      const albumKey = (p.album || 'Binafsi').trim() || 'Binafsi';
      if (!map.has(albumKey)) {
        map.set(albumKey, {
          folderId: albumKey,
          name: albumKey,
          parentId: '',
          pinHash: '',
          isVirtual: true,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [folders, photos]);

  const folderById = useMemo(() => {
    const map = new Map<string, MergedFolder>();
    mergedFolders.forEach((f) => map.set(f.folderId, f));
    return map;
  }, [mergedFolders]);

  // Helper: check if folder or any ancestor requires PIN and isn't unlocked yet
  const findFirstLockedFolderInPath = useCallback(
    (folderId: string | null): MergedFolder | null => {
      if (!folderId) return null;
      const chain: MergedFolder[] = [];
      let curId = folderId;
      const visited = new Set<string>();
      while (curId && !visited.has(curId)) {
        visited.add(curId);
        const f = folderById.get(curId);
        if (!f) break;
        chain.unshift(f);
        curId = f.parentId;
      }
      for (const f of chain) {
        if (f.pinHash && !unlockedFolderIds.has(f.folderId)) {
          return f;
        }
      }
      return null;
    },
    [folderById, unlockedFolderIds]
  );

  // Recursive descendant counts so root folder cards show total items safely without exposing photos
  const folderStatsMap = useMemo(() => {
    const directPhotos = new Map<string, number>();
    const directSubfolders = new Map<string, number>();
    for (const f of mergedFolders) {
      if (f.parentId) {
        directSubfolders.set(f.parentId, (directSubfolders.get(f.parentId) || 0) + 1);
      }
    }
    for (const p of photos) {
      const key = (p.album || 'Binafsi').trim() || 'Binafsi';
      directPhotos.set(key, (directPhotos.get(key) || 0) + 1);
    }

    const totalPhotosRec = (fid: string, visited = new Set<string>()): number => {
      if (visited.has(fid)) return 0;
      visited.add(fid);
      let sum = directPhotos.get(fid) || 0;
      for (const child of mergedFolders) {
        if (child.parentId === fid) {
          sum += totalPhotosRec(child.folderId, visited);
        }
      }
      return sum;
    };

    const stats = new Map<string, { directPhotos: number; totalPhotos: number; subfolders: number }>();
    for (const f of mergedFolders) {
      stats.set(f.folderId, {
        directPhotos: directPhotos.get(f.folderId) || 0,
        totalPhotos: totalPhotosRec(f.folderId),
        subfolders: directSubfolders.get(f.folderId) || 0,
      });
    }
    return stats;
  }, [mergedFolders, photos]);

  // Visible subfolders in current view (either root when currentFolderId === null, or children of currentFolderId)
  const visibleChildFolders = useMemo(() => {
    const parentTarget = currentFolderId || '';
    return mergedFolders.filter((f) => (f.parentId || '') === parentTarget);
  }, [mergedFolders, currentFolderId]);

  const currentFolder = useMemo(
    () => (currentFolderId ? folderById.get(currentFolderId) || null : null),
    [currentFolderId, folderById]
  );

  // Breadcrumb path from root -> currentFolder
  const breadcrumbs = useMemo(() => {
    const list: MergedFolder[] = [];
    let curId = currentFolderId || '';
    const visited = new Set<string>();
    while (curId && !visited.has(curId)) {
      visited.add(curId);
      const f = folderById.get(curId);
      if (!f) break;
      list.unshift(f);
      curId = f.parentId;
    }
    return list;
  }, [currentFolderId, folderById]);

  const isCurrentFolderLocked = useMemo(
    () => Boolean(findFirstLockedFolderInPath(currentFolderId)),
    [findFirstLockedFolderInPath, currentFolderId]
  );

  // STRICT PRIVACY: Only compute photos inside the currently OPEN & UNLOCKED folder
  const currentFolderPhotos = useMemo(() => {
    if (!currentFolderId || isCurrentFolderLocked) return [];
    const q = searchQuery.trim().toLowerCase();
    return photos.filter((p) => {
      const key = (p.album || 'Binafsi').trim() || 'Binafsi';
      if (key !== currentFolderId) return false;
      if (!q) return true;
      return (
        p.fileName.toLowerCase().includes(q) ||
        p.caption.toLowerCase().includes(q)
      );
    });
  }, [currentFolderId, isCurrentFolderLocked, photos, searchQuery]);

  // Group current folder photos into Google Photos chronological day sections
  const photoTimelineGroups = useMemo(() => {
    const groups: { key: string; label: string; items: OwnerPrivatePhoto[] }[] = [];
    const byKey = new Map<string, { key: string; label: string; items: OwnerPrivatePhoto[] }>();
    for (const p of currentFolderPhotos) {
      const ms = p.createdAt ? p.createdAt.toMillis() : 0;
      const { key, label } = getDayKeyAndLabel(ms, tr);
      let grp = byKey.get(key);
      if (!grp) {
        grp = { key, label, items: [] };
        byKey.set(key, grp);
        groups.push(grp);
      }
      grp.items.push(p);
    }
    return groups;
  }, [currentFolderPhotos, tr]);

  const totalVaultSizeBytes = useMemo(
    () => photos.reduce((acc, p) => acc + (p.fileSize || 0), 0),
    [photos]
  );

  // Open a folder (checking PIN first)
  const handleAttemptOpenFolder = (folder: MergedFolder) => {
    setSelectedIds(new Set());
    setSearchQuery('');
    const lockedParent = findFirstLockedFolderInPath(folder.folderId);
    if (lockedParent) {
      setPinPromptFolder(lockedParent);
      setPinInput('');
      setPinError('');
      return;
    }
    setCurrentFolderId(folder.folderId);
    setUploadTargetFolderId(folder.folderId);
  };

  const handleSubmitPinUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinPromptFolder || verifyingPin) return;
    if (!pinInput.trim()) {
      setPinError(tr('Ingiza PIN ya faili.', 'Enter folder PIN.'));
      return;
    }
    setVerifyingPin(true);
    setPinError('');
    try {
      const enteredHash = await hashFolderPin(pinInput, ownerUid);
      if (enteredHash !== pinPromptFolder.pinHash) {
        setPinError(tr('PIN si sahihi. Jaribu tena.', 'Incorrect PIN. Try again.'));
        return;
      }
      const next = new Set(unlockedFolderIds);
      next.add(pinPromptFolder.folderId);
      setUnlockedFolderIds(next);
      const targetId = pinPromptFolder.folderId;
      setPinPromptFolder(null);
      setPinInput('');
      setCurrentFolderId(targetId);
      setUploadTargetFolderId(targetId);
    } finally {
      setVerifyingPin(false);
    }
  };

  const handleLockAllFolders = () => {
    setUnlockedFolderIds(new Set());
    setCurrentFolderId(null);
    setSelectedIds(new Set());
    setLightboxPhoto(null);
    onToast(tr('Mafile yote yenye kufuli yamefungwa.', 'All PIN-locked folders locked.'));
  };

  // Create Folder (at root OR inside currentFolderId)
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newFolderName.trim();
    if (!cleanName) {
      onToast(tr('Andika jina la faili.', 'Enter a folder name.'));
      return;
    }
    const cleanPin = newFolderPin.trim();
    if (cleanPin && cleanPin.length < 4) {
      onToast(tr('PIN iwe na tarakimu 4 au zaidi.', 'PIN must be at least 4 digits/chars.'));
      return;
    }
    setCreatingFolder(true);
    try {
      const pinHash = cleanPin ? await hashFolderPin(cleanPin, ownerUid) : '';
      const created = await createOwnerPhotoFolder(ownerUid, {
        name: cleanName,
        parentId: currentFolderId || '',
        pinHash,
      });
      setFolders((prev) => [...prev, created]);
      if (created.pinHash) {
        setUnlockedFolderIds((prev) => new Set(prev).add(created.folderId));
      }
      setShowCreateFolder(false);
      setNewFolderName('');
      setNewFolderPin('');
      setUploadTargetFolderId(created.folderId);
      onToast(
        created.pinHash
          ? tr(`Faili "${created.name}" lenye PIN limeundwa.`, `Locked folder "${created.name}" created.`)
          : tr(`Faili "${created.name}" limeundwa.`, `Folder "${created.name}" created.`)
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : tr('Imeshindwa kuunda faili.', 'Failed to create folder.'));
    } finally {
      setCreatingFolder(false);
    }
  };

  // Materialize a legacy virtual folder into a real OwnerPhotoFolder when renaming or setting PIN
  const ensureRealFolder = async (folder: MergedFolder, overrideName?: string, pinHash = ''): Promise<string> => {
    if (!folder.isVirtual) return folder.folderId;
    const created = await createOwnerPhotoFolder(ownerUid, {
      name: overrideName || folder.name,
      parentId: '',
      pinHash,
    });
    setFolders((prev) => [...prev, created]);
    const matchingPhotos = photos.filter((p) => (p.album || 'Binafsi').trim() === folder.folderId);
    for (const p of matchingPhotos) {
      await updateOwnerPrivatePhotoMeta(p.photoId, created.folderId, p.caption);
    }
    setPhotos((prev) =>
      prev.map((p) =>
        (p.album || 'Binafsi').trim() === folder.folderId ? { ...p, album: created.folderId } : p
      )
    );
    if (currentFolderId === folder.folderId) {
      setCurrentFolderId(created.folderId);
    }
    return created.folderId;
  };

  const handleSaveRenameFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget) return;
    const clean = renameValue.trim();
    if (!clean) return;
    setSavingFolderEdit(true);
    try {
      if (renameTarget.isVirtual) {
        await ensureRealFolder(renameTarget, clean);
      } else {
        await renameOwnerPhotoFolder(renameTarget.folderId, clean);
        setFolders((prev) =>
          prev.map((f) => (f.folderId === renameTarget.folderId ? { ...f, name: clean } : f))
        );
      }
      setRenameTarget(null);
      onToast(tr('Jina la faili limebadilishwa.', 'Folder renamed.'));
    } catch (err) {
      onToast(err instanceof Error ? err.message : tr('Imeshindwa kubadili jina.', 'Rename failed.'));
    } finally {
      setSavingFolderEdit(false);
    }
  };

  const handleSaveFolderPin = async (e: React.FormEvent, removePin = false) => {
    e.preventDefault();
    if (!pinSettingsTarget) return;
    const clean = pinSettingsValue.trim();
    if (!removePin && clean.length < 4) {
      onToast(tr('Weka PIN yenye herufi/tarakimu angalau 4.', 'PIN must be at least 4 characters.'));
      return;
    }
    setSavingFolderEdit(true);
    try {
      const nextHash = removePin ? '' : await hashFolderPin(clean, ownerUid);
      if (pinSettingsTarget.isVirtual) {
        const realId = await ensureRealFolder(pinSettingsTarget, pinSettingsTarget.name, nextHash);
        if (nextHash) {
          setUnlockedFolderIds((prev) => new Set(prev).add(realId));
        }
      } else {
        await updateOwnerPhotoFolderPin(pinSettingsTarget.folderId, nextHash);
        setFolders((prev) =>
          prev.map((f) =>
            f.folderId === pinSettingsTarget.folderId ? { ...f, pinHash: nextHash } : f
          )
        );
        if (nextHash) {
          setUnlockedFolderIds((prev) => new Set(prev).add(pinSettingsTarget.folderId));
        }
      }
      setPinSettingsTarget(null);
      setPinSettingsValue('');
      onToast(
        removePin
          ? tr('Kufuli (PIN) ya faili imeondolewa.', 'Folder PIN removed.')
          : tr('Kufuli (PIN) ya faili imehifadhiwa.', 'Folder PIN saved.')
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : tr('Imeshindwa kuhifadhi PIN.', 'Failed to save PIN.'));
    } finally {
      setSavingFolderEdit(false);
    }
  };

  const handleDeleteFolder = async (folder: MergedFolder) => {
    const stat = folderStatsMap.get(folder.folderId);
    if (stat && (stat.totalPhotos > 0 || stat.subfolders > 0)) {
      onToast(
        tr(
          'Hamisha au futa picha na mafile ya ndani kwanza kabla ya kufuta faili hili.',
          'Move or delete all photos and subfolders before deleting this folder.'
        )
      );
      setConfirmDeleteFolder(null);
      return;
    }
    setDeletingBusy(true);
    try {
      if (!folder.isVirtual) {
        await deleteOwnerPhotoFolder(folder.folderId);
        setFolders((prev) => prev.filter((f) => f.folderId !== folder.folderId));
      }
      if (currentFolderId === folder.folderId) {
        setCurrentFolderId(folder.parentId || null);
      }
      setConfirmDeleteFolder(null);
      onToast(tr('Faili limefutwa.', 'Folder deleted.'));
    } catch (err) {
      onToast(err instanceof Error ? err.message : tr('Imeshindwa kufuta faili.', 'Delete failed.'));
    } finally {
      setDeletingBusy(false);
    }
  };

  // PERSISTENT RESUMABLE UPLOAD QUEUE ENGINE (survives phone shutdown!)
  const processPersistedQueue = useCallback(async () => {
    if (workerActiveRef.current) return;
    workerActiveRef.current = true;
    pauseRequestedRef.current = false;
    setIsQueueRunning(true);
    setIsQueuePaused(false);
    setLastBatchResult(null);

    let wakeLock: { release?: () => Promise<void> } | null = null;
    try {
      const navAny = navigator as unknown as {
        wakeLock?: { request: (type: 'screen') => Promise<{ release?: () => Promise<void> }> };
      };
      if (navAny?.wakeLock?.request) {
        wakeLock = await navAny.wakeLock.request('screen').catch(() => null);
      }
    } catch {
      // Ignore wake lock errors
    }

    let uploaded = 0;
    let duplicates = 0;
    let failed = 0;

    try {
      const initialList = await listPersistedVaultUploads(ownerUid);
      const pendingList = initialList.filter(
        (item) => item.status === 'pending' || item.status === 'uploading'
      );
      if (pendingList.length === 0) {
        setQueueItems(initialList);
        return;
      }

      const totalQueued = pendingList.length;
      const totalBytes = pendingList.reduce((acc, it) => acc + (it.fileSize || 0), 0);
      let completedBytes = 0;
      let doneCount = 0;

      for (const item of pendingList) {
        if (pauseRequestedRef.current) {
          setIsQueuePaused(true);
          break;
        }

        setCurrentItemPct(2);
        setBatchStats({
          totalQueued,
          doneCount,
          uploaded,
          duplicates,
          failed,
          currentFileName: item.fileName,
          totalBytes,
          completedBytes,
        });

        await updatePersistedVaultUploadStatus(item.queueId, 'uploading');

        try {
          const originalFile = new File([item.fileBlob], item.fileName, {
            type: item.mimeType || 'image/jpeg',
          });
          // Hash raw original so duplicate blocking stays 100% consistent
          const originalHash = await computeFileSha256(originalFile);

          // Pre-cache thumbnail & data-saver view blobs locally -> 0 MB viewing forever!
          const localBlobs = await generateLocalVaultBlobs(originalFile);
          if (localBlobs.thumbBlob || localBlobs.viewBlob) {
            await putCachedVaultPhoto(originalHash, localBlobs);
          }

          const alreadySaved = await ownerPrivatePhotoExists(originalHash);
          if (alreadySaved) {
            duplicates += 1;
            await removePersistedVaultUpload(item.queueId);
            doneCount += 1;
            completedBytes += item.fileSize || 0;
            setCurrentItemPct(100);
            continue;
          }

          if (pauseRequestedRef.current) {
            await updatePersistedVaultUploadStatus(item.queueId, 'pending');
            setIsQueuePaused(true);
            break;
          }

          setCurrentItemPct(8);
          const preparedFile = item.useDataSaver
            ? await prepareDataSaverImageFile(originalFile, { maxDim: 1600, quality: 0.78 })
            : await prepareSharedImageFile(originalFile);
          const dims = await readImageDimensions(preparedFile);

          const imageUrl = await uploadImageToCloudinaryWithProgress(
            preparedFile,
            (pct) => {
              const mapped = Math.min(96, Math.max(10, Math.round(10 + pct * 0.85)));
              setCurrentItemPct(mapped);
            }
          );

          const res = await saveOwnerPrivatePhotoRecord(ownerUid, {
            fileHash: originalHash,
            fileName: originalFile.name.slice(0, 140),
            mimeType: preparedFile.type || originalFile.type || 'image/jpeg',
            fileSize: preparedFile.size,
            width: dims.width,
            height: dims.height,
            imageUrl,
            album: item.targetFolderId || 'Binafsi',
            caption: '',
          });

          if (res.status === 'duplicate') {
            duplicates += 1;
          } else {
            uploaded += 1;
            setPhotos((prev) =>
              prev.some((x) => x.photoId === res.photo.photoId) ? prev : [res.photo, ...prev]
            );
          }

          await removePersistedVaultUpload(item.queueId);
          setCurrentItemPct(100);
          doneCount += 1;
          completedBytes += item.fileSize || 0;
        } catch (err) {
          failed += 1;
          doneCount += 1;
          completedBytes += item.fileSize || 0;
          const errMsg = err instanceof Error ? err.message : 'Hitilafu ya mtandao.';
          await updatePersistedVaultUploadStatus(item.queueId, 'failed', errMsg);
        }

        const refreshedQueue = await listPersistedVaultUploads(ownerUid);
        setQueueItems(refreshedQueue);
        setBatchStats({
          totalQueued,
          doneCount,
          uploaded,
          duplicates,
          failed,
          currentFileName: item.fileName,
          totalBytes,
          completedBytes,
        });
      }

      const remaining = await listPersistedVaultUploads(ownerUid);
      setQueueItems(remaining);
      await refreshCacheStats();

      if (!pauseRequestedRef.current) {
        setLastBatchResult({ uploaded, duplicates, failed });
        if (uploaded > 0 && failed === 0) {
          onToast(
            tr(
              `Picha ${uploaded} zimehifadhiwa na kuwekwa kwenye cache (0 MB kufungua).`,
              `${uploaded} photo(s) uploaded & cached for 0 MB viewing.`
            )
          );
        } else if (failed > 0) {
          onToast(
            tr(
              `Picha ${uploaded} zimepakia, ${failed} zimesubiri mtandao. Gusa "Endelea" baadaye.`,
              `${uploaded} uploaded, ${failed} paused awaiting network.`
            )
          );
        } else if (duplicates > 0) {
          onToast(
            tr(
              `Picha ${duplicates} zilikuwa tayari zipo (zimezuiwa kujirudia).`,
              `${duplicates} duplicate photo(s) blocked.`
            )
          );
        }
      }
    } finally {
      workerActiveRef.current = false;
      setIsQueueRunning(false);
      setBatchStats(null);
      setCurrentItemPct(0);
      try {
        await wakeLock?.release?.();
      } catch {
        // Ignore
      }
    }
  }, [ownerUid, onToast, refreshCacheStats, tr]);

  // Check IndexedDB on mount: if phone shut down mid-upload, pick up right where it left off!
  useEffect(() => {
    if (autoResumedCheckedRef.current) return;
    autoResumedCheckedRef.current = true;
    const initQueue = async () => {
      const saved = await listPersistedVaultUploads(ownerUid);
      if (saved.length === 0) return;
      setQueueItems(saved);
      const hasUnfinishedPending = saved.some(
        (it) => it.status === 'pending' || it.status === 'uploading'
      );
      if (hasUnfinishedPending) {
        onToast(
          tr(
            `Inaendelea kupakia picha ${saved.length} zilizobaki kabla simu kuzima...`,
            `Resuming ${saved.length} queued photo(s) automatically...`
          )
        );
        void processPersistedQueue();
      }
    };
    void initQueue();
  }, [ownerUid, onToast, processPersistedQueue, tr]);

  const handleEnqueueSelectedFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter(
      (f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic)$/i.test(f.name)
    );
    if (files.length === 0) {
      onToast(tr('Chagua picha halali (JPG, PNG, WEBP, GIF).', 'Select valid image files.'));
      return;
    }

    // Ensure a target folder exists (strict folder privacy: never leave at unfiled open root)
    let destFolderId = (currentFolderId || uploadTargetFolderId || '').trim();
    let destFolderName = folderById.get(destFolderId)?.name || '';

    if (!destFolderId) {
      // Auto-create a default private folder if owner hasn't created any yet
      if (mergedFolders.length > 0) {
        destFolderId = mergedFolders[0].folderId;
        destFolderName = mergedFolders[0].name;
      } else {
        const created = await createOwnerPhotoFolder(ownerUid, {
          name: 'Picha Binafsi',
          parentId: '',
          pinHash: '',
        });
        setFolders((prev) => [...prev, created]);
        destFolderId = created.folderId;
        destFolderName = created.name;
      }
      setUploadTargetFolderId(destFolderId);
    }

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const qId = `q_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`;
      await enqueuePersistedVaultUpload({
        queueId: qId,
        ownerUid,
        targetFolderId: destFolderId,
        targetFolderName: destFolderName || destFolderId,
        fileName: f.name || `picha_${i + 1}.jpg`,
        mimeType: f.type || 'image/jpeg',
        fileSize: f.size,
        fileBlob: f,
        useDataSaver: dataSaverUpload,
        status: 'pending',
        createdAt: Date.now() + i,
      });
    }

    const updated = await listPersistedVaultUploads(ownerUid);
    setQueueItems(updated);
    setUploadPanelOpen(false);
    void processPersistedQueue();
  };

  const handleRetryFailedAndResume = async () => {
    const items = await listPersistedVaultUploads(ownerUid);
    for (const it of items) {
      if (it.status === 'failed') {
        await updatePersistedVaultUploadStatus(it.queueId, 'pending', '');
      }
    }
    const updated = await listPersistedVaultUploads(ownerUid);
    setQueueItems(updated);
    void processPersistedQueue();
  };

  const handlePauseQueue = () => {
    pauseRequestedRef.current = true;
    onToast(tr('Inasimamisha foleni baada ya picha hii...', 'Pausing after current photo...'));
  };

  const handleClearQueue = async () => {
    pauseRequestedRef.current = true;
    const all = await listPersistedVaultUploads(ownerUid);
    for (const it of all) {
      if (it.status !== 'uploading') {
        await removePersistedVaultUpload(it.queueId);
      }
    }
    const left = await listPersistedVaultUploads(ownerUid);
    setQueueItems(left);
    setIsQueuePaused(false);
    onToast(tr('Foleni ya upakiaji imefutwa.', 'Upload queue cleared.'));
  };

  // Pre-cache current open folder 100% into IndexedDB so all subsequent views cost 0 MB
  const handlePrecacheCurrentFolder = async () => {
    if (!currentFolderPhotos.length || precachingFolder) return;
    const uncached = currentFolderPhotos.filter(
      (p) => !cacheStats.cachedHashes.has(p.fileHash)
    );
    if (uncached.length === 0) {
      onToast(
        tr(
          'Picha zote za faili hili tayari zipo offline (0 MB kufungua)!',
          'All photos in this folder are already cached offline (0 MB to open)!'
        )
      );
      return;
    }
    setPrecachingFolder({ done: 0, total: uncached.length });
    let loaded = 0;
    for (let i = 0; i < uncached.length; i++) {
      const p = uncached[i];
      try {
        const res = await fetch(buildCloudinaryThumbUrl(p.imageUrl, 280), {
          mode: 'cors',
          credentials: 'omit',
        });
        if (res.ok) {
          const blob = await res.blob();
          setSessionNetworkBytes((prev) => prev + blob.size);
          await putCachedVaultPhoto(p.fileHash, { thumbBlob: blob });
          loaded += 1;
        }
      } catch {
        // Skip failed item
      }
      setPrecachingFolder({ done: i + 1, total: uncached.length });
    }
    setPrecachingFolder(null);
    await refreshCacheStats();
    onToast(
      tr(
        `Picha ${loaded} zimehifadhiwa kwenye kifaa (sasa kufungua ni 0 MB).`,
        `${loaded} photo thumbnails saved locally (now 0 MB to open).`
      )
    );
  };

  const handleClearDeviceCache = async () => {
    await clearAllVaultPhotoCache();
    await refreshCacheStats();
    setOfflineHits(0);
    onToast(tr('Cache ya picha kwenye kifaa imesafishwa.', 'Device photo cache cleared.'));
  };

  // Single & ZIP Download (uses local cache offline fallback if needed!)
  const handleDownloadSingle = async (photo: OwnerPrivatePhoto) => {
    setDownloadingSingleId(photo.photoId);
    try {
      try {
        const res = await fetch(photo.imageUrl, { mode: 'cors', credentials: 'omit' });
        if (!res.ok) throw new Error('Network error');
        const blob = await res.blob();
        setSessionNetworkBytes((prev) => prev + blob.size);
        triggerBlobDownload(blob, photo.fileName || `${photo.photoId}.jpg`);
        onToast(tr('Picha imepakuliwa kurudi simuni.', 'Photo saved to device.'));
        return;
      } catch {
        // Fallback to cached IndexedDB viewBlob at 0 MB if offline!
        const cached = await getCachedVaultPhoto(photo.fileHash);
        const fallbackBlob = cached?.viewBlob || cached?.thumbBlob;
        if (fallbackBlob) {
          triggerBlobDownload(fallbackBlob, photo.fileName || `${photo.photoId}.jpg`);
          onToast(
            tr(
              'Imepakuliwa kutoka Offline Cache (0 MB).',
              'Restored from Offline Cache (0 MB).'
            )
          );
          return;
        }
        throw new Error('Offline na picha haijahifadhiwa kwenye cache.');
      }
    } catch {
      onToast(
        tr(
          'Imeshindwa kupakua picha (kagua mtandao).',
          'Failed to download photo (check connection).'
        )
      );
    } finally {
      setDownloadingSingleId(null);
    }
  };

  const handleDownloadZip = async (items: OwnerPrivatePhoto[]) => {
    if (items.length === 0 || zipBusy) return;
    setZipBusy({ done: 0, total: items.length });
    const entries: ZipInputEntry[] = [];
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      try {
        const res = await fetch(p.imageUrl, { mode: 'cors', credentials: 'omit' });
        if (res.ok) {
          const buf = await res.arrayBuffer();
          setSessionNetworkBytes((prev) => prev + buf.byteLength);
          entries.push({
            name: p.fileName || `picha_${i + 1}.jpg`,
            data: new Uint8Array(buf),
            lastModified: p.createdAt ? new Date(p.createdAt.toMillis()) : new Date(),
          });
        }
      } catch {
        const cached = await getCachedVaultPhoto(p.fileHash);
        const fb = cached?.viewBlob || cached?.thumbBlob;
        if (fb) {
          const buf = await fb.arrayBuffer();
          entries.push({
            name: p.fileName || `picha_${i + 1}.jpg`,
            data: new Uint8Array(buf),
            lastModified: p.createdAt ? new Date(p.createdAt.toMillis()) : new Date(),
          });
        }
      }
      setZipBusy({ done: i + 1, total: items.length });
    }
    setZipBusy(null);
    if (entries.length === 0) {
      onToast(tr('Hakuna picha zilizopakuliwa kwenye ZIP.', 'No photos could be bundled.'));
      return;
    }
    const zipBlob = createZipBlob(entries);
    const folderLabel = currentFolder?.name || 'kabati';
    triggerBlobDownload(zipBlob, `${folderLabel}-${entries.length}-picha.zip`);
    onToast(
      tr(
        `Faili la ZIP lenye picha ${entries.length} limepakuliwa.`,
        `ZIP with ${entries.length} photo(s) downloaded.`
      )
    );
  };

  const handleBulkMoveSelected = async () => {
    if (!moveDestFolderId || selectedIds.size === 0) return;
    setMovingBusy(true);
    const ids = Array.from(selectedIds);
    try {
      for (const pid of ids) {
        const p = photos.find((x) => x.photoId === pid);
        if (!p) continue;
        await updateOwnerPrivatePhotoMeta(pid, moveDestFolderId, p.caption);
      }
      setPhotos((prev) =>
        prev.map((p) => (selectedIds.has(p.photoId) ? { ...p, album: moveDestFolderId } : p))
      );
      setSelectedIds(new Set());
      setShowMoveModal(false);
      onToast(
        tr(
          `Picha ${ids.length} zimehamishiwa kwenye faili lingine.`,
          `${ids.length} photo(s) moved.`
        )
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : tr('Imeshindwa kuhamisha.', 'Move failed.'));
    } finally {
      setMovingBusy(false);
    }
  };

  const handleDeletePhotoConfirmed = async (photo: OwnerPrivatePhoto) => {
    setDeletingBusy(true);
    try {
      await deleteOwnerPrivatePhoto(photo.photoId);
      await deleteCachedVaultPhoto(photo.fileHash);
      setPhotos((prev) => prev.filter((p) => p.photoId !== photo.photoId));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(photo.photoId);
        return next;
      });
      if (lightboxPhoto?.photoId === photo.photoId) {
        setLightboxPhoto(null);
      }
      setConfirmDeletePhotoId(null);
      await refreshCacheStats();
      onToast(tr('Picha imefutwa.', 'Photo deleted.'));
    } catch (err) {
      onToast(err instanceof Error ? err.message : tr('Imeshindwa kufuta.', 'Delete failed.'));
    } finally {
      setDeletingBusy(false);
    }
  };

  const handleBulkDeleteConfirmed = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setDeletingBusy(true);
    try {
      for (const pid of ids) {
        const p = photos.find((x) => x.photoId === pid);
        await deleteOwnerPrivatePhoto(pid);
        if (p) await deleteCachedVaultPhoto(p.fileHash);
      }
      setPhotos((prev) => prev.filter((p) => !selectedIds.has(p.photoId)));
      setSelectedIds(new Set());
      setConfirmBulkDelete(false);
      await refreshCacheStats();
      onToast(tr(`Picha ${ids.length} zimefutwa.`, `${ids.length} photo(s) deleted.`));
    } catch (err) {
      onToast(err instanceof Error ? err.message : tr('Hitilafu ya kufuta.', 'Delete failed.'));
    } finally {
      setDeletingBusy(false);
    }
  };

  const openLightboxAt = (photo: OwnerPrivatePhoto) => {
    setLightboxPhoto(photo);
    setLightboxVariant('view');
    setLightboxShowInfo(false);
    setEditFolderId((photo.album || 'Binafsi').trim() || 'Binafsi');
    setEditCaption(photo.caption || '');
  };

  const lightboxIndex = useMemo(() => {
    if (!lightboxPhoto) return -1;
    return currentFolderPhotos.findIndex((p) => p.photoId === lightboxPhoto.photoId);
  }, [currentFolderPhotos, lightboxPhoto]);

  const navigateLightbox = (delta: number) => {
    if (lightboxIndex < 0 || currentFolderPhotos.length === 0) return;
    const nextIdx =
      (lightboxIndex + delta + currentFolderPhotos.length) % currentFolderPhotos.length;
    openLightboxAt(currentFolderPhotos[nextIdx]);
  };

  const handleSaveLightboxMeta = async () => {
    if (!lightboxPhoto) return;
    setSavingMeta(true);
    try {
      const nextAlbum = editFolderId || lightboxPhoto.album || 'Binafsi';
      await updateOwnerPrivatePhotoMeta(lightboxPhoto.photoId, nextAlbum, editCaption);
      setPhotos((prev) =>
        prev.map((p) =>
          p.photoId === lightboxPhoto.photoId
            ? { ...p, album: nextAlbum, caption: editCaption }
            : p
        )
      );
      setLightboxPhoto((prev) =>
        prev ? { ...prev, album: nextAlbum, caption: editCaption } : null
      );
      onToast(tr('Maelezo ya picha yamehifadhiwa.', 'Photo details saved.'));
    } catch (err) {
      onToast(err instanceof Error ? err.message : tr('Imeshindwa kuhifadhi.', 'Save failed.'));
    } finally {
      setSavingMeta(false);
    }
  };

  const toggleSelectPhoto = (photoId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  };

  const toggleSelectDayGroup = (items: OwnerPrivatePhoto[]) => {
    const allSelected = items.every((p) => selectedIds.has(p.photoId));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const p of items) {
        if (allSelected) next.delete(p.photoId);
        else next.add(p.photoId);
      }
      return next;
    });
  };

  // Queue derived metrics for live % display
  const overallBatchPct = useMemo(() => {
    if (!batchStats) return 0;
    const total = Math.max(1, batchStats.totalQueued);
    const doneFraction = batchStats.doneCount / total;
    const currentFraction = (currentItemPct / 100) / total;
    return Math.min(100, Math.round((doneFraction + currentFraction) * 100));
  }, [batchStats, currentItemPct]);

  const pendingOrFailedQueue = useMemo(
    () =>
      queueItems.filter(
        (it) => it.status === 'pending' || it.status === 'uploading' || it.status === 'failed'
      ),
    [queueItems]
  );

  return (
    <div className="space-y-4">
      {/* Compact Header & Data-Saver Telemetry Strip */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
              <h3 className="font-display text-sm font-bold text-slate-900 sm:text-base">
                {tr('Kabati la Siri — Mafile & 0 MB Cache', 'Secret Vault — Folders & 0 MB Cache')}
              </h3>
            </div>
            <p className="mt-0.5 text-xs text-slate-600">
              {tr(
                'Picha hazifunguki bila kufungua mafile ya ndani. Zikihifadhiwa kifaa hiki zinafunguka kwa 0 MB.',
                'Photos stay hidden inside inner folders. Cached photos on this device open using 0 MB.'
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {unlockedFolderIds.size > 0 && (
              <button
                type="button"
                onClick={handleLockAllFolders}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900 transition-colors hover:bg-amber-100"
              >
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                {tr('Funga Mafile', 'Lock Folders')}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setNewFolderName('');
                setNewFolderPin('');
                setShowCreateFolder(true);
              }}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100"
            >
              <FolderPlus className="h-3.5 w-3.5 text-[#0E2640]" aria-hidden="true" />
              {currentFolder
                ? tr('Faili la Ndani', 'New Subfolder')
                : tr('Unda Faili', 'New Folder')}
            </button>
            <button
              type="button"
              onClick={() => {
                if (currentFolderId) {
                  setUploadTargetFolderId(currentFolderId);
                } else if (!uploadTargetFolderId && mergedFolders.length > 0) {
                  setUploadTargetFolderId(mergedFolders[0].folderId);
                }
                setUploadPanelOpen((v) => !v);
              }}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#0E2640] px-3.5 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[#173A5E]"
            >
              <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />
              {tr('Pakia Picha', 'Upload Photos')}
            </button>
          </div>
        </div>

        {/* Clean Tabular Metrics Row (Zero Pills) */}
        <div className="grid grid-cols-2 gap-2 border-t border-slate-200/80 pt-3 sm:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="text-[11px] font-medium text-slate-500">
              {tr('Mafile / Picha', 'Folders / Photos')}
            </p>
            <p className="mt-0.5 font-mono text-xs font-bold tabular-nums text-slate-900">
              {mergedFolders.length} / {photos.length} ({formatBytesCompact(totalVaultSizeBytes)})
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="text-[11px] font-medium text-slate-500">
              {tr('Kifaa Offline (0 MB)', 'Cached Offline (0 MB)')}
            </p>
            <p className="mt-0.5 font-mono text-xs font-bold tabular-nums text-emerald-700">
              {cacheStats.count} {tr('picha', 'photos')} · {formatBytesCompact(cacheStats.totalBytes)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="text-[11px] font-medium text-slate-500">
              {tr('Data Iliyotumika Leo', 'Session Network Data')}
            </p>
            <p className="mt-0.5 font-mono text-xs font-bold tabular-nums text-slate-900">
              {formatBytesCompact(sessionNetworkBytes)} ({offlineHits}× 0 MB)
            </p>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-slate-500">
                {tr('Hifadhi ya Kifaa', 'Device Cache')}
              </p>
              <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-700">
                {cacheStats.count > 0 ? tr('Tayari 0 MB', '0 MB Ready') : tr('Tupu', 'Empty')}
              </p>
            </div>
            {cacheStats.count > 0 && (
              <button
                type="button"
                onClick={handleClearDeviceCache}
                title={tr('Safisha cache ya kifaa', 'Clear device cache')}
                className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
              >
                {tr('Safisha', 'Clear')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Live Percentage & Phone-Shutdown Resumable Upload Progress Card */}
      {(isQueueRunning || pendingOrFailedQueue.length > 0) && (
        <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3.5 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              {isQueueRunning ? (
                <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#0E2640]" aria-hidden="true" />
              ) : (
                <RotateCcw className="h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 sm:text-sm">
                  {isQueueRunning && batchStats
                    ? tr(
                        `Inapakia: Picha ${Math.min(batchStats.doneCount + 1, batchStats.totalQueued)} kati ya ${batchStats.totalQueued} (${overallBatchPct}%)`,
                        `Uploading: Photo ${Math.min(batchStats.doneCount + 1, batchStats.totalQueued)} of ${batchStats.totalQueued} (${overallBatchPct}%)`
                      )
                    : tr(
                        `Kuna picha ${pendingOrFailedQueue.length} zinasubiri kuendelea (hata simu ilizima)`,
                        `${pendingOrFailedQueue.length} photo(s) queued to resume`
                      )}
                </p>
                <p className="truncate text-[11px] text-slate-600">
                  {isQueueRunning && batchStats
                    ? `${batchStats.currentFileName} · ${currentItemPct}%`
                    : tr(
                        'Gusa Endelea Nilipoishia kupakia zilizoachwa bila kuanza upya.',
                        'Tap Resume to pick up right where upload stopped.'
                      )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isQueueRunning ? (
                <button
                  type="button"
                  onClick={handlePauseQueue}
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-100"
                >
                  <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                  {tr('Simamisha', 'Pause')}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleRetryFailedAndResume}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-[#0E2640] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#173A5E]"
                  >
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    {isQueuePaused
                      ? tr('Endelea Nilipoishia', 'Resume')
                      : tr('Endelea Nilipoishia', 'Resume Queue')}
                  </button>
                  <button
                    type="button"
                    onClick={handleClearQueue}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    {tr('Ghairi', 'Clear')}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Dual Percentage Progress Bars */}
          {isQueueRunning && batchStats && (
            <div className="mt-3 space-y-2">
              <div>
                <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-slate-700">
                  <span>{tr('Maendeleo ya Jumla', 'Overall Batch Progress')}</span>
                  <span className="font-mono tabular-nums">{overallBatchPct}%</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-white ring-1 ring-sky-200">
                  <div
                    className="h-full bg-[#0E2640] transition-all duration-200"
                    style={{ width: `${overallBatchPct}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-600">
                  <span className="truncate">{batchStats.currentFileName}</span>
                  <span className="font-mono tabular-nums">{currentItemPct}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white ring-1 ring-sky-200">
                  <div
                    className="h-full bg-emerald-600 transition-all duration-150"
                    style={{ width: `${currentItemPct}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Last Batch Summary Notice */}
      {lastBatchResult && !isQueueRunning && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5 text-xs text-emerald-950">
          <span>
            {tr(
              `Imekamilika: ${lastBatchResult.uploaded} zimehifadhiwa, ${lastBatchResult.duplicates} nakala zimezuiwa, ${lastBatchResult.failed} zimeshindwa.`,
              `Done: ${lastBatchResult.uploaded} uploaded, ${lastBatchResult.duplicates} duplicates blocked, ${lastBatchResult.failed} failed.`
            )}
          </span>
          <button
            type="button"
            onClick={() => setLastBatchResult(null)}
            className="text-emerald-800 hover:text-emerald-950"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Upload Dropzone Panel (collapsible) */}
      {uploadPanelOpen && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.length) {
              void handleEnqueueSelectedFiles(e.dataTransfer.files);
            }
          }}
          className={`space-y-3 rounded-xl border-2 border-dashed p-4 transition-colors ${
            dragOver ? 'border-[#0E2640] bg-sky-50/50' : 'border-slate-300 bg-white'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-slate-900 sm:text-sm">
              {tr('Pakia Picha Nyingi kwenye Faili', 'Batch Upload Photos into Folder')}
            </h4>
            <button
              type="button"
              onClick={() => setUploadPanelOpen(false)}
              className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                {tr('Chagua Faili Lengwa', 'Destination Folder')}
              </label>
              <select
                value={currentFolderId || uploadTargetFolderId}
                disabled={Boolean(currentFolderId)}
                onChange={(e) => setUploadTargetFolderId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 disabled:bg-slate-100"
              >
                {mergedFolders.length === 0 ? (
                  <option value="">{tr('Picha Binafsi (Auto)', 'Private Photos (Auto)')}</option>
                ) : (
                  mergedFolders.map((f) => (
                    <option key={f.folderId} value={f.folderId}>
                      {f.pinHash ? `🔒 ${f.name}` : `📁 ${f.name}`}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="flex items-end">
              <label className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="min-w-0">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Zap className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                    {tr('Okoa MB Wakati wa Kupakia', 'Data-Saver Upload')}
                  </span>
                  <span className="block truncate text-[10px] text-slate-500">
                    {dataSaverUpload
                      ? tr('Hupunguza MB 5 kuwa ~200 KB (Ubora Safi)', 'Shrinks 5 MB to ~200 KB HD')
                      : tr('Ubora halisi bila kupunguza ukubwa', 'Full original size')}
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={dataSaverUpload}
                  onChange={(e) => setDataSaverUpload(e.target.checked)}
                  className="h-4 w-4 accent-[#0E2640]"
                />
              </label>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                void handleEnqueueSelectedFiles(e.target.files);
                e.target.value = '';
              }
            }}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-6 text-center transition-colors hover:border-[#0E2640] hover:bg-sky-50/40"
          >
            <ImagePlus className="h-7 w-7 text-[#0E2640]" aria-hidden="true" />
            <div>
              <p className="text-xs font-bold text-slate-900 sm:text-sm">
                {tr(
                  'Bofya hapa kuchagua picha nyingi kutoka simuni (au buruta)',
                  'Tap to select multiple photos from phone (or drag & drop)'
                )}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {tr(
                  'Huzuia nakala zinazojirudia, huonyesha %, na huendelea simu ikizima',
                  'Duplicate blocking, live %, and survives device shut-down'
                )}
              </p>
            </div>
          </button>
        </div>
      )}

      {/* Breadcrumb Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setCurrentFolderId(null);
              setSelectedIds(new Set());
              setSearchQuery('');
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors ${
              currentFolderId === null
                ? 'bg-[#0E2640] text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <HardDrive className="h-3.5 w-3.5" aria-hidden="true" />
            {tr('Mafile Yangu', 'My Folders')}
          </button>

          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <React.Fragment key={crumb.folderId}>
                <ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => handleAttemptOpenFolder(crumb)}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 transition-colors ${
                    isLast
                      ? 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {crumb.pinHash && <Lock className="h-3 w-3" aria-hidden="true" />}
                  {crumb.name}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* Actions inside an open folder */}
        {currentFolder && !isCurrentFolderLocked && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrecacheCurrentFolder}
              disabled={Boolean(precachingFolder) || currentFolderPhotos.length === 0}
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
            >
              {precachingFolder ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  {precachingFolder.done}/{precachingFolder.total}
                </>
              ) : (
                <>
                  <HardDrive className="h-3.5 w-3.5" aria-hidden="true" />
                  {tr('Hifadhi Offline (0 MB)', 'Cache Offline (0 MB)')}
                </>
              )}
            </button>

            {currentFolderPhotos.length > 0 && (
              <button
                type="button"
                onClick={() => handleDownloadZip(currentFolderPhotos)}
                disabled={Boolean(zipBusy)}
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
              >
                {zipBusy ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    {zipBusy.done}/{zipBusy.total}
                  </>
                ) : (
                  <>
                    <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                    {tr('Pakua Faili (ZIP)', 'Download ZIP')}
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-12 text-xs font-medium text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-[#0E2640]" aria-hidden="true" />
          {tr('Inapakia mafile ya siri...', 'Loading private folders...')}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Closed Folder Cards Grid (Shown at Root, AND for Subfolders inside an Open Folder) */}
          {(currentFolderId === null || visibleChildFolders.length > 0) && (
            <div className="space-y-2.5">
              {currentFolderId === null && (
                <div className="flex items-center justify-between px-1">
                  <p className="text-xs font-semibold text-slate-600">
                    {tr(
                      'Fungua faili kuona mafile ya ndani au picha zake (picha zimefichwa hapa):',
                      'Open a folder to inspect subfolders or photos (photos stay hidden here):'
                    )}
                  </p>
                </div>
              )}

              {visibleChildFolders.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
                  <FolderLock className="h-9 w-9 text-slate-400" aria-hidden="true" />
                  <p className="text-xs font-semibold text-slate-700 sm:text-sm">
                    {tr('Bado huna faili la picha.', 'You have no folders yet.')}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setNewFolderName('');
                      setNewFolderPin('');
                      setShowCreateFolder(true);
                    }}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#0E2640] px-4 py-2 text-xs font-bold text-white hover:bg-[#173A5E]"
                  >
                    <FolderPlus className="h-4 w-4" aria-hidden="true" />
                    {tr('Unda Faili la Kwanza', 'Create First Folder')}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleChildFolders.map((folder) => {
                    const stat = folderStatsMap.get(folder.folderId) || {
                      directPhotos: 0,
                      totalPhotos: 0,
                      subfolders: 0,
                    };
                    const isLocked = Boolean(folder.pinHash);
                    const isUnlocked = unlockedFolderIds.has(folder.folderId);

                    return (
                      <div
                        key={folder.folderId}
                        className="group flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-[#0E2640]/40 hover:bg-slate-50/70"
                      >
                        <button
                          type="button"
                          onClick={() => handleAttemptOpenFolder(folder)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <span
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                              isLocked && !isUnlocked
                                ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                                : 'bg-sky-50 text-[#0E2640] ring-1 ring-sky-200'
                            }`}
                          >
                            {isLocked && !isUnlocked ? (
                              <FolderLock className="h-5 w-5" aria-hidden="true" />
                            ) : (
                              <Folder className="h-5 w-5" aria-hidden="true" />
                            )}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-display text-sm font-bold text-slate-900">
                                {folder.name}
                              </span>
                              {isLocked && (
                                <span
                                  className="shrink-0 text-amber-700"
                                  title={isUnlocked ? tr('Imefunguliwa', 'Unlocked') : tr('Ina PIN', 'PIN Protected')}
                                >
                                  {isUnlocked ? (
                                    <Unlock className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                                  ) : (
                                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                                  )}
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-500">
                              {stat.totalPhotos} {tr('picha', 'photos')}
                              {stat.subfolders > 0
                                ? ` · ${stat.subfolders} ${tr('mafile', 'folders')}`
                                : ''}
                            </p>
                          </div>
                        </button>

                        {/* Folder Management Quick Icons */}
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setPinSettingsTarget(folder);
                              setPinSettingsValue('');
                            }}
                            title={tr('Weka au badili PIN', 'Set or change PIN')}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70 hover:text-slate-900"
                          >
                            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRenameTarget(folder);
                              setRenameValue(folder.name);
                            }}
                            title={tr('Badili jina la faili', 'Rename folder')}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70 hover:text-slate-900"
                          >
                            <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          {!folder.isVirtual && (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteFolder(folder)}
                              title={tr('Futa faili', 'Delete folder')}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Inside Opened & Unlocked Folder: Google Photos-Style Chronological Timeline */}
          {currentFolder && !isCurrentFolderLocked && (
            <div className="space-y-4">
              {/* Inside-Folder Search & Selection Header */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="relative min-w-[200px] flex-1">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={tr(
                      `Tafuta ndani ya "${currentFolder.name}"...`,
                      `Search inside "${currentFolder.name}"...`
                    )}
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0E2640] focus:outline-none"
                  />
                </div>

                {currentFolderPhotos.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedIds.size === currentFolderPhotos.length) {
                        setSelectedIds(new Set());
                      } else {
                        setSelectedIds(new Set(currentFolderPhotos.map((p) => p.photoId)));
                      }
                    }}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-[#0E2640]" aria-hidden="true" />
                    {selectedIds.size === currentFolderPhotos.length
                      ? tr('Acha Zote', 'Deselect All')
                      : tr('Chagua Zote', 'Select All')}
                  </button>
                )}
              </div>

              {/* Chronological Day Groups (Google Photos Grid) */}
              {currentFolderPhotos.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
                  <FolderOpen className="h-8 w-8 text-slate-400" aria-hidden="true" />
                  <p className="text-xs font-semibold text-slate-600">
                    {searchQuery.trim()
                      ? tr('Hakuna picha iliyopatikana kwa utafutaji huo.', 'No photos matched your search.')
                      : tr('Faili hili halina picha bado. Gusa "Pakia Picha" kuongeza.', 'This folder has no photos yet.')}
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {photoTimelineGroups.map((group) => {
                    const groupAllSelected = group.items.every((p) =>
                      selectedIds.has(p.photoId)
                    );
                    return (
                      <div key={group.key} className="space-y-1.5">
                        {/* Sticky-feel Date Section Header */}
                        <div className="flex items-center justify-between px-0.5">
                          <div className="flex items-baseline gap-2">
                            <h4 className="font-display text-xs font-bold text-slate-900 sm:text-sm">
                              {group.label}
                            </h4>
                            <span className="font-mono text-[11px] tabular-nums text-slate-500">
                              {group.items.length}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleSelectDayGroup(group.items)}
                            className="text-[11px] font-semibold text-[#0E2640] hover:underline"
                          >
                            {groupAllSelected
                              ? tr('Ondoa Uteuzi', 'Unselect Day')
                              : tr('Chagua Siku', 'Select Day')}
                          </button>
                        </div>

                        {/* Edge-to-Edge Dense Google Photos Square Grid */}
                        <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 sm:gap-1.5 md:grid-cols-5 lg:grid-cols-6">
                          {group.items.map((photo) => {
                            const isSelected = selectedIds.has(photo.photoId);
                            const isOfflineCached = cacheStats.cachedHashes.has(photo.fileHash);

                            return (
                              <div
                                key={photo.photoId}
                                className={`group relative aspect-square overflow-hidden rounded-md bg-slate-100 transition-transform ${
                                  isSelected ? 'ring-2 ring-[#0E2640] ring-offset-1 scale-[0.96]' : ''
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (selectedIds.size > 0) {
                                      toggleSelectPhoto(photo.photoId);
                                    } else {
                                      openLightboxAt(photo);
                                    }
                                  }}
                                  className="h-full w-full focus:outline-none"
                                >
                                  <CachedVaultImage
                                    photo={photo}
                                    variant="thumb"
                                    alt={photo.caption || photo.fileName}
                                    className="h-full w-full object-cover"
                                    onOfflineHit={() => setOfflineHits((n) => n + 1)}
                                    onNetworkBytesLoaded={(b) =>
                                      setSessionNetworkBytes((prev) => prev + b)
                                    }
                                    onCacheUpdated={() => void refreshCacheStats()}
                                  />
                                </button>

                                {/* Corner Select Circle */}
                                <button
                                  type="button"
                                  aria-label={tr('Chagua picha', 'Select photo')}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleSelectPhoto(photo.photoId);
                                  }}
                                  className={`absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full transition-opacity ${
                                    isSelected
                                      ? 'bg-[#0E2640] text-white opacity-100 shadow-sm'
                                      : 'bg-black/35 text-white opacity-80 sm:opacity-0 sm:group-hover:opacity-100'
                                  }`}
                                >
                                  {isSelected ? (
                                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                  ) : (
                                    <span className="h-3.5 w-3.5 rounded-full border-2 border-white/90" />
                                  )}
                                </button>

                                {/* Subtle 0-MB Offline Ready Dot */}
                                {isOfflineCached && (
                                  <span
                                    title={tr('Ipo Offline (0 MB)', 'Cached Offline (0 MB)')}
                                    className="pointer-events-none absolute bottom-1.5 right-1.5 h-2 w-2 rounded-full bg-emerald-400 ring-1 ring-black/40"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Thumb-Zone Floating Bottom Bar for Multi-Selected Photos */}
      {selectedIds.size > 0 && (
        <div className="sticky bottom-3 z-30 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-white shadow-xl">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="font-mono text-xs font-bold tabular-nums">
              {selectedIds.size} {tr('zimechaguliwa', 'selected')}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                const firstOther = mergedFolders.find((f) => f.folderId !== currentFolderId);
                setMoveDestFolderId(firstOther?.folderId || mergedFolders[0]?.folderId || '');
                setShowMoveModal(true);
              }}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-semibold hover:bg-white/20"
            >
              <FolderInput className="h-3.5 w-3.5" aria-hidden="true" />
              {tr('Hamisha', 'Move')}
            </button>
            <button
              type="button"
              onClick={() => {
                const chosen = currentFolderPhotos.filter((p) => selectedIds.has(p.photoId));
                if (chosen.length === 1) {
                  void handleDownloadSingle(chosen[0]);
                } else {
                  void handleDownloadZip(chosen);
                }
              }}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              {selectedIds.size === 1 ? tr('Pakua', 'Save') : tr('Pakua ZIP', 'ZIP')}
            </button>
            <button
              type="button"
              onClick={() => setConfirmBulkDelete(true)}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-rose-500"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              {tr('Futa', 'Delete')}
            </button>
          </div>
        </div>
      )}

      {/* MODAL: Enter PIN to Unlock Locked Folder */}
      {pinPromptFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <form
            onSubmit={handleSubmitPinUnlock}
            className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                  <Lock className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h4 className="font-display text-sm font-bold text-slate-900">
                    {tr('Faili Limefungwa kwa PIN', 'Folder Locked with PIN')}
                  </h4>
                  <p className="text-xs text-slate-500">{pinPromptFolder.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPinPromptFolder(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                {tr('Ingiza PIN ya kufungua faili', 'Enter PIN to unlock folder')}
              </label>
              <input
                type="password"
                autoFocus
                inputMode="numeric"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="••••"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-center font-mono text-base font-bold tracking-widest text-slate-900 focus:border-[#0E2640] focus:outline-none"
              />
              {pinError && <p className="mt-1.5 text-xs font-semibold text-rose-600">{pinError}</p>}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPinPromptFolder(null)}
                className="min-h-[40px] rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                {tr('Ghairi', 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={verifyingPin}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#0E2640] px-4 py-2 text-xs font-bold text-white hover:bg-[#173A5E] disabled:opacity-60"
              >
                {verifyingPin && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {tr('Fungua Faili', 'Unlock Folder')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Create New Folder / Subfolder */}
      {showCreateFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <form
            onSubmit={handleCreateFolder}
            className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h4 className="font-display text-sm font-bold text-slate-900">
                {currentFolder
                  ? tr(`Unda Faili la Ndani (${currentFolder.name})`, `Create Subfolder in ${currentFolder.name}`)
                  : tr('Unda Faili Jipya la Siri', 'Create New Secret Folder')}
              </h4>
              <button
                type="button"
                onClick={() => setShowCreateFolder(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  {tr('Jina la Faili', 'Folder Name')}
                </label>
                <input
                  type="text"
                  autoFocus
                  maxLength={40}
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder={tr('Mfano: Nyaraka Muhimu', 'e.g. Important Docs')}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 focus:border-[#0E2640] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  {tr('Weka PIN ya Kufuli (Hiari — angalau tarakimu 4)', 'Optional Lock PIN (min 4 chars)')}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={16}
                  value={newFolderPin}
                  onChange={(e) => setNewFolderPin(e.target.value)}
                  placeholder={tr('Acha wazi kama hutaki kufuli', 'Leave blank for no PIN')}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-[#0E2640] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateFolder(false)}
                className="min-h-[40px] rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                {tr('Ghairi', 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={creatingFolder}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#0E2640] px-4 py-2 text-xs font-bold text-white hover:bg-[#173A5E] disabled:opacity-60"
              >
                {creatingFolder && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {tr('Hifadhi Faili', 'Create Folder')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Rename Folder */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <form
            onSubmit={handleSaveRenameFolder}
            className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
          >
            <h4 className="font-display text-sm font-bold text-slate-900">
              {tr('Badili Jina la Faili', 'Rename Folder')}
            </h4>
            <input
              type="text"
              autoFocus
              maxLength={40}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 focus:border-[#0E2640] focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                className="min-h-[38px] rounded-xl border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-700"
              >
                {tr('Ghairi', 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={savingFolderEdit}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#0E2640] px-4 py-1.5 text-xs font-bold text-white disabled:opacity-60"
              >
                {savingFolderEdit && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {tr('Hifadhi', 'Save')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Set / Remove Folder PIN */}
      {pinSettingsTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <form
            onSubmit={(e) => void handleSaveFolderPin(e, false)}
            className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h4 className="font-display text-sm font-bold text-slate-900">
                {tr(`Kufuli (PIN): ${pinSettingsTarget.name}`, `Folder PIN: ${pinSettingsTarget.name}`)}
              </h4>
              <button
                type="button"
                onClick={() => setPinSettingsTarget(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                {tr('PIN Mpya (angalau tarakimu/herufi 4)', 'New PIN (at least 4 characters)')}
              </label>
              <input
                type="password"
                autoFocus
                inputMode="numeric"
                value={pinSettingsValue}
                onChange={(e) => setPinSettingsValue(e.target.value)}
                placeholder="••••"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-center font-mono text-sm font-bold tracking-widest text-slate-900 focus:border-[#0E2640] focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              {pinSettingsTarget.pinHash ? (
                <button
                  type="button"
                  disabled={savingFolderEdit}
                  onClick={(e) => void handleSaveFolderPin(e, true)}
                  className="min-h-[38px] rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100"
                >
                  {tr('Ondoa Kufuli', 'Remove PIN')}
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPinSettingsTarget(null)}
                  className="min-h-[38px] rounded-xl border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-700"
                >
                  {tr('Ghairi', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={savingFolderEdit}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#0E2640] px-4 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                >
                  {savingFolderEdit && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                  {tr('Weka PIN', 'Save PIN')}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Move Selected Photos */}
      {showMoveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h4 className="font-display text-sm font-bold text-slate-900">
              {tr(`Hamisha Picha ${selectedIds.size}`, `Move ${selectedIds.size} Photo(s)`)}
            </h4>
            <select
              value={moveDestFolderId}
              onChange={(e) => setMoveDestFolderId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
            >
              {mergedFolders.map((f) => (
                <option key={f.folderId} value={f.folderId}>
                  {f.pinHash ? `🔒 ${f.name}` : `📁 ${f.name}`}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowMoveModal(false)}
                className="min-h-[38px] rounded-xl border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-700"
              >
                {tr('Ghairi', 'Cancel')}
              </button>
              <button
                type="button"
                disabled={movingBusy || !moveDestFolderId}
                onClick={handleBulkMoveSelected}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#0E2640] px-4 py-1.5 text-xs font-bold text-white disabled:opacity-60"
              >
                {movingBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {tr('Hamisha Sasa', 'Move Now')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Confirm Folder / Bulk / Single Delete */}
      {(confirmDeleteFolder || confirmBulkDelete || confirmDeletePhotoId) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm space-y-4 rounded-2xl border border-rose-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-6 w-6 shrink-0 text-rose-600" aria-hidden="true" />
              <div>
                <h4 className="font-display text-sm font-bold text-slate-900">
                  {confirmDeleteFolder
                    ? tr(`Futa Faili "${confirmDeleteFolder.name}"?`, `Delete folder "${confirmDeleteFolder.name}"?`)
                    : confirmBulkDelete
                      ? tr(`Futa picha ${selectedIds.size} zilizochaguliwa?`, `Delete ${selectedIds.size} selected photo(s)?`)
                      : tr('Futa picha hii kabisa?', 'Delete this photo permanently?')}
                </h4>
                <p className="mt-1 text-xs text-slate-600">
                  {tr('Hatua hii haiwezi kurudishwa nyuma.', 'This action cannot be undone.')}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmDeleteFolder(null);
                  setConfirmBulkDelete(false);
                  setConfirmDeletePhotoId(null);
                }}
                className="min-h-[38px] rounded-xl border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-700"
              >
                {tr('Ghairi', 'Cancel')}
              </button>
              <button
                type="button"
                disabled={deletingBusy}
                onClick={() => {
                  if (confirmDeleteFolder) {
                    void handleDeleteFolder(confirmDeleteFolder);
                  } else if (confirmBulkDelete) {
                    void handleBulkDeleteConfirmed();
                  } else if (confirmDeletePhotoId) {
                    const target = photos.find((p) => p.photoId === confirmDeletePhotoId);
                    if (target) void handleDeletePhotoConfirmed(target);
                  }
                }}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {deletingBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {tr('Ndiyo, Futa', 'Yes, Delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULLSCREEN GOOGLE PHOTOS DARK LIGHTBOX VIEWER */}
      {lightboxPhoto && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white">
          {/* Lightbox Top Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5 sm:px-5">
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                type="button"
                onClick={() => setLightboxPhoto(null)}
                className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10"
                aria-label={tr('Funga', 'Close')}
              >
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-white sm:text-sm">
                  {lightboxPhoto.fileName}
                </p>
                <p className="font-mono text-[11px] tabular-nums text-white/65">
                  {lightboxIndex >= 0 ? `${lightboxIndex + 1} / ${currentFolderPhotos.length}` : ''} ·{' '}
                  {lightboxSourceMode === 'offline'
                    ? tr('0 MB Offline Cache', '0 MB Offline Cache')
                    : lightboxSourceMode === 'original'
                      ? tr('Ubora Halisi', 'Original Quality')
                      : tr('Data Saver HD', 'Data Saver HD')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {lightboxVariant !== 'original' && (
                <button
                  type="button"
                  onClick={() => setLightboxVariant('original')}
                  className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-[11px] font-semibold hover:bg-white/20"
                >
                  {tr('Pakia Halisi', 'Load Original')}
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleDownloadSingle(lightboxPhoto)}
                disabled={downloadingSingleId === lightboxPhoto.photoId}
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-emerald-600 px-3 text-xs font-bold hover:bg-emerald-500 disabled:opacity-60"
              >
                {downloadingSingleId === lightboxPhoto.photoId ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="h-4 w-4" aria-hidden="true" />
                )}
                <span className="hidden sm:inline">{tr('Pakua Simuni', 'Save')}</span>
              </button>
              <button
                type="button"
                onClick={() => setLightboxShowInfo((v) => !v)}
                className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  lightboxShowInfo ? 'bg-white/20' : 'hover:bg-white/10'
                }`}
                aria-label={tr('Maelezo', 'Info')}
              >
                <Info className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeletePhotoId(lightboxPhoto.photoId)}
                className="flex h-10 w-10 items-center justify-center rounded-full text-rose-400 hover:bg-rose-500/20"
                aria-label={tr('Futa', 'Delete')}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Center Image Stage with Prev/Next Navigation */}
          <div className="relative flex min-h-0 flex-1 items-center justify-center p-2 sm:p-6">
            {currentFolderPhotos.length > 1 && (
              <button
                type="button"
                onClick={() => navigateLightbox(-1)}
                className="absolute left-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/80 sm:left-4"
                aria-label={tr('Iliyopita', 'Previous')}
              >
                <ChevronLeft className="h-6 w-6" aria-hidden="true" />
              </button>
            )}

            <div className="flex h-full w-full max-w-4xl items-center justify-center">
              <CachedVaultImage
                photo={lightboxPhoto}
                variant={lightboxVariant}
                alt={lightboxPhoto.caption || lightboxPhoto.fileName}
                className="max-h-full max-w-full rounded-lg object-contain"
                onOfflineHit={() => setOfflineHits((n) => n + 1)}
                onNetworkBytesLoaded={(b) => setSessionNetworkBytes((prev) => prev + b)}
                onCacheUpdated={() => void refreshCacheStats()}
                onSourceMode={setLightboxSourceMode}
              />
            </div>

            {currentFolderPhotos.length > 1 && (
              <button
                type="button"
                onClick={() => navigateLightbox(1)}
                className="absolute right-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/80 sm:right-4"
                aria-label={tr('Inayofuata', 'Next')}
              >
                <ChevronRight className="h-6 w-6" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Collapsible Info & Edit Drawer inside Lightbox */}
          {lightboxShowInfo && (
            <div className="border-t border-white/15 bg-slate-900 p-4 sm:px-6">
              <div className="mx-auto grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-300">
                    {tr('Faili (Folder)', 'Folder')}
                  </label>
                  <select
                    value={editFolderId}
                    onChange={(e) => setEditFolderId(e.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-slate-800 px-3 py-2 text-xs text-white"
                  >
                    {mergedFolders.map((f) => (
                      <option key={f.folderId} value={f.folderId}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-[11px] font-semibold text-slate-300">
                    {tr('Maelezo / Kumbukumbu', 'Caption / Note')}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={240}
                      value={editCaption}
                      onChange={(e) => setEditCaption(e.target.value)}
                      placeholder={tr('Andika maelezo...', 'Add a note...')}
                      className="flex-1 rounded-lg border border-white/15 bg-slate-800 px-3 py-2 text-xs text-white placeholder:text-slate-400"
                    />
                    <button
                      type="button"
                      disabled={savingMeta}
                      onClick={() => void handleSaveLightboxMeta()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-60"
                    >
                      {savingMeta && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                      {tr('Hifadhi', 'Save')}
                    </button>
                  </div>
                </div>
              </div>
              <p className="mx-auto mt-2 max-w-3xl font-mono text-[10px] text-slate-400">
                {lightboxPhoto.width}×{lightboxPhoto.height}px · {formatBytesCompact(lightboxPhoto.fileSize)} · SHA-256: {lightboxPhoto.fileHash.slice(0, 16)}…
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
