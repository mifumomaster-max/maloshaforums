import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Images, X } from 'lucide-react';
import { optimizeCloudinaryUrl } from '../services/cloudinaryService';
import { useLanguage } from '../context/LanguageContext';

interface OrderedPhotoAlbumProps {
  images: string[];
  altBase: string;
  initialPreviewLimit?: number;
  className?: string;
}

export const OrderedPhotoAlbum: React.FC<OrderedPhotoAlbumProps> = ({
  images,
  altBase,
  initialPreviewLimit = 6,
  className = '',
}) => {
  const { tr } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [expandedLimit, setExpandedLimit] = useState(30);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [failedUrls, setFailedUrls] = useState<Set<number>>(() => new Set());

  const total = images.length;

  useEffect(() => {
    setExpanded(false);
    setExpandedLimit(30);
    setLightboxIdx(null);
    setFailedUrls(new Set());
  }, [images]);

  const handleCloseLightbox = useCallback(() => {
    setLightboxIdx(null);
  }, []);

  const handlePrev = useCallback(() => {
    setLightboxIdx((curr) => {
      if (curr === null || total === 0) return curr;
      return (curr - 1 + total) % total;
    });
  }, [total]);

  const handleNext = useCallback(() => {
    setLightboxIdx((curr) => {
      if (curr === null || total === 0) return curr;
      return (curr + 1) % total;
    });
  }, [total]);

  useEffect(() => {
    if (lightboxIdx === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCloseLightbox();
      else if (e.key === 'ArrowLeft') handlePrev();
      else if (e.key === 'ArrowRight') handleNext();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxIdx, handleCloseLightbox, handlePrev, handleNext]);

  if (total === 0) return null;

  // Single photo preserves full-width crisp display
  if (total === 1) {
    if (failedUrls.has(0)) return null;
    return (
      <>
        <div
          className={`${className} -mx-4 overflow-hidden border-y border-slate-200 bg-slate-100 sm:mx-0 sm:rounded-lg sm:border`}
        >
          <button
            type="button"
            onClick={() => setLightboxIdx(0)}
            aria-label={tr('Fungua picha kwa ukubwa kamili', 'Open full-size photo')}
            className="block w-full cursor-zoom-in focus-visible:outline-2 focus-visible:outline-[#1D4E89]"
          >
            <img
              src={optimizeCloudinaryUrl(images[0], 1080)}
              alt={altBase}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setFailedUrls((prev) => new Set(prev).add(0))}
              className="block h-auto w-full"
            />
          </button>
        </div>

        {lightboxIdx !== null && (
          <LightboxModal
            images={images}
            activeIndex={lightboxIdx}
            altBase={altBase}
            onClose={handleCloseLightbox}
            onPrev={handlePrev}
            onNext={handleNext}
            onSelectIndex={setLightboxIdx}
          />
        )}
      </>
    );
  }

  const visibleCount = expanded ? Math.min(total, expandedLimit) : Math.min(total, initialPreviewLimit);
  const visibleImages = images.slice(0, visibleCount);
  const hiddenRemaining = Math.max(0, total - visibleCount);

  return (
    <>
      <div
        className={`${className} -mx-4 overflow-hidden border-y border-slate-200 bg-slate-50/70 p-2 sm:mx-0 sm:rounded-xl sm:border sm:p-2.5`}
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#0E2640]">
            <Images className="h-3.5 w-3.5 text-[#1D4E89]" aria-hidden="true" />
            <span>
              {tr(
                `Albamu ya picha ${total} (mpangilio #1–#${total})`,
                `${total} photo album (sorted #1–#${total})`
              )}
            </span>
          </span>
          {total > initialPreviewLimit && (
            <button
              type="button"
              onClick={() => {
                setExpanded((prev) => !prev);
                setExpandedLimit(30);
              }}
              className="text-[11px] font-bold text-[#1D4E89] hover:underline"
            >
              {expanded
                ? tr('Fupisha albamu', 'Collapse album')
                : tr(`Onyesha zote (${total})`, `View all (${total})`)}
            </button>
          )}
        </div>

        <div
          className={`grid gap-1.5 sm:gap-2 ${
            total === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'
          }`}
        >
          {visibleImages.map((url, idx) => {
            const isOverflowTile = !expanded && hiddenRemaining > 0 && idx === visibleImages.length - 1;
            const failed = failedUrls.has(idx);
            return (
              <div
                key={`${idx}-${url}`}
                className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (isOverflowTile) {
                      setExpanded(true);
                    } else {
                      setLightboxIdx(idx);
                    }
                  }}
                  aria-label={
                    isOverflowTile
                      ? tr(`Onyesha picha ${hiddenRemaining} zilizobaki`, `Show ${hiddenRemaining} more photos`)
                      : `${altBase} #${idx + 1}`
                  }
                  className="relative block h-full w-full focus-visible:outline-2 focus-visible:outline-[#1D4E89]"
                >
                  {!failed ? (
                    <img
                      src={optimizeCloudinaryUrl(url, 600)}
                      alt={`${altBase} #${idx + 1}`}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      onError={() => setFailedUrls((prev) => new Set(prev).add(idx))}
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[11px] font-medium text-slate-400">
                      #{idx + 1}
                    </div>
                  )}

                  <span className="absolute top-1.5 left-1.5 rounded bg-[#0E2640]/85 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums shadow-xs">
                    #{idx + 1}
                  </span>

                  {isOverflowTile && (
                    <span className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/60 text-white backdrop-blur-[1px] transition-colors group-hover:bg-slate-950/70">
                      <span className="font-display text-xl font-extrabold tabular-nums">
                        +{hiddenRemaining}
                      </span>
                      <span className="mt-0.5 text-[11px] font-semibold">
                        {tr('Fungua zote', 'Show all')}
                      </span>
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {expanded && hiddenRemaining > 0 && (
          <div className="mt-2.5 flex justify-center">
            <button
              type="button"
              onClick={() => setExpandedLimit((prev) => prev + 36)}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-bold text-[#0E2640] hover:border-[#1D4E89] hover:text-[#1D4E89]"
            >
              <span>
                {tr(
                  `Pakia picha zaidi (${hiddenRemaining} zimesalia)`,
                  `Load more photos (${hiddenRemaining} remaining)`
                )}
              </span>
            </button>
          </div>
        )}
      </div>

      {lightboxIdx !== null && (
        <LightboxModal
          images={images}
          activeIndex={lightboxIdx}
          altBase={altBase}
          onClose={handleCloseLightbox}
          onPrev={handlePrev}
          onNext={handleNext}
          onSelectIndex={setLightboxIdx}
        />
      )}
    </>
  );
};

interface LightboxModalProps {
  images: string[];
  activeIndex: number;
  altBase: string;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSelectIndex: (idx: number) => void;
}

const LightboxModal: React.FC<LightboxModalProps> = ({
  images,
  activeIndex,
  altBase,
  onClose,
  onPrev,
  onNext,
  onSelectIndex,
}) => {
  const { tr } = useLanguage();
  const total = images.length;
  const activeUrl = images[activeIndex] || '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tr(`Picha ${activeIndex + 1} kati ya ${total}`, `Photo ${activeIndex + 1} of ${total}`)}
      onClick={onClose}
      className="fixed inset-0 z-[70] flex flex-col bg-slate-950/95 text-white backdrop-blur-sm"
    >
      {/* Top Bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex items-center justify-between border-b border-white/10 px-4 py-3"
      >
        <span className="rounded-lg bg-white/10 px-3 py-1 text-xs font-bold tabular-nums">
          #{activeIndex + 1} / {total}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={tr('Funga picha', 'Close viewer')}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Main Image Stage */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex min-h-0 flex-1 items-center justify-center p-3 sm:p-6"
      >
        {total > 1 && (
          <button
            type="button"
            onClick={onPrev}
            aria-label={tr('Picha iliyotangulia', 'Previous photo')}
            className="absolute left-2 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/20 hover:bg-black/80 sm:left-5"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}

        <img
          src={optimizeCloudinaryUrl(activeUrl, 1600)}
          alt={`${altBase} #${activeIndex + 1}`}
          referrerPolicy="no-referrer"
          className="max-h-full max-w-full rounded-lg object-contain select-none"
        />

        {total > 1 && (
          <button
            type="button"
            onClick={onNext}
            aria-label={tr('Picha inayofuata', 'Next photo')}
            className="absolute right-2 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/20 hover:bg-black/80 sm:right-5"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Quick Thumbnail Window Strip for Large Albums */}
      {total > 1 && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="border-t border-white/10 bg-black/50 px-4 py-2.5"
        >
          <div className="mx-auto flex max-w-4xl items-center gap-1.5 overflow-x-auto pb-0.5">
            {images.map((url, idx) => {
              // Render nearby window if album > 40 to keep lightbox snappy
              if (total > 40 && Math.abs(idx - activeIndex) > 15 && idx !== 0 && idx !== total - 1) {
                return null;
              }
              const isCurrent = idx === activeIndex;
              return (
                <button
                  key={`${idx}-${url}`}
                  type="button"
                  onClick={() => onSelectIndex(idx)}
                  aria-label={`#${idx + 1}`}
                  className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-md border-2 transition-all ${
                    isCurrent ? 'border-amber-400 scale-105' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  <img
                    src={optimizeCloudinaryUrl(url, 128)}
                    alt={`#${idx + 1}`}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute bottom-0 right-0 rounded-tl bg-black/75 px-1 text-[9px] font-bold text-white tabular-nums">
                    {idx + 1}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
