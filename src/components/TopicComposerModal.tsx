import React, { useEffect, useRef, useState } from 'react';
import {
  Eye,
  ImagePlus,
  Loader2,
  X,
} from 'lucide-react';
import {
  FORUM_BOARDS,
  JOB_TYPES,
  KijiweniFontStyle,
  MAKALA_COVERS,
  MAKALA_SECTIONS,
  Topic,
  TopicCategory,
  getKijiweniFontMeta,
  getMakalaSection,
  normalizeBoardCategory,
  normalizeKijiweniFontStyle,
  resolveMakalaCover,
} from '../types';
import { prepareSharedImageFile, uploadImageToCloudinary } from '../services/cloudinaryService';
import { autoFormatScholarlyText } from '../utils/editorialFormatter';
import { parseTagsInput } from '../utils/formatters';
import {
  MakalaFormatAction,
  applyMakalaFormatAction,
  captureTextareaScrollSnapshot,
  restoreTextareaSelectionAndScroll,
} from '../utils/makalaSelectionFormatter';
import { useLanguage } from '../context/LanguageContext';
import { ImageResizeModal } from './ImageResizeModal';
import {
  InlineMediaInsertModal,
  InsertedInlineMedia,
  computeTextAfterInlineMediaInsert,
} from './InlineMediaInsertModal';
import { KijiweniDescriptionTools } from './KijiweniDescriptionTools';
import { MakalaArticleRenderer } from './MakalaArticleRenderer';
import { MakalaFormatToolbar } from './MakalaFormatToolbar';
import { RichText } from './RichText';
import { StudioMakalaPickerBar } from './StudioMakalaPickerBar';

interface TopicComposerModalProps {
  isOpen: boolean;
  editingTopic: Topic | null;
  defaultCategory?: TopicCategory | 'all';
  onClose: () => void;
  onSubmit: (
    data: {
      title: string;
      body: string;
      category: TopicCategory;
      tags: string[];
      company?: string;
      location?: string;
      jobType?: string;
      deadline?: string;
      applyInfo?: string;
      coverImage?: string;
      images?: string[];
      bodyFontStyle?: KijiweniFontStyle;
    },
    options?: { silent?: boolean; stayOnFeed?: boolean }
  ) => Promise<void>;
}

export const TopicComposerModal: React.FC<TopicComposerModalProps> = ({
  isOpen,
  editingTopic,
  defaultCategory,
  onClose,
  onSubmit,
}) => {
  const { tr, getBoardLabel, getJobTypeLabel, getMakalaCoverLabel, getMakalaSectionLabel } = useLanguage();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<TopicCategory>('Kijiweni');
  const [makalaSection, setMakalaSection] = useState<string>(MAKALA_SECTIONS[0]);
  const [body, setBody] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');

  // Fursa (Youth Jobs) fields
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [jobType, setJobType] = useState<string>(JOB_TYPES[0]);
  const [deadline, setDeadline] = useState('');
  const [applyInfo, setApplyInfo] = useState('');

  // Makala (BBC-style article) cover selector / Cloudinary upload
  const [coverImage, setCoverImage] = useState<string>(MAKALA_COVERS[0].path);
  // Kijiweni & Fursa Cloudinary attachment(s)
  const [kijiweniImage, setKijiweniImage] = useState<string>('');
  const [kijiweniImages, setKijiweniImages] = useState<string[]>([]);
  const [publishAsAlbum, setPublishAsAlbum] = useState(true);
  const [pendingResize, setPendingResize] = useState<{
    file: File;
    target: 'kijiweni' | 'makala';
  } | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const kijiweniFileRef = useRef<HTMLInputElement>(null);
  const makalaFileRef = useRef<HTMLInputElement>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [makalaPreview, setMakalaPreview] = useState(false);
  const [bodyFontStyle, setBodyFontStyle] = useState<KijiweniFontStyle>('sans');
  const [kijiweniPreview, setKijiweniPreview] = useState(false);
  const [inlineMediaPicker, setInlineMediaPicker] = useState<{
    atIndex: number;
    replaceAt: boolean;
  } | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedWordCount, setSelectedWordCount] = useState(0);

  useEffect(() => {
    if (editingTopic) {
      const norm = normalizeBoardCategory(editingTopic.category);
      setTitle(editingTopic.title);
      setCategory(norm);
      setMakalaSection(
        norm === 'Makala'
          ? getMakalaSection(editingTopic.tags, editingTopic.title)
          : MAKALA_SECTIONS[0]
      );
      setBody(editingTopic.body);
      setTagsRaw(editingTopic.tags.join(', '));
      setCompany(editingTopic.company || '');
      setLocation(editingTopic.location || '');
      setJobType(editingTopic.jobType || JOB_TYPES[0]);
      setDeadline(editingTopic.deadline || '');
      setApplyInfo(editingTopic.applyInfo || '');
      setCoverImage(resolveMakalaCover(editingTopic.coverImage) || MAKALA_COVERS[0].path);
      const existingList =
        norm === 'Kijiweni' && Array.isArray(editingTopic.images) && editingTopic.images.length > 0
          ? editingTopic.images
          : norm === 'Kijiweni' && editingTopic.coverImage
            ? [editingTopic.coverImage]
            : [];
      setKijiweniImages(existingList);
      setKijiweniImage(
        norm === 'Kijiweni' || norm === 'Fursa' ? existingList[0] || editingTopic.coverImage || '' : ''
      );
      setBodyFontStyle(normalizeKijiweniFontStyle(editingTopic.bodyFontStyle));
      setPublishAsAlbum(true);
    } else {
      const initialCat =
        defaultCategory && defaultCategory !== 'all'
          ? normalizeBoardCategory(defaultCategory)
          : 'Kijiweni';
      setTitle('');
      setCategory(initialCat);
      setMakalaSection(MAKALA_SECTIONS[0]);
      setBody('');
      setTagsRaw('');
      setCompany('');
      setLocation('');
      setJobType(JOB_TYPES[0]);
      setDeadline('');
      setApplyInfo('');
      setCoverImage(MAKALA_COVERS[0].path);
      setKijiweniImage('');
      setKijiweniImages([]);
      setBodyFontStyle('sans');
      setPublishAsAlbum(true);
    }
    setMakalaPreview(false);
    setKijiweniPreview(false);
    setInlineMediaPicker(null);
    setSelectedWordCount(0);
    setError('');
  }, [editingTopic, defaultCategory, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (inlineMediaPicker !== null) {
          setInlineMediaPicker(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose, inlineMediaPicker]);

  if (!isOpen) return null;

  const isFursa = category === 'Fursa';
  const isMakala = category === 'Makala';
  const isKijiweni = category === 'Kijiweni';
  const maxBodyLength = isMakala ? 16000 : 8000;
  const activeKijiweniFont = getKijiweniFontMeta(bodyFontStyle);

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

  const handleApplyMakalaFormat = (action: MakalaFormatAction, sample: string) => {
    const el = bodyTextareaRef.current;
    const { nextBody, nextSelStart, nextSelEnd, snapshot } = applyMakalaFormatAction(
      body,
      el,
      action,
      sample
    );
    setBody(nextBody);
    setMakalaPreview(false);
    setKijiweniPreview(false);
    restoreTextareaSelectionAndScroll(el, nextSelStart, nextSelEnd, snapshot);
    window.setTimeout(() => {
      const words = nextBody.slice(nextSelStart, nextSelEnd).trim().split(/\s+/).filter(Boolean).length;
      setSelectedWordCount(nextSelEnd > nextSelStart ? words : 0);
    }, 0);
  };

  const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextVal = e.target.value;
    const cursor = e.target.selectionStart ?? nextVal.length;
    const wasAtTyped =
      isMakala &&
      nextVal.length > body.length &&
      nextVal.length - body.length <= 2 &&
      cursor > 0 &&
      nextVal[cursor - 1] === '@';

    setBody(nextVal);
    setSelectedWordCount(0);
    if (wasAtTyped) {
      setInlineMediaPicker({ atIndex: cursor - 1, replaceAt: true });
    }
  };

  const handleInsertInlineMedia = (media: InsertedInlineMedia) => {
    const el = bodyTextareaRef.current;
    const snapshot = captureTextareaScrollSnapshot(el);
    const picker = inlineMediaPicker ?? {
      atIndex: el?.selectionStart ?? body.length,
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
    setMakalaPreview(false);
    restoreTextareaSelectionAndScroll(el, nextCursor, nextCursor, snapshot);
  };

  const handleAutoFormatBody = () => {
    if (!body.trim()) return;
    const el = bodyTextareaRef.current;
    const snapshot = captureTextareaScrollSnapshot(el);
    const prevCursor = el?.selectionStart ?? 0;
    const nextFormatted = autoFormatScholarlyText(body);
    setBody(nextFormatted);
    const clampedPos = Math.min(prevCursor, nextFormatted.length);
    restoreTextareaSelectionAndScroll(el, clampedPos, clampedPos, snapshot);
  };

  const handleKijiweniFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setError('');

    if (!isKijiweni || (files.length === 1 && kijiweniImages.length === 0)) {
      setPendingResize({ file: files[0], target: 'kijiweni' });
      return;
    }

    setUploadingImage(true);
    try {
      const uploadedUrls: string[] = [];
      for (const rawFile of files.slice(0, 60)) {
        const prepared = await prepareSharedImageFile(rawFile);
        const url = await uploadImageToCloudinary(prepared);
        uploadedUrls.push(url);
      }
      if (uploadedUrls.length > 0) {
        setKijiweniImages((prev) => {
          const next = [...prev, ...uploadedUrls];
          setKijiweniImage(next[0] || '');
          return next;
        });
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kupakia baadhi ya picha.', 'Failed uploading some photos.')
      );
    } finally {
      setUploadingImage(false);
    }
  };

  const handleMakalaFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setPendingResize({ file, target: 'makala' });
  };

  const handleConfirmResizedImage = async (resizedFile: File) => {
    const target = pendingResize?.target || 'kijiweni';
    setPendingResize(null);
    setError('');
    setUploadingImage(true);
    try {
      const url = await uploadImageToCloudinary(resizedFile);
      if (target === 'makala') {
        setCoverImage(url);
      } else if (isKijiweni) {
        setKijiweniImages((prev) => {
          const next = [...prev, url];
          setKijiweniImage(next[0] || '');
          return next;
        });
      } else {
        setKijiweniImage(url);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kupakia picha.', 'Failed to upload image.')
      );
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    const effectiveKijiweniImages =
      kijiweniImages.length > 0
        ? kijiweniImages
        : kijiweniImage.trim().length >= 10
          ? [kijiweniImage.trim()]
          : [];
    const isImageOnlyKijiweni = isKijiweni && effectiveKijiweniImages.length > 0;

    if (!isImageOnlyKijiweni) {
      if (cleanTitle.length < 5 || cleanTitle.length > 140) {
        setError(
          tr(
            'Kichwa cha mada lazima kiwe na herufi kati ya 5 na 140.',
            'Title must be between 5 and 140 characters.'
          )
        );
        return;
      }
      if (cleanBody.length < 10 || cleanBody.length > maxBodyLength) {
        setError(
          tr(
            `Maelezo lazima yawe na herufi kati ya 10 na ${maxBodyLength}.`,
            `Content must be between 10 and ${maxBodyLength} characters.`
          )
        );
        return;
      }
    } else if (cleanTitle.length > 140 || cleanBody.length > maxBodyLength) {
      setError(
        tr(
          `Kichwa kisizidi herufi 140 na maelezo yasizidi herufi ${maxBodyLength}.`,
          `Title max 140 chars and body max ${maxBodyLength} chars.`
        )
      );
      return;
    }

    setSaving(true);
    try {
      const parsedTags = parseTagsInput(tagsRaw);
      const sectionTag = makalaSection.toLowerCase();
      const canonicalLowerSections = new Set(MAKALA_SECTIONS.map((s) => s.toLowerCase()));
      const finalTags = isMakala
        ? [
            sectionTag,
            ...parsedTags.filter((t) => !canonicalLowerSections.has(t.toLowerCase())),
          ].slice(0, 5)
        : parsedTags;

      if (isKijiweni && !editingTopic && effectiveKijiweniImages.length > 1 && !publishAsAlbum) {
        const total = effectiveKijiweniImages.length;
        for (let idx = total - 1; idx >= 0; idx--) {
          const suffix = cleanTitle ? ` (${idx + 1}/${total})` : '';
          const perTitle = cleanTitle ? `${cleanTitle.slice(0, 140 - suffix.length)}${suffix}` : '';
          await onSubmit(
            {
              title: perTitle,
              body: cleanBody,
              category: 'Kijiweni',
              tags: finalTags,
              coverImage: effectiveKijiweniImages[idx],
              images: [effectiveKijiweniImages[idx]],
              bodyFontStyle,
            },
            { silent: idx > 0, stayOnFeed: idx === 0 }
          );
          if (idx > 0) {
            await new Promise((resolve) => setTimeout(resolve, 25));
          }
        }
        onClose();
        return;
      }

      await onSubmit({
        title: cleanTitle,
        body: cleanBody,
        category,
        tags: finalTags,
        ...(isFursa
          ? {
              company: company.trim(),
              location: location.trim(),
              jobType,
              deadline: deadline.trim(),
              applyInfo: applyInfo.trim(),
            }
          : {}),
        ...(isMakala ? { coverImage } : {}),
        ...(isFursa ? { coverImage: kijiweniImage } : {}),
        ...(isKijiweni
          ? {
              coverImage: effectiveKijiweniImages[0] || '',
              images: effectiveKijiweniImages,
              bodyFontStyle,
            }
          : {}),
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : tr('Imeshindwa kuhifadhi chapisho.', 'Failed to save post.')
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-[1px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="composer-modal-title"
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:max-h-[90vh] sm:rounded-lg">
        <div className="flex items-center justify-between bg-[#163A5F] px-6 py-4 text-white">
          <h2 id="composer-modal-title" className="font-display text-lg font-semibold">
            {editingTopic
              ? tr('Hariri Chapisho', 'Edit Post')
              : isFursa
                ? tr('Tangaza Fursa / Ajira ya Vijana', 'Post Youth Opportunity / Job')
                : isMakala
                  ? tr('Andika Makala Mpya', 'Write New Article')
                  : tr('Chapisha Kijiweni', 'Post to Kijiweni')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={tr('Funga', 'Close')}
            className="rounded-md p-1 text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form noValidate onSubmit={handleSubmit} className="space-y-4 p-6">
          {isMakala && (
            <StudioMakalaPickerBar
              hasExistingBody={body.trim().length > 0}
              onApplyFullItem={({ title: sTitle, bodyDraft, tags, coverUrl, mode }) => {
                if (sTitle.trim() && (mode === 'replace' || !title.trim())) {
                  setTitle(sTitle.trim().slice(0, 140));
                }
                if (coverUrl) {
                  setCoverImage(coverUrl);
                }
                if (bodyDraft.trim()) {
                  if (mode === 'append' && body.trim()) {
                    setBody((prev) => `${prev.trim()}\n\n${bodyDraft.trim()}`.slice(0, maxBodyLength));
                  } else {
                    setBody(bodyDraft.trim().slice(0, maxBodyLength));
                  }
                  setMakalaPreview(false);
                }
                if (Array.isArray(tags) && tags.length > 0 && !tagsRaw.trim()) {
                  const lowerSections = new Set(MAKALA_SECTIONS.map((s) => s.toLowerCase()));
                  const cleanedTags = tags.filter((t) => !lowerSections.has(t.toLowerCase()));
                  if (cleanedTags.length > 0) {
                    setTagsRaw(cleanedTags.join(', '));
                  }
                }
              }}
              onApplyCoverOnly={(coverUrl) => {
                setCoverImage(coverUrl);
              }}
              onInsertImageInline={(coverUrl, caption) => {
                const el = bodyTextareaRef.current;
                const snapshot = captureTextareaScrollSnapshot(el);
                const atIndex = el?.selectionStart ?? body.length;
                const { nextText, nextCursor } = computeTextAfterInlineMediaInsert(
                  body,
                  atIndex,
                  false,
                  { type: 'image', url: coverUrl, caption: caption || '' }
                );
                setBody(nextText.slice(0, maxBodyLength));
                setMakalaPreview(false);
                restoreTextareaSelectionAndScroll(el, nextCursor, nextCursor, snapshot);
              }}
              onToast={(msg, kind) => {
                if (kind === 'error') setError(msg);
              }}
            />
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="topic-category"
                className="block text-xs font-semibold text-slate-700"
              >
                {tr('Sehemu ya Jukwaa', 'Forum Section')}
              </label>
              <select
                id="topic-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as TopicCategory)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#1D4E89] focus:outline-none"
              >
                {FORUM_BOARDS.map((board) => (
                  <option key={board.id} value={board.id}>
                    {getBoardLabel(board.id)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="topic-tags" className="block text-xs font-semibold text-slate-700">
                {tr('Lebo (tenganisha kwa mkato, hadi 5)', 'Tags (comma-separated, up to 5)')}
              </label>
              <input
                id="topic-tags"
                type="text"
                value={tagsRaw}
                onChange={(e) => setTagsRaw(e.target.value)}
                placeholder={
                  isFursa
                    ? tr('ajira, vijana, dar', 'jobs, youth, remote')
                    : tr('habari, uchambuzi', 'news, analysis')
                }
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#1D4E89] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="topic-title" className="block text-xs font-semibold text-slate-700">
              {isFursa
                ? tr('Kichwa cha Tangazo / Nafasi ya Kazi', 'Listing Title / Role')
                : isMakala
                  ? tr('Kichwa cha Makala', 'Article Headline')
                  : tr('Kichwa cha Mada / Posti', 'Topic / Post Title')}
            </label>
            <input
              id="topic-title"
              type="text"
              required={!(isKijiweni && kijiweniImage.trim().length >= 10)}
              minLength={isKijiweni && kijiweniImage.trim().length >= 10 ? 0 : 5}
              maxLength={140}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                isFursa
                  ? tr(
                      'Mfano: Afisa Tehama (Vijana) — Dar es Salaam',
                      'Example: Junior IT Officer — Dar es Salaam'
                    )
                  : isMakala
                    ? tr(
                        'Mfano: Jinsi nishati jadidifu inavyobadilisha uchumi wa vijijini',
                        'Example: How renewable energy is transforming rural economies'
                      )
                    : tr(
                        'Andika mada fupi ya kuvutia mjadala...',
                        'Write a clear, engaging topic title...'
                      )
              }
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#1D4E89] focus:outline-none"
            />
            <div className="mt-1 flex justify-end font-mono text-[11px] text-slate-500 tabular-nums">
              {title.length}/140
            </div>
          </div>

          {/* Fursa Structured Fields */}
          {isFursa && (
            <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
              <div>
                <label htmlFor="job-company" className="block text-xs font-semibold text-slate-700">
                  {tr('Kampuni / Shirika', 'Company / Organization')}
                </label>
                <input
                  id="job-company"
                  type="text"
                  maxLength={100}
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder={tr('Mfano: Swahili Tech Ltd', 'Example: Malosha Tech Ltd')}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="job-location" className="block text-xs font-semibold text-slate-700">
                  {tr('Mahali / Mkoa', 'Location / City')}
                </label>
                <input
                  id="job-location"
                  type="text"
                  maxLength={100}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder={tr(
                    'Mfano: Dar es Salaam / Mtandaoni',
                    'Example: Dar es Salaam / Remote'
                  )}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="job-type" className="block text-xs font-semibold text-slate-700">
                  {tr('Aina ya Fursa', 'Opportunity Type')}
                </label>
                <select
                  id="job-type"
                  value={jobType}
                  onChange={(e) => setJobType(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                >
                  {JOB_TYPES.map((jt) => (
                    <option key={jt} value={jt}>
                      {getJobTypeLabel(jt)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="job-deadline" className="block text-xs font-semibold text-slate-700">
                  {tr('Mwisho wa Maombi', 'Application Deadline')}
                </label>
                <input
                  id="job-deadline"
                  type="text"
                  maxLength={60}
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  placeholder={tr('Mfano: 30 Desemba 2026', 'Example: 30 December 2026')}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="job-apply" className="block text-xs font-semibold text-slate-700">
                  {tr(
                    'Namna ya Kuomba (Barua pepe au Maelekezo)',
                    'How to Apply (URL, Email, or Instructions)'
                  )}
                </label>
                <input
                  id="job-apply"
                  type="text"
                  maxLength={300}
                  value={applyInfo}
                  onChange={(e) => setApplyInfo(e.target.value)}
                  placeholder={tr(
                    'Mfano: Tuma CV yako kwa barua pepe ajira@kampuni.co.tz',
                    'Example: https://company.com/apply or send CV to jobs@company.com'
                  )}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Kijiweni & Fursa Cloudinary Image Attachment(s) */}
          {(isKijiweni || isFursa) && (
            <div>
              <span className="block text-xs font-semibold text-slate-700">
                {isFursa
                  ? tr('Picha ya Tangazo la Fursa (Hiari · Cloudinary)', 'Opportunity Image (Optional · Cloudinary)')
                  : tr('Picha za Chapisho (Hiari · Picha 1 au Nyingi)', 'Post Photos (Optional · Single or Multiple)')}
              </span>
              <input
                ref={kijiweniFileRef}
                type="file"
                multiple={isKijiweni && !editingTopic}
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(e) => void handleKijiweniFileChange(e)}
                className="hidden"
              />
              {uploadingImage && (
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-[#163A5F]">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>
                    {tr('Inapakia picha kwenda Cloudinary...', 'Uploading image(s) to Cloudinary...')}
                  </span>
                </div>
              )}

              {isKijiweni && kijiweniImages.length > 0 && !uploadingImage && (
                <div className="mt-2 space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-[#0E2640]">
                      {tr(`Picha ${kijiweniImages.length} zimepakiwa`, `${kijiweniImages.length} photo(s) attached`)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setKijiweniImages([]);
                        setKijiweniImage('');
                      }}
                      className="font-semibold text-red-600 hover:underline"
                    >
                      {tr('Ondoa zote', 'Clear all')}
                    </button>
                  </div>

                  {!editingTopic && (
                    <div
                      role="radiogroup"
                      aria-label={tr('Mtindo wa kuchapisha picha', 'Photo publish mode')}
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
                            : 'border-slate-200 bg-white hover:bg-slate-100'
                        }`}
                      >
                        <span className="text-xs font-bold text-[#0E2640]">
                          {tr('Zote Katika Post 1 (Auto-Slide)', 'All in 1 Post (Auto-Slide)')}
                        </span>
                        <span className="mt-0.5 text-[10.5px] text-slate-600">
                          {tr('Picha zitaenda pamoja na kuslide zenyewe.', 'Combine all photos into 1 auto-sliding post.')}
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
                            : 'border-slate-200 bg-white hover:bg-slate-100'
                        }`}
                      >
                        <span className="text-xs font-bold text-[#0E2640]">
                          {tr(
                            `Kila Picha Iwe Post Yake (${kijiweniImages.length})`,
                            `Each Photo Its Own Post (${kijiweniImages.length})`
                          )}
                        </span>
                        <span className="mt-0.5 text-[10.5px] text-slate-600">
                          {tr('Kila picha itachapishwa kama post yake pekee.', 'Publish each photo as a separate post.')}
                        </span>
                      </button>
                    </div>
                  )}

                  <div
                    className={`grid gap-2 ${
                      kijiweniImages.length === 1 ? 'grid-cols-1' : 'grid-cols-3 sm:grid-cols-4'
                    }`}
                  >
                    {kijiweniImages.map((imgUrl, idx) => (
                      <div
                        key={`${imgUrl}-${idx}`}
                        className="relative overflow-hidden rounded-lg border border-slate-200 bg-white"
                      >
                        <img
                          src={imgUrl}
                          alt={`${tr('Picha', 'Photo')} ${idx + 1}`}
                          referrerPolicy="no-referrer"
                          className={`block w-full bg-slate-100 ${
                            kijiweniImages.length === 1 ? 'max-h-64 object-contain' : 'h-24 object-cover'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setKijiweniImages((prev) => {
                              const next = prev.filter((_, i) => i !== idx);
                              setKijiweniImage(next[0] || '');
                              return next;
                            })
                          }
                          aria-label={tr('Ondoa picha', 'Remove photo')}
                          className="absolute top-1.5 right-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-600/90 text-white hover:bg-red-700"
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isFursa && kijiweniImage && !uploadingImage && (
                <div className="relative mt-2 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                  <img
                    src={kijiweniImage}
                    alt={tr('Picha ya chapisho', 'Post image')}
                    referrerPolicy="no-referrer"
                    className="block h-auto w-full"
                  />
                  <button
                    type="button"
                    onClick={() => setKijiweniImage('')}
                    className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-slate-900/80 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-900"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                    <span>{tr('Ondoa', 'Remove')}</span>
                  </button>
                </div>
              )}

              <button
                type="button"
                disabled={uploadingImage}
                onClick={() => kijiweniFileRef.current?.click()}
                className="mt-2 inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <ImagePlus className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                <span>
                  {isKijiweni
                    ? kijiweniImages.length > 0
                      ? tr(`Ongeza Picha (${kijiweniImages.length})`, `Add More Photos (${kijiweniImages.length})`)
                      : tr('Ambatanisha Picha (1 au Nyingi)', 'Attach Photos (Single or Multiple)')
                    : kijiweniImage
                      ? tr('Badilisha Picha', 'Change Photo')
                      : tr('Ambatanisha Picha', 'Attach Photo')}
                </span>
              </button>
            </div>
          )}

          {/* Makala Editorial Section Selector + Cover Image Upload & Presets */}
          {isMakala && (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="makala-modal-section"
                  className="block text-xs font-semibold text-slate-700"
                >
                  {tr('Kitengo cha Habari / Makala', 'News / Article Section')}
                </label>
                <select
                  id="makala-modal-section"
                  value={makalaSection}
                  onChange={(e) => setMakalaSection(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#B80000] focus:outline-none sm:max-w-xs"
                >
                  {MAKALA_SECTIONS.map((sec) => (
                    <option key={sec} value={sec}>
                      {getMakalaSectionLabel(sec)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="block text-xs font-semibold text-slate-700">
                  {tr(
                    'Picha ya Jalada la Makala (Cloudinary au Maktaba)',
                    'Article Cover Photo (Cloudinary or Library)'
                  )}
                </span>
                <button
                  type="button"
                  disabled={uploadingImage}
                  onClick={() => makalaFileRef.current?.click()}
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  <ImagePlus className="h-3.5 w-3.5 text-[#B80000]" aria-hidden="true" />
                  <span>{tr('Pakia Picha Yako', 'Upload Your Photo')}</span>
                </button>
              </div>
              <input
                ref={makalaFileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleMakalaFileChange}
                className="hidden"
              />
              {uploadingImage && (
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  <Loader2 className="h-4 w-4 animate-spin text-[#B80000]" aria-hidden="true" />
                  <span>
                    {tr(
                      'Inapakia picha ya makala kwenda Cloudinary...',
                      'Uploading cover image to Cloudinary...'
                    )}
                  </span>
                </div>
              )}
              {coverImage && !uploadingImage && (
                <div className="relative mt-2 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                  <img
                    src={coverImage}
                    alt={tr('Hakiki ya picha ya makala', 'Cover image preview')}
                    referrerPolicy="no-referrer"
                    className="block h-auto w-full"
                  />
                  <button
                    type="button"
                    onClick={() => setCoverImage('')}
                    className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-slate-900/80 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-900"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                    <span>{tr('Ondoa', 'Remove')}</span>
                  </button>
                </div>
              )}
              <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {MAKALA_COVERS.map((c) => {
                  const selected = coverImage === c.path;
                  const labelText = getMakalaCoverLabel(c.label);
                  return (
                    <button
                      key={c.path}
                      type="button"
                      onClick={() => setCoverImage(c.path)}
                      className={`overflow-hidden rounded-lg border text-left transition-all ${
                        selected
                          ? 'border-[#B80000] ring-2 ring-[#B80000]/25'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <img
                        src={c.path}
                        alt={labelText}
                        referrerPolicy="no-referrer"
                        className="aspect-[4/3] w-full object-cover"
                      />
                      <span className="block truncate px-2 py-1 text-[11px] font-medium text-slate-700">
                        {labelText}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="topic-body" className="block text-xs font-semibold text-slate-700">
                {isFursa
                  ? tr('Majukumu, Sifa & Maelezo ya Kazi', 'Responsibilities, Qualifications & Details')
                  : isMakala
                    ? tr('Matini Kamili ya Makala', 'Full Article Body')
                    : tr('Ujumbe Wako', 'Your Message')}
              </label>
              {isMakala ? (
                <div className="inline-flex rounded border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setMakalaPreview(false)}
                    className={`rounded px-2 py-0.5 ${
                      !makalaPreview ? 'bg-[#141414] text-white' : 'text-slate-600'
                    }`}
                  >
                    {tr('Hariri', 'Edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMakalaPreview(true)}
                    className={`inline-flex items-center gap-1 rounded px-2 py-0.5 ${
                      makalaPreview ? 'bg-[#B80000] text-white' : 'text-slate-600'
                    }`}
                  >
                    <Eye className="h-3 w-3" aria-hidden="true" />
                    <span>{tr('Hakiki (BBC)', 'Preview')}</span>
                  </button>
                </div>
              ) : isKijiweni ? (
                <span className="text-[11px] text-slate-500">
                  {tr('Chagua mwandiko na mpangilio hapa chini', 'Choose font & scholarly style below')}
                </span>
              ) : (
                <span className="text-[11px] text-slate-500">
                  {tr('**nzito** · *italiki* · > nukuu', '**bold** · *italic* · > quote')}
                </span>
              )}
            </div>

            {isMakala && (
              <MakalaFormatToolbar
                selectedWordCount={selectedWordCount}
                onApplyFormat={handleApplyMakalaFormat}
                onOpenInlineMedia={() =>
                  setInlineMediaPicker({
                    atIndex: bodyTextareaRef.current?.selectionStart ?? body.length,
                    replaceAt: false,
                  })
                }
                onAutoFormat={handleAutoFormatBody}
              />
            )}

            {isKijiweni && (
              <div className="mt-1.5">
                <KijiweniDescriptionTools
                  fontStyle={bodyFontStyle}
                  onChangeFontStyle={setBodyFontStyle}
                  previewMode={kijiweniPreview}
                  onTogglePreview={setKijiweniPreview}
                  selectedWordCount={selectedWordCount}
                  onApplyFormat={handleApplyMakalaFormat}
                  onAutoFormat={handleAutoFormatBody}
                />
              </div>
            )}

            {isMakala && makalaPreview ? (
              <div className="min-h-[190px] rounded-b-lg border border-slate-300 bg-white p-4">
                <MakalaArticleRenderer body={body} previewMode />
              </div>
            ) : isKijiweni && kijiweniPreview ? (
              <div className="min-h-[190px] rounded-b-lg border border-slate-200 bg-white p-4">
                {title.trim() && (
                  <h3 className="mb-2 border-b border-slate-100 pb-2 font-display text-lg font-bold leading-snug text-[#0E2640] [text-wrap:balance]">
                    {title.trim()}
                  </h3>
                )}
                <RichText content={body} fontStyle={bodyFontStyle} scholarly />
              </div>
            ) : (
              <textarea
                id="topic-body"
                ref={bodyTextareaRef}
                rows={7}
                maxLength={maxBodyLength}
                value={body}
                onChange={handleBodyChange}
                onSelect={isMakala || isKijiweni ? syncSelectionCount : undefined}
                onKeyUp={isMakala || isKijiweni ? syncSelectionCount : undefined}
                onMouseUp={isMakala || isKijiweni ? syncSelectionCount : undefined}
                style={isKijiweni ? { fontFamily: activeKijiweniFont.fontFamilyCss } : undefined}
                placeholder={
                  isFursa
                    ? tr(
                        'Eleza majukumu ya kazi, sifa za mwombaji kijana, na faida zake...',
                        'Describe role responsibilities, requirements, and benefits...'
                      )
                    : isMakala
                      ? tr(
                          'Andika uchambuzi, chagua maneno kuyabadilisha nukuu/orodha/rangi, au andika @ kuweka picha/video...',
                          'Write your analysis, select text to format quotes/bullets/colors, or type @ to insert media...'
                        )
                      : tr(
                          'Shiriki mawazo yako, chagua mwandiko unaovutia hapo juu, au tumia Panga Kisomi...',
                          'Share your thoughts, choose an expressive font above, or use Auto-Format...'
                        )
                }
                className={`w-full border border-slate-300 bg-white p-3.5 leading-relaxed text-slate-900 focus:border-[#1D4E89] focus:outline-none ${
                  isKijiweni
                    ? `rounded-b-lg border-slate-200 ${activeKijiweniFont.bodySizeClass}`
                    : isMakala
                      ? 'rounded-b-lg text-sm'
                      : 'mt-1.5 rounded-lg text-sm'
                }`}
              />
            )}
            <div className="mt-1 flex justify-end font-mono text-[11px] text-slate-500 tabular-nums">
              {body.length}/{maxBodyLength}
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-medium text-red-800">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              {tr('Ghairi', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#1D4E89] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#163A5F] disabled:opacity-60"
            >
              {saving
                ? tr('Inahifadhi...', 'Saving...')
                : editingTopic
                  ? tr('Hifadhi Mabadiliko', 'Save Changes')
                  : tr('Chapisha Sasa', 'Publish Now')}
            </button>
          </div>
        </form>
      </div>

      <ImageResizeModal
        file={pendingResize?.file || null}
        onCancel={() => setPendingResize(null)}
        onConfirm={(resizedFile) => void handleConfirmResizedImage(resizedFile)}
      />

      <InlineMediaInsertModal
        isOpen={inlineMediaPicker !== null}
        onClose={() => setInlineMediaPicker(null)}
        onInsert={handleInsertInlineMedia}
        onToast={(msg, kind) => {
          if (kind === 'error') setError(msg);
        }}
      />
    </div>
  );
};
