import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Send, X } from 'lucide-react';
import {
  getCloudinaryConfig,
  uploadImageToCloudinary,
} from '../services/cloudinaryService';
import { parseTagsInput } from '../utils/formatters';
import { useLanguage } from '../context/LanguageContext';
import { AuthPromptReason } from '../types';
import { Avatar } from './Avatar';
import { ImageResizeModal } from './ImageResizeModal';
import { AuthorVerificationBadge } from './VerificationBadge';

interface KijiweniInlineComposerProps {
  expanded: boolean;
  onExpandedChange: (next: boolean) => void;
  userUid: string | null;
  userDisplayName: string;
  userPhoto: string;
  isSuspended?: boolean;
  onSignIn: (reason?: AuthPromptReason) => void;
  onSubmitPost: (data: {
    title: string;
    body: string;
    tags: string[];
    coverImage?: string;
  }) => Promise<void>;
  onToast: (message: string, kind?: 'success' | 'error') => void;
}

export const KijiweniInlineComposer: React.FC<KijiweniInlineComposerProps> = ({
  expanded,
  onExpandedChange,
  userUid,
  userDisplayName,
  userPhoto,
  isSuspended = false,
  onSignIn,
  onSubmitPost,
  onToast,
}) => {
  const { tr } = useLanguage();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [attachedImage, setAttachedImage] = useState('');
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [previewFailed, setPreviewFailed] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { configured: cloudinaryConfigured } = getCloudinaryConfig();

  useEffect(() => {
    if (expanded && userUid) {
      const timer = window.setTimeout(() => {
        titleInputRef.current?.focus();
      }, 40);
      return () => window.clearTimeout(timer);
    }
  }, [expanded, userUid]);

  const handleExpand = (triggerImagePicker = false) => {
    if (!userUid) {
      onToast(
        tr(
          'Tengeneza akaunti au ingia (kwa Google au Jisajili kawaida) ili kuchapisha Kijiweni.',
          'Create an account or sign in to post in Kijiweni.'
        ),
        'error'
      );
      onSignIn('post');
      return;
    }
    if (isSuspended) {
      onToast(
        tr(
          'Akaunti yako imefungwa na msimamizi — huwezi kuchapisha.',
          'Your account is suspended — you cannot post.'
        ),
        'error'
      );
      return;
    }
    setError('');
    onExpandedChange(true);
    if (triggerImagePicker) {
      window.setTimeout(() => {
        fileInputRef.current?.click();
      }, 60);
    }
  };

  const handleResetAndCollapse = () => {
    setTitle('');
    setBody('');
    setTagsRaw('');
    setAttachedImage('');
    setPendingImageFile(null);
    setPreviewFailed(false);
    setError('');
    onExpandedChange(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setPendingImageFile(file);
  };

  const handleConfirmResizedImage = async (resizedFile: File) => {
    setPendingImageFile(null);
    setError('');
    setUploadingImage(true);
    setPreviewFailed(false);
    try {
      const url = await uploadImageToCloudinary(resizedFile);
      setAttachedImage(url);
      onToast(tr('Picha imeambatanishwa kikamilifu.', 'Image attached successfully.'));
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
      setUploadingImage(false);
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
    const hasImage = attachedImage.trim().length >= 10;

    if (!hasImage) {
      if (cleanTitle.length < 5 || cleanTitle.length > 140) {
        setError(
          tr(
            'Andika kichwa cha chapisho (angalau herufi 5) au ambatanisha picha pekee.',
            'Enter a post title (at least 5 characters) or attach a photo.'
          )
        );
        return;
      }
      if (cleanBody.length < 10 || cleanBody.length > 8000) {
        setError(
          tr(
            'Andika maelezo (angalau herufi 10) au ambatanisha picha pekee.',
            'Write a message (at least 10 characters) or attach a photo.'
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
    if (uploadingImage) {
      setError(
        tr(
          'Subiri picha ikamilishe kupakiwa kabla ya kuchapisha.',
          'Wait for the image to finish uploading before posting.'
        )
      );
      return;
    }

    setSubmitting(true);
    try {
      await onSubmitPost({
        title: cleanTitle,
        body: cleanBody,
        tags: parseTagsInput(tagsRaw),
        ...(attachedImage ? { coverImage: attachedImage } : {}),
      });
      handleResetAndCollapse();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : tr('Imeshindwa kuchapisha.', 'Failed to publish.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!expanded) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 sm:rounded-lg sm:px-5">
        <div className="flex items-center gap-3">
          <Avatar
            name={userUid ? userDisplayName : 'M'}
            photoURL={userUid ? userPhoto : ''}
            size="md"
          />
          <button
            type="button"
            onClick={() => handleExpand(false)}
            className="min-h-[44px] flex-1 rounded-full bg-[#F0F2F5] px-4 py-2 text-left text-sm text-slate-600 transition-colors hover:bg-slate-200/80"
          >
            {isSuspended
              ? tr(
                  'Akaunti yako imefungwa — huwezi kuchapisha Kijiweni.',
                  'Your account is suspended — posting is disabled.'
                )
              : userUid
                ? tr(
                    `Unawaza nini leo, ${userDisplayName.split(' ')[0]}? Andika hapa...`,
                    `What's on your mind, ${userDisplayName.split(' ')[0]}? Write here...`
                  )
                : tr(
                    'Tengeneza akaunti (Google / Jisajili) ili uandike unachowaza Kijiweni...',
                    'Create an account (Google / Register) to share your thoughts on Kijiweni...'
                  )}
          </button>
          <button
            type="button"
            onClick={() => handleExpand(true)}
            aria-label={tr('Ambatanisha picha Kijiweni', 'Attach image to Kijiweni')}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <ImagePlus className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            <span className="hidden sm:inline">{tr('Picha', 'Photo')}</span>
          </button>
        </div>
      </div>
    );
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
            attachedImage
              ? tr(
                  'Kichwa cha chapisho (hiari — unaweza kuchapisha picha pekee)',
                  'Post title (optional — you can post just the photo)'
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
          rows={attachedImage ? 3 : 4}
          maxLength={8000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            attachedImage
              ? tr(
                  'Maelezo ya picha (hiari — unaweza kuchapisha picha pekee)...',
                  'Photo caption (optional — you can post just the photo)...'
                )
              : tr(
                  'Unawaza nini leo? Shiriki mawazo yako na wana Kijiweni...',
                  "What's on your mind today? Share your thoughts with Kijiweni..."
                )
          }
          aria-label={tr('Maelezo ya chapisho', 'Post body')}
          className="w-full resize-y rounded-lg border border-slate-200 bg-[#F8FAFC] p-3.5 text-sm leading-relaxed text-slate-900 placeholder:text-slate-500 focus:border-[#1D4E89] focus:bg-white focus:outline-none"
        />

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Uploading State */}
        {uploadingImage && (
          <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-xs font-medium text-[#163A5F]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>
              {tr('Inapakia picha kwenda Cloudinary...', 'Uploading image to Cloudinary...')}
            </span>
          </div>
        )}

        {/* Attached Cloudinary Image Preview */}
        {attachedImage && !uploadingImage && (
          <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
            {!previewFailed ? (
              <img
                src={attachedImage}
                alt={tr('Hakiki ya picha iliyoambatanishwa', 'Attached image preview')}
                referrerPolicy="no-referrer"
                onError={() => setPreviewFailed(true)}
                className="block h-auto w-full"
              />
            ) : (
              <div className="flex h-32 items-center justify-center text-xs text-slate-500">
                {tr('Picha imeambatanishwa', 'Image attached')} ({attachedImage})
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setAttachedImage('');
                setPreviewFailed(false);
              }}
              aria-label={tr('Ondoa picha', 'Remove image')}
              className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-lg bg-slate-900/80 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-900"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr('Ondoa Picha', 'Remove Image')}</span>
            </button>
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
              'Upakiaji wa picha uko tayari kwa Cloudinary (mipangilio ya Cloudinary ikikamilishwa itaunganishwa moja kwa moja).',
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
            disabled={uploadingImage || submitting}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
          >
            <ImagePlus className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            <span>
              {attachedImage
                ? tr('Badilisha Picha', 'Change Photo')
                : tr('Ambatanisha Picha', 'Attach Photo')}
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
              disabled={submitting || uploadingImage}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#1D4E89] px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#163A5F] disabled:opacity-60"
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {submitting
                  ? tr('Inachapisha...', 'Publishing...')
                  : tr('Chapisha Kijiweni', 'Post to Kijiweni')}
              </span>
            </button>
          </div>
        </div>
      </form>

      <ImageResizeModal
        file={pendingImageFile}
        onCancel={() => setPendingImageFile(null)}
        onConfirm={(resizedFile) => void handleConfirmResizedImage(resizedFile)}
      />
    </section>
  );
};
