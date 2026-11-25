import React, { useRef, useState } from 'react';
import { AtSign, Film, ImagePlus, Loader2, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import {
  prepareSharedImageFile,
  uploadImageToCloudinary,
  uploadVideoToCloudinary,
} from '../services/cloudinaryService';

export interface InsertedInlineMedia {
  type: 'image' | 'video';
  url: string;
  caption: string;
}

export function computeTextAfterInlineMediaInsert(
  currentText: string,
  atIndex: number,
  replaceAt: boolean,
  media: InsertedInlineMedia
): { nextText: string; nextCursor: number } {
  const safeIndex = Math.max(0, Math.min(atIndex, currentText.length));
  const beforeRaw = currentText.slice(0, safeIndex);
  const skipLen = replaceAt && currentText[safeIndex] === '@' ? 1 : 0;
  const afterRaw = currentText.slice(safeIndex + skipLen);

  const beforeTrimmed = beforeRaw.replace(/[ \t]+$/, '').replace(/\n+$/, '');
  const afterTrimmed = afterRaw.replace(/^\n+/, '').replace(/^[ \t]+/, '');

  const cleanCaption = media.caption.replace(/[\[\]()|\r\n]/g, ' ').trim();
  const token =
    media.type === 'video'
      ? cleanCaption
        ? `@[video|${cleanCaption}](${media.url})`
        : `@[video](${media.url})`
      : `![${cleanCaption || 'Picha'}](${media.url})`;

  const prefix = beforeTrimmed ? `${beforeTrimmed}\n\n` : '';
  const suffix = afterTrimmed ? `\n\n${afterTrimmed}` : '\n\n';
  const nextText = `${prefix}${token}${suffix}`;
  const nextCursor = prefix.length + token.length + 2;

  return { nextText, nextCursor };
}

interface InlineMediaInsertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (media: InsertedInlineMedia) => void;
  onToast?: (message: string, kind?: 'success' | 'error') => void;
  inline?: boolean;
}

export const InlineMediaInsertModal: React.FC<InlineMediaInsertModalProps> = ({
  isOpen,
  onClose,
  onInsert,
  onToast,
  inline = false,
}) => {
  const { tr } = useLanguage();
  const [caption, setCaption] = useState('');
  const [uploadingType, setUploadingType] = useState<'image' | 'video' | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const busy = uploadingType !== null;

  const resetAndClose = () => {
    if (busy) return;
    setCaption('');
    setError('');
    setUploadProgress(0);
    onClose();
  };

  const handleImageSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0];
    e.target.value = '';
    if (!rawFile || busy) return;

    setError('');
    setUploadingType('image');
    setUploadProgress(20);
    try {
      const prepared = await prepareSharedImageFile(rawFile);
      setUploadProgress(55);
      const url = await uploadImageToCloudinary(prepared);
      setUploadProgress(100);
      const cleanCaption = caption
        .replace(/[\[\]()|\r\n]/g, ' ')
        .trim()
        .slice(0, 140);
      onInsert({
        type: 'image',
        url,
        caption: cleanCaption,
      });
      setCaption('');
      setUploadProgress(0);
      setUploadingType(null);
      onToast?.(tr('Picha imewekwa sehemu uliyochagua!', 'Photo inserted at cursor!'));
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kupakia picha.', 'Failed to upload photo.');
      setError(msg);
      onToast?.(msg, 'error');
      setUploadingType(null);
      setUploadProgress(0);
    }
  };

  const handleVideoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || busy) return;

    setError('');
    setUploadingType('video');
    setUploadProgress(1);
    try {
      const uploaded = await uploadVideoToCloudinary(file, (pct) => {
        setUploadProgress(pct);
      });
      const cleanCaption = caption
        .replace(/[\[\]()|\r\n]/g, ' ')
        .trim()
        .slice(0, 140);
      onInsert({
        type: 'video',
        url: uploaded.secureUrl,
        caption: cleanCaption,
      });
      setCaption('');
      setUploadProgress(0);
      setUploadingType(null);
      onToast?.(tr('Video imewekwa sehemu uliyochagua!', 'Video inserted at cursor!'));
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kupakia video.', 'Failed to upload video.');
      setError(msg);
      onToast?.(msg, 'error');
      setUploadingType(null);
      setUploadProgress(0);
    }
  };

  const cardNode = (
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between bg-[#0E2640] px-4 py-3 text-white">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-400 text-[#0E2640]">
              <AtSign className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-sm font-bold leading-tight">
                {tr('Weka Picha au Video Hapa', 'Insert Photo or Video Here')}
              </h3>
              <p className="text-[11px] text-slate-300">
                {tr(
                  'Itaambatanishwa mahali ulipoweka @ kisha uendelee kuandika chini',
                  'Inserts right at @ so you can continue writing below'
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={resetAndClose}
            aria-label={tr('Funga', 'Close')}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div>
            <label
              htmlFor="inline-media-caption"
              className="block text-xs font-bold text-slate-700"
            >
              {tr('Maelezo mafupi chini ya picha/video (hiari)', 'Caption below media (optional)')}
            </label>
            <input
              id="inline-media-caption"
              type="text"
              maxLength={140}
              disabled={busy}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={tr(
                'Mfano: Video ya maelekezo au mchoro wa hatua hii...',
                'e.g. Step-by-step demonstration video or diagram...'
              )}
              className="mt-1.5 min-h-[42px] w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0E2640] focus:bg-white focus:outline-none disabled:opacity-60"
            />
          </div>

          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(e) => void handleImageSelected(e)}
            className="hidden"
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/x-m4v,video/3gpp,video/x-matroska,video/mpeg,video/avi,.mp4,.mov,.m4v,.webm,.3gp"
            onChange={(e) => void handleVideoSelected(e)}
            className="hidden"
          />

          {busy ? (
            <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
              <Loader2 className="mx-auto h-7 w-7 animate-spin text-[#0E2640]" aria-hidden="true" />
              <p className="text-xs font-bold text-slate-800">
                {uploadingType === 'video'
                  ? tr(
                      `Inapakia video... ${uploadProgress > 0 ? `${uploadProgress}%` : ''}`,
                      `Uploading video... ${uploadProgress > 0 ? `${uploadProgress}%` : ''}`
                    )
                  : tr('Inapakia picha...', 'Uploading photo...')}
              </p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-[#075E54] transition-all duration-200"
                  style={{ width: `${Math.max(8, uploadProgress)}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-slate-50/70 px-3 py-5 text-center transition-all hover:border-[#075E54] hover:bg-emerald-50/60"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-[#075E54]">
                  <ImagePlus className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <span className="block text-sm font-bold text-slate-900">
                    {tr('Pakia Picha', 'Upload Photo')}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    JPG, PNG, WEBP
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-slate-50/70 px-3 py-5 text-center transition-all hover:border-[#B80000] hover:bg-rose-50/60"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-100 text-[#B80000]">
                  <Film className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <span className="block text-sm font-bold text-slate-900">
                    {tr('Pakia Video', 'Upload Video')}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    MP4, MOV (hadi 95MB)
                  </span>
                </div>
              </button>
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800"
            >
              {error}
            </p>
          )}

          <div className="flex justify-end border-t border-slate-100 pt-2">
            <button
              type="button"
              disabled={busy}
              onClick={resetAndClose}
              className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              {tr('Funga / Endelea Kuandika', 'Close / Keep Writing')}
            </button>
          </div>
        </div>
      </div>
  );

  if (inline) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col items-center justify-center overflow-y-auto bg-[#F4F7FA] p-3 sm:p-5">
        {cardNode}
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tr('Ambatanisha Picha au Video', 'Insert Photo or Video')}
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-[1px] sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) resetAndClose();
      }}
    >
      {cardNode}
    </div>
  );
};
