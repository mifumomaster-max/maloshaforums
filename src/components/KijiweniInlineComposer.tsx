import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  Crop,
  Eye,
  EyeOff,
  ImagePlus,
  Images,
  Loader2,
  Lock,
  Send,
  X,
} from 'lucide-react';
import {
  getCloudinaryConfig,
  prepareSharedImageFile,
  uploadImageToCloudinary,
} from '../services/cloudinaryService';
import { parseTagsInput } from '../utils/formatters';
import { autoFormatScholarlyText } from '../utils/editorialFormatter';
import {
  MakalaFormatAction,
  applyMakalaFormatAction,
  captureTextareaScrollSnapshot,
  restoreTextareaSelectionAndScroll,
} from '../utils/makalaSelectionFormatter';
import { useLanguage } from '../context/LanguageContext';
import {
  AuthPromptReason,
  KijiweniFontStyle,
  SharedMediaPayload,
  getKijiweniFontMeta,
} from '../types';
import { Avatar } from './Avatar';
import { ImageResizeModal } from './ImageResizeModal';
import { KijiweniDescriptionTools } from './KijiweniDescriptionTools';
import { RichText } from './RichText';
import { AuthorVerificationBadge } from './VerificationBadge';

const MAX_KIJIWENI_IMAGES = 250;
const UPLOAD_CONCURRENCY = 5;

interface QueuedKijiweniImage {
  id: string;
  url: string;
  fileName: string;
  lastModified: number;
  sourceFile: File;
  status: 'uploading' | 'ready' | 'error';
}

interface KijiweniInlineComposerProps {
  expanded: boolean;
  onExpandedChange: (next: boolean) => void;
  userUid: string | null;
  userDisplayName: string;
  userPhoto: string;
  isSuspended?: boolean;
  sharedPayload?: SharedMediaPayload | null;
  onClearSharedPayload?: (id: number) => void;
  onSignIn: (reason?: AuthPromptReason) => void;
  onSubmitPost: (
    data: {
      title: string;
      body: string;
      tags: string[];
      coverImage?: string;
      images?: string[];
      bodyFontStyle?: KijiweniFontStyle;
      status?: 'open' | 'private';
    },
    options?: { silent?: boolean }
  ) => Promise<void>;
  onToast: (message: string, kind?: 'success' | 'error') => void;
}

export const KijiweniInlineComposer: React.FC<KijiweniInlineComposerProps> = ({
  expanded,
  onExpandedChange,
  userUid,
  userDisplayName,
  userPhoto,
  isSuspended = false,
  sharedPayload = null,
  onClearSharedPayload,
  onSignIn,
  onSubmitPost,
  onToast,
}) => {
  const { tr } = useLanguage();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [bodyFontStyle, setBodyFontStyle] = useState<KijiweniFontStyle>('sans');
  const [bodyPreviewMode, setBodyPreviewMode] = useState(false);
  const [selectedWordCount, setSelectedWordCount] = useState(0);
  const [tagsRaw, setTagsRaw] = useState('');
  const [queuedImages, setQueuedImages] = useState<QueuedKijiweniImage[]>([]);
  const [publishAsAlbum, setPublishAsAlbum] = useState(true);
  const [postAsPrivate, setPostAsPrivate] = useState(false);
  const [showAllQueueThumbs, setShowAllQueueThumbs] = useState(false);
  const [localPreviewUrl, setLocalPreviewUrl] = useState('');
  const [pendingSharedFile, setPendingSharedFile] = useState<File | null>(null);
  const [croppingItem, setCroppingItem] = useState<{
    existingId?: string;
    file: File;
  } | null>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [batchUploadProgress, setBatchUploadProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [publishProgress, setPublishProgress] = useState<{ current: number; total: number } | null>(
    null
  );
  const [error, setError] = useState('');

  const titleInputRef = useRef<HTMLInputElement>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastHandledShareIdRef = useRef<number>(0);
  const { configured: cloudinaryConfigured } = getCloudinaryConfig();
  const activeFontMeta = getKijiweniFontMeta(bodyFontStyle);

  useEffect(() => {
    if (expanded && userUid) {
      const timer = window.setTimeout(() => {
        titleInputRef.current?.focus({ preventScroll: true });
      }, 110);
      return () => window.clearTimeout(timer);
    }
  }, [expanded, userUid]);

  // Apply incoming shared image + text from phone Share Sheet cleanly
  useEffect(() => {
    if (!sharedPayload || sharedPayload.id === lastHandledShareIdRef.current) return;
    lastHandledShareIdRef.current = sharedPayload.id;

    setError('');
    if (sharedPayload.title && !title) {
      setTitle(sharedPayload.title.slice(0, 140));
    }
    if (sharedPayload.text && !body) {
      setBody(sharedPayload.text.slice(0, 8000));
    }

    if (sharedPayload.file) {
      const objUrl = URL.createObjectURL(sharedPayload.file);
      setLocalPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return objUrl;
      });
      setPendingSharedFile(sharedPayload.file);
      onExpandedChange(true);
    }
  }, [sharedPayload, title, body, onExpandedChange]);

  // Upload buffered shared photo automatically once signed in
  useEffect(() => {
    if (!userUid || !pendingSharedFile || isSuspended) return;
    let cancelled = false;
    const fileToUpload = pendingSharedFile;
    setPendingSharedFile(null);
    setUploadingCount((c) => c + 1);

    void prepareSharedImageFile(fileToUpload)
      .then((prepared) => uploadImageToCloudinary(prepared).then((url) => ({ url, prepared })))
      .then(({ url, prepared }) => {
        if (cancelled) return;
        setQueuedImages((prev) => [
          ...prev,
          {
            id: `shared-${Date.now()}`,
            url,
            fileName: prepared.name || 'shared-photo.jpg',
            lastModified: prepared.lastModified || Date.now(),
            sourceFile: prepared,
            status: 'ready',
          },
        ]);
        setLocalPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return '';
        });
        onToast(
          tr(
            'Picha uliyoshare imejibandika Kijiweni! Unaweza kuchapisha moja kwa moja au kuongeza maneno.',
            'Your shared photo is attached in Kijiweni! Post it directly or add a caption.'
          )
        );
      })
      .catch((err) => {
        if (cancelled) return;
        const msg =
          err instanceof Error
            ? err.message
            : tr('Imeshindwa kupakia picha uliyoshare.', 'Failed to upload shared photo.');
        setError(msg);
        onToast(msg, 'error');
      })
      .finally(() => {
        if (!cancelled) setUploadingCount((c) => Math.max(0, c - 1));
      });

    return () => {
      cancelled = true;
    };
  }, [userUid, pendingSharedFile, isSuspended, onToast, tr]);

  useEffect(() => {
    return () => {
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
      }
    };
  }, [localPreviewUrl]);

  const handleResetAndCollapse = () => {
    setTitle('');
    setBody('');
    setBodyFontStyle('sans');
    setBodyPreviewMode(false);
    setSelectedWordCount(0);
    setTagsRaw('');
    setQueuedImages([]);
    setPublishAsAlbum(true);
    setPostAsPrivate(false);
    setShowAllQueueThumbs(false);
    setPendingSharedFile(null);
    setLocalPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
    setCroppingItem(null);
    setBatchUploadProgress(null);
    setPublishProgress(null);
    setError('');
    if (sharedPayload) {
      onClearSharedPayload?.(sharedPayload.id);
    }
    onExpandedChange(false);
  };

  const syncSelectionCount = () => {
    const el = bodyTextareaRef.current;
    if (!el) {
      setSelectedWordCount(0);
      return;
    }
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (end <= start) {
      setSelectedWordCount(0);
      return;
    }
    const words = body.slice(start, end).trim().split(/\s+/).filter(Boolean).length;
    setSelectedWordCount(words);
  };

  const handleApplyBodyFormat = (action: MakalaFormatAction, sample: string) => {
    const el = bodyTextareaRef.current;
    const { nextBody, nextSelStart, nextSelEnd, snapshot } = applyMakalaFormatAction(
      body,
      el,
      action,
      sample
    );
    setBody(nextBody.slice(0, 8000));
    setBodyPreviewMode(false);
    restoreTextareaSelectionAndScroll(el, nextSelStart, nextSelEnd, snapshot);
    window.setTimeout(() => {
      const words = nextBody.slice(nextSelStart, nextSelEnd).trim().split(/\s+/).filter(Boolean).length;
      setSelectedWordCount(nextSelEnd > nextSelStart ? words : 0);
    }, 0);
  };

  const handleAutoFormatBody = () => {
    if (!body.trim()) return;
    const el = bodyTextareaRef.current;
    const snapshot = captureTextareaScrollSnapshot(el);
    const prevCursor = el?.selectionStart ?? 0;
    const nextFormatted = autoFormatScholarlyText(body).slice(0, 8000);
    setBody(nextFormatted);
    const clampedPos = Math.min(prevCursor, nextFormatted.length);
    restoreTextareaSelectionAndScroll(el, clampedPos, clampedPos, snapshot);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    e.target.value = '';
    if (selectedFiles.length === 0) return;
    setError('');

    const remainingSlots = Math.max(0, MAX_KIJIWENI_IMAGES - queuedImages.length);
    if (remainingSlots === 0) {
      onToast(
        tr(
          `Kiwango cha juu ni picha ${MAX_KIJIWENI_IMAGES} kwa chapisho moja.`,
          `Maximum ${MAX_KIJIWENI_IMAGES} photos per post.`
        ),
        'error'
      );
      return;
    }

    const batchFiles = selectedFiles.slice(0, remainingSlots);
    if (selectedFiles.length > remainingSlots) {
      onToast(
        tr(
          `Zimechaguliwa picha ${remainingSlots} za mwanzo (kikomo ni ${MAX_KIJIWENI_IMAGES}).`,
          `Selected first ${remainingSlots} photos (limit is ${MAX_KIJIWENI_IMAGES}).`
        )
      );
    }

    // Single photo -> allow instant crop preview when queue is empty
    if (batchFiles.length === 1 && queuedImages.length === 0) {
      setCroppingItem({ file: batchFiles[0] });
      return;
    }

    // Pre-allocate exact ordered slots BEFORE async uploads so original/sorted order is 100% preserved
    const baseTs = Date.now();
    const placeholders: QueuedKijiweniImage[] = batchFiles.map((rawFile, idx) => ({
      id: `img-${baseTs}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      url: '',
      fileName: rawFile.name || `photo-${idx + 1}.jpg`,
      lastModified: rawFile.lastModified || baseTs + idx,
      sourceFile: rawFile,
      status: 'uploading',
    }));

    setQueuedImages((prev) => [...prev, ...placeholders]);
    setUploadingCount((c) => c + batchFiles.length);
    setBatchUploadProgress({ done: 0, total: batchFiles.length });

    let successCount = 0;
    let doneCount = 0;
    let firstError = '';
    let nextCursor = 0;

    const runWorker = async () => {
      while (true) {
        const currentIdx = nextCursor;
        nextCursor += 1;
        if (currentIdx >= batchFiles.length) break;

        const rawFile = batchFiles[currentIdx];
        const slotId = placeholders[currentIdx].id;
        try {
          const prepared = await prepareSharedImageFile(rawFile);
          const url = await uploadImageToCloudinary(prepared);
          successCount += 1;
          setQueuedImages((prev) =>
            prev.map((item) =>
              item.id === slotId
                ? {
                    ...item,
                    url,
                    sourceFile: prepared,
                    status: 'ready',
                  }
                : item
            )
          );
        } catch (err) {
          if (!firstError) {
            firstError =
              err instanceof Error
                ? err.message
                : tr('Imeshindwa kupakia baadhi ya picha.', 'Failed uploading some photos.');
          }
          setQueuedImages((prev) => prev.filter((item) => item.id !== slotId));
        } finally {
          doneCount += 1;
          setBatchUploadProgress({ done: doneCount, total: batchFiles.length });
          setUploadingCount((c) => Math.max(0, c - 1));
        }
      }
    };

    const workerCount = Math.min(UPLOAD_CONCURRENCY, batchFiles.length);
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
    setBatchUploadProgress(null);

    if (successCount > 0) {
      onToast(
        tr(
          `Picha ${successCount} zimepakiwa kwa mpangilio wako!`,
          `${successCount} photo(s) uploaded in your exact order!`
        )
      );
    }
    if (firstError) {
      setError(firstError);
      onToast(firstError, 'error');
    }
  };

  const handleConfirmResizedImage = async (resizedFile: File) => {
    const targetId = croppingItem?.existingId;
    setCroppingItem(null);
    setError('');
    setUploadingCount((c) => c + 1);
    try {
      const url = await uploadImageToCloudinary(resizedFile);
      if (targetId) {
        setQueuedImages((prev) =>
          prev.map((item) =>
            item.id === targetId
              ? { ...item, url, sourceFile: resizedFile, status: 'ready' }
              : item
          )
        );
        onToast(tr('Picha imekatwa na kusasishwa.', 'Photo cropped and updated.'));
      } else {
        setQueuedImages((prev) => [
          ...prev,
          {
            id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            url,
            fileName: resizedFile.name || 'photo.jpg',
            lastModified: resizedFile.lastModified || Date.now(),
            sourceFile: resizedFile,
            status: 'ready',
          },
        ]);
        onToast(tr('Picha imeambatanishwa kikamilifu.', 'Image attached successfully.'));
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : tr(
              'Imeshindwa kupakia picha kwenda Cloudinary.',
              'Failed to upload image to Cloudinary.'
            );
      setError(msg);
      onToast(msg, 'error');
    } finally {
      setUploadingCount((c) => Math.max(0, c - 1));
    }
  };

  const sortQueuedImages = (mode: 'name_asc' | 'name_desc' | 'date_asc' | 'date_desc' | 'reverse') => {
    setQueuedImages((prev) => {
      const copy = [...prev];
      if (mode === 'reverse') {
        return copy.reverse();
      }
      if (mode === 'name_asc') {
        return copy.sort((a, b) =>
          a.fileName.localeCompare(b.fileName, undefined, { numeric: true, sensitivity: 'base' })
        );
      }
      if (mode === 'name_desc') {
        return copy.sort((a, b) =>
          b.fileName.localeCompare(a.fileName, undefined, { numeric: true, sensitivity: 'base' })
        );
      }
      if (mode === 'date_asc') {
        return copy.sort((a, b) => a.lastModified - b.lastModified);
      }
      return copy.sort((a, b) => b.lastModified - a.lastModified);
    });
  };

  const moveQueuedImage = (index: number, delta: -1 | 1) => {
    setQueuedImages((prev) => {
      const nextIdx = index + delta;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(index, 1);
      copy.splice(nextIdx, 0, moved);
      return copy;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userUid) {
      onSignIn('post');
      return;
    }
    if (isSuspended) return;
    setError('');

    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    const readyImages = queuedImages.filter((q) => q.status === 'ready' && q.url.length >= 10);
    const hasImages = readyImages.length > 0;

    if (!hasImages) {
      if (cleanTitle.length < 5 || cleanTitle.length > 140) {
        setError(
          tr(
            'Andika kichwa cha chapisho (angalau herufi 5) au chagua picha.',
            'Enter a post title (at least 5 characters) or attach photos.'
          )
        );
        return;
      }
      if (cleanBody.length < 10 || cleanBody.length > 8000) {
        setError(
          tr(
            'Andika maelezo (angalau herufi 10) au chagua picha.',
            'Write a message (at least 10 characters) or attach photos.'
          )
        );
        return;
      }
    } else {
      if (cleanTitle.length > 140) {
        setError(
          tr(
            'Kichwa cha chapisho kisizidi herufi 140.',
            'Post title cannot exceed 140 characters.'
          )
        );
        return;
      }
      if (cleanBody.length > 8000) {
        setError(
          tr(
            'Maelezo yasizidi herufi 8000.',
            'Post message cannot exceed 8000 characters.'
          )
        );
        return;
      }
    }

    if (uploadingCount > 0) {
      setError(
        tr(
          'Subiri picha zote zikamilishe kupakiwa kabla ya kuchapisha.',
          'Wait for all photos to finish uploading before posting.'
        )
      );
      return;
    }

    setSubmitting(true);
    const parsedTags = parseTagsInput(tagsRaw);
    const targetStatus: 'open' | 'private' = postAsPrivate ? 'private' : 'open';

    try {
      if (!hasImages) {
        await onSubmitPost({
          title: cleanTitle,
          body: cleanBody,
          tags: parsedTags,
          bodyFontStyle,
          status: targetStatus,
        });
      } else if (readyImages.length === 1 || publishAsAlbum) {
        const orderedUrls = readyImages.map((img) => img.url);
        await onSubmitPost({
          title: cleanTitle,
          body: cleanBody,
          tags: parsedTags,
          coverImage: orderedUrls[0],
          images: orderedUrls,
          bodyFontStyle,
          status: targetStatus,
        });
      } else {
        // Publish as separate posts in reverse order so newest-first feed shows #1 at the top!
        const total = readyImages.length;
        for (let idx = total - 1; idx >= 0; idx--) {
          setPublishProgress({ current: total - idx, total });
          const suffix = cleanTitle ? ` (${idx + 1}/${total})` : '';
          const perPostTitle = cleanTitle
            ? `${cleanTitle.slice(0, 140 - suffix.length)}${suffix}`
            : '';
          await onSubmitPost(
            {
              title: perPostTitle,
              body: idx === 0 ? cleanBody : cleanBody || '',
              tags: parsedTags,
              coverImage: readyImages[idx].url,
              images: [readyImages[idx].url],
              bodyFontStyle,
              status: targetStatus,
            },
            { silent: true }
          );
          if (idx > 0) {
            await new Promise((resolve) => setTimeout(resolve, 25));
          }
        }
        onToast(
          postAsPrivate
            ? tr(
                `Picha ${total} zimehifadhiwa kwa faragha (akaunti yako tu)!`,
                `${total} photos saved privately (your account only)!`
              )
            : tr(
                `Picha ${total} zimechapishwa kwa mpangilio wako Kijiweni!`,
                `${total} photos published in your exact order in Kijiweni!`
              )
        );
      }

      handleResetAndCollapse();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : tr('Imeshindwa kuchapisha.', 'Failed to publish.')
      );
    } finally {
      setSubmitting(false);
      setPublishProgress(null);
    }
  };

  if (!expanded) {
    return null;
  }

  const readyCount = queuedImages.filter((q) => q.status === 'ready').length;
  const visibleQueueLimit = showAllQueueThumbs ? queuedImages.length : 18;
  const displayedQueue = queuedImages.slice(0, visibleQueueLimit);
  const hiddenQueueCount = Math.max(0, queuedImages.length - displayedQueue.length);

  return (
    <section
      aria-label={tr('Andika chapisho jipya la Kijiweni', 'Write a new Kijiweni post')}
      className="overflow-hidden rounded-xl border border-[#BFD7F2] bg-white sm:rounded-lg"
    >
      {/* Inline Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <Avatar name={userDisplayName} photoURL={userPhoto} uid={userUid} size="md" />
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-bold text-slate-900">{userDisplayName}</p>
              <AuthorVerificationBadge uid={userUid} size="sm" />
            </div>
            <p className="text-[11px] text-slate-500">
              {postAsPrivate
                ? tr('Chapisho la faragha · Akaunti yako tu', 'Private post · Your account only')
                : tr('Unachapisha ndani ya Kijiweni', 'Posting in Kijiweni')}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleResetAndCollapse}
          aria-label={tr('Funga kisanduku cha kuandika', 'Close composer')}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Inline Form */}
      <form onSubmit={handleSubmit} className="space-y-3 p-4 sm:p-5">
        <input
          ref={titleInputRef}
          type="text"
          maxLength={140}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            queuedImages.length > 0
              ? tr(
                  'Kichwa cha chapisho (hiari — unaweza kuchapisha picha pekee)',
                  'Post title (optional — you can post just photos)'
                )
              : tr(
                  'Kichwa cha chapisho (mfano: Maoni yangu kuhusu...)',
                  'Post title (e.g., My thoughts on...)'
                )
          }
          aria-label={tr('Kichwa cha chapisho', 'Post title')}
          className="w-full rounded-lg border border-slate-200 bg-[#F8FAFC] px-3.5 py-2.5 text-sm font-semibold text-slate-900 placeholder:font-normal placeholder:text-slate-500 focus:border-[#1D4E89] focus:bg-white focus:outline-none"
        />

        <div>
          <KijiweniDescriptionTools
            fontStyle={bodyFontStyle}
            onChangeFontStyle={setBodyFontStyle}
            previewMode={bodyPreviewMode}
            onTogglePreview={setBodyPreviewMode}
            selectedWordCount={selectedWordCount}
            onApplyFormat={handleApplyBodyFormat}
            onAutoFormat={handleAutoFormatBody}
          />

          {bodyPreviewMode ? (
            <div className="min-h-[120px] rounded-b-lg border border-slate-200 bg-white p-4">
              {title.trim() && (
                <h3 className="mb-2 border-b border-slate-100 pb-2 font-display text-lg font-bold leading-snug text-[#0E2640] [text-wrap:balance]">
                  {title.trim()}
                </h3>
              )}
              {body.trim() ? (
                <RichText content={body} fontStyle={bodyFontStyle} scholarly />
              ) : (
                <p className="text-sm italic text-slate-400">
                  {tr(
                    'Andika maelezo ili uone muonekano wa kisomi hapa...',
                    'Write your description to preview the scholarly layout here...'
                  )}
                </p>
              )}
            </div>
          ) : (
            <textarea
              ref={bodyTextareaRef}
              rows={queuedImages.length > 0 ? 4 : 5}
              maxLength={8000}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setSelectedWordCount(0);
              }}
              onSelect={syncSelectionCount}
              onKeyUp={syncSelectionCount}
              onMouseUp={syncSelectionCount}
              style={{ fontFamily: activeFontMeta.fontFamilyCss }}
              placeholder={
                queuedImages.length > 0
                  ? tr(
                      'Maelezo ya picha (hiari — chagua mwandiko hapo juu na panga kisomi)...',
                      'Photo caption (optional — pick a font above & format cleanly)...'
                    )
                  : tr(
                      'Unawaza nini leo? Andika hapa, chagua mwandiko wako, au tumia Panga Kisomi...',
                      "What's on your mind today? Write here, choose your font, or use Auto-Format..."
                    )
              }
              aria-label={tr('Maelezo ya chapisho', 'Post body')}
              className={`w-full resize-y rounded-b-lg border border-slate-200 bg-[#F8FAFC] p-3.5 leading-[1.68] text-slate-900 placeholder:font-sans placeholder:text-sm placeholder:text-slate-500 focus:border-[#1D4E89] focus:bg-white focus:outline-none ${activeFontMeta.bodySizeClass}`}
            />
          )}
        </div>

        {/* Hidden Multi-File Input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(e) => void handleFileChange(e)}
          className="hidden"
        />

        {/* Uploading State with Progress */}
        {uploadingCount > 0 && (
          <div className="space-y-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-xs font-medium text-[#163A5F]">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>
                  {batchUploadProgress
                    ? tr(
                        `Inapakia picha ${batchUploadProgress.done}/${batchUploadProgress.total} kwa mpangilio wako...`,
                        `Uploading ${batchUploadProgress.done}/${batchUploadProgress.total} photos in order...`
                      )
                    : tr(
                        `Inapakia picha ${uploadingCount} kwenda Cloudinary...`,
                        `Uploading ${uploadingCount} photo(s) to Cloudinary...`
                      )}
                </span>
              </span>
              {batchUploadProgress && (
                <span className="font-mono text-[11px] font-bold tabular-nums">
                  {Math.round((batchUploadProgress.done / Math.max(1, batchUploadProgress.total)) * 100)}%
                </span>
              )}
            </div>
            {batchUploadProgress && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-sky-200/70">
                <div
                  className="h-full rounded-full bg-[#1D4E89] transition-all duration-150"
                  style={{
                    width: `${Math.round((batchUploadProgress.done / Math.max(1, batchUploadProgress.total)) * 100)}%`,
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Shared Local Preview while uploading */}
        {localPreviewUrl && queuedImages.length === 0 && (
          <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
            <img
              src={localPreviewUrl}
              alt={tr('Hakiki ya picha iliyoshare', 'Shared image preview')}
              className="block max-h-60 w-full object-contain"
            />
          </div>
        )}

        {/* Multi-Photo Queue Grid + Ordering Tools */}
        {queuedImages.length > 0 && (
          <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-bold text-[#0E2640]">
                <Images className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                <span>
                  {queuedImages.length === 1
                    ? tr('Picha 1 itachapishwa', '1 photo ready to post')
                    : publishAsAlbum
                      ? tr(
                          `Picha ${readyCount}/${queuedImages.length} zimepangwa (#1–#${queuedImages.length}) · Post 1`,
                          `${readyCount}/${queuedImages.length} photos ordered (#1–#${queuedImages.length}) · 1 Post`
                        )
                      : tr(
                          `Picha ${readyCount}/${queuedImages.length} zimepangwa · Post ${queuedImages.length} tofauti`,
                          `${readyCount}/${queuedImages.length} photos ordered · ${queuedImages.length} separate posts`
                        )}
                </span>
              </p>
              <button
                type="button"
                disabled={uploadingCount > 0}
                onClick={() => setQueuedImages([])}
                className="text-[11px] font-semibold text-red-600 hover:underline disabled:opacity-50"
              >
                {tr('Ondoa zote', 'Clear all')}
              </button>
            </div>

            <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5">
              {queuedImages.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-2">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                    <ArrowUpDown className="h-3 w-3 text-[#1D4E89]" aria-hidden="true" />
                    <span>{tr('Panga:', 'Sort:')}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => sortQueuedImages('name_asc')}
                    className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:border-[#1D4E89] hover:text-[#1D4E89]"
                  >
                    A–Z
                  </button>
                  <button
                    type="button"
                    onClick={() => sortQueuedImages('name_desc')}
                    className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:border-[#1D4E89] hover:text-[#1D4E89]"
                  >
                    Z–A
                  </button>
                  <button
                    type="button"
                    onClick={() => sortQueuedImages('date_asc')}
                    className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:border-[#1D4E89] hover:text-[#1D4E89]"
                  >
                    {tr('Zamani → Mpya', 'Old → New')}
                  </button>
                  <button
                    type="button"
                    onClick={() => sortQueuedImages('reverse')}
                    className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:border-[#1D4E89] hover:text-[#1D4E89]"
                  >
                    {tr('Geuza Mpangilio', 'Reverse')}
                  </button>
                </div>
              )}

              <div>
                <p className="mb-1.5 text-[11px] font-bold text-[#0E2640]">
                  {tr(
                    `Chagua jinsi ya kuchapisha picha (${queuedImages.length}):`,
                    `Choose how to publish (${queuedImages.length} photo${queuedImages.length === 1 ? '' : 's'}):`
                  )}
                </p>
                <div
                  role="radiogroup"
                  aria-label={tr('Mtindo wa kuchapisha picha nyingi', 'Multi-photo publish mode')}
                  className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={publishAsAlbum}
                    onClick={() => setPublishAsAlbum(true)}
                    className={`flex flex-col items-start rounded-lg border px-3 py-2 text-left transition-all ${
                      publishAsAlbum
                        ? 'border-[#1D4E89] bg-sky-50/90 ring-1 ring-[#1D4E89]'
                        : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-xs font-bold text-[#0E2640]">
                      {tr('Zote Katika Post 1 (Auto-Slide)', 'All in 1 Post (Auto-Slide)')}
                    </span>
                    <span className="mt-0.5 text-[10.5px] leading-snug text-slate-600">
                      {tr(
                        `Picha zote ${queuedImages.length} zinaenda pamoja na kuslide zenyewe ili zisomeke kirahisi.`,
                        `All ${queuedImages.length} photo(s) combine in 1 post with automatic slideshow.`
                      )}
                    </span>
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={!publishAsAlbum}
                    onClick={() => setPublishAsAlbum(false)}
                    className={`flex flex-col items-start rounded-lg border px-3 py-2 text-left transition-all ${
                      !publishAsAlbum
                        ? 'border-[#1D4E89] bg-sky-50/90 ring-1 ring-[#1D4E89]'
                        : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-xs font-bold text-[#0E2640]">
                      {tr(
                        `Kila Picha Iwe Post Yake (${queuedImages.length} Post)`,
                        `Each Photo as Its Own Post (${queuedImages.length})`
                      )}
                    </span>
                    <span className="mt-0.5 text-[10.5px] leading-snug text-slate-600">
                      {tr(
                        `Kila picha itachapishwa kama post yake tofauti Kijiweni kwa mpangilio wako.`,
                        `Each photo publishes as its own individual post in Kijiweni in order.`
                      )}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <div
              className={`grid gap-2 ${
                queuedImages.length === 1
                  ? 'grid-cols-1'
                  : queuedImages.length >= 9
                    ? 'grid-cols-3 sm:grid-cols-5'
                    : 'grid-cols-2 sm:grid-cols-3'
              }`}
            >
              {displayedQueue.map((item, idx) => (
                <div
                  key={item.id}
                  className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white"
                >
                  {item.status === 'ready' ? (
                    <img
                      src={item.url}
                      alt={`${tr('Picha', 'Photo')} ${idx + 1}`}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className={`block w-full bg-slate-100 object-cover ${
                        queuedImages.length === 1 ? 'max-h-80 object-contain' : 'h-24 sm:h-28'
                      }`}
                    />
                  ) : (
                    <div className="flex h-24 w-full flex-col items-center justify-center gap-1 bg-slate-100 px-2 text-center sm:h-28">
                      <Loader2 className="h-4 w-4 animate-spin text-[#1D4E89]" aria-hidden="true" />
                      <span className="max-w-full truncate text-[10px] text-slate-500">
                        {item.fileName}
                      </span>
                    </div>
                  )}

                  {queuedImages.length > 1 && (
                    <span className="absolute top-1.5 left-1.5 rounded-md bg-[#0E2640]/85 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
                      #{idx + 1}
                    </span>
                  )}

                  <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                    {item.status === 'ready' && queuedImages.length <= 12 && (
                      <button
                        type="button"
                        onClick={() =>
                          setCroppingItem({ existingId: item.id, file: item.sourceFile })
                        }
                        aria-label={tr(`Kata picha ${idx + 1}`, `Crop photo ${idx + 1}`)}
                        className="inline-flex h-6 items-center gap-1 rounded bg-slate-900/80 px-1.5 text-[10px] font-semibold text-white hover:bg-slate-900"
                      >
                        <Crop className="h-3 w-3" aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setQueuedImages((prev) => prev.filter((x) => x.id !== item.id))
                      }
                      aria-label={tr(`Ondoa picha ${idx + 1}`, `Remove photo ${idx + 1}`)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded bg-red-600/90 text-white hover:bg-red-700"
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </div>

                  {queuedImages.length > 1 && (
                    <div className="flex items-center justify-between border-t border-slate-100 bg-white px-1.5 py-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveQueuedImage(idx, -1)}
                        aria-label={tr(`Sogeza nyuma #${idx + 1}`, `Move #${idx + 1} earlier`)}
                        className="inline-flex h-5 w-6 items-center justify-center rounded text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                      >
                        <ArrowLeft className="h-3 w-3" />
                      </button>
                      <span className="max-w-[70px] truncate text-[9.5px] text-slate-500">
                        {item.fileName}
                      </span>
                      <button
                        type="button"
                        disabled={idx === queuedImages.length - 1}
                        onClick={() => moveQueuedImage(idx, 1)}
                        aria-label={tr(`Sogeza mbele #${idx + 1}`, `Move #${idx + 1} later`)}
                        className="inline-flex h-5 w-6 items-center justify-center rounded text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                      >
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {hiddenQueueCount > 0 && (
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => setShowAllQueueThumbs(true)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-[11px] font-bold text-[#1D4E89] hover:bg-sky-50"
                >
                  {tr(
                    `Onyesha picha zingine ${hiddenQueueCount} kwenye foleni`,
                    `Show ${hiddenQueueCount} more queued photos`
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Optional Tags Row */}
        <input
          type="text"
          value={tagsRaw}
          onChange={(e) => setTagsRaw(e.target.value)}
          placeholder={tr(
            'Lebo za mada (hiari, tenganisha kwa mkato: maisha, michezo)',
            'Topic tags (optional, comma-separated: life, sports)'
          )}
          aria-label={tr('Lebo za mada', 'Topic tags')}
          className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#1D4E89] focus:outline-none"
        />

        {/* Privacy Switch: Lock to Account Only */}
        <div
          className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${
            postAsPrivate
              ? 'border-amber-300 bg-amber-50/80 text-amber-950'
              : 'border-slate-200 bg-slate-50/70 text-slate-700'
          }`}
        >
          <div className="flex items-center gap-2">
            {postAsPrivate ? (
              <Lock className="h-3.5 w-3.5 shrink-0 text-amber-800" aria-hidden="true" />
            ) : (
              <Eye className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
            )}
            <span className="font-medium">
              {postAsPrivate
                ? tr(
                    'Imefungwa: Post hii itaonekana kwenye akaunti yako pekee.',
                    'Private: Only visible inside your own account.'
                  )
                : tr(
                    'Wazi: Watu wote wataona post hii Kijiweni.',
                    'Public: Visible to everyone in Kijiweni.'
                  )}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setPostAsPrivate((prev) => !prev)}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors ${
              postAsPrivate
                ? 'bg-amber-800 text-white hover:bg-amber-900'
                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            {postAsPrivate ? (
              <>
                <EyeOff className="h-3 w-3" aria-hidden="true" />
                <span>{tr('Akaunti Yangu Tu', 'Only Me')}</span>
              </>
            ) : (
              <span>{tr('Funga kwa Wengine', 'Lock Private')}</span>
            )}
          </button>
        </div>

        {!cloudinaryConfigured && (
          <p className="text-[11px] text-slate-500">
            {tr(
              'Upakiaji wa picha uko tayari kwa Cloudinary.',
              'Image uploads are ready for Cloudinary.'
            )}
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
          >
            {error}
          </p>
        )}

        {/* Inline Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-slate-100 pt-3">
          <button
            type="button"
            disabled={uploadingCount > 0 || submitting}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
          >
            <ImagePlus className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            <span>
              {queuedImages.length > 0
                ? tr(
                    `Ongeza Picha (${queuedImages.length}/${MAX_KIJIWENI_IMAGES})`,
                    `Add Photos (${queuedImages.length}/${MAX_KIJIWENI_IMAGES})`
                  )
                : tr('Chagua Picha (Hadi 250)', 'Attach Photos (Up to 250)')}
            </span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetAndCollapse}
              className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {tr('Ghairi', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting || uploadingCount > 0}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#1D4E89] px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#163A5F] disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : postAsPrivate ? (
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>
                {publishProgress
                  ? tr(
                      `Inachapisha ${publishProgress.current}/${publishProgress.total}...`,
                      `Posting ${publishProgress.current}/${publishProgress.total}...`
                    )
                  : submitting
                    ? tr('Inachapisha...', 'Publishing...')
                    : postAsPrivate
                      ? tr('Hifadhi (Akaunti Yangu Tu)', 'Save Privately')
                      : readyCount > 1
                        ? publishAsAlbum
                          ? tr(
                              `Chapisha Post 1 (Picha ${readyCount})`,
                              `Post 1 Album (${readyCount} Photos)`
                            )
                          : tr(
                              `Chapisha Post ${readyCount} Tofauti`,
                              `Publish ${readyCount} Separate Posts`
                            )
                        : tr('Chapisha Kijiweni', 'Post to Kijiweni')}
              </span>
            </button>
          </div>
        </div>
      </form>

      <ImageResizeModal
        file={croppingItem?.file || null}
        onCancel={() => setCroppingItem(null)}
        onConfirm={(resizedFile) => void handleConfirmResizedImage(resizedFile)}
      />
    </section>
  );
};
