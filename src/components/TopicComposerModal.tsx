import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import {
  FORUM_BOARDS,
  JOB_TYPES,
  MAKALA_COVERS,
  MAKALA_SECTIONS,
  Topic,
  TopicCategory,
  getMakalaSection,
  normalizeBoardCategory,
  resolveMakalaCover,
} from '../types';
import { uploadImageToCloudinary } from '../services/cloudinaryService';
import { parseTagsInput } from '../utils/formatters';
import { useLanguage } from '../context/LanguageContext';
import { ImageResizeModal } from './ImageResizeModal';

interface TopicComposerModalProps {
  isOpen: boolean;
  editingTopic: Topic | null;
  defaultCategory?: TopicCategory | 'all';
  onClose: () => void;
  onSubmit: (data: {
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
  }) => Promise<void>;
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
  // Kijiweni & Fursa Cloudinary attachment
  const [kijiweniImage, setKijiweniImage] = useState<string>('');
  const [pendingResize, setPendingResize] = useState<{
    file: File;
    target: 'kijiweni' | 'makala';
  } | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const kijiweniFileRef = useRef<HTMLInputElement>(null);
  const makalaFileRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

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
      setKijiweniImage(
        norm === 'Kijiweni' || norm === 'Fursa' ? editingTopic.coverImage || '' : ''
      );
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
    }
    setError('');
  }, [editingTopic, defaultCategory, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isFursa = category === 'Fursa';
  const isMakala = category === 'Makala';
  const isKijiweni = category === 'Kijiweni';

  const handleKijiweniFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setPendingResize({ file, target: 'kijiweni' });
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
    const isImageOnlyKijiweni = isKijiweni && kijiweniImage.trim().length >= 10;

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
      if (cleanBody.length < 10 || cleanBody.length > 8000) {
        setError(
          tr(
            'Maelezo lazima yawe na herufi kati ya 10 na 8000.',
            'Content must be between 10 and 8000 characters.'
          )
        );
        return;
      }
    } else if (cleanTitle.length > 140 || cleanBody.length > 8000) {
      setError(
        tr(
          'Kichwa kisizidi herufi 140 na maelezo yasizidi herufi 8000.',
          'Title max 140 chars and body max 8000 chars.'
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
        ...(isKijiweni || isFursa ? { coverImage: kijiweniImage } : {}),
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

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
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

          {/* Kijiweni & Fursa Cloudinary Image Attachment */}
          {(isKijiweni || isFursa) && (
            <div>
              <span className="block text-xs font-semibold text-slate-700">
                {isFursa
                  ? tr('Picha ya Tangazo la Fursa (Hiari · Cloudinary)', 'Opportunity Image (Optional · Cloudinary)')
                  : tr('Picha ya Chapisho (Hiari · Cloudinary)', 'Post Image (Optional · Cloudinary)')}
              </span>
              <input
                ref={kijiweniFileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleKijiweniFileChange}
                className="hidden"
              />
              {uploadingImage && (
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-[#163A5F]">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>
                    {tr('Inapakia picha kwenda Cloudinary...', 'Uploading image to Cloudinary...')}
                  </span>
                </div>
              )}
              {kijiweniImage && !uploadingImage && (
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
                  {kijiweniImage
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
            <div className="flex items-center justify-between">
              <label htmlFor="topic-body" className="block text-xs font-semibold text-slate-700">
                {isFursa
                  ? tr('Majukumu, Sifa & Maelezo ya Kazi', 'Responsibilities, Qualifications & Details')
                  : isMakala
                    ? tr('Matini Kamili ya Makala', 'Full Article Body')
                    : tr('Ujumbe Wako', 'Your Message')}
              </label>
              <span className="text-[11px] text-slate-500">
                {tr('**nzito** · *italiki* · > nukuu', '**bold** · *italic* · > quote')}
              </span>
            </div>
            <textarea
              id="topic-body"
              required={!(isKijiweni && kijiweniImage.trim().length >= 10)}
              rows={7}
              minLength={isKijiweni && kijiweniImage.trim().length >= 10 ? 0 : 10}
              maxLength={8000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={
                isFursa
                  ? tr(
                      'Eleza majukumu ya kazi, sifa za mwombaji kijana, na faida zake...',
                      'Describe role responsibilities, requirements, and benefits...'
                    )
                  : isMakala
                    ? tr(
                        'Andika uchambuzi wenye aya zinazoeleweka, ushahidi, na nukuu...',
                        'Write a clear analysis with well-structured paragraphs, facts, and quotes...'
                      )
                    : tr('Shiriki mawazo yako na jamii...', 'Share your thoughts with the community...')
              }
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white p-3.5 text-sm leading-relaxed text-slate-900 focus:border-[#1D4E89] focus:outline-none"
            />
            <div className="mt-1 flex justify-end font-mono text-[11px] text-slate-500 tabular-nums">
              {body.length}/8000
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
    </div>
  );
};
