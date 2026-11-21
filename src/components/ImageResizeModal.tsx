import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Crop, Maximize2, RotateCcw, RotateCw, Upload, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export type AspectPreset = 'free' | '4:5' | '1:1' | '3:4' | '4:3' | '16:9';

interface ImageResizeModalProps {
  file: File | null;
  defaultPreset?: AspectPreset;
  titleSw?: string;
  titleEn?: string;
  subtitleSw?: string;
  subtitleEn?: string;
  confirmLabelSw?: string;
  confirmLabelEn?: string;
  showCircleGuide?: boolean;
  showLivePreview?: boolean;
  onCancel: () => void;
  onConfirm: (resizedFile: File) => void;
}

interface CropRect {
  x: number; // 0..1 normalized
  y: number; // 0..1 normalized
  w: number; // 0..1 normalized
  h: number; // 0..1 normalized
}

type DragHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';

interface DragSession {
  handle: DragHandle;
  startX: number;
  startY: number;
  startRect: CropRect;
}

const MIN_CROP_FRAC = 0.08;

function getPresetRatio(preset: AspectPreset): number | null {
  switch (preset) {
    case '4:5':
      return 4 / 5;
    case '1:1':
      return 1;
    case '3:4':
      return 3 / 4;
    case '4:3':
      return 4 / 3;
    case '16:9':
      return 16 / 9;
    default:
      return null;
  }
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export const ImageResizeModal: React.FC<ImageResizeModalProps> = ({
  file,
  defaultPreset = 'free',
  titleSw,
  titleEn,
  subtitleSw,
  subtitleEn,
  confirmLabelSw,
  confirmLabelEn,
  showCircleGuide = false,
  showLivePreview = false,
  onCancel,
  onConfirm,
}) => {
  const { tr } = useLanguage();
  const [sourceUrl, setSourceUrl] = useState<string>('');
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [rotatedPreviewUrl, setRotatedPreviewUrl] = useState<string>('');
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [preset, setPreset] = useState<AspectPreset>(defaultPreset);
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, w: 1, h: 1 });
  const [qualityScale, setQualityScale] = useState<number>(100);
  const [processing, setProcessing] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragSession | null>(null);
  const imgElementRef = useRef<HTMLImageElement | null>(null);
  const livePreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load selected file object URL
  useEffect(() => {
    if (!file) {
      setSourceUrl('');
      setRotatedPreviewUrl('');
      setNaturalSize({ w: 0, h: 0 });
      return;
    }
    const url = URL.createObjectURL(file);
    setSourceUrl(url);
    setRotation(0);
    setPreset(defaultPreset);
    setQualityScale(100);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file, defaultPreset]);

  // Build upright/rotated working image URL + capture natural pixel dimensions
  useEffect(() => {
    if (!sourceUrl) return;
    let cancelled = false;
    let generatedBlobUrl = '';

    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      if (rotation === 0) {
        imgElementRef.current = img;
        setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
        setRotatedPreviewUrl(sourceUrl);
        return;
      }

      const swap = rotation === 90 || rotation === 270;
      const cw = swap ? img.naturalHeight : img.naturalWidth;
      const ch = swap ? img.naturalWidth : img.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.translate(cw / 2, ch / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

      canvas.toBlob(
        (blob) => {
          if (cancelled || !blob) return;
          generatedBlobUrl = URL.createObjectURL(blob);
          const rotImg = new Image();
          rotImg.onload = () => {
            if (cancelled) return;
            imgElementRef.current = rotImg;
            setNaturalSize({ w: cw, h: ch });
            setRotatedPreviewUrl(generatedBlobUrl);
          };
          rotImg.src = generatedBlobUrl;
        },
        file?.type === 'image/png' ? 'image/png' : 'image/jpeg',
        0.95
      );
    };
    img.src = sourceUrl;

    return () => {
      cancelled = true;
      if (generatedBlobUrl) URL.revokeObjectURL(generatedBlobUrl);
    };
  }, [sourceUrl, rotation, file?.type]);

  // Re-fit crop box when preset or natural dimensions change
  const applyPresetCrop = useCallback(
    (targetPreset: AspectPreset, wPx: number, hPx: number) => {
      if (!wPx || !hPx) return;
      const ratio = getPresetRatio(targetPreset);
      if (!ratio) {
        setCrop({ x: 0, y: 0, w: 1, h: 1 });
        return;
      }
      const imgRatio = wPx / hPx;
      let wNorm = 1;
      let hNorm = 1;
      if (imgRatio > ratio) {
        // Image is wider than target ratio
        hNorm = 1;
        wNorm = clamp((hPx * ratio) / wPx, MIN_CROP_FRAC, 1);
      } else {
        // Image is taller than target ratio
        wNorm = 1;
        hNorm = clamp(wPx / ratio / hPx, MIN_CROP_FRAC, 1);
      }
      setCrop({
        x: (1 - wNorm) / 2,
        y: (1 - hNorm) / 2,
        w: wNorm,
        h: hNorm,
      });
    },
    []
  );

  useEffect(() => {
    if (naturalSize.w > 0 && naturalSize.h > 0) {
      applyPresetCrop(preset, naturalSize.w, naturalSize.h);
    }
  }, [preset, naturalSize.w, naturalSize.h, applyPresetCrop]);

  const handlePointerDown = (handle: DragHandle, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startRect: { ...crop },
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage) return;

    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dx = (e.clientX - drag.startX) / rect.width;
    const dy = (e.clientY - drag.startY) / rect.height;
    const s = drag.startRect;
    const targetRatio = getPresetRatio(preset);
    const imgRatio = naturalSize.w && naturalSize.h ? naturalSize.w / naturalSize.h : 1;

    if (drag.handle === 'move') {
      const nx = clamp(s.x + dx, 0, 1 - s.w);
      const ny = clamp(s.y + dy, 0, 1 - s.h);
      setCrop({ x: nx, y: ny, w: s.w, h: s.h });
      return;
    }

    let left = s.x;
    let right = s.x + s.w;
    let top = s.y;
    let bottom = s.y + s.h;

    if (drag.handle.includes('w')) {
      left = clamp(s.x + dx, 0, right - MIN_CROP_FRAC);
    }
    if (drag.handle.includes('e')) {
      right = clamp(s.x + s.w + dx, left + MIN_CROP_FRAC, 1);
    }
    if (drag.handle.includes('n')) {
      top = clamp(s.y + dy, 0, bottom - MIN_CROP_FRAC);
    }
    if (drag.handle.includes('s')) {
      bottom = clamp(s.y + s.h + dy, top + MIN_CROP_FRAC, 1);
    }

    // Lock aspect ratio if a fixed preset is active
    if (targetRatio) {
      let nextW = right - left;
      let nextH = bottom - top;
      const normRatio = targetRatio / imgRatio; // wNorm / hNorm = targetRatio / imgRatio

      if (drag.handle === 'n' || drag.handle === 's') {
        nextW = nextH * normRatio;
        const cx = (left + right) / 2;
        left = cx - nextW / 2;
        right = cx + nextW / 2;
        if (left < 0) {
          left = 0;
          right = nextW;
        }
        if (right > 1) {
          right = 1;
          left = Math.max(0, 1 - nextW);
        }
        nextW = right - left;
        nextH = nextW / normRatio;
        if (drag.handle === 'n') top = bottom - nextH;
        else bottom = top + nextH;
      } else {
        nextH = nextW / normRatio;
        if (drag.handle.includes('n')) {
          top = bottom - nextH;
          if (top < 0) {
            top = 0;
            nextH = bottom;
            nextW = nextH * normRatio;
            if (drag.handle.includes('w')) left = right - nextW;
            else right = left + nextW;
          }
        } else {
          bottom = top + nextH;
          if (bottom > 1) {
            bottom = 1;
            nextH = 1 - top;
            nextW = nextH * normRatio;
            if (drag.handle.includes('w')) left = right - nextW;
            else right = left + nextW;
          }
        }
      }
    }

    setCrop({
      x: clamp(left, 0, 1 - MIN_CROP_FRAC),
      y: clamp(top, 0, 1 - MIN_CROP_FRAC),
      w: clamp(right - left, MIN_CROP_FRAC, 1),
      h: clamp(bottom - top, MIN_CROP_FRAC, 1),
    });
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const outputPixels = useMemo(() => {
    if (!naturalSize.w || !naturalSize.h) return { w: 0, h: 0 };
    const rawW = Math.max(1, Math.round(crop.w * naturalSize.w));
    const rawH = Math.max(1, Math.round(crop.h * naturalSize.h));
    const maxEdge = Math.round((1600 * qualityScale) / 100);
    const scaleFactor = Math.min(1, maxEdge / Math.max(rawW, rawH));
    return {
      w: Math.max(1, Math.round(rawW * scaleFactor)),
      h: Math.max(1, Math.round(rawH * scaleFactor)),
    };
  }, [crop.w, crop.h, naturalSize.w, naturalSize.h, qualityScale]);

  // Update WYSIWYG live crop thumbnail canvas whenever crop/rotation updates
  useEffect(() => {
    if (!showLivePreview || !file) return;
    const canvas = livePreviewCanvasRef.current;
    const img = imgElementRef.current;
    if (!canvas || !img || !naturalSize.w || !naturalSize.h) return;

    const sx = Math.max(0, Math.round(crop.x * naturalSize.w));
    const sy = Math.max(0, Math.round(crop.y * naturalSize.h));
    const sw = Math.max(1, Math.round(crop.w * naturalSize.w));
    const sh = Math.max(1, Math.round(crop.h * naturalSize.h));

    const size = 96;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);

    const scale = Math.min(size / sw, size / sh);
    const dw = Math.max(1, Math.round(sw * scale));
    const dh = Math.max(1, Math.round(sh * scale));
    const dx = Math.round((size - dw) / 2);
    const dy = Math.round((size - dh) / 2);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  }, [showLivePreview, file, rotatedPreviewUrl, naturalSize.w, naturalSize.h, crop]);

  const handleConfirmCrop = async () => {
    if (!file || !imgElementRef.current || !naturalSize.w || !naturalSize.h) return;
    setProcessing(true);
    try {
      const img = imgElementRef.current;
      const sx = Math.round(crop.x * naturalSize.w);
      const sy = Math.round(crop.y * naturalSize.h);
      const sw = Math.max(1, Math.round(crop.w * naturalSize.w));
      const sh = Math.max(1, Math.round(crop.h * naturalSize.h));

      const dw = Math.max(1, outputPixels.w || sw);
      const dh = Math.max(1, outputPixels.h || sh);

      const canvas = document.createElement('canvas');
      canvas.width = dw;
      canvas.height = dh;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);

      const keepPng = file.type === 'image/png';
      const outMime = keepPng ? 'image/png' : 'image/jpeg';
      const outExt = keepPng ? 'png' : 'jpg';

      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Failed to export resized image'))),
          outMime,
          keepPng ? undefined : 0.92
        );
      });

      const baseName = file.name.replace(/\.[^.]+$/, '') || 'malosha-photo';
      const outFile = new File([blob], `${baseName}-resized.${outExt}`, {
        type: outMime,
        lastModified: Date.now(),
      });
      onConfirm(outFile);
    } catch {
      // Fall back cleanly to original file if canvas fails
      onConfirm(file);
    } finally {
      setProcessing(false);
    }
  };

  if (!file) return null;

  const isGif = file.type === 'image/gif';

  const modalNode = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tr(
        titleSw || 'Rekebisha Ukubwa wa Picha Kabla ya Kupakia',
        titleEn || 'Resize & Frame Photo Before Upload'
      )}
      className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/85 p-2 backdrop-blur-[2px] sm:p-4"
    >
      <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-[#0F172A] text-white shadow-2xl">
        {/* Modal Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <Crop className="h-4 w-4 text-amber-400" aria-hidden="true" />
            <div>
              <h2 className="font-sans text-sm font-bold text-white">
                {tr(titleSw || 'Rekebisha / Kata Picha (Crop)', titleEn || 'Resize & Crop Photo')}
              </h2>
              <p className="text-[11px] text-slate-400">
                {tr(
                  subtitleSw || 'Vuta pembe au buruta fremu — itapakiwa na kuonekana hivyo hivyo bila kukatwa.',
                  subtitleEn || 'Drag corners or move frame — uploaded and shown in full without clipping.'
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            aria-label={tr('Funga', 'Close')}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Aspect Ratio Presets & Rotate Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-[#162033] px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            {(
              [
                { id: 'free', label: tr('Huru (Free)', 'Freeform') },
                { id: '4:5', label: tr('Simu 4:5', '4:5 Phone') },
                { id: '1:1', label: tr('1:1 Mraba', '1:1 Square') },
                { id: '3:4', label: '3:4' },
                { id: '4:3', label: '4:3' },
                { id: '16:9', label: '16:9' },
              ] as { id: AspectPreset; label: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPreset(opt.id)}
                className={`min-h-[32px] rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors whitespace-nowrap shrink-0 ${
                  preset === opt.id
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-800/80 text-slate-200 hover:bg-slate-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setRotation((prev) => ((prev + 90) % 360) as 0 | 90 | 180 | 270)}
              aria-label={tr('Zungusha picha', 'Rotate photo')}
              title={tr('Zungusha 90°', 'Rotate 90°')}
              className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-700"
            >
              <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>90°</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setRotation(0);
                setPreset('free');
                setQualityScale(100);
                setCrop({ x: 0, y: 0, w: 1, h: 1 });
              }}
              aria-label={tr('Rejesha ukubwa wa awali', 'Reset crop')}
              title={tr('Rejesha', 'Reset')}
              className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-700"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">{tr('Rejesha', 'Reset')}</span>
            </button>
          </div>
        </div>

        {/* Interactive Crop Stage */}
        <div className="relative flex min-h-[210px] flex-1 items-center justify-center overflow-hidden bg-slate-950 p-5 sm:p-6">
          {rotatedPreviewUrl ? (
            <div
              ref={stageRef}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              style={{ touchAction: 'none' }}
              className="relative inline-block max-h-[46dvh] max-w-full select-none"
            >
              <img
                src={rotatedPreviewUrl}
                alt={tr('Hakiki ya kukata picha', 'Crop preview')}
                draggable={false}
                className="block max-h-[46dvh] w-auto max-w-full object-contain"
              />

              {/* Outside Dark Scrim Masks */}
              <div
                className="pointer-events-none absolute inset-0 bg-slate-950/60"
                style={{
                  clipPath: `polygon(
                    0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
                    ${crop.x * 100}% ${crop.y * 100}%,
                    ${crop.x * 100}% ${(crop.y + crop.h) * 100}%,
                    ${(crop.x + crop.w) * 100}% ${(crop.y + crop.h) * 100}%,
                    ${(crop.x + crop.w) * 100}% ${crop.y * 100}%,
                    ${crop.x * 100}% ${crop.y * 100}%
                  )`,
                }}
              />

              {/* Draggable & Resizable Crop Box */}
              <div
                onPointerDown={(e) => handlePointerDown('move', e)}
                style={{
                  left: `${crop.x * 100}%`,
                  top: `${crop.y * 100}%`,
                  width: `${crop.w * 100}%`,
                  height: `${crop.h * 100}%`,
                  touchAction: 'none',
                }}
                className="absolute cursor-move border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
              >
                {showCircleGuide && preset === '1:1' && (
                  <div className="pointer-events-none absolute inset-1 rounded-full border border-dashed border-amber-300/75" />
                )}

                {/* Rule of Thirds Gridlines */}
                <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                  <div className="border-r border-b border-white/25" />
                  <div className="border-r border-b border-white/25" />
                  <div className="border-b border-white/25" />
                  <div className="border-r border-b border-white/25" />
                  <div className="border-r border-b border-white/25" />
                  <div className="border-b border-white/25" />
                  <div className="border-r border-white/25" />
                  <div className="border-r border-white/25" />
                  <div />
                </div>

                {/* Corner Handles (Large 40x40 touch targets) */}
                {(
                  [
                    { h: 'nw', pos: '-top-5 -left-5 cursor-nwse-resize', visual: 'top-4 left-4 border-t-[3px] border-l-[3px]' },
                    { h: 'ne', pos: '-top-5 -right-5 cursor-nesw-resize', visual: 'top-4 right-4 border-t-[3px] border-r-[3px]' },
                    { h: 'sw', pos: '-bottom-5 -left-5 cursor-nesw-resize', visual: 'bottom-4 left-4 border-b-[3px] border-l-[3px]' },
                    { h: 'se', pos: '-bottom-5 -right-5 cursor-nwse-resize', visual: 'bottom-4 right-4 border-b-[3px] border-r-[3px]' },
                  ] as { h: DragHandle; pos: string; visual: string }[]
                ).map((item) => (
                  <div
                    key={item.h}
                    onPointerDown={(e) => handlePointerDown(item.h, e)}
                    style={{ touchAction: 'none' }}
                    className={`absolute z-20 flex h-10 w-10 items-center justify-center ${item.pos}`}
                  >
                    <span
                      className={`pointer-events-none absolute h-4 w-4 border-amber-400 ${item.visual}`}
                    />
                  </div>
                ))}

                {/* Edge Midpoint Handles */}
                <div
                  onPointerDown={(e) => handlePointerDown('n', e)}
                  style={{ touchAction: 'none' }}
                  className="absolute -top-4 left-1/2 z-10 flex h-8 w-12 -translate-x-1/2 cursor-ns-resize items-center justify-center"
                >
                  <span className="h-1 w-6 rounded-full bg-white shadow" />
                </div>
                <div
                  onPointerDown={(e) => handlePointerDown('s', e)}
                  style={{ touchAction: 'none' }}
                  className="absolute -bottom-4 left-1/2 z-10 flex h-8 w-12 -translate-x-1/2 cursor-ns-resize items-center justify-center"
                >
                  <span className="h-1 w-6 rounded-full bg-white shadow" />
                </div>
                <div
                  onPointerDown={(e) => handlePointerDown('w', e)}
                  style={{ touchAction: 'none' }}
                  className="absolute top-1/2 -left-4 z-10 flex h-12 w-8 -translate-y-1/2 cursor-ew-resize items-center justify-center"
                >
                  <span className="h-6 w-1 rounded-full bg-white shadow" />
                </div>
                <div
                  onPointerDown={(e) => handlePointerDown('e', e)}
                  style={{ touchAction: 'none' }}
                  className="absolute top-1/2 -right-4 z-10 flex h-12 w-8 -translate-y-1/2 cursor-ew-resize items-center justify-center"
                >
                  <span className="h-6 w-1 rounded-full bg-white shadow" />
                </div>
              </div>
            </div>
          ) : (
            <div className="py-12 text-xs text-slate-400">
              {tr('Inaandaa picha...', 'Preparing photo...')}
            </div>
          )}
        </div>

        {/* Size / Resolution Bar & Footer Actions */}
        <div className="shrink-0 space-y-2.5 border-t border-slate-800 bg-[#111827] px-4 py-3 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 text-slate-300">
              {showLivePreview && (
                <div className="flex items-center gap-1.5">
                  <canvas
                    ref={livePreviewCanvasRef}
                    className="h-10 w-10 rounded-lg border border-amber-400/70 bg-slate-900 object-contain"
                  />
                  <span className="text-[10px] font-semibold text-amber-300">
                    {tr('Matokeo', 'Output')}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Maximize2 className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                <span>{tr('Ukubwa:', 'Size:')}</span>
                <span className="rounded bg-slate-800 px-2 py-0.5 font-mono font-bold text-white tabular-nums">
                  {outputPixels.w} × {outputPixels.h} px
                </span>
              </div>
            </div>

            <label className="flex items-center gap-2 text-[11px] text-slate-300">
              <span>{tr('Ubora / Ukubwa:', 'Scale:')}</span>
              <input
                type="range"
                min={35}
                max={100}
                step={5}
                value={qualityScale}
                onChange={(e) => setQualityScale(Number(e.target.value))}
                className="h-1.5 w-24 accent-amber-500 sm:w-32"
              />
              <span className="w-9 font-mono font-semibold text-amber-300 tabular-nums">
                {qualityScale}%
              </span>
            </label>
          </div>

          {isGif && (
            <p className="text-[11px] text-amber-300">
              {tr(
                'Kumbuka: Picha ya GIF ikikatwa itahifadhiwa kama picha tuli. Tumia "Pakia Asili" kubakiza mwendo.',
                'Note: Cropping an animated GIF exports a still frame. Use "Upload Original" to keep animation.'
              )}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <button
              type="button"
              disabled={processing}
              onClick={() => file && onConfirm(file)}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 transition-colors hover:bg-slate-700 disabled:opacity-60"
            >
              <Upload className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
              <span>{tr('Pakia Asili Bila Kukata', 'Upload Original')}</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={processing}
                onClick={onCancel}
                className="min-h-[42px] rounded-lg border border-slate-700 bg-transparent px-3.5 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                {tr('Ghairi', 'Cancel')}
              </button>
              <button
                type="button"
                disabled={processing || !naturalSize.w}
                onClick={() => void handleConfirmCrop()}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-extrabold text-slate-950 transition-colors hover:bg-amber-400 disabled:opacity-60"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                <span>
                  {processing
                    ? tr('Inashughulikia...', 'Processing...')
                    : tr(
                        confirmLabelSw || 'Hifadhi Ukubwa & Pakia',
                        confirmLabelEn || 'Apply Resize & Upload'
                      )}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalNode, document.body);
  }
  return modalNode;
};
