import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Link2,
  Loader2,
  MessageCircle,
  Send,
  Share2,
  X,
} from 'lucide-react';
import { Topic } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { buildMakalaSocialPayload, fetchShareImageFile } from '../utils/makalaSocialShare';

interface MakalaSocialShareModalProps {
  topic: Topic | null;
  onClose: () => void;
  onToast: (message: string, kind?: 'success' | 'error') => void;
  onShared?: (topic: Topic) => void;
}

export const MakalaSocialShareModal: React.FC<MakalaSocialShareModalProps> = ({
  topic,
  onClose,
  onToast,
  onShared,
}) => {
  const { tr, lang } = useLanguage();
  const [captionText, setCaptionText] = useState('');
  const [copiedKey, setCopiedKey] = useState<'caption' | 'link' | null>(null);
  const [sharingNative, setSharingNative] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState(false);
  const [previewImgError, setPreviewImgError] = useState(false);

  const countedShareRef = useRef(false);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const payload = useMemo(() => {
    if (!topic) return null;
    return buildMakalaSocialPayload(topic, origin, lang);
  }, [topic, origin, lang]);

  useEffect(() => {
    if (!payload) return;
    setCaptionText(payload.fullCaption);
    setCopiedKey(null);
    setPreviewImgError(false);
    countedShareRef.current = false;
  }, [payload?.shareUrl]);

  useEffect(() => {
    if (!topic) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [topic, onClose]);

  if (!topic || !payload) return null;

  const activeCaption = captionText.trim() || payload.fullCaption;

  const recordSharedOnce = () => {
    if (countedShareRef.current) return;
    countedShareRef.current = true;
    onShared?.(topic);
  };

  const copyToClipboard = async (text: string, key: 'caption' | 'link', msg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 2200);
      recordSharedOnce();
      onToast(msg);
    } catch {
      onToast(tr('Imeshindwa kunakili moja kwa moja.', 'Could not copy automatically.'), 'error');
    }
  };

  const handlePlatformAnchorClick = (platformName: string) => {
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(activeCaption).catch(() => {});
    }
    recordSharedOnce();
    onToast(
      tr(
        `Chapisho kamili limenakiliwa — fungua ${platformName} na ubonyeze Post!`,
        `Full post copied — open ${platformName} and hit Post!`
      )
    );
  };

  const handleNativeCompleteShare = async () => {
    if (sharingNative) return;
    setSharingNative(true);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(activeCaption).catch(() => {});
      }

      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        const imageFile = await fetchShareImageFile(payload.imageUrl, payload.title);
        if (
          imageFile &&
          typeof navigator.canShare === 'function' &&
          navigator.canShare({ files: [imageFile] })
        ) {
          await navigator.share({
            files: [imageFile],
            title: payload.title,
            text: activeCaption,
            url: payload.shareUrl,
          });
          recordSharedOnce();
          onToast(
            tr(
              'Picha na maelezo yametumwa! Kama maelezo hayakutokea, bandika (Paste) na upost.',
              'Image & caption shared! If text is missing, simply Paste and post.'
            )
          );
          return;
        }

        await navigator.share({
          title: payload.title,
          text: activeCaption,
          url: payload.shareUrl,
        });
        recordSharedOnce();
        onToast(tr('Makala imeshirikiwa kikamilifu!', 'Article shared successfully!'));
        return;
      }

      await navigator.clipboard.writeText(activeCaption);
      setCopiedKey('caption');
      recordSharedOnce();
      onToast(
        tr(
          'Chapisho kamili limenakiliwa! Bandika moja kwa moja kwenye mtandao wowote wa kijamii.',
          'Complete post copied! Paste directly onto any social network.'
        )
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      await copyToClipboard(
        activeCaption,
        'caption',
        tr(
          'Chapisho kamili limenakiliwa — bandika kwenye Facebook au mtandao mwingine.',
          'Complete post copied — paste onto Facebook or any network.'
        )
      );
    } finally {
      setSharingNative(false);
    }
  };

  const handleDownloadCoverImage = async () => {
    if (downloadingImage) return;
    setDownloadingImage(true);
    try {
      const file = await fetchShareImageFile(payload.imageUrl, payload.title);
      if (!file) {
        throw new Error('no-file');
      }
      const blobUrl = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
      onToast(
        tr(
          'Picha ya makala imepakuliwa tayari kupost!',
          'Article image downloaded and ready to post!'
        )
      );
    } catch {
      onToast(
        tr(
          'Imeshindwa kupakua picha moja kwa moja. Tumia kiungo cha Facebook/WhatsApp hapo juu.',
          'Could not download image directly. Use the social share buttons above.'
        ),
        'error'
      );
    } finally {
      setDownloadingImage(false);
    }
  };

  const facebookHref = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
    payload.shareUrl
  )}&quote=${encodeURIComponent(activeCaption)}`;
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(activeCaption)}`;
  const xHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    payload.shortTweetCaption
  )}&url=${encodeURIComponent(payload.shareUrl)}`;
  const telegramHref = `https://t.me/share/url?url=${encodeURIComponent(
    payload.shareUrl
  )}&text=${encodeURIComponent(`📰 ${payload.title}\n\n${payload.excerpt}\n\n${payload.hashtags.join(' ')}`)}`;
  const linkedinHref = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
    payload.shareUrl
  )}`;

  const displayHost =
    typeof window !== 'undefined' ? window.location.host.toUpperCase() : 'MALOSHA FORUMS';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/65 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="makala-share-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-[#0E2640] px-4 py-3.5 text-white sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#B80000] text-white">
              <Share2 className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="makala-share-modal-title" className="truncate text-sm font-bold sm:text-base">
                {tr('Shiriki Makala Kamili', 'Share Complete Article')}
              </h2>
              <p className="truncate text-[11px] text-slate-200">
                {tr(
                  'Picha, kichwa, muhtasari na kiungo viko tayari — kazi yako ni kupost tu',
                  'Image, headline, summary & link ready — just hit post'
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={tr('Funga', 'Close')}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          {/* Live Social Card Preview */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600">
              <span className="inline-flex items-center gap-1.5 text-[#0E2640]">
                <ImageIcon className="h-3.5 w-3.5 text-[#B80000]" aria-hidden="true" />
                {tr(
                  'Mwonekano wa Kadi Kwenye Facebook / WhatsApp / X',
                  'Social Preview Card (Facebook / WhatsApp / X)'
                )}
              </span>
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                {payload.hasArticleImage
                  ? tr('Picha Ipo ✓', 'Image Ready ✓')
                  : tr('Nembo ya Jukwaa', 'Site Card')}
              </span>
            </div>

            {!previewImgError ? (
              <div className="relative aspect-[16/9] w-full overflow-hidden bg-slate-200">
                <img
                  src={payload.imageUrl}
                  alt={payload.title}
                  referrerPolicy="no-referrer"
                  onError={() => setPreviewImgError(true)}
                  className="h-full w-full object-cover"
                />
                <span className="absolute top-2.5 left-2.5 rounded bg-[#B80000] px-2 py-0.5 text-[10px] font-black tracking-wider text-white uppercase shadow">
                  {payload.section}
                </span>
              </div>
            ) : (
              <div className="flex aspect-[16/9] w-full items-center justify-center bg-[#0E2640] text-xs font-semibold text-white/80">
                Malosha Forums · {payload.section}
              </div>
            )}

            <div className="space-y-1 bg-white p-3">
              <p className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                {displayHost}
              </p>
              <h3 className="line-clamp-2 font-display text-sm font-bold leading-snug text-slate-950">
                {payload.title}
              </h3>
              {payload.excerpt && (
                <p className="line-clamp-2 text-xs leading-relaxed text-slate-600">
                  {payload.excerpt}
                </p>
              )}
            </div>
          </div>

          {/* Primary 1-Tap Native Share (Image + Text + Link) */}
          <button
            type="button"
            onClick={() => void handleNativeCompleteShare()}
            disabled={sharingNative}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#B80000] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#990000] disabled:opacity-60"
          >
            {sharingNative ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Share2 className="h-4 w-4" aria-hidden="true" />
            )}
            <span>
              {tr(
                'Shiriki Picha + Maelezo Moja kwa Moja (App Zote)',
                'Share Photo + Caption Directly (All Apps)'
              )}
            </span>
          </button>

          {/* Direct Social Network One-Click Links */}
          <div>
            <p className="mb-2 text-[11px] font-bold tracking-wide text-slate-500 uppercase">
              {tr('Tuma Moja kwa Moja Kwenye Mtandao:', 'Post Directly To:')}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <a
                href={facebookHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => handlePlatformAnchorClick('Facebook')}
                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-[#1877F2] px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-95"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Facebook</span>
              </a>

              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => handlePlatformAnchorClick('WhatsApp')}
                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-[#128C7E] px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-95"
              >
                <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>WhatsApp</span>
              </a>

              <a
                href={xHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => handlePlatformAnchorClick('X')}
                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-95"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                <span>X / Twitter</span>
              </a>

              <a
                href={telegramHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => handlePlatformAnchorClick('Telegram')}
                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-[#0088CC] px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-95"
              >
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Telegram</span>
              </a>

              <a
                href={linkedinHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => handlePlatformAnchorClick('LinkedIn')}
                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-[#0A66C2] px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-95"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                <span>LinkedIn</span>
              </a>

              <button
                type="button"
                onClick={() => void handleDownloadCoverImage()}
                disabled={downloadingImage}
                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-60"
              >
                {downloadingImage ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>{tr('Pakua Picha', 'Save Image')}</span>
              </button>
            </div>
          </div>

          {/* Ready-to-Post Editable Caption + Copy Tools */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="makala-share-caption"
                className="text-[11px] font-bold tracking-wide text-slate-600 uppercase"
              >
                {tr(
                  'Maelezo Kamili ya Kupost (Yameandaliwa Tayari):',
                  'Complete Post Text (Ready to Post):'
                )}
              </label>
              <button
                type="button"
                onClick={() =>
                  void copyToClipboard(
                    activeCaption,
                    'caption',
                    tr('Chapisho kamili limenakiliwa!', 'Complete post copied!')
                  )
                }
                className="inline-flex items-center gap-1 rounded-lg bg-[#0E2640] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#163A5F]"
              >
                {copiedKey === 'caption' ? (
                  <Check className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>
                  {copiedKey === 'caption'
                    ? tr('Imenakiliwa', 'Copied')
                    : tr('Nakili Maelezo', 'Copy Post')}
                </span>
              </button>
            </div>

            <textarea
              id="makala-share-caption"
              rows={5}
              value={captionText}
              onChange={(e) => setCaptionText(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-900 focus:border-[#0E2640] focus:bg-white focus:outline-none"
            />

            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <Link2 className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-700">
                {payload.shareUrl}
              </span>
              <button
                type="button"
                onClick={() =>
                  void copyToClipboard(
                    payload.shareUrl,
                    'link',
                    tr('Kiungo kimenakiliwa!', 'Link copied!')
                  )
                }
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-800 hover:bg-slate-100"
              >
                {copiedKey === 'link' ? (
                  <Check className="h-3 w-3 text-emerald-600" aria-hidden="true" />
                ) : (
                  <Copy className="h-3 w-3" aria-hidden="true" />
                )}
                <span>{copiedKey === 'link' ? tr('Tayari', 'Copied') : tr('Nakili Link', 'Copy Link')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
