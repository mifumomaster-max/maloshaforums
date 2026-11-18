import React, { useEffect, useRef, useState } from 'react';
import { Crop, ImagePlus, Images, Loader2, Send, X } from 'lucide-react';
import {
  getCloudinaryConfig,
  prepareSharedImageFile,
  uploadImageToCloudinary,
} from '../services/cloudinaryService';
import { parseTagsInput } from '../utils/formatters';
import { useLanguage } from '../context/LanguageContext';
import { AuthPromptReason, SharedMediaPayload } from '../types';
import { Avatar } from './Avatar';
import { ImageResizeModal } from './ImageResizeModal';
import { AuthorVerificationBadge } from './VerificationBadge';

interface QueuedKijiweniImage {
  id: string;
  url: string;
  fileName: string;
  sourceFile: File;
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
  const [tagsRaw, setTagsRaw] = useState('');
  const [queuedImages, setQueuedImages] = useState<QueuedKijiweniImage[]>([]);
  const [localPreviewUrl, setLocalPreviewUrl] = useState('');
  const [pendingSharedFile, setPendingSharedFile] = useState<File | null>(null);
  const [croppingItem, setCroppingItem] = useState<{
    existingId?: string;
    file: File;
  } | null>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [publishProgress, setPublishProgress] = useState<{ current: number; total: number } | null>(
    null
  );
  const [error, setError] = useState('');

  const titleInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastHandledShareIdRef = useRef<number>(0);
  const { configured: cloudinaryConfigured } = getCloudinaryConfig();

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
            sourceFile: prepared,
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
    setTagsRaw('');
    setQueuedImages([]);
    setPendingSharedFile(null);
    setLocalPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
    setCroppingItem(null);
    setPublishProgress(null);
    setError('');
    if (sharedPayload) {
      onClearSharedPayload?.(sharedPayload.id);
    }
    onExpandedChange(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    e.target.value = '';
    if (selectedFiles.length === 0) return;
    setError('');

    const remainingSlots = Math.max(0, 12 - queuedImages.length);
    if (remainingSlots === 0) {
      onToast(
        tr('Kiwango cha juu ni picha 12 kwa mkupuo mmoja.', 'Maximum 12 photos per batch.'),
        'error'
      );
      return;
    }

    const batchFiles = selectedFiles.slice(0, remainingSlots);
    if (selectedFiles.length > remainingSlots) {
      onToast(
        tr(
          `Zimechaguliwa picha ${remainingSlots} za mwanzo (kikomo ni 12 kwa mkupuo).`,
          `Selected first ${remainingSlots} photos (batch limit is 12).`
        )
      );
    }

    // Single photo -> allow instant crop preview like before if desired, or fast batch upload when > 1
    if (batchFiles.length === 1 && queuedImages.length === 0) {
      setCroppingItem({ file: batchFiles[0] });
      return;
    }

    setUploadingCount((c) => c + batchFiles.length);
    let successCount = 0;
    let firstError = '';

    await Promise.all(
      batchFiles.map(async (rawFile, idx) => {
        try {
          const prepared = await prepareSharedImageFile(rawFile);
          const url = await uploadImageToCloudinary(prepared);
          successCount += 1;
          setQueuedImages((prev) => [
            ...prev,
            {
              id: `img-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
              url,
              fileName: rawFile.name || `photo-${idx + 1}.jpg`,
              sourceFile: prepared,
            },
          ]);
        } catch (err) {
          if (!firstError) {
            firstError =
              err instanceof Error
                ? err.message
                : tr('Imeshindwa kupakia baadhi ya picha.', 'Failed uploading some photos.');
          }
        } finally {
          setUploadingCount((c) => Math.max(0, c - 1));
        }
      })
    );

    if (successCount > 0) {
      onToast(
        tr(
          `Picha ${successCount} ziko tayari! Kila picha itachapishwa kama post yake.`,
          `${successCount} photos ready! Each photo will publish as a separate post.`
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
            item.id === targetId ? { ...item, url, sourceFile: resizedFile } : item
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
            sourceFile: resizedFile,
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
    const hasImages = queuedImages.length > 0;

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

    try {
      if (!hasImages) {
        await onSubmitPost({
          title: cleanTitle,
          body: cleanBody,
          tags: parsedTags,
        });
      } else if (queuedImages.length === 1) {
        await onSubmitPost({
          title: cleanTitle,
          body: cleanBody,
          tags: parsedTags,
          coverImage: queuedImages[0].url,
        });
      } else {
        const total = queuedImages.length;
        for (let idx = 0; idx < total; idx++) {
          setPublishProgress({ current: idx + 1, total });
          const suffix = cleanTitle ? ` (${idx + 1}/${total})` : '';
          const perPostTitle = cleanTitle
            ? `${cleanTitle.slice(0, 140 - suffix.length)}${suffix}`
            : '';
          await onSubmitPost(
            {
              title: perPostTitle,
              body: idx === 0 ? cleanBody : cleanBody || '',
              tags: parsedTags,
              coverImage: queuedImages[idx].url,
            },
            { silent: true }
          );
        }
        onToast(
          tr(
            `Picha ${total} zimechapishwa kama machapisho ${total} tofauti Kijiweni!`,
            `${total} photos published as ${total} separate posts in Kijiweni!`
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

  return (
    <section
      aria-label={tr('Andika chapisho jipya la Kijiweni', 'Write a new Kijiweni post')}
      className="overflow-hidden rounded-xl border border-[#BFD7F2] bg-white sm:rounded-lg"
    >
      {/* Inline Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <Avatar name={userDisplayName} photoURL={userPhoto} size="md" />
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-bold text-slate-900">{userDisplayName}</p>
              <AuthorVerificationBadge uid={userUid} size="sm" />
            </div>
            <p className="text-[11px] text-slate-500">
              {tr('Unachapisha ndani ya Kijiweni', 'Posting in Kijiweni')}
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

        <textarea
          rows={queuedImages.length > 0 ? 3 : 4}
          maxLength={8000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            queuedImages.length > 0
              ? tr(
                  'Maelezo ya picha (hiari — unaweza kuchapisha picha pekee)...',
                  'Photo caption (optional — you can post just the photos)...'
                )
              : tr(
                  'Unawaza nini leo? Shiriki mawazo yako na wana Kijiweni...',
                  "What's on your mind today? Share your thoughts with Kijiweni..."
                )
          }
          aria-label={tr('Maelezo ya chapisho', 'Post body')}
          className="w-full resize-y rounded-lg border border-slate-200 bg-[#F8FAFC] p-3.5 text-sm leading-relaxed text-slate-900 placeholder:text-slate-500 focus:border-[#1D4E89] focus:bg-white focus:outline-none"
        />

        {/* Hidden Multi-File Input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(e) => void handleFileChange(e)}
          className="hidden"
        />

        {/* Uploading State */}
        {uploadingCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-xs font-medium text-[#163A5F]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>
              {tr(
                `Inapakia picha ${uploadingCount} kwenda Cloudinary...`,
                `Uploading ${uploadingCount} photo(s) to Cloudinary...`
              )}
            </span>
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

        {/* Multi-Photo Queue Grid */}
        {queuedImages.length > 0 && (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-bold text-[#0E2640]">
                <Images className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                <span>
                  {queuedImages.length === 1
                    ? tr('Picha 1 itachapishwa', '1 photo ready to post')
                    : tr(
                        `Picha ${queuedImages.length} zimechaguliwa · Kila picha itakuwa chapisho lake`,
                        `${queuedImages.length} photos queued · Each publishes as its own post`
                      )}
                </span>
              </p>
              <button
                type="button"
                onClick={() => setQueuedImages([])}
                className="text-[11px] font-semibold text-red-600 hover:underline"
              >
                {tr('Ondoa zote', 'Clear all')}
              </button>
            </div>

            <div
              className={`grid gap-2.5 ${
                queuedImages.length === 1 ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-3'
              }`}
            >
              {queuedImages.map((item, idx) => (
                <div
                  key={item.id}
                  className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white"
                >
                  <img
                    src={item.url}
                    alt={`${tr('Picha', 'Photo')} ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    className={`block w-full bg-slate-100 object-cover ${
                      queuedImages.length === 1 ? 'max-h-80 object-contain' : 'h-32 sm:h-36'
                    }`}
                  />
                  {queuedImages.length > 1 && (
                    <span className="absolute top-2 left-2 rounded-md bg-[#0E2640]/85 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
                      #{idx + 1}
                    </span>
                  )}
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setCroppingItem({ existingId: item.id, file: item.sourceFile })
                      }
                      aria-label={tr(`Kata picha ${idx + 1}`, `Crop photo ${idx + 1}`)}
                      className="inline-flex h-7 items-center gap-1 rounded-md bg-slate-900/80 px-2 text-[11px] font-semibold text-white hover:bg-slate-900"
                    >
                      <Crop className="h-3 w-3" aria-hidden="true" />
                      <span className="hidden sm:inline">{tr('Kata', 'Crop')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setQueuedImages((prev) => prev.filter((x) => x.id !== item.id))
                      }
                      aria-label={tr(`Ondoa picha ${idx + 1}`, `Remove photo ${idx + 1}`)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-red-600/90 text-white hover:bg-red-700"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
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
                ? tr('Ongeza Picha Zaidi', 'Add More Photos')
                : tr('Chagua Picha (1 au Nyingi)', 'Attach Photo(s)')}
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
                    : queuedImages.length > 1
                      ? tr(
                          `Chapisha Picha ${queuedImages.length}`,
                          `Post ${queuedImages.length} Photos`
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
