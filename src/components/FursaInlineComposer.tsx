import React, { useEffect, useRef, useState } from 'react';
import { Briefcase, ImagePlus, Loader2, Send, X } from 'lucide-react';
import { uploadImageToCloudinary } from '../services/cloudinaryService';
import { AuthPromptReason, JOB_TYPES } from '../types';
import { parseTagsInput } from '../utils/formatters';
import { useLanguage } from '../context/LanguageContext';
import { Avatar } from './Avatar';
import { ImageResizeModal } from './ImageResizeModal';
import { AuthorVerificationBadge } from './VerificationBadge';

interface FursaInlineComposerProps {
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
    company?: string;
    location?: string;
    jobType?: string;
    deadline?: string;
    applyInfo?: string;
    coverImage?: string;
  }) => Promise<void>;
  onToast: (message: string, kind?: 'success' | 'error') => void;
}

export const FursaInlineComposer: React.FC<FursaInlineComposerProps> = ({
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
  const { tr, getJobTypeLabel } = useLanguage();
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [jobType, setJobType] = useState<string>(JOB_TYPES[0]);
  const [deadline, setDeadline] = useState('');
  const [applyInfo, setApplyInfo] = useState('');
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
          'Tengeneza akaunti au ingia (kwa Google au Jisajili kawaida) ili kutangaza fursa.',
          'Create an account or sign in to post an opportunity.'
        ),
        'error'
      );
      onSignIn('post');
      return;
    }
    if (isSuspended) {
      onToast(
        tr(
          'Akaunti yako imefungwa na msimamizi — huwezi kutangaza fursa.',
          'Your account is suspended — posting is disabled.'
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
    setCompany('');
    setLocation('');
    setJobType(JOB_TYPES[0]);
    setDeadline('');
    setApplyInfo('');
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
      onToast(tr('Picha ya tangazo imeambatanishwa.', 'Listing image attached.'));
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
          'Kichwa cha tangazo lazima kiwe na herufi kati ya 5 na 140.',
          'Listing title must be between 5 and 140 characters.'
        )
      );
      return;
    }
    if (cleanBody.length < 10 || cleanBody.length > 8000) {
      setError(
        tr(
          'Maelezo ya fursa lazima yawe na herufi kati ya 10 na 8000.',
          'Opportunity details must be between 10 and 8000 characters.'
        )
      );
      return;
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
        company: company.trim(),
        location: location.trim(),
        jobType,
        deadline: deadline.trim(),
        applyInfo: applyInfo.trim(),
        ...(attachedImage ? { coverImage: attachedImage } : {}),
      });
      handleResetAndCollapse();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kuchapisha tangazo la fursa.', 'Failed to publish opportunity.')
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
            name={userUid ? userDisplayName : 'F'}
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
                  'Akaunti yako imefungwa — huwezi kutangaza fursa.',
                  'Your account is suspended — posting is disabled.'
                )
              : userUid
                ? tr(
                    'Una fursa ya ajira, internship au ruzuku? Tangaza hapa...',
                    'Have a job, internship, or grant opportunity? Post it here...'
                  )
                : tr(
                    'Tengeneza akaunti (Google / Jisajili) ili utangaze fursa mpya...',
                    'Create an account (Google / Register) to post a new opportunity...'
                  )}
          </button>
          <button
            type="button"
            onClick={() => handleExpand(true)}
            aria-label={tr('Ambatanisha picha ya fursa', 'Attach opportunity image')}
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
      aria-label={tr('Jaza tangazo jipya la fursa', 'Create a new opportunity listing')}
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
            <p className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1D4E89]">
              <Briefcase className="h-3 w-3" aria-hidden="true" />
              <span>
                {tr(
                  'Unatangaza Fursa Mpya (Ajira / Internship / Ruzuku)',
                  'Posting New Opportunity (Job / Internship / Grant)'
                )}
              </span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleResetAndCollapse}
          aria-label={tr('Funga fomu ya fursa', 'Close opportunity form')}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Inline Form */}
      <form onSubmit={handleSubmit} className="space-y-3.5 p-4 sm:p-5">
        <div>
          <label htmlFor="inline-fursa-title" className="block text-xs font-semibold text-slate-700">
            {tr('Kichwa cha Tangazo / Nafasi ya Kazi', 'Listing Title / Role')}
          </label>
          <input
            id="inline-fursa-title"
            ref={titleInputRef}
            type="text"
            maxLength={140}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={tr(
              'Mfano: Afisa Tehama (Vijana) — Dar es Salaam',
              'Example: Junior IT Officer — Dar es Salaam'
            )}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-[#F8FAFC] px-3.5 py-2.5 text-sm font-semibold text-slate-900 placeholder:font-normal placeholder:text-slate-400 focus:border-[#1D4E89] focus:bg-white focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-[#F8FAFC] p-3.5 sm:grid-cols-2">
          <div>
            <label htmlFor="inline-fursa-company" className="block text-xs font-semibold text-slate-700">
              {tr('Kampuni / Shirika / Taasisi', 'Company / Organization')}
            </label>
            <input
              id="inline-fursa-company"
              type="text"
              maxLength={100}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder={tr('Mfano: Swahili Digital Hub Ltd', 'Example: Malosha Digital Hub Ltd')}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1D4E89] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="inline-fursa-location" className="block text-xs font-semibold text-slate-700">
              {tr('Mahali / Mkoa', 'Location / City')}
            </label>
            <input
              id="inline-fursa-location"
              type="text"
              maxLength={100}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={tr('Mfano: Dar es Salaam / Mtandaoni', 'Example: Dar es Salaam / Remote')}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1D4E89] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="inline-fursa-type" className="block text-xs font-semibold text-slate-700">
              {tr('Aina ya Fursa', 'Opportunity Type')}
            </label>
            <select
              id="inline-fursa-type"
              value={jobType}
              onChange={(e) => setJobType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#1D4E89] focus:outline-none"
            >
              {JOB_TYPES.map((jt) => (
                <option key={jt} value={jt}>
                  {getJobTypeLabel(jt)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="inline-fursa-deadline" className="block text-xs font-semibold text-slate-700">
              {tr('Mwisho wa Maombi', 'Application Deadline')}
            </label>
            <input
              id="inline-fursa-deadline"
              type="text"
              maxLength={60}
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              placeholder={tr('Mfano: 30 Desemba 2026', 'Example: 30 December 2026')}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1D4E89] focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="inline-fursa-apply" className="block text-xs font-semibold text-slate-700">
              {tr(
                'Kiungo au Namna ya Kuomba (Link / Barua pepe)',
                'Application Link or Instructions (URL / Email)'
              )}
            </label>
            <input
              id="inline-fursa-apply"
              type="text"
              maxLength={300}
              value={applyInfo}
              onChange={(e) => setApplyInfo(e.target.value)}
              placeholder={tr(
                'Mfano: https://kampuni.co.tz/ajira au tuma CV kwa ajira@kampuni.co.tz',
                'Example: https://company.com/jobs or email your CV to jobs@company.com'
              )}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1D4E89] focus:outline-none"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="inline-fursa-body" className="block text-xs font-semibold text-slate-700">
              {tr('Majukumu, Sifa & Maelezo Kamili', 'Responsibilities, Qualifications & Details')}
            </label>
            <span className="text-[11px] text-slate-500">
              {tr(
                'Viungo (https://...) vinagusika moja kwa moja',
                'Links (https://...) become clickable automatically'
              )}
            </span>
          </div>
          <textarea
            id="inline-fursa-body"
            rows={5}
            maxLength={8000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={tr(
              'Eleza majukumu ya kazi, sifa za mwombaji kijana, mshahara/posho kama ipo, na weka kiungo cha maombi...',
              'Describe role responsibilities, eligibility requirements, compensation if any, and application links...'
            )}
            className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-[#F8FAFC] p-3.5 text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-[#1D4E89] focus:bg-white focus:outline-none"
          />
        </div>

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
              {tr('Inapakia picha ya fursa kwenda Cloudinary...', 'Uploading image to Cloudinary...')}
            </span>
          </div>
        )}

        {/* Attached Cloudinary Image Preview */}
        {attachedImage && !uploadingImage && (
          <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
            {!previewFailed ? (
              <img
                src={attachedImage}
                alt={tr('Hakiki ya picha ya tangazo la fursa', 'Opportunity image preview')}
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

        <input
          type="text"
          value={tagsRaw}
          onChange={(e) => setTagsRaw(e.target.value)}
          placeholder={tr(
            'Lebo za fursa (hiari, tenganisha kwa mkato: ajira, vijana, dar)',
            'Opportunity tags (optional, comma-separated: jobs, youth, remote)'
          )}
          aria-label={tr('Lebo za fursa', 'Opportunity tags')}
          className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#1D4E89] focus:outline-none"
        />

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
          >
            {error}
          </p>
        )}

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
                  : tr('Chapisha Fursa', 'Post Opportunity')}
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
