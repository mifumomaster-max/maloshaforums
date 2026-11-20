import React, { useRef, useState } from 'react';
import { Eraser, PenLine, RotateCcw } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface SignaturePadInputProps {
  label: string;
  sigText: string;
  sigPath: string;
  onChangeText: (val: string) => void;
  onChangePath: (path: string) => void;
  placeholder?: string;
}

const PAD_W = 300;
const PAD_H = 90;

export const SignaturePadInput: React.FC<SignaturePadInputProps> = ({
  label,
  sigText,
  sigPath,
  onChangeText,
  onChangePath,
  placeholder,
}) => {
  const { tr } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [mode, setMode] = useState<'draw' | 'type'>(sigPath ? 'draw' : 'type');
  const activeStrokeRef = useRef<{ x: number; y: number }[]>([]);
  const strokesRef = useRef<string>(sigPath || '');

  React.useEffect(() => {
    strokesRef.current = sigPath || '';
  }, [sigPath]);

  const getCoords = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(PAD_W, Math.round(((e.clientX - rect.left) / rect.width) * PAD_W)));
    const y = Math.max(0, Math.min(PAD_H, Math.round(((e.clientY - rect.top) / rect.height) * PAD_H)));
    return { x, y };
  };

  const redrawCanvas = (pathD: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, PAD_W, PAD_H);
    if (!pathD.trim()) return;
    ctx.save();
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    try {
      const p2d = new Path2D(pathD);
      ctx.stroke(p2d);
    } catch {
      // Ignore malformed partial path
    }
    ctx.restore();
  };

  React.useEffect(() => {
    if (mode === 'draw') {
      redrawCanvas(sigPath);
    }
  }, [mode, sigPath]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = getCoords(e);
    activeStrokeRef.current = [pt];
    setDrawing(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    e.preventDefault();
    const pt = getCoords(e);
    const pts = activeStrokeRef.current;
    const last = pts[pts.length - 1];
    if (last && Math.hypot(pt.x - last.x, pt.y - last.y) < 3) {
      return;
    }
    pts.push(pt);
    const liveSegment =
      pts.length === 1
        ? `M${pts[0].x} ${pts[0].y}`
        : `M${pts[0].x} ${pts[0].y} ` +
          pts
            .slice(1)
            .map((p) => `L${p.x} ${p.y}`)
            .join(' ');
    const combined = [strokesRef.current.trim(), liveSegment].filter(Boolean).join(' ');
    redrawCanvas(combined);
  };

  const finishStroke = () => {
    if (!drawing) return;
    setDrawing(false);
    const pts = activeStrokeRef.current;
    if (pts.length === 0) return;
    const segment =
      pts.length === 1
        ? `M${pts[0].x} ${pts[0].y} L${pts[0].x + 1} ${pts[0].y + 1}`
        : `M${pts[0].x} ${pts[0].y} ` +
          pts
            .slice(1)
            .map((p) => `L${p.x} ${p.y}`)
            .join(' ');
    const nextPath = [strokesRef.current.trim(), segment].filter(Boolean).join(' ').slice(0, 3900);
    strokesRef.current = nextPath;
    activeStrokeRef.current = [];
    onChangePath(nextPath);
  };

  const handleClear = () => {
    strokesRef.current = '';
    activeStrokeRef.current = [];
    onChangePath('');
    redrawCanvas('');
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-800">{label}</span>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-[11px] font-semibold">
          <button
            type="button"
            onClick={() => setMode('type')}
            className={`rounded-md px-2.5 py-1 transition-colors ${
              mode === 'type' ? 'bg-[#0E2640] text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tr('Andika Jina', 'Type Script')}
          </button>
          <button
            type="button"
            onClick={() => setMode('draw')}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 transition-colors ${
              mode === 'draw' ? 'bg-[#0E2640] text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <PenLine className="h-3 w-3" aria-hidden="true" />
            <span>{tr('Chora Saini', 'Draw')}</span>
          </button>
        </div>
      </div>

      {mode === 'type' ? (
        <div className="mt-2 space-y-1.5">
          <input
            type="text"
            maxLength={80}
            value={sigText}
            onChange={(e) => {
              onChangeText(e.target.value);
              if (sigPath) onChangePath('');
            }}
            placeholder={placeholder || tr('Mfano: R. Masawe', 'e.g. R. Masawe')}
            className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-[#1D4E89] focus:outline-none"
          />
          {sigText.trim() && (
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-1.5">
              <span
                className="text-2xl text-slate-900"
                style={{ fontFamily: '"Great Vibes", cursive' }}
              >
                {sigText}
              </span>
              {sigPath && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-[11px] font-semibold text-rose-700 hover:underline"
                >
                  {tr('Tumia maandishi pekee', 'Use typed only')}
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <div className="relative overflow-hidden rounded-lg border border-dashed border-slate-300 bg-white">
            <canvas
              ref={canvasRef}
              width={PAD_W}
              height={PAD_H}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishStroke}
              onPointerCancel={finishStroke}
              className="block h-[84px] w-full cursor-crosshair touch-none"
            />
            {!sigPath && !drawing && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-slate-400">
                {tr('Chora saini yako hapa kwa kidole au kipanya', 'Draw signature here')}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500">
              {sigPath
                ? tr('Saini iliyochorwa iko tayari', 'Drawn signature active')
                : tr('Bado hujachora (itatumia maandishi)', 'Blank (uses typed text)')}
            </span>
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-700 hover:bg-slate-100"
            >
              {sigPath ? (
                <Eraser className="h-3 w-3 text-rose-600" aria-hidden="true" />
              ) : (
                <RotateCcw className="h-3 w-3 text-slate-500" aria-hidden="true" />
              )}
              <span>{tr('Futa Saini', 'Clear')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
