import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Newspaper, Send, X } from 'lucide-react';
import { uploadImageToCloudinary } from '../services/cloudinaryService';
import { MAKALA_COVERS, MAKALA_SECTIONS } from '../types';
import { parseTagsInput } from '../utils/formatters';
import { useLanguage } from '../context/LanguageContext';
import { Avatar } from './Avatar';
import { AuthorVerificationBadge } from './VerificationBadge';

interface MakalaInlineComposerProps {
  expanded: boolean;
  onExpandedChange: (next: boolean) => void;
  userUid: string | null;
  userDisplayName: string;
  userPhoto: string;
  onSignIn: () => void;
  onSubmitArticle: (data: {
    title: string;
    body: string;
    tags: string[];
    coverImage?: string;
  }) => Promise<void>;
  onToast: (message: string, kind?: 'success' | 'error') => void;
}

export const MakalaInlineComposer: React.FC<MakalaInlineComposerProps> = ({
  expanded,
  onExpandedChange,
  userUid,
  userDisplayName,
  userPhoto,
  onSignIn,
  onSubmitArticle,
  onToast,
}) => {
  const { tr, getMakalaSectionLabel, getMakalaCoverLabel } = useLanguage();
  const [title, setTitle] = useState('');
  const [section, setSection] = useState<string>(MAKALA_SECTIONS[0]);
  const [body, setBody] = useState('');
  const [extraTags, setExtraTags] = useState('');
  const [coverImage, setCoverImage] = useState<string>('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const titleInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      onSignIn();
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
    setSection(MAKALA_SECTIONS[0]);
    setBody('');
    setExtraTags('');
    setCoverImage('');
    setShowPresets(false);
    setPreviewFailed(false);
    setError('');
    onExpandedChange(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError('');
    setUploadingImage(true);
    setPreviewFailed(false);
    try {
      const url = await uploadImageToCloudinary(file);
      setCoverImage(url);
      setShowPresets(false);
      onToast(tr('Picha ya makala imeambatanishwa.', 'Article image attached.'));
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
      onSignIn();
      return;
    }
    setError('');

    const cleanTitle = title.trim();
    const cleanBody = body.trim();

    if (cleanTitle.length < 5 || cleanTitle.length > 140) {
      setError(
        tr(
          'Kichwa cha makala lazima kiwe na herufi kati ya 5 na 140.',
          'Article headline must be between 5 and 140 characters.'
        )
      );
      return;
    }
    if (cleanBody.length < 10 || cleanBody.length > 8000) {
      setError(
        tr(
          'Matini ya makala lazima yawe na herufi kati ya 10 na 8000.',
          'Article body must be between 10 and 8000 characters.'
        )
      );
      return;
    }
    if (uploadingImage) {
      setError(
        tr(
          'Subiri picha ikamilishe kupakiwa kabla ya kuchapisha.',
          'Wait for the image to finish uploading before publishing.'
        )
      );
      return;
    }

    const sectionTag = section.toLowerCase();
    const otherTags = parseTagsInput(extraTags).filter((t) => t !== sectionTag);
    const mergedTags = [sectionTag, ...otherTags].slice(0, 5);

    setSubmitting(true);
    try {
      await onSubmitArticle({
        title: cleanTitle,
        body: cleanBody,
        tags: mergedTags,
        ...(coverImage ? { coverImage } : {}),
      });
      handleResetAndCollapse();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kuchapisha makala.', 'Failed to publish article.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!expanded) {
    return (
      <div className="border border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar
            name={userUid ? userDisplayName : 'M'}
            photoURL={userUid ? userPhoto : ''}
            size="md"
          />
          <button
            type="button"
            onClick={() => handleExpand(false)}
            className="min-h-[44px] flex-1 border border-slate-200 bg-[#F6F6F6] px-4 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-200/70"
          >
            {userUid
              ? tr(
                  'Una habari, ripoti au uchambuzi mpya? Andika makala hapa...',
                  'Have a news report or in-depth analysis? Write an article here...'
                )
              : tr(
                  'Ingia na Google ili uandike makala mpya ya Malosha Forums...',
                  'Sign in with Google to write a new article on Malosha Forums...'
                )}
          </button>
          <button
            type="button"
            onClick={() => handleExpand(true)}
            aria-label={tr('Ambatanisha picha ya makala', 'Attach article cover image')}
            className="inline-flex min-h-[44px] items-center gap-1.5 border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:border-[#B80000] hover:text-[#B80000] whitespace-nowrap shrink-0"
          >
            <ImagePlus className="h-4 w-4 text-[#B80000]" aria-hidden="true" />
            <span className="hidden sm:inline">
              {tr('Ambatanisha Picha', 'Attach Image')}
            </span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <section
      aria-label={tr('Andika makala mpya', 'Write new article')}
      className="overflow-hidden border border-slate-300 bg-white"
    >
      {/* Editorial Crimson Top Bar */}
      <div className="flex items-center justify-between border-b-2 border-[#B80000] bg-[#141414] px-4 py-3 text-white sm:px-5">
        <div className="flex items-center gap-2.5">
          <Avatar name={userDisplayName} photoURL={userPhoto} size="sm" />
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-bold">{userDisplayName}</p>
              <AuthorVerificationBadge uid={userUid} size="xs" />
            </div>
            <p className="inline-flex items-center gap-1 text-[11px] text-slate-300">
              <Newspaper className="h-3 w-3 text-[#FF4D4D]" aria-hidden="true" />
              <span>
                {tr(
                  'Chumba cha Habari · Andika Makala Mpya',
                  'Newsroom · Write New Article'
                )}
              </span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleResetAndCollapse}
          aria-label={tr('Funga sehemu ya kuandika makala', 'Close article editor')}
          className="inline-flex h-9 w-9 items-center justify-center text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Inline Editorial Form */}
      <form onSubmit={handleSubmit} className="space-y-4 p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label htmlFor="inline-makala-title" className="block text-xs font-bold text-slate-800">
              {tr('Kichwa cha Habari / Makala', 'Headline / Article Title')}
            </label>
            <input
              id="inline-makala-title"
              ref={titleInputRef}
              type="text"
              maxLength={140}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={tr(
                'Mfano: Jinsi teknolojia ya AI inavyobadilisha kilimo Afrika Mashariki',
                'Example: How technology is transforming agriculture across East Africa'
              )}
              className="mt-1.5 w-full border border-slate-300 bg-[#F9FAFB] px-3.5 py-2.5 font-display text-base font-bold text-slate-900 placeholder:font-sans placeholder:text-sm placeholder:font-normal placeholder:text-slate-400 focus:border-[#B80000] focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="inline-makala-section"
              className="block text-xs font-bold text-slate-800"
            >
              {tr('Kitengo cha Habari', 'News Section')}
            </label>
            <select
              id="inline-makala-section"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              className="mt-1.5 min-h-[46px] w-full border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 focus:border-[#B80000] focus:outline-none"
            >
              {MAKALA_SECTIONS.map((sec) => (
                <option key={sec} value={sec}>
                  {getMakalaSectionLabel(sec)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Picha ya Makala (Cloudinary + Optional Library Presets) */}
        <div className="border border-slate-200 bg-[#F6F6F6] p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-800">
              {tr('Picha Kuu ya Makala (16:9 · Cloudinary)', 'Article Cover Photo (16:9 · Cloudinary)')}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={uploadingImage || submitting}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex min-h-[38px] items-center gap-1.5 border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 transition-colors hover:border-[#B80000] hover:text-[#B80000] disabled:opacity-60"
              >
                <ImagePlus className="h-4 w-4 text-[#B80000]" aria-hidden="true" />
                <span>
                  {coverImage
                    ? tr('Pakia Picha Nyingine', 'Upload Another Photo')
                    : tr('Pakia Picha Kutoka Kifaa', 'Upload From Device')}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setShowPresets((p) => !p)}
                className="inline-flex min-h-[38px] items-center border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {showPresets
                  ? tr('Ficha Picha za Maktaba', 'Hide Library Photos')
                  : tr('Chagua Picha ya Maktaba', 'Choose Library Photo')}
              </button>
            </div>
          </div>

          {uploadingImage && (
            <div className="mt-3 flex items-center gap-2 border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-800">
              <Loader2 className="h-4 w-4 animate-spin text-[#B80000]" aria-hidden="true" />
              <span>
                {tr('Inapakia picha ya makala kwenda Cloudinary...', 'Uploading cover photo to Cloudinary...')}
              </span>
            </div>
          )}

          {coverImage && !uploadingImage && (
            <div className="relative mt-3 overflow-hidden border border-slate-300 bg-slate-200">
              {!previewFailed ? (
                <img
                  src={coverImage}
                  alt={tr('Hakiki ya picha ya makala', 'Article cover preview')}
                  referrerPolicy="no-referrer"
                  onError={() => setPreviewFailed(true)}
                  className="aspect-[16/9] max-h-80 w-full object-cover"
                />
              ) : (
                <div className="flex h-36 items-center justify-center bg-white text-xs text-slate-600">
                  {tr('Picha imeambatanishwa', 'Image attached')} ({coverImage})
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setCoverImage('');
                  setPreviewFailed(false);
                }}
                aria-label={tr('Ondoa picha ya makala', 'Remove cover photo')}
                className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 bg-black/80 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-black"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{tr('Ondoa Picha', 'Remove Photo')}</span>
              </button>
            </div>
          )}

          {showPresets && !uploadingImage && (
            <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {MAKALA_COVERS.map((c) => {
                const selected = coverImage === c.path;
                const labelText = getMakalaCoverLabel(c.label);
                return (
                  <button
                    key={c.path}
                    type="button"
                    onClick={() => {
                      setCoverImage(c.path);
                      setPreviewFailed(false);
                    }}
                    className={`overflow-hidden border text-left transition-colors ${
                      selected
                        ? 'border-[#B80000] ring-2 ring-[#B80000]/25'
                        : 'border-slate-300 bg-white hover:border-slate-500'
                    }`}
                  >
                    <img
                      src={c.path}
                      alt={labelText}
                      referrerPolicy="no-referrer"
                      className="aspect-[16/9] w-full object-cover"
                    />
                    <span className="block truncate bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-800">
                      {labelText}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="inline-makala-body" className="block text-xs font-bold text-slate-800">
              {tr('Matini Kamili ya Makala / Habari', 'Full Article / Report Body')}
            </label>
            <span className="text-[11px] text-slate-500">
              {tr(
                '**nzito** · *italiki* · > nukuu · viungo (https://...)',
                '**bold** · *italic* · > quote · links (https://...)'
              )}
            </span>
          </div>
          <textarea
            id="inline-makala-body"
            rows={7}
            maxLength={8000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={tr(
              'Anza na aya ya muhtasari (lead), kisha uendelee na maelezo yenye takwimu, nukuu, na vyanzo...',
              'Start with a strong lead paragraph, followed by facts, quotes, and analysis...'
            )}
            className="mt-1.5 w-full resize-y border border-slate-300 bg-[#F9FAFB] p-3.5 text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-[#B80000] focus:bg-white focus:outline-none"
          />
          <div className="mt-1 flex justify-end font-mono text-[11px] text-slate-500 tabular-nums">
            {body.length}/8000
          </div>
        </div>

        <input
          type="text"
          value={extraTags}
          onChange={(e) => setExtraTags(e.target.value)}
          placeholder={tr(
            'Lebo za ziada (hiari, mfano: afrika mashariki, uchambuzi)',
            'Extra tags (optional, e.g., east africa, analysis)'
          )}
          aria-label={tr('Lebo za makala', 'Article tags')}
          className="w-full border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#B80000] focus:outline-none"
        />

        {error && (
          <p
            role="alert"
            className="border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800"
          >
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-slate-200 pt-3">
          <span className="text-[11px] text-slate-500">
            {tr(
              'Makala itachapishwa moja kwa moja kwenye sehemu ya Habari & Makala.',
              'Your article will be published directly to News & Articles.'
            )}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetAndCollapse}
              className="min-h-[40px] border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              {tr('Ghairi', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting || uploadingImage}
              className="inline-flex min-h-[40px] items-center gap-1.5 bg-[#B80000] px-5 py-2 text-xs font-bold text-white transition-colors hover:bg-[#990000] disabled:opacity-60"
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {submitting
                  ? tr('Inachapisha...', 'Publishing...')
                  : tr('Chapisha Makala', 'Publish Article')}
              </span>
            </button>
          </div>
        </div>
      </form>
    </section>
  );
};
