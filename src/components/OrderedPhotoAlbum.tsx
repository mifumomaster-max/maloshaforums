import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Heart,
  Images,
  LayoutGrid,
  Loader2,
  Maximize2,
  Pause,
  Play,
  X,
} from 'lucide-react';
import { optimizeCloudinaryUrl } from '../services/cloudinaryService';
import { useLanguage } from '../context/LanguageContext';
import { downloadPhotoWithMaloshaWatermark } from '../utils/watermarkedDownload';

interface OrderedPhotoAlbumProps {
  images: string[];
  altBase: string;
  initialPreviewLimit?: number;
  className?: string;
  enableDoubleTapLike?: boolean;
  onDoubleTapLike?: () => void;
  enableWatermarkedDownload?: boolean;
  onToast?: (message: string, kind?: 'success' | 'error') => void;
}

interface FloatingHeart {
  id: number;
  x: number;
  y: number;
  tiltDeg: number;
  scale: number;
}

const AUTO_SLIDE_INTERVAL_MS = 4500;
const HEART_TILTS = [-16, -8, 0, 8, 16];
const HEART_SCALES = [0.95, 1.05, 1.15, 1.25];

export const OrderedPhotoAlbum: React.FC<OrderedPhotoAlbumProps> = ({
  images,
  altBase,
  initialPreviewLimit = 6,
  className = '',
  enableDoubleTapLike = false,
  onDoubleTapLike,
  enableWatermarkedDownload = false,
  onToast,
}) => {
  const { tr } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [expandedLimit, setExpandedLimit] = useState(30);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [downloadingIdx, setDownloadingIdx] = useState<number | null>(null);
  const [failedUrls, setFailedUrls] = useState<Set<number>>(() => new Set());
  const [viewMode, setViewMode] = useState<'slide' | 'grid'>('slide');
  const [activeSlide, setActiveSlide] = useState(0);
  const [autoPlay, setAutoPlay] = useState(() => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return true;
  });
  const [isPausedByPointer, setIsPausedByPointer] = useState(false);
  const [hasEnteredViewport, setHasEnteredViewport] = useState(
    () => typeof IntersectionObserver === 'undefined'
  );
  const [isInView, setIsInView] = useState(true);
  const [floatingHearts, setFloatingHearts] = useState<FloatingHeart[]>([]);
  const albumRootRef = useRef<HTMLDivElement | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const thumbStripRef = useRef<HTMLDivElement | null>(null);
  const lastTapAtRef = useRef(0);
  const lastBurstAtRef = useRef(0);
  const singleTapTimerRef = useRef<number | null>(null);
  const heartIdRef = useRef(0);
  const heartTimersRef = useRef<number[]>([]);

  const total = images.length;

  useEffect(() => {
    const el = albumRootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const nearObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setHasEnteredViewport(true);
          nearObserver.disconnect();
        }
      },
      { rootMargin: '350px 0px' }
    );
    nearObserver.observe(el);

    const viewObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          setIsInView(entry.isIntersecting && entry.intersectionRatio >= 0.08);
        }
      },
      { threshold: [0, 0.08, 0.25] }
    );
    viewObserver.observe(el);

    return () => {
      nearObserver.disconnect();
      viewObserver.disconnect();
    };
  }, [images]);

  useEffect(() => {
    return () => {
      if (singleTapTimerRef.current !== null) {
        window.clearTimeout(singleTapTimerRef.current);
      }
      heartTimersRef.current.forEach((t) => window.clearTimeout(t));
      heartTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    setExpanded(false);
    setExpandedLimit(30);
    setLightboxIdx(null);
    setFailedUrls(new Set());
    setActiveSlide(0);
  }, [images]);

  useEffect(() => {
    if (
      total <= 1 ||
      viewMode !== 'slide' ||
      !autoPlay ||
      !isInView ||
      isPausedByPointer ||
      lightboxIdx !== null
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      setActiveSlide((curr) => (curr + 1) % total);
    }, AUTO_SLIDE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [total, viewMode, autoPlay, isInView, isPausedByPointer, lightboxIdx]);

  // Keep active thumbnail smoothly visible inside the horizontal strip without vertical page scroll
  useEffect(() => {
    if (viewMode !== 'slide' || total <= 1) return;
    const container = thumbStripRef.current;
    if (!container) return;
    const activeEl = container.querySelector<HTMLElement>(`[data-thumb-index="${activeSlide}"]`);
    if (!activeEl) return;
    const targetLeft =
      activeEl.offsetLeft - container.clientWidth / 2 + activeEl.clientWidth / 2;
    container.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
  }, [activeSlide, viewMode, total]);

  const handleSlidePrev = useCallback(() => {
    if (total <= 1) return;
    setActiveSlide((curr) => (curr - 1 + total) % total);
  }, [total]);

  const handleSlideNext = useCallback(() => {
    if (total <= 1) return;
    setActiveSlide((curr) => (curr + 1) % total);
  }, [total]);

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

  const spawnFloatingHeart = useCallback((x: number, y: number) => {
    const id = ++heartIdRef.current;
    const tiltDeg = HEART_TILTS[Math.floor(Math.random() * HEART_TILTS.length)] ?? 0;
    const scale = HEART_SCALES[Math.floor(Math.random() * HEART_SCALES.length)] ?? 1;
    const jitterX = (Math.random() - 0.5) * 20;
    const jitterY = (Math.random() - 0.5) * 14;
    setFloatingHearts((prev) => [
      ...prev.slice(-14),
      { id, x: x + jitterX, y: y + jitterY, tiltDeg, scale },
    ]);
    const timer = window.setTimeout(() => {
      setFloatingHearts((prev) => prev.filter((item) => item.id !== id));
      heartTimersRef.current = heartTimersRef.current.filter((t) => t !== timer);
    }, 900);
    heartTimersRef.current.push(timer);
  }, []);

  const handleMediaTap = useCallback(
    (e: React.MouseEvent<HTMLElement>, indexToOpen: number) => {
      if (!enableDoubleTapLike) {
        setLightboxIdx(indexToOpen);
        return;
      }

      const rect = e.currentTarget.getBoundingClientRect();
      const hasPointerCoords = e.clientX !== 0 || e.clientY !== 0;
      const x = hasPointerCoords ? e.clientX - rect.left : rect.width / 2;
      const y = hasPointerCoords ? e.clientY - rect.top : rect.height / 2;

      const now = Date.now();
      const isDoubleOrBurstTap =
        now - lastTapAtRef.current <= 360 || now - lastBurstAtRef.current <= 550;

      if (isDoubleOrBurstTap) {
        if (singleTapTimerRef.current !== null) {
          window.clearTimeout(singleTapTimerRef.current);
          singleTapTimerRef.current = null;
        }
        lastBurstAtRef.current = now;
        lastTapAtRef.current = now;
        onDoubleTapLike?.();
        spawnFloatingHeart(x, y);
        return;
      }

      lastTapAtRef.current = now;
      if (singleTapTimerRef.current !== null) {
        window.clearTimeout(singleTapTimerRef.current);
      }
      singleTapTimerRef.current = window.setTimeout(() => {
        singleTapTimerRef.current = null;
        setLightboxIdx(indexToOpen);
      }, 250);
    },
    [enableDoubleTapLike, onDoubleTapLike, spawnFloatingHeart]
  );

  const handleDownloadWatermarked = useCallback(
    async (imageUrl: string, idx: number) => {
      if (!imageUrl || downloadingIdx !== null) return;
      setDownloadingIdx(idx);
      try {
        await downloadPhotoWithMaloshaWatermark(imageUrl, altBase);
        onToast?.(
          tr(
            'Picha imepakuliwa ikiwa na alama ya @maloshadavid.',
            'Photo downloaded with @maloshadavid watermark.'
          )
        );
      } catch {
        onToast?.(
          tr(
            'Imeshindwa kupakua picha hii. Tafadhali jaribu tena.',
            'Failed to download this photo. Please try again.'
          ),
          'error'
        );
      } finally {
        setDownloadingIdx(null);
      }
    },
    [altBase, downloadingIdx, onToast, tr]
  );

  const renderFloatingHeartsOverlay = () => {
    if (floatingHearts.length === 0) return null;
    return (
      <div
        className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
        aria-hidden="true"
      >
        {floatingHearts.map((heart) => (
          <div
            key={heart.id}
            style={
              {
                left: `${heart.x}px`,
                top: `${heart.y}px`,
                '--heart-tilt': `${heart.tiltDeg}deg`,
                '--heart-scale': String(heart.scale),
              } as React.CSSProperties
            }
            className="animate-kijiweni-heart-pop absolute"
          >
            <Heart className="h-14 w-14 fill-rose-500 text-rose-500 drop-shadow-[0_6px_14px_rgba(244,63,94,0.45)]" />
          </div>
        ))}
      </div>
    );
  };

  if (total === 0) return null;

  // Single photo preserves full-width crisp display
  if (total === 1) {
    if (failedUrls.has(0)) return null;
    return (
      <>
        <div
          ref={albumRootRef}
          className={`${className} relative -mx-4 overflow-hidden border-y border-slate-200 bg-slate-100 sm:mx-0 sm:rounded-lg sm:border`}
        >
          <button
            type="button"
            onClick={(e) => handleMediaTap(e, 0)}
            aria-label={tr('Fungua picha kwa ukubwa kamili', 'Open full-size photo')}
            className="relative block w-full cursor-zoom-in touch-manipulation focus-visible:outline-2 focus-visible:outline-[#1D4E89]"
          >
            {hasEnteredViewport ? (
              <img
                src={optimizeCloudinaryUrl(images[0], 1440, { quality: 'ultra' })}
                alt={altBase}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={() => setFailedUrls((prev) => new Set(prev).add(0))}
                className="block h-auto w-full select-none"
              />
            ) : (
              <div className="aspect-[4/3] w-full animate-pulse bg-slate-100" />
            )}
          </button>
          {renderFloatingHeartsOverlay()}
          {enableWatermarkedDownload && (
            <button
              type="button"
              disabled={downloadingIdx !== null}
              onClick={(e) => {
                e.stopPropagation();
                void handleDownloadWatermarked(images[0], 0);
              }}
              aria-label={tr('Pakua picha yenye nembo ya @maloshadavid', 'Download watermarked photo')}
              title={tr('Pakua picha', 'Download photo')}
              className="absolute right-2.5 bottom-2.5 z-10 inline-flex min-h-[34px] items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-[11px] font-bold text-white ring-1 ring-white/25 backdrop-blur-xs transition-colors hover:bg-black/90 disabled:opacity-60"
            >
              {downloadingIdx === 0 ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
              )}
              <span>{downloadingIdx === 0 ? tr('Inapakua...', 'Saving...') : tr('Pakua', 'Download')}</span>
            </button>
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
            enableWatermarkedDownload={enableWatermarkedDownload}
            downloading={downloadingIdx === lightboxIdx}
            onDownloadActive={() => void handleDownloadWatermarked(images[lightboxIdx] || '', lightboxIdx)}
          />
        )}
      </>
    );
  }

  const safeSlideIndex = Math.min(activeSlide, total - 1);
  const currentSlideUrl = images[safeSlideIndex] || '';
  const slideFailed = failedUrls.has(safeSlideIndex);
  const visibleCount = expanded ? Math.min(total, expandedLimit) : Math.min(total, initialPreviewLimit);
  const visibleImages = images.slice(0, visibleCount);
  const hiddenRemaining = Math.max(0, total - visibleCount);

  return (
    <>
      <div
        ref={albumRootRef}
        onMouseEnter={() => setIsPausedByPointer(true)}
        onMouseLeave={() => setIsPausedByPointer(false)}
        className={`${className} -mx-4 overflow-hidden border-y border-slate-200 bg-white sm:mx-0 sm:rounded-lg sm:border`}
      >
        {/* Top Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/75 px-3 py-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#0E2640] tabular-nums">
            <Images className="h-3.5 w-3.5 text-[#1D4E89]" aria-hidden="true" />
            <span>
              {viewMode === 'slide'
                ? tr(
                    `Slide #${safeSlideIndex + 1} / ${total}`,
                    `Slide #${safeSlideIndex + 1} / ${total}`
                  )
                : tr(
                    `Albamu ya picha ${total} (#1–#${total})`,
                    `${total} photo album (#1–#${total})`
                  )}
            </span>
          </span>

          <div className="flex flex-wrap items-center gap-1.5">
            {viewMode === 'slide' && (
              <button
                type="button"
                onClick={() => setAutoPlay((prev) => !prev)}
                aria-pressed={autoPlay}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                  autoPlay
                    ? 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300 hover:bg-emerald-200'
                    : 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-100'
                }`}
              >
                {autoPlay ? (
                  <>
                    <Pause className="h-3 w-3" aria-hidden="true" />
                    <span>{tr('Auto-Slide', 'Auto-Slide')}</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3 w-3" aria-hidden="true" />
                    <span>{tr('Endeleza Slide', 'Play Slide')}</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => setViewMode((prev) => (prev === 'slide' ? 'grid' : 'slide'))}
              className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-[#1D4E89] transition-colors hover:bg-sky-50"
            >
              {viewMode === 'slide' ? (
                <>
                  <LayoutGrid className="h-3 w-3" aria-hidden="true" />
                  <span>{tr(`Gridi (${total})`, `Grid (${total})`)}</span>
                </>
              ) : (
                <>
                  <Images className="h-3 w-3" aria-hidden="true" />
                  <span>{tr('Hali ya Slide', 'Slide View')}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {viewMode === 'slide' ? (
          <div>
            {/* Active Auto-Slide Stage — Full Width Matching Single Photo */}
            <div
              onTouchStart={(e) => {
                touchStartXRef.current = e.touches[0]?.clientX ?? null;
                setIsPausedByPointer(true);
              }}
              onTouchEnd={(e) => {
                const startX = touchStartXRef.current;
                const endX = e.changedTouches[0]?.clientX ?? null;
                touchStartXRef.current = null;
                setIsPausedByPointer(false);
                if (startX !== null && endX !== null) {
                  const delta = endX - startX;
                  if (delta >= 40) handleSlidePrev();
                  else if (delta <= -40) handleSlideNext();
                }
              }}
              className="relative w-full overflow-hidden bg-slate-100"
            >
              {!slideFailed ? (
                <button
                  type="button"
                  onClick={(e) => handleMediaTap(e, safeSlideIndex)}
                  aria-label={tr(
                    `Fungua picha #${safeSlideIndex + 1} kwa ukubwa kamili`,
                    `Open photo #${safeSlideIndex + 1} fullscreen`
                  )}
                  className="relative block w-full cursor-zoom-in touch-manipulation focus-visible:outline-2 focus-visible:outline-[#1D4E89]"
                >
                  {hasEnteredViewport ? (
                    <img
                      key={`${safeSlideIndex}-${currentSlideUrl}`}
                      src={optimizeCloudinaryUrl(currentSlideUrl, 1440, { quality: 'ultra' })}
                      alt={`${altBase} #${safeSlideIndex + 1}`}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      onError={() => setFailedUrls((prev) => new Set(prev).add(safeSlideIndex))}
                      className="block h-auto max-h-[82vh] w-full bg-slate-100 object-contain transition-opacity duration-300 select-none"
                    />
                  ) : (
                    <div className="aspect-[4/3] w-full animate-pulse bg-slate-100" />
                  )}
                </button>
              ) : (
                <div className="flex min-h-[260px] w-full items-center justify-center text-xs font-semibold text-slate-400">
                  #{safeSlideIndex + 1}
                </div>
              )}

              {renderFloatingHeartsOverlay()}

              {/* Top Slide Counter & Fullscreen / Download Controls */}
              <div className="pointer-events-none absolute top-2.5 right-2.5 left-2.5 z-10 flex items-center justify-between gap-2">
                <span className="rounded-md bg-black/70 px-2 py-0.5 text-[11px] font-bold text-white tabular-nums backdrop-blur-xs">
                  #{safeSlideIndex + 1} / {total}
                </span>
                <div className="pointer-events-auto flex items-center gap-1.5">
                  {enableWatermarkedDownload && currentSlideUrl && !slideFailed && (
                    <button
                      type="button"
                      disabled={downloadingIdx !== null}
                      onClick={() => void handleDownloadWatermarked(currentSlideUrl, safeSlideIndex)}
                      aria-label={tr('Pakua picha hii', 'Download this photo')}
                      className="inline-flex h-8 items-center gap-1 rounded-full bg-black/70 px-2.5 text-[11px] font-semibold text-white ring-1 ring-white/25 backdrop-blur-xs hover:bg-black/90 disabled:opacity-60"
                    >
                      {downloadingIdx === safeSlideIndex ? (
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                      ) : (
                        <Download className="h-3 w-3 text-amber-300" aria-hidden="true" />
                      )}
                      <span>{downloadingIdx === safeSlideIndex ? tr('Inapakua...', 'Saving...') : tr('Pakua', 'Download')}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setLightboxIdx(safeSlideIndex)}
                    aria-label={tr('Panua picha', 'Expand photo')}
                    className="inline-flex h-8 items-center gap-1 rounded-full bg-black/65 px-2.5 text-[11px] font-semibold text-white ring-1 ring-white/20 backdrop-blur-xs hover:bg-black/85"
                  >
                    <Maximize2 className="h-3 w-3" aria-hidden="true" />
                    <span className="hidden sm:inline">{tr('Kuza', 'Zoom')}</span>
                  </button>
                </div>
              </div>

              {/* Left / Right Manual Navigation Buttons */}
              <button
                type="button"
                onClick={handleSlidePrev}
                aria-label={tr('Picha iliyotangulia', 'Previous photo')}
                className="absolute top-1/2 left-2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/20 backdrop-blur-xs transition-colors hover:bg-black/85"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={handleSlideNext}
                aria-label={tr('Picha inayofuata', 'Next photo')}
                className="absolute top-1/2 right-2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/20 backdrop-blur-xs transition-colors hover:bg-black/85"
              >
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>

              {/* Progress Dot Indicator */}
              {total <= 12 && (
                <div className="pointer-events-none absolute right-0 bottom-2.5 left-0 z-10 flex items-center justify-center gap-1.5 px-3">
                  {images.map((_, idx) => (
                    <button
                      key={`dot-${idx}`}
                      type="button"
                      onClick={() => setActiveSlide(idx)}
                      aria-label={`${tr('Nenda picha', 'Go to photo')} #${idx + 1}`}
                      className={`pointer-events-auto h-1.5 rounded-full transition-all ${
                        idx === safeSlideIndex
                          ? 'w-5 bg-amber-400 shadow-xs'
                          : 'w-1.5 bg-white/50 hover:bg-white/80'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Horizontal Clickable Thumbnail Strip */}
            <div
              ref={thumbStripRef}
              className="flex items-center gap-1.5 overflow-x-auto border-t border-slate-100 bg-slate-50/60 px-3 py-2"
            >
              {hasEnteredViewport &&
                images.map((url, idx) => {
                if (total > 24 && Math.abs(idx - safeSlideIndex) > 12 && idx !== 0 && idx !== total - 1) {
                  return null;
                }
                const isActive = idx === safeSlideIndex;
                const failed = failedUrls.has(idx);
                return (
                  <button
                    key={`thumb-${idx}-${url}`}
                    type="button"
                    data-thumb-index={idx}
                    onClick={() => setActiveSlide(idx)}
                    aria-label={`${altBase} #${idx + 1}`}
                    className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-md border-2 transition-all sm:h-14 sm:w-14 ${
                      isActive
                        ? 'border-[#1D4E89] ring-2 ring-[#1D4E89]/25'
                        : 'border-slate-200 opacity-75 hover:opacity-100'
                    }`}
                  >
                    {!failed ? (
                      <img
                        src={optimizeCloudinaryUrl(url, 128, { quality: 'eco' })}
                        alt={`#${idx + 1}`}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        onError={() => setFailedUrls((prev) => new Set(prev).add(idx))}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center bg-slate-200 text-[10px] text-slate-500">
                        #{idx + 1}
                      </span>
                    )}
                    <span
                      className={`absolute right-0 bottom-0 rounded-tl px-1 text-[9px] font-bold text-white tabular-nums ${
                        isActive ? 'bg-[#1D4E89]' : 'bg-black/70'
                      }`}
                    >
                      {idx + 1}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-2.5 sm:p-3">
            <div
              className={`grid gap-1.5 sm:gap-2 ${
                total === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'
              }`}
            >
              {visibleImages.map((url, idx) => {
                const isOverflowTile =
                  !expanded && hiddenRemaining > 0 && idx === visibleImages.length - 1;
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
                          setActiveSlide(idx);
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
                      {!failed && hasEnteredViewport ? (
                        <img
                          src={optimizeCloudinaryUrl(url, 720, { quality: 'good' })}
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

            {total > initialPreviewLimit && (
              <div className="mt-2.5 flex justify-center gap-2">
                {expanded && hiddenRemaining > 0 ? (
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
                ) : (
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
            )}
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
          enableWatermarkedDownload={enableWatermarkedDownload}
          downloading={downloadingIdx === lightboxIdx}
          onDownloadActive={() => void handleDownloadWatermarked(images[lightboxIdx] || '', lightboxIdx)}
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
  enableWatermarkedDownload?: boolean;
  downloading?: boolean;
  onDownloadActive?: () => void;
}

const LightboxModal: React.FC<LightboxModalProps> = ({
  images,
  activeIndex,
  altBase,
  onClose,
  onPrev,
  onNext,
  onSelectIndex,
  enableWatermarkedDownload = false,
  downloading = false,
  onDownloadActive,
}) => {
  const { tr } = useLanguage();
  const total = images.length;
  const activeUrl = images[activeIndex] || '';
  const [lightboxAutoSlide, setLightboxAutoSlide] = useState(false);

  useEffect(() => {
    if (!lightboxAutoSlide || total <= 1) return;
    const timer = window.setInterval(() => {
      onNext();
    }, AUTO_SLIDE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [lightboxAutoSlide, total, onNext]);

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
        className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-white/10 px-3 py-1 text-xs font-bold tabular-nums">
            #{activeIndex + 1} / {total}
          </span>
          {total > 1 && (
            <button
              type="button"
              onClick={() => setLightboxAutoSlide((prev) => !prev)}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                lightboxAutoSlide
                  ? 'bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-400/50'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {lightboxAutoSlide ? (
                <>
                  <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{tr('Simama Slide', 'Pause Slide')}</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{tr('Auto-Slide', 'Auto-Slide')}</span>
                </>
              )}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {enableWatermarkedDownload && onDownloadActive && (
            <button
              type="button"
              disabled={downloading}
              onClick={onDownloadActive}
              aria-label={tr('Pakua picha yenye nembo ya @maloshadavid', 'Download watermarked photo')}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-amber-500 px-3.5 text-xs font-bold text-[#0B1F35] transition-colors hover:bg-amber-400 disabled:opacity-60"
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-4 w-4" aria-hidden="true" />
              )}
              <span>{downloading ? tr('Inapakua...', 'Downloading...') : tr('Pakua Picha', 'Download')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={tr('Funga picha', 'Close viewer')}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
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
          src={optimizeCloudinaryUrl(activeUrl, 2048, { quality: 'ultra' })}
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
