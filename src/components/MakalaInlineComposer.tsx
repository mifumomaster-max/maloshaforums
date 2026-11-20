import React, { useEffect, useRef, useState } from 'react';
import {
  AtSign,
  Bold,
  Eye,
  Heading2,
  Heading3,
  ImagePlus,
  List,
  ListOrdered,
  Loader2,
  Newspaper,
  Quote,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { uploadImageToCloudinary } from '../services/cloudinaryService';
import { AuthPromptReason, MAKALA_COVERS, MAKALA_SECTIONS } from '../types';
import { autoFormatScholarlyText } from '../utils/editorialFormatter';
import { parseTagsInput } from '../utils/formatters';
import { useLanguage } from '../context/LanguageContext';
import { Avatar } from './Avatar';
import { ImageResizeModal } from './ImageResizeModal';
import {
  InlineMediaInsertModal,
  InsertedInlineMedia,
  computeTextAfterInlineMediaInsert,
} from './InlineMediaInsertModal';
import { MakalaArticleRenderer } from './MakalaArticleRenderer';
import { AuthorVerificationBadge } from './VerificationBadge';

interface MakalaInlineComposerProps {
  expanded: boolean;
  onExpandedChange: (next: boolean) => void;
  initialSection?: string;
  userUid: string | null;
  userDisplayName: string;
  userPhoto: string;
  isSuspended?: boolean;
  onSignIn: (reason?: AuthPromptReason) => void;
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
  initialSection,
  userUid,
  userDisplayName,
  userPhoto,
  isSuspended = false,
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
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [bodyPreviewMode, setBodyPreviewMode] = useState(false);
  const [inlineMediaPicker, setInlineMediaPicker] = useState<{
    atIndex: number;
    replaceAt: boolean;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const titleInputRef = useRef<HTMLInputElement>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (
      initialSection &&
      MAKALA_SECTIONS.some((s) => s.toLowerCase() === initialSection.toLowerCase())
    ) {
      setSection(initialSection);
    }
  }, [initialSection]);

  useEffect(() => {
    if (expanded && userUid) {
      const timer = window.setTimeout(() => {
        titleInputRef.current?.focus({ preventScroll: true });
      }, 110);
      return () => window.clearTimeout(timer);
    }
  }, [expanded, userUid]);

  const handleResetAndCollapse = () => {
    setTitle('');
    setSection(MAKALA_SECTIONS[0]);
    setBody('');
    setExtraTags('');
    setCoverImage('');
    setPendingImageFile(null);
    setShowPresets(false);
    setPreviewFailed(false);
    setBodyPreviewMode(false);
    setInlineMediaPicker(null);
    setError('');
    onExpandedChange(false);
  };

  const insertBodySyntax = (prefix: string, suffix = '', fallbackSample = '') => {
    const el = bodyTextareaRef.current;
    if (!el) {
      setBody((prev) => `${prev}${prev && !prev.endsWith('\n') ? '\n' : ''}${prefix}${fallbackSample}${suffix}`);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const selected = body.slice(start, end) || fallbackSample;
    const needsLeadingNewline =
      prefix.startsWith('#') || prefix.startsWith('- ') || prefix.startsWith('1. ') || prefix.startsWith('> ')
        ? start > 0 && body[start - 1] !== '\n'
          ? '\n'
          : ''
        : '';
    const insertion = `${needsLeadingNewline}${prefix}${selected}${suffix}`;
    const nextValue = body.slice(0, start) + insertion + body.slice(end);
    setBody(nextValue);
    setBodyPreviewMode(false);
    window.requestAnimationFrame(() => {
      el.focus();
      const cursor = start + insertion.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextVal = e.target.value;
    const cursor = e.target.selectionStart ?? nextVal.length;
    const wasAtTyped =
      nextVal.length > body.length &&
      nextVal.length - body.length <= 2 &&
      cursor > 0 &&
      nextVal[cursor - 1] === '@';

    setBody(nextVal);
    if (wasAtTyped) {
      setInlineMediaPicker({ atIndex: cursor - 1, replaceAt: true });
    }
  };

  const handleInsertInlineMedia = (media: InsertedInlineMedia) => {
    const picker = inlineMediaPicker ?? {
      atIndex: bodyTextareaRef.current?.selectionStart ?? body.length,
      replaceAt: false,
    };
    const { nextText, nextCursor } = computeTextAfterInlineMediaInsert(
      body,
      picker.atIndex,
      picker.replaceAt,
      media
    );
    setBody(nextText);
    setInlineMediaPicker(null);
    setBodyPreviewMode(false);
    window.requestAnimationFrame(() => {
      const el = bodyTextareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleAutoFormatBody = () => {
    if (!body.trim()) return;
    setBody((prev) => autoFormatScholarlyText(prev));
    onToast(
      tr(
        'Makala imepangwa kisomi (vichwa, orodha na aya)!',
        'Article formatted cleanly with headings, bullets, and paragraphs!'
      )
    );
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
      onSignIn('post');
      return;
    }
    if (isSuspended) return;
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
    return null;
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
                  className="block h-auto w-full"
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="inline-makala-body" className="block text-xs font-bold text-slate-800">
              {tr('Matini Kamili ya Makala / Habari', 'Full Article / Report Body')}
            </label>
            <div className="inline-flex border border-slate-300 bg-white p-0.5 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setBodyPreviewMode(false)}
                className={`px-2.5 py-1 transition-colors ${
                  !bodyPreviewMode ? 'bg-[#141414] text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tr('Andika', 'Write')}
              </button>
              <button
                type="button"
                onClick={() => setBodyPreviewMode(true)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 transition-colors ${
                  bodyPreviewMode ? 'bg-[#B80000] text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Eye className="h-3 w-3" aria-hidden="true" />
                <span>{tr('Hakiki (BBC)', 'Preview')}</span>
              </button>
            </div>
          </div>

          {/* Scholarly BBC Formatting Toolbar */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1 border border-b-0 border-slate-300 bg-[#F6F6F6] px-2 py-1.5">
            <button
              type="button"
              onClick={() => insertBodySyntax('## ', '', tr('Kichwa cha Sehemu', 'Section Title'))}
              className="inline-flex min-h-[30px] items-center gap-1 border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-800 hover:border-[#B80000] hover:text-[#B80000]"
            >
              <Heading2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr('Kichwa', 'Heading')}</span>
            </button>
            <button
              type="button"
              onClick={() => insertBodySyntax('### ', '', tr('Kichwa Kidogo', 'Subtitle'))}
              className="inline-flex min-h-[30px] items-center gap-1 border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-800 hover:border-[#B80000] hover:text-[#B80000]"
            >
              <Heading3 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr('Kichwa Kidogo', 'Subtitle')}</span>
            </button>
            <button
              type="button"
              onClick={() => insertBodySyntax('- ', '', tr('Hoja muhimu hapa', 'Bullet point'))}
              className="inline-flex min-h-[30px] items-center gap-1 border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-800 hover:border-[#B80000] hover:text-[#B80000]"
            >
              <List className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr('Orodha', 'Bullets')}</span>
            </button>
            <button
              type="button"
              onClick={() => insertBodySyntax('1. ', '', tr('Hatua ya kwanza', 'First point'))}
              className="inline-flex min-h-[30px] items-center gap-1 border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-800 hover:border-[#B80000] hover:text-[#B80000]"
            >
              <ListOrdered className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr('Namba', 'Numbered')}</span>
            </button>
            <button
              type="button"
              onClick={() => insertBodySyntax('> ', '', tr('Nukuu ya msemaji...', 'Quote text...'))}
              className="inline-flex min-h-[30px] items-center gap-1 border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-800 hover:border-[#B80000] hover:text-[#B80000]"
            >
              <Quote className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr('Nukuu', 'Quote')}</span>
            </button>
            <button
              type="button"
              onClick={() => insertBodySyntax('**', '**', tr('maneno mazito', 'bold text'))}
              className="inline-flex min-h-[30px] items-center gap-1 border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-800 hover:border-[#B80000] hover:text-[#B80000]"
            >
              <Bold className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr('Nzito', 'Bold')}</span>
            </button>
            <button
              type="button"
              onClick={() =>
                setInlineMediaPicker({
                  atIndex: bodyTextareaRef.current?.selectionStart ?? body.length,
                  replaceAt: false,
                })
              }
              title={tr(
                'Weka picha au video mahali hapa (au andika @)',
                'Insert photo or video at cursor (or type @)'
              )}
              className="inline-flex min-h-[30px] items-center gap-1 border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-bold text-[#0E2640] hover:border-[#B80000] hover:bg-amber-100"
            >
              <AtSign className="h-3.5 w-3.5 text-[#B80000]" aria-hidden="true" />
              <span>{tr('Picha / Video', 'Photo / Video')}</span>
            </button>
            <button
              type="button"
              onClick={handleAutoFormatBody}
              className="ml-auto inline-flex min-h-[30px] items-center gap-1 bg-[#0E2640] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#163A5F]"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
              <span>{tr('Panga Kisomi', 'Auto-Format')}</span>
            </button>
          </div>

          {bodyPreviewMode ? (
            <div className="min-h-[190px] border border-slate-300 bg-white p-4 sm:p-6">
              {title.trim() && (
                <h2 className="mb-4 border-b border-slate-200 pb-3 font-display text-2xl font-bold text-slate-950">
                  {title.trim()}
                </h2>
              )}
              <MakalaArticleRenderer body={body} previewMode />
            </div>
          ) : (
            <textarea
              id="inline-makala-body"
              ref={bodyTextareaRef}
              rows={8}
              maxLength={8000}
              value={body}
              onChange={handleBodyChange}
              placeholder={tr(
                'Anza na aya ya muhtasari (lead), andika @ popote kupakia picha au video katikati ya makala, au tumia ## Vichwa, - Orodha, na > Nukuu...',
                'Start with a lead paragraph, type @ anywhere to insert a photo or video inline, or use ## Headings, - Bullets, and > Quotes...'
              )}
              className="w-full resize-y border border-slate-300 bg-[#F9FAFB] p-3.5 text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-[#B80000] focus:bg-white focus:outline-none"
            />
          )}
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

      <ImageResizeModal
        file={pendingImageFile}
        onCancel={() => setPendingImageFile(null)}
        onConfirm={(resizedFile) => void handleConfirmResizedImage(resizedFile)}
      />

      <InlineMediaInsertModal
        isOpen={inlineMediaPicker !== null}
        onClose={() => setInlineMediaPicker(null)}
        onInsert={handleInsertInlineMedia}
        onToast={onToast}
      />
    </section>
  );
};
