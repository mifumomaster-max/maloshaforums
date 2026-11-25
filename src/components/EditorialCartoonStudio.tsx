import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Brush,
  Check,
  ChevronDown,
  Circle,
  Copy,
  Download,
  Eraser,
  Eye,
  EyeOff,
  FlipHorizontal2,
  Grid,
  ImagePlus,
  Layers,
  Loader2,
  Lock,
  MessageCircle,
  Minus,
  MousePointer,
  Newspaper,
  PaintBucket,
  PenTool,
  Pipette,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Search,
  Send,
  Share2,
  Sparkles,
  Square,
  Trash2,
  Type,
  Undo2,
  Unlock,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { uploadImageToCloudinary } from '../services/cloudinaryService';
import { PrimaryBoard, TopicCategory } from '../types';
import {
  CARTOON_CATALOG,
  CARTOON_CATALOG_MAP,
  CARTOON_CATEGORIES,
  CARTOON_SCENE_COMBOS,
  CartoonAssetDef,
  CartoonCategoryId,
  CartoonSceneCombo,
  CartoonSceneItem,
  drawCartoonAssetToContext,
  getCartoonThumbnailDataUrl,
} from '../utils/cartoonLibrary';
import { parseTagsInput } from '../utils/formatters';
import {
  blobToImageElement,
  canvasToPngBlob,
  clearStudioDraft,
  drawBlobOntoCanvas,
  loadStudioDraft,
  saveStudioDraft,
} from '../utils/studioDraftStorage';
import {
  buildStudioMakalaBody,
  saveStudioMakalaSnapshot,
  setPendingStudioMakalaImportId,
} from '../utils/studioMakalaBridge';

interface EditorialCartoonStudioProps {
  onPublishToPlatform: (input: {
    title: string;
    body: string;
    category: TopicCategory;
    tags: string[];
    coverImage: string;
  }) => Promise<string | void>;
  onOpenPublishedTopic?: (topicId: string) => void;
  onNavigateBoard?: (board: PrimaryBoard) => void;
  onToast: (message: string) => void;
  defaultSignature?: string;
}

type CartoonAspect = '4:3' | '1:1' | '16:9';
type LayerId = 'pencil' | 'color' | 'ink';
type DrawingToolId =
  | 'select_item'
  | 'ink'
  | 'pencil'
  | 'marker'
  | 'wash'
  | 'hatch'
  | 'fill'
  | 'line'
  | 'circle'
  | 'rect'
  | 'eraser'
  | 'eyedropper';

type SketchChartId =
  | 'none'
  | 'head_caricature'
  | 'body_proportions'
  | 'expressions'
  | 'perspective_thirds';

type BubbleKind = 'thought' | 'speech' | 'shout' | 'banner' | 'free_text';

interface CartoonBubble {
  id: string;
  kind: BubbleKind;
  text: string;
  xPct: number;
  yPct: number;
  widthPct: number;
  fontSize: number;
  tailSide: 'left' | 'right';
  textColor?: string;
  bgColor?: string;
}

interface LayerVisibility {
  pencil: boolean;
  color: boolean;
  ink: boolean;
}

interface HistorySnapshot {
  pencil: ImageData;
  color: ImageData;
  ink: ImageData;
  sceneItems: CartoonSceneItem[];
  bubbles: CartoonBubble[];
}

interface CartoonStudioDraftPayload {
  aspect: CartoonAspect;
  activeLayer: LayerId;
  layerVisibility: LayerVisibility;
  pencilOpacity: number;
  hidePencilOnExport: boolean;
  sceneBelowInk?: boolean;
  activeChart: SketchChartId;
  paperTint: string;
  refPhotoOpacity: number;
  showRefPhoto: boolean;
  refPhotoBlob: Blob | null;
  pencilBlob: Blob | null;
  colorBlob: Blob | null;
  inkBlob: Blob | null;
  sceneItems?: CartoonSceneItem[];
  bubbles: CartoonBubble[];
  showCornerBadge: boolean;
  cornerBadgeText: string;
  showSignature: boolean;
  signatureText: string;
  publishBoard: PrimaryBoard;
  postTitle: string;
  postCaption: string;
  postTagsRaw: string;
  savedAt: number;
}

interface ItemHitbox {
  uid: string;
  cx: number;
  cy: number;
  iw: number;
  ih: number;
  rotationDeg: number;
  resizeX: number;
  resizeY: number;
  rotateX: number;
  rotateY: number;
}

const CARTOON_DRAFT_KEY_V2 = 'cartoon_studio_draft_v2';
const CARTOON_DRAFT_KEY_V1 = 'cartoon_studio_draft_v1';
const LIBRARY_PAGE_SIZE = 24;

const ASPECT_DIMENSIONS: Record<
  CartoonAspect,
  { width: number; height: number; labelSw: string; labelEn: string }
> = {
  '4:3': { width: 1440, height: 1080, labelSw: '4:3 DW Katuni', labelEn: '4:3 DW Cartoon' },
  '1:1': { width: 1200, height: 1200, labelSw: '1:1 Mraba', labelEn: '1:1 Square' },
  '16:9': { width: 1600, height: 900, labelSw: '16:9 Pana', labelEn: '16:9 Wide' },
};

const PAPER_TINTS = [
  { hex: '#FAF6EA', nameSw: 'Karatasi ya DW', nameEn: 'DW Cream Paper' },
  { hex: '#FFFFFF', nameSw: 'Nyeupe Safi', nameEn: 'Pure White' },
  { hex: '#F1EFE7', nameSw: 'Gazeti', nameEn: 'Newsprint' },
  { hex: '#E6EEF7', nameSw: 'Anga Hafifu', nameEn: 'Pale Sky' },
];

const CARTOON_SWATCHES = [
  '#111827',
  '#3B82F6',
  '#DC2626',
  '#1D4ED8',
  '#FACC15',
  '#16A34A',
  '#D97706',
  '#9C623E',
  '#6B3E26',
  '#D6A074',
  '#94A3B8',
  '#FFFFFF',
];

const SKIN_TONE_SWATCHES = ['#5A3119', '#6B3E26', '#7B4626', '#9C623E', '#B97C52', '#D6A074'];

const DW_CARTOON_CONCEPTS: {
  num: string;
  titleSw: string;
  titleEn: string;
  bodySw: string;
  bodyEn: string;
}[] = [
  {
    num: '01',
    titleSw: 'Caricature & Kuzidisha Sifa (Exaggeration)',
    titleEn: 'Caricature & Exaggeration',
    bodySw:
      'Kichwa cha mhusika huchorwa kikubwa kuliko kawaida (1/3 hadi 1/2 ya mwili mzima) ili hisia za uso zionekane wazi. Zidisha alama za utambulisho kama miwani mikubwa meupe, pua, ndevu, upara au suti.',
    bodyEn:
      'Draw the head oversized (1/3 to 1/2 of total body height) so facial emotion carries the story. Exaggerate defining traits like oversized comic glasses, nose, hairline, or clothing.',
  },
  {
    num: '02',
    titleSw: 'Unganisha Michoro Tayari + Wino wa Mkono',
    titleEn: 'Combine Ready Cartoons + Hand Ink',
    bodySw:
      'Chagua Rais, Uwanja, Barabara, Wananchi, Bendera, Magari au Masanduku ya Kura kutoka Maktaba (570+), badili rangi na maneno yake, kisha chora mistari yako au nyuso juu yake kwa mkono.',
    bodyEn:
      'Pick ready cartoon elements from the 570+ Library, customize colors and labels, then ink custom details directly on top.',
  },
  {
    num: '03',
    titleSw: 'Ishara & Methali za Picha (Visual Metaphors)',
    titleEn: 'Visual Metaphors & Symbolism',
    bodySw:
      'Badala ya kuandika insha, tumia sitiari za picha: ulingo wa ndondi kuonyesha ushindani wa kisiasa, mizani kuonyesha haki, keki kuwakilisha bajeti/rasilimali, au meli yenye matobo kuonyesha taasisi inayoyumba.',
    bodyEn:
      'Show rather than tell with visual metaphors: a boxing ring for political rivalry, scales for justice, a pie for national budget, or a leaking boat for struggling institutions.',
  },
  {
    num: '04',
    titleSw: 'Mistari ya Mtetemo, Jasho & Alama za " !? "',
    titleEn: 'Motion Lines, Sweat Drops & "!?" Marks',
    bodySw:
      'Katikati ya katuni za DW huonekana mistari midogo pembeni mwa kichwa au mikono kuonyesha mtetemo/mshangao, matone ya jasho kwa hofu, na bubble ya "!?" bila maneno marefu.',
    bodyEn:
      'Small curved vibration lines beside the head or hands convey shock or nervousness, sweat drops show tension, and a simple "!?" bubble replaces long dialogue.',
  },
  {
    num: '05',
    titleSw: 'Vivuli vya Mistari (Cross-Hatching & Ink Weight)',
    titleEn: 'Cross-Hatching & Line Weight',
    bodySw:
      'Mistari ya mbele na mipaka ya nje huwekwa minene zaidi kuliko mistari ya nyuma (mandhari ya umati wa watu). Tumia "Kivuli cha Mistari" kutoa kina chini ya kidevu, mikono, na nguo.',
    bodyEn:
      'Use heavier ink strokes for foreground figures and thinner strokes for background crowds. Apply cross-hatching under chins, arms, and folds for newspaper editorial depth.',
  },
  {
    num: '06',
    titleSw: 'Ucheshi Mkavu & Ujumbe Mfupi',
    titleEn: 'Minimal Text & Punchline',
    bodySw:
      'Katuni bora ya gazeti au DW inaeleweka ndani ya sekunde 3. Kama bubble lina maneno, liwe fupi (maneno 1 hadi 6) au alama moja ya mshangao.',
    bodyEn:
      'Great editorial cartoons communicate within 3 seconds. Keep any text bubble punchy (1–6 words) or let facial expressions tell the whole joke.',
  },
  {
    num: '07',
    titleSw: 'Nembo ya Pembeni & Saini ya Mchoraji',
    titleEn: 'Corner Mark & Cartoonist Signature',
    bodySw:
      'Kila mchoraji wa DW huacha saini yake pembeni chini kulia kwa mshazari mwepesi na nembo ndogo juu kushoto kuthibitisha hakimiliki ya mchoro.',
    bodyEn:
      'Sign your work cleanly at a slight angle in the bottom-right corner with an optional top-left editorial emblem.',
  },
];

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = words[0];
    for (let i = 1; i < words.length; i++) {
      const test = `${current} ${words[i]}`;
      if (ctx.measureText(test).width <= maxWidth) {
        current = test;
      } else {
        lines.push(current);
        current = words[i];
      }
    }
    lines.push(current);
  }
  return lines.length > 0 ? lines : [''];
}

function drawSketchChartGuide(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  chartId: SketchChartId
): void {
  if (chartId === 'none') return;
  ctx.save();
  ctx.strokeStyle = 'rgba(37, 99, 235, 0.42)';
  ctx.fillStyle = 'rgba(37, 99, 235, 0.55)';
  ctx.lineWidth = Math.max(1.5, Math.min(w, h) * 0.0022);
  ctx.setLineDash([8, 6]);

  if (chartId === 'head_caricature') {
    const cx = w * 0.5;
    const cy = h * 0.42;
    const r = Math.min(w, h) * 0.2;

    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.15, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.25, r * 0.85, r * 1.15, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 1.35);
    ctx.lineTo(cx, cy + r * 1.6);
    ctx.moveTo(cx - r * 1.15, cy - r * 0.08);
    ctx.lineTo(cx + r * 1.15, cy - r * 0.08);
    ctx.moveTo(cx - r * 0.9, cy + r * 0.45);
    ctx.lineTo(cx + r * 0.9, cy + r * 0.45);
    ctx.moveTo(cx - r * 0.75, cy + r * 0.85);
    ctx.lineTo(cx + r * 0.75, cy + r * 0.85);
    ctx.stroke();

    ctx.setLineDash([4, 4]);
    ctx.strokeRect(cx - r * 0.78, cy - r * 0.34, r * 0.68, r * 0.48);
    ctx.strokeRect(cx + r * 0.1, cy - r * 0.34, r * 0.68, r * 0.48);

    ctx.beginPath();
    ctx.moveTo(cx - r * 0.3, cy + r * 1.38);
    ctx.lineTo(cx - r * 0.95, h * 0.92);
    ctx.moveTo(cx + r * 0.3, cy + r * 1.38);
    ctx.lineTo(cx + r * 0.95, h * 0.92);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.font = `700 ${Math.round(h * 0.02)}px system-ui, sans-serif`;
    ctx.fillText('Mstari wa Macho / Miwani', cx + r * 1.18, cy - r * 0.06);
    ctx.fillText('Pua', cx + r * 0.95, cy + r * 0.46);
    ctx.fillText('Mdomo / Kidevu', cx + r * 0.82, cy + r * 0.86);
    ctx.restore();
    return;
  }

  if (chartId === 'body_proportions') {
    ctx.beginPath();
    ctx.moveTo(0, h * 0.56);
    ctx.lineTo(w, h * 0.56);
    ctx.stroke();

    const drawSkeleton = (sx: number, sy: number, height: number, pose: 'raised' | 'standing' | 'running') => {
      const hr = height * 0.16;
      ctx.beginPath();
      ctx.arc(sx, sy - height * 0.42, hr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeRect(sx - height * 0.11, sy - height * 0.24, height * 0.22, height * 0.3);
      ctx.beginPath();
      if (pose === 'raised') {
        ctx.moveTo(sx + height * 0.11, sy - height * 0.22);
        ctx.lineTo(sx + height * 0.24, sy - height * 0.62);
        ctx.moveTo(sx - height * 0.11, sy - height * 0.22);
        ctx.lineTo(sx - height * 0.22, sy + height * 0.08);
      } else if (pose === 'running') {
        ctx.moveTo(sx + height * 0.11, sy - height * 0.22);
        ctx.lineTo(sx + height * 0.28, sy - height * 0.05);
        ctx.moveTo(sx - height * 0.11, sy - height * 0.22);
        ctx.lineTo(sx - height * 0.26, sy - height * 0.12);
      } else {
        ctx.moveTo(sx - height * 0.11, sy - height * 0.22);
        ctx.lineTo(sx - height * 0.2, sy + height * 0.1);
        ctx.moveTo(sx + height * 0.11, sy - height * 0.22);
        ctx.lineTo(sx + height * 0.2, sy + height * 0.1);
      }
      ctx.moveTo(sx - height * 0.06, sy + height * 0.06);
      ctx.lineTo(sx - height * 0.12, sy + height * 0.44);
      ctx.moveTo(sx + height * 0.06, sy + height * 0.06);
      ctx.lineTo(sx + height * 0.12, sy + height * 0.44);
      ctx.stroke();
    };

    drawSkeleton(w * 0.26, h * 0.62, h * 0.56, 'raised');
    drawSkeleton(w * 0.52, h * 0.62, h * 0.5, 'standing');
    drawSkeleton(w * 0.77, h * 0.62, h * 0.56, 'running');

    ctx.setLineDash([]);
    ctx.font = `700 ${Math.round(h * 0.019)}px system-ui, sans-serif`;
    ctx.fillText('Mstari wa Upeo (Horizon)', 24, h * 0.545);
    ctx.restore();
    return;
  }

  if (chartId === 'expressions') {
    const cols = 3;
    const rows = 2;
    const cellW = w / cols;
    const cellH = h / rows;
    const exprs = [
      { title: '1. Ushindi / Furaha', brow: 'up', mouth: 'grin', glasses: false },
      { title: '2. Mshtuko (!?)', brow: 'high', mouth: 'o', glasses: false },
      { title: '3. Hasira / Ukali', brow: 'angry', mouth: 'frown', glasses: false },
      { title: '4. Miwani ya DW + Mshangao', brow: 'high', mouth: 'open', glasses: true },
      { title: '5. Kejeli / Wasiwasi', brow: 'skew', mouth: 'wavy', glasses: false },
      { title: '6. Kipaza Sauti / Mkono', brow: 'up', mouth: 'shout', glasses: false },
    ];

    exprs.forEach((ex, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = col * cellW + cellW * 0.5;
      const cy = row * cellH + cellH * 0.52;
      const r = Math.min(cellW, cellH) * 0.28;

      ctx.setLineDash([6, 5]);
      ctx.strokeRect(col * cellW + 16, row * cellH + 16, cellW - 32, cellH - 32);

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.setLineDash([]);
      if (ex.glasses) {
        ctx.strokeRect(cx - r * 0.72, cy - r * 0.34, r * 0.64, r * 0.44);
        ctx.strokeRect(cx + r * 0.08, cy - r * 0.34, r * 0.64, r * 0.44);
        ctx.beginPath();
        ctx.arc(cx - r * 0.34, cy - r * 0.12, r * 0.08, 0, Math.PI * 2);
        ctx.arc(cx + r * 0.44, cy - r * 0.12, r * 0.08, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(cx - r * 0.34, cy - r * 0.14, r * 0.15, 0, Math.PI * 2);
        ctx.arc(cx + r * 0.34, cy - r * 0.14, r * 0.15, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.beginPath();
      if (ex.brow === 'angry') {
        ctx.moveTo(cx - r * 0.55, cy - r * 0.48);
        ctx.lineTo(cx - r * 0.12, cy - r * 0.26);
        ctx.moveTo(cx + r * 0.55, cy - r * 0.48);
        ctx.lineTo(cx + r * 0.12, cy - r * 0.26);
      } else if (ex.brow === 'skew') {
        ctx.moveTo(cx - r * 0.55, cy - r * 0.45);
        ctx.lineTo(cx - r * 0.14, cy - r * 0.48);
        ctx.moveTo(cx + r * 0.14, cy - r * 0.34);
        ctx.lineTo(cx + r * 0.55, cy - r * 0.38);
      } else {
        ctx.moveTo(cx - r * 0.52, cy - r * 0.44);
        ctx.lineTo(cx - r * 0.16, cy - r * 0.5);
        ctx.moveTo(cx + r * 0.16, cy - r * 0.5);
        ctx.lineTo(cx + r * 0.52, cy - r * 0.44);
      }
      ctx.stroke();

      ctx.beginPath();
      if (ex.mouth === 'o') {
        ctx.ellipse(cx, cy + r * 0.44, r * 0.2, r * 0.25, 0, 0, Math.PI * 2);
      } else if (ex.mouth === 'grin') {
        ctx.arc(cx, cy + r * 0.28, r * 0.38, 0.1, Math.PI - 0.1);
        ctx.closePath();
      } else if (ex.mouth === 'frown') {
        ctx.arc(cx, cy + r * 0.62, r * 0.32, Math.PI + 0.2, -0.2);
      } else if (ex.mouth === 'wavy') {
        ctx.moveTo(cx - r * 0.32, cy + r * 0.45);
        ctx.quadraticCurveTo(cx - r * 0.1, cy + r * 0.3, cx + r * 0.32, cy + r * 0.48);
      } else {
        ctx.ellipse(cx, cy + r * 0.45, r * 0.26, r * 0.18, 0, 0, Math.PI * 2);
      }
      ctx.stroke();

      ctx.font = `700 ${Math.round(h * 0.022)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(ex.title, cx, row * cellH + 46);
    });
    ctx.restore();
    return;
  }

  [1 / 3, 2 / 3].forEach((f) => {
    ctx.beginPath();
    ctx.moveTo(w * f, 0);
    ctx.lineTo(w * f, h);
    ctx.moveTo(0, h * f);
    ctx.lineTo(w, h * f);
    ctx.stroke();
  });
  const vx = w * 0.5;
  const vy = h * 0.44;
  ctx.setLineDash([4, 6]);
  for (let a = 0; a < 12; a++) {
    const ang = (a * Math.PI * 2) / 12;
    ctx.beginPath();
    ctx.moveTo(vx, vy);
    ctx.lineTo(vx + Math.cos(ang) * w, vy + Math.sin(ang) * w);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCartoonBubble(
  ctx: CanvasRenderingContext2D,
  bubble: CartoonBubble,
  canvasW: number,
  canvasH: number,
  isSelected: boolean
): { x: number; y: number; w: number; h: number } {
  const cx = (bubble.xPct / 100) * canvasW;
  const cy = (bubble.yPct / 100) * canvasH;
  const maxW = Math.max(120, (bubble.widthPct / 100) * canvasW);

  ctx.save();
  ctx.font = `900 ${bubble.fontSize}px "Trebuchet MS", "Comic Sans MS", system-ui, sans-serif`;
  const lines = wrapCanvasText(ctx, bubble.text || '...', maxW - 44);
  const lineHeight = bubble.fontSize * 1.15;
  const textMaxW = Math.max(70, ...lines.map((l) => ctx.measureText(l).width));
  const bw = bubble.kind === 'free_text' ? textMaxW + 32 : Math.max(maxW, textMaxW + 52);
  const bh = bubble.kind === 'free_text' ? Math.max(bubble.fontSize * 1.4, lines.length * lineHeight + 20) : Math.max(bubble.fontSize * 1.9, lines.length * lineHeight + 42);
  const bx = cx - bw / 2;
  const by = cy - bh / 2;

  const fillBg =
    bubble.bgColor ||
    (bubble.kind === 'banner' ? '#FEF08A' : bubble.kind === 'shout' ? '#FEF2F2' : '#FFFFFF');

  if (bubble.kind !== 'free_text') {
    ctx.fillStyle = fillBg;
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 5;

    if (bubble.kind === 'thought') {
      const dir = bubble.tailSide === 'left' ? -1 : 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, bw * 0.54, bh * 0.54, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx + dir * (bw * 0.55 + 24), cy - bh * 0.1, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx + dir * (bw * 0.55 + 56), cy - bh * 0.04, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (bubble.kind === 'speech') {
      const dir = bubble.tailSide === 'left' ? -1 : 1;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 26);
      ctx.fill();
      ctx.stroke();

      const tailBaseX = cx + dir * bw * 0.2;
      ctx.beginPath();
      ctx.moveTo(tailBaseX - 14, by + bh - 2);
      ctx.lineTo(tailBaseX + dir * 28, by + bh + 34);
      ctx.lineTo(tailBaseX + 14, by + bh - 2);
      ctx.closePath();
      ctx.fillStyle = fillBg;
      ctx.fill();
      ctx.stroke();
    } else if (bubble.kind === 'shout') {
      const spikes = 16;
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const ang = (i * Math.PI) / spikes;
        const radX = i % 2 === 0 ? bw * 0.58 : bw * 0.44;
        const radY = i % 2 === 0 ? bh * 0.62 : bh * 0.45;
        const px = cx + Math.cos(ang) * radX;
        const py = cy + Math.sin(ang) * radY;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 10);
      ctx.fill();
      ctx.stroke();
    }
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const startY = cy - ((lines.length - 1) * lineHeight) / 2;
  const fgColor = bubble.textColor || '#0F172A';
  lines.forEach((line, idx) => {
    const ty = startY + idx * lineHeight;
    if (bubble.kind === 'free_text') {
      ctx.lineWidth = Math.max(4, bubble.fontSize * 0.16);
      ctx.strokeStyle = fgColor.toLowerCase() === '#ffffff' ? '#0F172A' : 'rgba(255,255,255,0.92)';
      ctx.strokeText(line, cx, ty);
    }
    ctx.fillStyle = fgColor;
    ctx.fillText(line, cx, ty);
  });

  if (isSelected) {
    ctx.strokeStyle = '#2563EB';
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 5]);
    ctx.strokeRect(bx - 10, by - 10, bw + 20, bh + 20);
  }
  ctx.restore();

  return { x: bx - 10, y: by - 10, w: bw + 20, h: bh + 20 };
}

function drawSceneItemToCanvas(
  ctx: CanvasRenderingContext2D,
  item: CartoonSceneItem,
  asset: CartoonAssetDef,
  canvasW: number,
  canvasH: number,
  isSelected: boolean,
  forExport: boolean
): ItemHitbox {
  const cx = (item.xPct / 100) * canvasW;
  const cy = (item.yPct / 100) * canvasH;
  const iw = Math.max(48, (item.widthPct / 100) * canvasW);
  const ih = Math.max(48, (item.heightPct / 100) * canvasH);
  const rad = (item.rotationDeg * Math.PI) / 180;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rad);
  if (item.flipX) {
    ctx.scale(-1, 1);
  }
  ctx.globalAlpha = Math.max(0.15, Math.min(1, item.opacity));
  ctx.translate(-iw / 2, -ih / 2);

  drawCartoonAssetToContext(ctx, asset, {
    w: iw,
    h: ih,
    primaryColor: item.primaryColor,
    secondaryColor: item.secondaryColor,
    skinColor: item.skinColor,
    labelText: item.labelText,
    textColor: item.textColor,
    strokeWidthScale: item.strokeWidthScale,
  });
  ctx.restore();

  // Compute screen-space handle coordinates for Resize (bottom-right) & Rotate (top-center)
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const toWorld = (lx: number, ly: number) => ({
    x: cx + lx * cos - ly * sin,
    y: cy + lx * sin + ly * cos,
  });

  const resizePt = toWorld(iw / 2, ih / 2);
  const rotatePt = toWorld(0, -ih / 2 - 34);

  if (!forExport && isSelected) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rad);
    ctx.strokeStyle = item.locked ? '#D97706' : '#2563EB';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(-iw / 2, -ih / 2, iw, ih);
    ctx.setLineDash([]);

    if (!item.locked) {
      // Top Rotate Stem + Amber Knob
      ctx.beginPath();
      ctx.moveTo(0, -ih / 2);
      ctx.lineTo(0, -ih / 2 - 34);
      ctx.strokeStyle = '#2563EB';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = '#FACC15';
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, -ih / 2 - 34, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Bottom-Right Resize Square Handle
      ctx.fillStyle = '#2563EB';
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2.5;
      ctx.fillRect(iw / 2 - 12, ih / 2 - 12, 24, 24);
      ctx.strokeRect(iw / 2 - 12, ih / 2 - 12, 24, 24);
    }
    ctx.restore();
  }

  return {
    uid: item.uid,
    cx,
    cy,
    iw,
    ih,
    rotationDeg: item.rotationDeg,
    resizeX: resizePt.x,
    resizeY: resizePt.y,
    rotateX: rotatePt.x,
    rotateY: rotatePt.y,
  };
}

function hitTestRotatedBox(px: number, py: number, box: ItemHitbox): boolean {
  const dx = px - box.cx;
  const dy = py - box.cy;
  const rad = (-box.rotationDeg * Math.PI) / 180;
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
  return Math.abs(lx) <= box.iw / 2 + 8 && Math.abs(ly) <= box.ih / 2 + 8;
}

function hexToRgbaTuple(hex: string): [number, number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [r, g, b, 255];
  }
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  return [r, g, b, 255];
}

function performFloodFill(
  targetCanvas: HTMLCanvasElement,
  boundaryCanvas: HTMLCanvasElement | null,
  startX: number,
  startY: number,
  fillHex: string
): boolean {
  const w = targetCanvas.width;
  const h = targetCanvas.height;
  const sx = Math.floor(startX);
  const sy = Math.floor(startY);
  if (sx < 0 || sx >= w || sy < 0 || sy >= h) return false;

  const targetCtx = targetCanvas.getContext('2d', { willReadFrequently: true });
  if (!targetCtx) return false;
  const targetImg = targetCtx.getImageData(0, 0, w, h);
  const tData = targetImg.data;

  const bData = boundaryCanvas
    ? boundaryCanvas.getContext('2d', { willReadFrequently: true })?.getImageData(0, 0, w, h).data
    : null;

  const startIdx = (sy * w + sx) * 4;
  if (bData && bData[startIdx + 3] > 110) return false;

  const sr = tData[startIdx];
  const sg = tData[startIdx + 1];
  const sb = tData[startIdx + 2];
  const sa = tData[startIdx + 3];

  const [fr, fg, fb, fa] = hexToRgbaTuple(fillHex);
  if (sa > 240 && Math.abs(sr - fr) < 10 && Math.abs(sg - fg) < 10 && Math.abs(sb - fb) < 10) {
    return false;
  }

  const visited = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let sp = 0;
  stack[sp++] = sy * w + sx;
  visited[sy * w + sx] = 1;

  const matchesSeed = (idx: number) => {
    const p = idx * 4;
    if (bData && bData[p + 3] > 95) return false;
    return (
      Math.abs(tData[p] - sr) <= 36 &&
      Math.abs(tData[p + 1] - sg) <= 36 &&
      Math.abs(tData[p + 2] - sb) <= 36 &&
      Math.abs(tData[p + 3] - sa) <= 40
    );
  };

  while (sp > 0) {
    const idx = stack[--sp];
    const p = idx * 4;
    tData[p] = fr;
    tData[p + 1] = fg;
    tData[p + 2] = fb;
    tData[p + 3] = fa;

    const x = idx % w;
    const y = (idx - x) / w;

    if (x > 0) {
      const n = idx - 1;
      if (!visited[n] && matchesSeed(n)) {
        visited[n] = 1;
        stack[sp++] = n;
      }
    }
    if (x + 1 < w) {
      const n = idx + 1;
      if (!visited[n] && matchesSeed(n)) {
        visited[n] = 1;
        stack[sp++] = n;
      }
    }
    if (y > 0) {
      const n = idx - w;
      if (!visited[n] && matchesSeed(n)) {
        visited[n] = 1;
        stack[sp++] = n;
      }
    }
    if (y + 1 < h) {
      const n = idx + w;
      if (!visited[n] && matchesSeed(n)) {
        visited[n] = 1;
        stack[sp++] = n;
      }
    }
  }

  targetCtx.putImageData(targetImg, 0, 0);
  return true;
}

export const EditorialCartoonStudio: React.FC<EditorialCartoonStudioProps> = ({
  onPublishToPlatform,
  onOpenPublishedTopic,
  onNavigateBoard,
  onToast,
  defaultSignature = 'Mifumo Master',
}) => {
  const { tr } = useLanguage();

  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const pencilCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const colorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const inkCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const refPhotoInputRef = useRef<HTMLInputElement>(null);

  const [aspect, setAspect] = useState<CartoonAspect>('4:3');
  const [paperTint, setPaperTint] = useState('#FAF6EA');
  const [zoomPct, setZoomPct] = useState<number>(100);

  // Layer Controls
  const [activeLayer, setActiveLayer] = useState<LayerId>('ink');
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>({
    pencil: true,
    color: true,
    ink: true,
  });
  const [pencilOpacity, setPencilOpacity] = useState<number>(55);
  const [hidePencilOnExport, setHidePencilOnExport] = useState<boolean>(false);
  const [sceneBelowInk, setSceneBelowInk] = useState<boolean>(true);

  // Sketch Charts ("Schart") & Reference Photo Underlay
  const [activeChart, setActiveChart] = useState<SketchChartId>('none');
  const [refPhotoBlob, setRefPhotoBlob] = useState<Blob | null>(null);
  const [refPhotoImg, setRefPhotoImg] = useState<HTMLImageElement | null>(null);
  const [refPhotoUrl, setRefPhotoUrl] = useState<string | null>(null);
  const [showRefPhoto, setShowRefPhoto] = useState<boolean>(true);
  const [refPhotoOpacity, setRefPhotoOpacity] = useState<number>(35);

  // Drawing Tool & Brush Options
  const [tool, setTool] = useState<DrawingToolId>('select_item');
  const [brushColor, setBrushColor] = useState<string>('#111827');
  const [brushSize, setBrushSize] = useState<number>(7);

  // Combinable Ready-Made Cartoon Scene Objects (570+ Assets)
  const [sceneItems, setSceneItems] = useState<CartoonSceneItem[]>([]);
  const [selectedItemUid, setSelectedItemUid] = useState<string | null>(null);

  // Library Browser State
  const [libCategory, setLibCategory] = useState<CartoonCategoryId>('all');
  const [libSearch, setLibSearch] = useState<string>('');
  const [libVisibleCount, setLibVisibleCount] = useState<number>(LIBRARY_PAGE_SIZE);

  // Optional Movable Bubbles / Free Text, Corner Emblem & Signature
  const [bubbles, setBubbles] = useState<CartoonBubble[]>([]);
  const [selectedBubbleId, setSelectedBubbleId] = useState<string | null>(null);
  const [showCornerBadge, setShowCornerBadge] = useState<boolean>(true);
  const [cornerBadgeText, setCornerBadgeText] = useState<string>('MF');
  const [showSignature, setShowSignature] = useState<boolean>(true);
  const [signatureText, setSignatureText] = useState<string>(defaultSignature || 'Mifumo Master');

  // DW Concept Guide Drawer
  const [showDwGuide, setShowDwGuide] = useState<boolean>(false);

  // History Stacks (Undo / Redo)
  const historyRef = useRef<HistorySnapshot[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const [historyMeta, setHistoryMeta] = useState<{ canUndo: boolean; canRedo: boolean }>({
    canUndo: false,
    canRedo: false,
  });

  // Publish & Export State
  const [publishBoard, setPublishBoard] = useState<PrimaryBoard>('Kijiweni');
  const [postTitle, setPostTitle] = useState('');
  const [postCaption, setPostCaption] = useState('');
  const [hasCustomTitle, setHasCustomTitle] = useState(false);
  const [hasCustomCaption, setHasCustomCaption] = useState(false);
  const [postTagsRaw, setPostTagsRaw] = useState('katuni, maoni, malosha');
  const [publishing, setPublishing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sendingToMakala, setSendingToMakala] = useState(false);

  // Reset confirm + Auto-save status
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const draftHydratedRef = useRef(false);
  const [canvasRevision, setCanvasRevision] = useState(0);

  // Latest arrays refs for snapshots without stale closures
  const sceneItemsRef = useRef<CartoonSceneItem[]>(sceneItems);
  const bubblesRef = useRef<CartoonBubble[]>(bubbles);
  useEffect(() => {
    sceneItemsRef.current = sceneItems;
  }, [sceneItems]);
  useEffect(() => {
    bubblesRef.current = bubbles;
  }, [bubbles]);

  // Live Gesture Tracking Refs
  const drawingRef = useRef<{
    active: boolean;
    lastX: number;
    lastY: number;
    lastTime: number;
    lastWidth: number;
    startX: number;
    startY: number;
    preShapeSnapshot: ImageData | null;
  } | null>(null);
  const bubbleHitboxesRef = useRef<{ id: string; x: number; y: number; w: number; h: number }[]>([]);
  const itemHitboxesRef = useRef<ItemHitbox[]>([]);
  const bubbleDragRef = useRef<{
    id: string;
    startXPct: number;
    startYPct: number;
    startClientX: number;
    startClientY: number;
    moved: boolean;
  } | null>(null);
  const itemDragRef = useRef<{
    mode: 'move' | 'resize' | 'rotate';
    uid: string;
    startXPct: number;
    startYPct: number;
    startWidthPct: number;
    startHeightPct: number;
    startClientX: number;
    startClientY: number;
    cx: number;
    cy: number;
    moved: boolean;
  } | null>(null);

  const getLayerCanvas = useCallback(
    (id: LayerId): HTMLCanvasElement => {
      const dims = ASPECT_DIMENSIONS[aspect];
      const ensure = (ref: React.MutableRefObject<HTMLCanvasElement | null>) => {
        if (!ref.current) {
          ref.current = document.createElement('canvas');
          ref.current.width = dims.width;
          ref.current.height = dims.height;
        } else if (ref.current.width !== dims.width || ref.current.height !== dims.height) {
          const prev = document.createElement('canvas');
          prev.width = ref.current.width;
          prev.height = ref.current.height;
          prev.getContext('2d')?.drawImage(ref.current, 0, 0);
          ref.current.width = dims.width;
          ref.current.height = dims.height;
          ref.current.getContext('2d')?.drawImage(prev, 0, 0);
        }
        return ref.current;
      };
      if (id === 'pencil') return ensure(pencilCanvasRef);
      if (id === 'color') return ensure(colorCanvasRef);
      return ensure(inkCanvasRef);
    },
    [aspect]
  );

  const pushHistorySnapshot = useCallback(
    (overrideItems?: CartoonSceneItem[], overrideBubbles?: CartoonBubble[]) => {
      const pCanvas = getLayerCanvas('pencil');
      const cCanvas = getLayerCanvas('color');
      const iCanvas = getLayerCanvas('ink');
      const pCtx = pCanvas.getContext('2d', { willReadFrequently: true });
      const cCtx = cCanvas.getContext('2d', { willReadFrequently: true });
      const iCtx = iCanvas.getContext('2d', { willReadFrequently: true });
      if (!pCtx || !cCtx || !iCtx) return;

      const snap: HistorySnapshot = {
        pencil: pCtx.getImageData(0, 0, pCanvas.width, pCanvas.height),
        color: cCtx.getImageData(0, 0, cCanvas.width, cCanvas.height),
        ink: iCtx.getImageData(0, 0, iCanvas.width, iCanvas.height),
        sceneItems: (overrideItems ?? sceneItemsRef.current).map((item) => ({ ...item })),
        bubbles: (overrideBubbles ?? bubblesRef.current).map((b) => ({ ...b })),
      };

      const nextStack = historyRef.current.slice(0, historyIndexRef.current + 1);
      nextStack.push(snap);
      if (nextStack.length > 30) {
        nextStack.shift();
      }
      historyRef.current = nextStack;
      historyIndexRef.current = nextStack.length - 1;
      setHistoryMeta({
        canUndo: historyIndexRef.current > 0,
        canRedo: false,
      });
    },
    [getLayerCanvas]
  );

  const compositeCanvas = useCallback(
    (forExport: boolean, targetCanvas?: HTMLCanvasElement) => {
      const out = targetCanvas || displayCanvasRef.current;
      if (!out) return;
      const dims = ASPECT_DIMENSIONS[aspect];
      if (out.width !== dims.width) out.width = dims.width;
      if (out.height !== dims.height) out.height = dims.height;

      const ctx = out.getContext('2d');
      if (!ctx) return;

      const w = out.width;
      const h = out.height;

      // 1. Paper Base
      ctx.fillStyle = paperTint;
      ctx.fillRect(0, 0, w, h);

      if (!forExport) {
        ctx.save();
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.06)';
        ctx.lineWidth = 2;
        ctx.strokeRect(14, 14, w - 28, h - 28);
        ctx.restore();
      }

      // 2. Reference Photo Tracing Sheet
      if (!forExport && showRefPhoto && refPhotoImg) {
        ctx.save();
        ctx.globalAlpha = Math.max(0.05, Math.min(0.85, refPhotoOpacity / 100));
        const sc = Math.min(w / (refPhotoImg.naturalWidth || 1), h / (refPhotoImg.naturalHeight || 1));
        const dw = (refPhotoImg.naturalWidth || w) * sc;
        const dh = (refPhotoImg.naturalHeight || h) * sc;
        ctx.drawImage(refPhotoImg, (w - dw) / 2, (h - dh) / 2, dw, dh);
        ctx.restore();
      }

      // 3. Faint Non-Destructive "Schart" Tracing Guide
      if (!forExport && activeChart !== 'none') {
        drawSketchChartGuide(ctx, w, h, activeChart);
      }

      // 4. Color Layer (Underneath everything)
      const colorCanvas = getLayerCanvas('color');
      if (layerVisibility.color) {
        ctx.drawImage(colorCanvas, 0, 0);
      }

      // 5. Pencil Sketch Layer
      const pencilCanvas = getLayerCanvas('pencil');
      if (layerVisibility.pencil && !(forExport && hidePencilOnExport)) {
        ctx.save();
        ctx.globalAlpha = Math.max(0.1, Math.min(1, pencilOpacity / 100));
        ctx.drawImage(pencilCanvas, 0, 0);
        ctx.restore();
      }

      const drawAllSceneItems = (): ItemHitbox[] => {
        const hitboxes: ItemHitbox[] = [];
        for (const item of sceneItems) {
          const def = CARTOON_CATALOG_MAP.get(item.assetId);
          if (!def) continue;
          const isSel = !forExport && tool === 'select_item' && selectedItemUid === item.uid;
          hitboxes.push(drawSceneItemToCanvas(ctx, item, def, w, h, isSel, forExport));
        }
        return hitboxes;
      };

      let nextItemHits: ItemHitbox[] = [];
      if (sceneBelowInk) {
        nextItemHits = drawAllSceneItems();
      }

      // 6. Crisp Comic Ink Layer
      const inkCanvas = getLayerCanvas('ink');
      if (layerVisibility.ink) {
        ctx.drawImage(inkCanvas, 0, 0);
      }

      if (!sceneBelowInk) {
        nextItemHits = drawAllSceneItems();
      }

      if (!forExport) {
        itemHitboxesRef.current = nextItemHits;
      }

      // 7. Movable Speech / Thought / Free-Text Labels
      const nextBubbleHits: { id: string; x: number; y: number; w: number; h: number }[] = [];
      for (const b of bubbles) {
        const isSel = !forExport && tool === 'select_item' && selectedBubbleId === b.id;
        const box = drawCartoonBubble(ctx, b, w, h, isSel);
        nextBubbleHits.push({ id: b.id, ...box });
      }
      if (!forExport) {
        bubbleHitboxesRef.current = nextBubbleHits;
      }

      // 8. Corner Badge (Top-Left)
      if (showCornerBadge && cornerBadgeText.trim()) {
        ctx.save();
        const badgeR = Math.round(Math.min(w, h) * 0.052);
        const bx = Math.round(w * 0.075);
        const by = Math.round(h * 0.1);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
        ctx.beginPath();
        ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0F172A';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.fillStyle = '#334155';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const txt = cornerBadgeText.trim().slice(0, 6).toUpperCase();
        const fSize = txt.length <= 2 ? badgeR * 0.84 : txt.length <= 4 ? badgeR * 0.58 : badgeR * 0.44;
        ctx.font = `900 ${Math.round(fSize)}px system-ui, sans-serif`;
        ctx.fillText(txt, bx, by + 2);
        ctx.restore();
      }

      // 9. Slanted Cartoonist Signature (Bottom-Right)
      if (showSignature && signatureText.trim()) {
        ctx.save();
        ctx.translate(w * 0.965, h * 0.945);
        ctx.rotate(-0.14);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.font = `800 ${Math.round(Math.min(w, h) * 0.032)}px "Comic Sans MS", "Trebuchet MS", cursive, sans-serif`;
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.86)';
        ctx.strokeText(signatureText.trim(), 0, 0);
        ctx.fillStyle = '#0F172A';
        ctx.fillText(signatureText.trim(), 0, 0);
        ctx.restore();
      }
    },
    [
      aspect,
      paperTint,
      showRefPhoto,
      refPhotoImg,
      refPhotoOpacity,
      activeChart,
      getLayerCanvas,
      layerVisibility,
      hidePencilOnExport,
      pencilOpacity,
      sceneItems,
      sceneBelowInk,
      selectedItemUid,
      bubbles,
      tool,
      selectedBubbleId,
      showCornerBadge,
      cornerBadgeText,
      showSignature,
      signatureText,
    ]
  );

  // Re-composite whenever state or raster layers change
  useEffect(() => {
    compositeCanvas(false);
  }, [compositeCanvas, canvasRevision]);

  // Persist Draft Helper
  const saveDraftNow = useCallback(async () => {
    if (!draftHydratedRef.current) return;
    const [pencilBlob, colorBlob, inkBlob] = await Promise.all([
      canvasToPngBlob(pencilCanvasRef.current),
      canvasToPngBlob(colorCanvasRef.current),
      canvasToPngBlob(inkCanvasRef.current),
    ]);
    const payload: CartoonStudioDraftPayload = {
      aspect,
      activeLayer,
      layerVisibility,
      pencilOpacity,
      hidePencilOnExport,
      sceneBelowInk,
      activeChart,
      paperTint,
      refPhotoOpacity,
      showRefPhoto,
      refPhotoBlob,
      pencilBlob,
      colorBlob,
      inkBlob,
      sceneItems,
      bubbles,
      showCornerBadge,
      cornerBadgeText,
      showSignature,
      signatureText,
      publishBoard,
      postTitle,
      postCaption,
      postTagsRaw,
      savedAt: Date.now(),
    };
    await saveStudioDraft(CARTOON_DRAFT_KEY_V2, payload);
    setDraftSavedAt(payload.savedAt);
  }, [
    aspect,
    activeLayer,
    layerVisibility,
    pencilOpacity,
    hidePencilOnExport,
    sceneBelowInk,
    activeChart,
    paperTint,
    refPhotoOpacity,
    showRefPhoto,
    refPhotoBlob,
    sceneItems,
    bubbles,
    showCornerBadge,
    cornerBadgeText,
    showSignature,
    signatureText,
    publishBoard,
    postTitle,
    postCaption,
    postTagsRaw,
  ]);

  const latestSaveDraftRef = useRef(saveDraftNow);
  useEffect(() => {
    latestSaveDraftRef.current = saveDraftNow;
  }, [saveDraftNow]);

  // Hydrate Saved Draft on Mount (v2 first, fallback migrate v1)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        let draft = await loadStudioDraft<CartoonStudioDraftPayload>(CARTOON_DRAFT_KEY_V2);
        if (!draft) {
          draft = await loadStudioDraft<CartoonStudioDraftPayload>(CARTOON_DRAFT_KEY_V1);
        }
        if (cancelled) return;
        if (draft) {
          setAspect(draft.aspect || '4:3');
          setActiveLayer(draft.activeLayer || 'ink');
          if (draft.layerVisibility) setLayerVisibility(draft.layerVisibility);
          if (typeof draft.pencilOpacity === 'number') setPencilOpacity(draft.pencilOpacity);
          setHidePencilOnExport(Boolean(draft.hidePencilOnExport));
          setSceneBelowInk(draft.sceneBelowInk !== false);
          setActiveChart(draft.activeChart || 'none');
          if (draft.paperTint) setPaperTint(draft.paperTint);
          if (typeof draft.refPhotoOpacity === 'number') setRefPhotoOpacity(draft.refPhotoOpacity);
          setShowRefPhoto(draft.showRefPhoto !== false);
          if (Array.isArray(draft.sceneItems)) {
            setSceneItems(draft.sceneItems);
            sceneItemsRef.current = draft.sceneItems;
          }
          if (Array.isArray(draft.bubbles)) {
            setBubbles(draft.bubbles);
            bubblesRef.current = draft.bubbles;
          }
          setShowCornerBadge(draft.showCornerBadge !== false);
          if (typeof draft.cornerBadgeText === 'string') setCornerBadgeText(draft.cornerBadgeText);
          setShowSignature(draft.showSignature !== false);
          if (typeof draft.signatureText === 'string') setSignatureText(draft.signatureText);
          if (draft.publishBoard) setPublishBoard(draft.publishBoard);
          if (typeof draft.postTitle === 'string' && draft.postTitle.trim()) {
            setPostTitle(draft.postTitle);
            setHasCustomTitle(true);
          }
          if (typeof draft.postCaption === 'string' && draft.postCaption.trim()) {
            setPostCaption(draft.postCaption);
            setHasCustomCaption(true);
          }
          if (typeof draft.postTagsRaw === 'string') setPostTagsRaw(draft.postTagsRaw);

          const targetDims = ASPECT_DIMENSIONS[draft.aspect || '4:3'];
          const initCanvas = (ref: React.MutableRefObject<HTMLCanvasElement | null>) => {
            if (!ref.current) ref.current = document.createElement('canvas');
            ref.current.width = targetDims.width;
            ref.current.height = targetDims.height;
            return ref.current;
          };

          await Promise.all([
            drawBlobOntoCanvas(draft.pencilBlob, initCanvas(pencilCanvasRef)),
            drawBlobOntoCanvas(draft.colorBlob, initCanvas(colorCanvasRef)),
            drawBlobOntoCanvas(draft.inkBlob, initCanvas(inkCanvasRef)),
          ]);

          if (draft.refPhotoBlob) {
            const loadedRef = await blobToImageElement(draft.refPhotoBlob);
            if (!cancelled && loadedRef) {
              setRefPhotoBlob(draft.refPhotoBlob);
              setRefPhotoUrl(loadedRef.objectUrl);
              setRefPhotoImg(loadedRef.img);
            }
          }

          if (!cancelled && draft.savedAt) {
            setDraftSavedAt(draft.savedAt);
          }
        }
        if (!cancelled) {
          pushHistorySnapshot(draft?.sceneItems || [], draft?.bubbles || []);
          setCanvasRevision((r) => r + 1);
        }
      } finally {
        draftHydratedRef.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pushHistorySnapshot]);

  // Debounced Auto-Save
  useEffect(() => {
    if (!draftHydratedRef.current) return;
    const timer = window.setTimeout(() => {
      void saveDraftNow();
    }, 360);
    return () => window.clearTimeout(timer);
  }, [saveDraftNow, canvasRevision]);

  // Immediate flush on unmount / background
  useEffect(() => {
    const flushNow = () => {
      if (!draftHydratedRef.current) return;
      void latestSaveDraftRef.current();
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') flushNow();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flushNow);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', flushNow);
      flushNow();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (refPhotoUrl) URL.revokeObjectURL(refPhotoUrl);
    };
  }, [refPhotoUrl]);

  const applyHistorySnapshot = (snap: HistorySnapshot) => {
    getLayerCanvas('pencil').getContext('2d')?.putImageData(snap.pencil, 0, 0);
    getLayerCanvas('color').getContext('2d')?.putImageData(snap.color, 0, 0);
    getLayerCanvas('ink').getContext('2d')?.putImageData(snap.ink, 0, 0);
    const clonedItems = snap.sceneItems.map((i) => ({ ...i }));
    const clonedBubbles = snap.bubbles.map((b) => ({ ...b }));
    setSceneItems(clonedItems);
    setBubbles(clonedBubbles);
    sceneItemsRef.current = clonedItems;
    bubblesRef.current = clonedBubbles;
    setHistoryMeta({
      canUndo: historyIndexRef.current > 0,
      canRedo: historyIndexRef.current < historyRef.current.length - 1,
    });
    setCanvasRevision((r) => r + 1);
  };

  const handleUndo = () => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    const snap = historyRef.current[historyIndexRef.current];
    if (snap) applyHistorySnapshot(snap);
  };

  const handleRedo = () => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    const snap = historyRef.current[historyIndexRef.current];
    if (snap) applyHistorySnapshot(snap);
  };

  const handleStampChartToPencilLayer = () => {
    if (activeChart === 'none') {
      onToast(tr('Chagua kwanza Schart moja hapo juu.', 'Select a sketch chart first.'));
      return;
    }
    const pCanvas = getLayerCanvas('pencil');
    const pCtx = pCanvas.getContext('2d');
    if (!pCtx) return;
    drawSketchChartGuide(pCtx, pCanvas.width, pCanvas.height, activeChart);
    setLayerVisibility((prev) => ({ ...prev, pencil: true }));
    pushHistorySnapshot();
    setCanvasRevision((r) => r + 1);
    onToast(
      tr(
        'Schart imewekwa kwenye tabaka la Penseli — sasa unaweza kuifuta au kuichora juu yake!',
        'Chart stamped onto Pencil layer — trace or erase any part freely!'
      )
    );
  };

  const selectToolAndSmartLayer = (nextTool: DrawingToolId) => {
    setTool(nextTool);
    if (nextTool === 'pencil') {
      setActiveLayer('pencil');
      if (brushColor === '#111827') setBrushColor('#3B82F6');
    } else if (nextTool === 'wash' || nextTool === 'fill') {
      setActiveLayer('color');
    } else if (nextTool === 'ink' || nextTool === 'marker' || nextTool === 'hatch') {
      setActiveLayer('ink');
      if (brushColor === '#3B82F6') setBrushColor('#111827');
    }
  };

  const toCanvasPoint = (clientX: number, clientY: number) => {
    const canvas = displayCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    const y = ((clientY - rect.top) / rect.height) * canvas.height;
    return { x, y, w: canvas.width, h: canvas.height, rectW: rect.width, rectH: rect.height };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = toCanvasPoint(e.clientX, e.clientY);
    if (!pt) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    // 1. Unified Select / Move / Resize / Rotate Tool (Cartoon Items & Bubbles/Text)
    if (tool === 'select_item') {
      // 1a. Check handles of currently selected item first
      if (selectedItemUid) {
        const selBox = itemHitboxesRef.current.find((hb) => hb.uid === selectedItemUid);
        const selObj = sceneItems.find((i) => i.uid === selectedItemUid);
        if (selBox && selObj && !selObj.locked) {
          const distRotate = Math.hypot(pt.x - selBox.rotateX, pt.y - selBox.rotateY);
          if (distRotate <= 28) {
            itemDragRef.current = {
              mode: 'rotate',
              uid: selObj.uid,
              startXPct: selObj.xPct,
              startYPct: selObj.yPct,
              startWidthPct: selObj.widthPct,
              startHeightPct: selObj.heightPct,
              startClientX: e.clientX,
              startClientY: e.clientY,
              cx: selBox.cx,
              cy: selBox.cy,
              moved: false,
            };
            return;
          }
          const distResize = Math.hypot(pt.x - selBox.resizeX, pt.y - selBox.resizeY);
          if (distResize <= 28) {
            itemDragRef.current = {
              mode: 'resize',
              uid: selObj.uid,
              startXPct: selObj.xPct,
              startYPct: selObj.yPct,
              startWidthPct: selObj.widthPct,
              startHeightPct: selObj.heightPct,
              startClientX: e.clientX,
              startClientY: e.clientY,
              cx: selBox.cx,
              cy: selBox.cy,
              moved: false,
            };
            return;
          }
        }
      }

      // 1b. Check Bubbles / Free Text (top layer)
      for (let i = bubbleHitboxesRef.current.length - 1; i >= 0; i--) {
        const box = bubbleHitboxesRef.current[i];
        if (pt.x >= box.x && pt.x <= box.x + box.w && pt.y >= box.y && pt.y <= box.y + box.h) {
          const b = bubbles.find((item) => item.id === box.id);
          if (b) {
            setSelectedBubbleId(b.id);
            setSelectedItemUid(null);
            bubbleDragRef.current = {
              id: b.id,
              startXPct: b.xPct,
              startYPct: b.yPct,
              startClientX: e.clientX,
              startClientY: e.clientY,
              moved: false,
            };
            return;
          }
        }
      }

      // 1c. Check Cartoon Scene Items (top-down z-order)
      for (let i = itemHitboxesRef.current.length - 1; i >= 0; i--) {
        const hb = itemHitboxesRef.current[i];
        if (hitTestRotatedBox(pt.x, pt.y, hb)) {
          const obj = sceneItems.find((item) => item.uid === hb.uid);
          if (obj) {
            setSelectedItemUid(obj.uid);
            setSelectedBubbleId(null);
            if (!obj.locked) {
              itemDragRef.current = {
                mode: 'move',
                uid: obj.uid,
                startXPct: obj.xPct,
                startYPct: obj.yPct,
                startWidthPct: obj.widthPct,
                startHeightPct: obj.heightPct,
                startClientX: e.clientX,
                startClientY: e.clientY,
                cx: hb.cx,
                cy: hb.cy,
                moved: false,
              };
            }
            return;
          }
        }
      }

      setSelectedBubbleId(null);
      setSelectedItemUid(null);
      return;
    }

    // 2. Eyedropper color picker
    if (tool === 'eyedropper') {
      const displayCtx = displayCanvasRef.current?.getContext('2d', { willReadFrequently: true });
      if (displayCtx) {
        const px = displayCtx.getImageData(Math.floor(pt.x), Math.floor(pt.y), 1, 1).data;
        const hex = `#${[px[0], px[1], px[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
        setBrushColor(hex);
        onToast(tr(`Rangi imechukuliwa: ${hex}`, `Color picked: ${hex}`));
      }
      return;
    }

    // 3. Flood Fill
    if (tool === 'fill') {
      const targetLayer: LayerId = activeLayer === 'pencil' ? 'color' : activeLayer;
      const targetCanvas = getLayerCanvas(targetLayer);
      const boundary = targetLayer === 'color' ? getLayerCanvas('ink') : null;
      const filled = performFloodFill(targetCanvas, boundary, pt.x, pt.y, brushColor);
      if (filled) {
        pushHistorySnapshot();
        setCanvasRevision((r) => r + 1);
      } else {
        onToast(tr('Eneo tayari lina rangi hii au umegusa mstari wa wino.', 'Already filled or tapped an ink outline.'));
      }
      return;
    }

    // 4. Stroke or Geometric Shape Start
    const layerCanvas = getLayerCanvas(activeLayer);
    const layerCtx = layerCanvas.getContext('2d', { willReadFrequently: true });
    if (!layerCtx) return;

    const isShape = tool === 'line' || tool === 'circle' || tool === 'rect';
    const snapshot = isShape
      ? layerCtx.getImageData(0, 0, layerCanvas.width, layerCanvas.height)
      : null;

    drawingRef.current = {
      active: true,
      lastX: pt.x,
      lastY: pt.y,
      lastTime: performance.now(),
      lastWidth: brushSize,
      startX: pt.x,
      startY: pt.y,
      preShapeSnapshot: snapshot,
    };

    if (!isShape) {
      layerCtx.save();
      layerCtx.lineCap = 'round';
      layerCtx.lineJoin = 'round';
      if (tool === 'eraser') {
        layerCtx.globalCompositeOperation = 'destination-out';
        layerCtx.fillStyle = 'rgba(0,0,0,1)';
        layerCtx.beginPath();
        layerCtx.arc(pt.x, pt.y, brushSize * 0.95, 0, Math.PI * 2);
        layerCtx.fill();
      } else {
        layerCtx.globalAlpha = tool === 'wash' ? 0.3 : tool === 'pencil' ? 0.52 : 1;
        layerCtx.fillStyle = brushColor;
        layerCtx.beginPath();
        layerCtx.arc(pt.x, pt.y, Math.max(1, brushSize * 0.45), 0, Math.PI * 2);
        layerCtx.fill();
      }
      layerCtx.restore();
      setCanvasRevision((r) => r + 1);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = toCanvasPoint(e.clientX, e.clientY);
    if (!pt) return;

    // 1. Bubble / Text Dragging
    if (tool === 'select_item' && bubbleDragRef.current) {
      const bDrag = bubbleDragRef.current;
      const dxPct = ((e.clientX - bDrag.startClientX) / pt.rectW) * 100;
      const dyPct = ((e.clientY - bDrag.startClientY) / pt.rectH) * 100;
      if (Math.abs(dxPct) > 0.4 || Math.abs(dyPct) > 0.4) bDrag.moved = true;
      const nextX = Math.max(4, Math.min(96, bDrag.startXPct + dxPct));
      const nextY = Math.max(5, Math.min(95, bDrag.startYPct + dyPct));
      setBubbles((prev) =>
        prev.map((b) => (b.id === bDrag.id ? { ...b, xPct: nextX, yPct: nextY } : b))
      );
      return;
    }

    // 2. Scene Item Move / Resize / Rotate
    if (tool === 'select_item' && itemDragRef.current) {
      const drag = itemDragRef.current;
      drag.moved = true;

      if (drag.mode === 'move') {
        const dxPct = ((e.clientX - drag.startClientX) / pt.rectW) * 100;
        const dyPct = ((e.clientY - drag.startClientY) / pt.rectH) * 100;
        const nextX = Math.max(2, Math.min(98, drag.startXPct + dxPct));
        const nextY = Math.max(2, Math.min(98, drag.startYPct + dyPct));
        setSceneItems((prev) =>
          prev.map((item) => (item.uid === drag.uid ? { ...item, xPct: nextX, yPct: nextY } : item))
        );
      } else if (drag.mode === 'resize') {
        const dxPct = ((e.clientX - drag.startClientX) / pt.rectW) * 100 * 1.6;
        const ratio = drag.startHeightPct / Math.max(1, drag.startWidthPct);
        const nextW = Math.max(6, Math.min(96, drag.startWidthPct + dxPct));
        const nextH = Math.max(6, Math.min(96, nextW * ratio));
        setSceneItems((prev) =>
          prev.map((item) =>
            item.uid === drag.uid ? { ...item, widthPct: nextW, heightPct: nextH } : item
          )
        );
      } else if (drag.mode === 'rotate') {
        const angRad = Math.atan2(pt.y - drag.cy, pt.x - drag.cx);
        const deg = Math.round(((angRad * 180) / Math.PI + 90 + 360) % 360);
        const normalized = deg > 180 ? deg - 360 : deg;
        setSceneItems((prev) =>
          prev.map((item) => (item.uid === drag.uid ? { ...item, rotationDeg: normalized } : item))
        );
      }
      return;
    }

    const st = drawingRef.current;
    if (!st || !st.active) return;

    const layerCanvas = getLayerCanvas(activeLayer);
    const layerCtx = layerCanvas.getContext('2d');
    if (!layerCtx) return;

    // Shape Live Preview
    if (tool === 'line' || tool === 'circle' || tool === 'rect') {
      if (st.preShapeSnapshot) {
        layerCtx.putImageData(st.preShapeSnapshot, 0, 0);
      }
      layerCtx.save();
      layerCtx.strokeStyle = brushColor;
      layerCtx.lineWidth = brushSize;
      layerCtx.lineCap = 'round';
      layerCtx.lineJoin = 'round';
      layerCtx.beginPath();
      if (tool === 'line') {
        layerCtx.moveTo(st.startX, st.startY);
        layerCtx.lineTo(pt.x, pt.y);
      } else if (tool === 'rect') {
        layerCtx.rect(st.startX, st.startY, pt.x - st.startX, pt.y - st.startY);
      } else {
        const rx = Math.abs(pt.x - st.startX) / 2;
        const ry = Math.abs(pt.y - st.startY) / 2;
        const cx = (st.startX + pt.x) / 2;
        const cy = (st.startY + pt.y) / 2;
        layerCtx.ellipse(cx, cy, Math.max(2, rx), Math.max(2, ry), 0, 0, Math.PI * 2);
      }
      layerCtx.stroke();
      layerCtx.restore();
      setCanvasRevision((r) => r + 1);
      return;
    }

    // Freehand Brush Strokes
    const now = performance.now();
    const dist = Math.hypot(pt.x - st.lastX, pt.y - st.lastY);
    const dt = Math.max(1, now - st.lastTime);
    const velocity = dist / dt;

    layerCtx.save();
    layerCtx.lineCap = 'round';
    layerCtx.lineJoin = 'round';

    if (tool === 'eraser') {
      layerCtx.globalCompositeOperation = 'destination-out';
      layerCtx.strokeStyle = 'rgba(0,0,0,1)';
      layerCtx.lineWidth = brushSize * 1.9;
      layerCtx.beginPath();
      layerCtx.moveTo(st.lastX, st.lastY);
      layerCtx.lineTo(pt.x, pt.y);
      layerCtx.stroke();
    } else if (tool === 'hatch') {
      layerCtx.strokeStyle = brushColor;
      layerCtx.lineWidth = Math.max(1.5, brushSize * 0.28);
      const tickSpan = Math.max(10, brushSize * 2.2);
      const steps = Math.max(1, Math.floor(dist / 7));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const hx = st.lastX + (pt.x - st.lastX) * t;
        const hy = st.lastY + (pt.y - st.lastY) * t;
        layerCtx.beginPath();
        layerCtx.moveTo(hx - tickSpan * 0.45, hy + tickSpan * 0.45);
        layerCtx.lineTo(hx + tickSpan * 0.45, hy - tickSpan * 0.45);
        layerCtx.stroke();
      }
    } else if (tool === 'ink') {
      const targetWidth = Math.max(
        Math.max(1.5, brushSize * 0.42),
        Math.min(brushSize * 1.35, brushSize * (1.28 - velocity * 0.26))
      );
      const smoothW = st.lastWidth * 0.65 + targetWidth * 0.35;
      layerCtx.strokeStyle = brushColor;
      layerCtx.lineWidth = smoothW;
      layerCtx.beginPath();
      layerCtx.moveTo(st.lastX, st.lastY);
      layerCtx.lineTo(pt.x, pt.y);
      layerCtx.stroke();
      st.lastWidth = smoothW;
    } else if (tool === 'wash') {
      layerCtx.globalAlpha = 0.24;
      layerCtx.strokeStyle = brushColor;
      layerCtx.lineWidth = brushSize * 2.3;
      layerCtx.beginPath();
      layerCtx.moveTo(st.lastX, st.lastY);
      layerCtx.lineTo(pt.x, pt.y);
      layerCtx.stroke();
    } else if (tool === 'pencil') {
      layerCtx.globalAlpha = 0.45;
      layerCtx.strokeStyle = brushColor;
      layerCtx.lineWidth = Math.max(1.5, brushSize * 0.65);
      layerCtx.beginPath();
      layerCtx.moveTo(st.lastX, st.lastY);
      layerCtx.lineTo(pt.x, pt.y);
      layerCtx.stroke();
    } else {
      layerCtx.strokeStyle = brushColor;
      layerCtx.lineWidth = brushSize * 1.4;
      layerCtx.beginPath();
      layerCtx.moveTo(st.lastX, st.lastY);
      layerCtx.lineTo(pt.x, pt.y);
      layerCtx.stroke();
    }

    layerCtx.restore();
    st.lastX = pt.x;
    st.lastY = pt.y;
    st.lastTime = now;
    setCanvasRevision((r) => r + 1);
  };

  const handlePointerUp = () => {
    const bMoved = bubbleDragRef.current?.moved;
    const iMoved = itemDragRef.current?.moved;
    bubbleDragRef.current = null;
    itemDragRef.current = null;
    if (bMoved || iMoved) {
      pushHistorySnapshot();
      setCanvasRevision((r) => r + 1);
    }
    if (drawingRef.current?.active) {
      drawingRef.current = null;
      pushHistorySnapshot();
      setCanvasRevision((r) => r + 1);
    }
  };

  const handleClearLayer = (id: LayerId) => {
    const canvas = getLayerCanvas(id);
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    pushHistorySnapshot();
    setCanvasRevision((r) => r + 1);
  };

  const handleNewBlankCartoon = async () => {
    await clearStudioDraft(CARTOON_DRAFT_KEY_V2);
    await clearStudioDraft(CARTOON_DRAFT_KEY_V1);
    (['pencil', 'color', 'ink'] as LayerId[]).forEach((id) => {
      const c = getLayerCanvas(id);
      c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    });
    setSceneItems([]);
    setSelectedItemUid(null);
    setBubbles([]);
    setSelectedBubbleId(null);
    setRefPhotoBlob(null);
    setRefPhotoImg(null);
    if (refPhotoUrl) URL.revokeObjectURL(refPhotoUrl);
    setRefPhotoUrl(null);
    setActiveChart('none');
    setPostTitle('');
    setPostCaption('');
    setConfirmClearAll(false);
    setDraftSavedAt(null);
    pushHistorySnapshot([], []);
    setCanvasRevision((r) => r + 1);
    onToast(tr('Karatasi mpya tupu iko tayari kuchora.', 'Fresh blank cartoon canvas ready.'));
  };

  const handleAddCartoonAsset = (asset: CartoonAssetDef) => {
    const offsetStep = (sceneItems.length % 5) * 3 - 6;
    const newItem: CartoonSceneItem = {
      uid: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      assetId: asset.id,
      xPct: Math.max(15, Math.min(85, 50 + offsetStep)),
      yPct: Math.max(15, Math.min(85, 52 + offsetStep)),
      widthPct: asset.defaultW,
      heightPct: asset.defaultH,
      rotationDeg: 0,
      flipX: false,
      opacity: 1,
      primaryColor: asset.primaryColor,
      secondaryColor: asset.secondaryColor,
      skinColor: asset.skinColor,
      labelText: asset.defaultLabelText,
      textColor: '#0F172A',
      strokeWidthScale: 1,
      locked: false,
    };
    const nextItems = [...sceneItems, newItem];
    setSceneItems(nextItems);
    setSelectedItemUid(newItem.uid);
    setSelectedBubbleId(null);
    setTool('select_item');
    pushHistorySnapshot(nextItems, bubbles);
    setCanvasRevision((r) => r + 1);
    onToast(tr(`Imeongezwa: ${asset.titleSw}`, `Added: ${asset.titleEn}`));
  };

  const handleApplySceneCombo = (combo: CartoonSceneCombo, append = false) => {
    const baseTime = Date.now();
    const newItems: CartoonSceneItem[] = combo.items.map((it, idx) => ({
      ...it,
      uid: `combo_${baseTime}_${idx}`,
    }));
    const newBubbles: CartoonBubble[] = combo.bubbles.map((b, idx) => ({
      id: `cb_${baseTime}_${idx}`,
      kind: b.kind,
      text: b.text,
      xPct: b.xPct,
      yPct: b.yPct,
      widthPct: b.widthPct,
      fontSize: b.fontSize,
      tailSide: b.tailSide,
    }));
    const mergedItems = append ? [...sceneItems, ...newItems] : newItems;
    const mergedBubbles = append ? [...bubbles, ...newBubbles] : newBubbles;
    if (!append) setPaperTint(combo.paperTint);
    setSceneItems(mergedItems);
    setBubbles(mergedBubbles);
    setSelectedItemUid(newItems[0]?.uid || null);
    setSelectedBubbleId(null);
    setTool('select_item');
    pushHistorySnapshot(mergedItems, mergedBubbles);
    setCanvasRevision((r) => r + 1);
    onToast(tr(`Mchanganyiko umewekwa: ${combo.titleSw}`, `Scene loaded: ${combo.titleEn}`));
  };

  const updateSelectedItem = (patch: Partial<CartoonSceneItem>) => {
    if (!selectedItemUid) return;
    setSceneItems((prev) =>
      prev.map((item) => (item.uid === selectedItemUid ? { ...item, ...patch } : item))
    );
  };

  const moveSelectedItemLayer = (dir: 'up' | 'down' | 'top' | 'bottom') => {
    if (!selectedItemUid) return;
    const idx = sceneItems.findIndex((i) => i.uid === selectedItemUid);
    if (idx < 0) return;
    const next = [...sceneItems];
    const [picked] = next.splice(idx, 1);
    if (dir === 'up') next.splice(Math.min(next.length, idx + 1), 0, picked);
    else if (dir === 'down') next.splice(Math.max(0, idx - 1), 0, picked);
    else if (dir === 'top') next.push(picked);
    else next.unshift(picked);
    setSceneItems(next);
    pushHistorySnapshot(next, bubbles);
    setCanvasRevision((r) => r + 1);
  };

  const duplicateSelectedItem = () => {
    const sel = sceneItems.find((i) => i.uid === selectedItemUid);
    if (!sel) return;
    const copy: CartoonSceneItem = {
      ...sel,
      uid: `item_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      xPct: Math.min(92, sel.xPct + 5),
      yPct: Math.min(92, sel.yPct + 5),
      locked: false,
    };
    const next = [...sceneItems, copy];
    setSceneItems(next);
    setSelectedItemUid(copy.uid);
    pushHistorySnapshot(next, bubbles);
    setCanvasRevision((r) => r + 1);
  };

  const deleteSelectedItem = () => {
    if (!selectedItemUid) return;
    const next = sceneItems.filter((i) => i.uid !== selectedItemUid);
    setSceneItems(next);
    setSelectedItemUid(null);
    pushHistorySnapshot(next, bubbles);
    setCanvasRevision((r) => r + 1);
  };

  const handleAddBubble = (kind: BubbleKind) => {
    const id = `bubble_${Date.now()}`;
    const defaultText =
      kind === 'thought'
        ? '!?'
        : kind === 'shout'
          ? 'OYEEE!'
          : kind === 'banner'
            ? 'MAONI YA KATUNI'
            : kind === 'free_text'
              ? 'ANDIKA POPOTE HAPA'
              : 'KWANI VIPI?';
    const nextBubble: CartoonBubble = {
      id,
      kind,
      text: defaultText,
      xPct: 50,
      yPct: 22,
      widthPct: kind === 'banner' ? 42 : 26,
      fontSize: kind === 'thought' ? 44 : 32,
      tailSide: 'left',
      textColor: '#0F172A',
    };
    const nextBubbles = [...bubbles, nextBubble];
    setBubbles(nextBubbles);
    setSelectedBubbleId(id);
    setSelectedItemUid(null);
    setTool('select_item');
    pushHistorySnapshot(sceneItems, nextBubbles);
    setCanvasRevision((r) => r + 1);
  };

  const handleUploadRefPhoto = (file: File | null) => {
    if (!file) return;
    void (async () => {
      const loaded = await blobToImageElement(file);
      if (!loaded) {
        onToast(tr('Imeshindwa kupakia picha ya kurejelea.', 'Failed to load reference photo.'));
        return;
      }
      if (refPhotoUrl) URL.revokeObjectURL(refPhotoUrl);
      setRefPhotoBlob(file);
      setRefPhotoUrl(loaded.objectUrl);
      setRefPhotoImg(loaded.img);
      setShowRefPhoto(true);
      onToast(
        tr(
          'Picha ya kurejelea imewekwa chini — tumia Penseli & Wino kuchora kwa mkono juu yake.',
          'Reference photo placed below — sketch & ink over it by hand.'
        )
      );
    })();
  };

  const autoCartoonTexts = useMemo(() => {
    const cleanTexts = bubbles
      .map((b) => ({ kind: b.kind, text: b.text.trim() }))
      .filter((b) => b.text.length > 0 && b.text !== 'ANDIKA POPOTE HAPA');
    const banner = cleanTexts.find((b) => b.kind === 'banner');
    const first = cleanTexts[0];
    const autoTitle = (banner?.text || first?.text || tr('Katuni ya Siku · Malosha Forums', 'Editorial Cartoon · Malosha Forums')).slice(0, 140);
    const bubbleLines = cleanTexts.map((b) => b.text);
    const autoCaption =
      bubbleLines.join('\n\n') ||
      tr('Katuni ya maoni iliyotengenezwa ndani ya Studio ya Malosha Forums.', 'Editorial cartoon created in Malosha Forums Studio.');
    return { autoTitle, autoCaption, bubbleLines };
  }, [bubbles, tr]);

  useEffect(() => {
    if (!hasCustomTitle) {
      setPostTitle(autoCartoonTexts.autoTitle);
    }
  }, [hasCustomTitle, autoCartoonTexts.autoTitle]);

  useEffect(() => {
    if (!hasCustomCaption) {
      setPostCaption(autoCartoonTexts.autoCaption);
    }
  }, [hasCustomCaption, autoCartoonTexts.autoCaption]);

  const exportCleanPngBlob = useCallback(async (): Promise<Blob> => {
    const dims = ASPECT_DIMENSIONS[aspect];
    const offscreen = document.createElement('canvas');
    offscreen.width = dims.width;
    offscreen.height = dims.height;
    compositeCanvas(true, offscreen);
    const blob = await new Promise<Blob | null>((resolve) =>
      offscreen.toBlob(resolve, 'image/png', 1)
    );
    if (!blob) throw new Error('Imeshindwa kutengeneza picha ya katuni.');
    return blob;
  }, [aspect, compositeCanvas]);

  const syncCartoonToMakalaBridge = useCallback(
    async (options?: { saveHistory?: boolean; uploadedImageUrl?: string; existingBlob?: Blob }) => {
      try {
        const blob = options?.existingBlob || (await exportCleanPngBlob());
        const cleanTitle = (postTitle.trim() || autoCartoonTexts.autoTitle).slice(0, 140);
        const bodyDraft = buildStudioMakalaBody({
          headline: cleanTitle,
          subheadline: hasCustomCaption && postCaption.trim() ? postCaption.trim() : autoCartoonTexts.autoCaption,
          bubbles: autoCartoonTexts.bubbleLines,
        });
        await saveStudioMakalaSnapshot(
          {
            id: 'latest_cartoon',
            source: 'cartoon',
            title: cleanTitle,
            subheadline: postCaption.trim() || autoCartoonTexts.autoCaption,
            bodyDraft,
            tags: parseTagsInput(postTagsRaw),
            imageBlob: blob,
            ...(options?.uploadedImageUrl ? { uploadedImageUrl: options.uploadedImageUrl } : {}),
            updatedAt: Date.now(),
          },
          options?.saveHistory ? { saveHistory: true } : undefined
        );
      } catch {
        // Ignore bridge background sync errors
      }
    },
    [exportCleanPngBlob, postTitle, postCaption, hasCustomCaption, autoCartoonTexts, postTagsRaw]
  );

  useEffect(() => {
    if (!draftHydratedRef.current) return;
    const timer = window.setTimeout(() => {
      void syncCartoonToMakalaBridge();
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [syncCartoonToMakalaBridge, canvasRevision]);

  const handleDownloadPng = async () => {
    setExporting(true);
    try {
      const blob = await exportCleanPngBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `malosha-katuni-${Date.now()}.png`;
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      await syncCartoonToMakalaBridge({ saveHistory: true, existingBlob: blob });
      onToast(tr('Katuni yako imepakuliwa (PNG)!', 'Your cartoon PNG has been downloaded!'));
    } catch {
      onToast(tr('Imeshindwa kupakua katuni.', 'Failed to export cartoon.'));
    } finally {
      setExporting(false);
    }
  };

  const handleShareCartoonAnywhere = async () => {
    setExporting(true);
    try {
      const blob = await exportCleanPngBlob();
      await syncCartoonToMakalaBridge({ saveHistory: true, existingBlob: blob });
      const file = new File([blob], `malosha-katuni-${Date.now()}.png`, { type: 'image/png' });
      const chosenTitle = postTitle.trim() || autoCartoonTexts.autoTitle;
      const chosenCaption = postCaption.trim() || autoCartoonTexts.autoCaption;
      const shareText = [chosenTitle, chosenCaption !== chosenTitle ? chosenCaption : '', 'https://maloshaforums.web.app']
        .filter(Boolean)
        .join('\n\n');

      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        (!navigator.canShare || navigator.canShare({ files: [file] }))
      ) {
        await navigator.share({
          files: [file],
          title: chosenTitle,
          text: shareText,
        });
        onToast(tr('Katuni imeshirikiwa kikamilifu!', 'Cartoon shared successfully!'));
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText).catch(() => {});
      }
      onToast(
        tr(
          'Katuni imepakuliwa na maelezo yamenakiliwa — tuma WhatsApp, Facebook au X.',
          'Cartoon downloaded and caption copied — upload to WhatsApp, Facebook, or X.'
        )
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      onToast(tr('Imeshindwa kushare katuni.', 'Failed to share cartoon.'));
    } finally {
      setExporting(false);
    }
  };

  const handleSendCartoonToMakala = async () => {
    if (sendingToMakala) return;
    setSendingToMakala(true);
    try {
      const blob = await exportCleanPngBlob();
      await syncCartoonToMakalaBridge({ saveHistory: true, existingBlob: blob });
      setPendingStudioMakalaImportId('latest_cartoon');
      onToast(
        tr(
          'Inafungua Makala — katuni na maelezo yatajijaza kiotomatiki!',
          'Opening Makala — cartoon & notes will auto-fill!'
        )
      );
      if (onNavigateBoard) {
        onNavigateBoard('Makala');
      }
    } catch {
      onToast(tr('Imeshindwa kutuma katuni kwenda Makala.', 'Failed to send cartoon to Makala.'));
    } finally {
      setSendingToMakala(false);
    }
  };

  const handlePublishCartoon = async () => {
    if (publishing) return;
    setPublishing(true);
    try {
      const blob = await exportCleanPngBlob();
      const file = new File([blob], `malosha-katuni-${Date.now()}.png`, { type: 'image/png' });
      const coverUrl = await uploadImageToCloudinary(file);
      const tags = parseTagsInput(postTagsRaw);
      const chosenTitle = postTitle.trim() || autoCartoonTexts.autoTitle;
      const chosenBody = postCaption.trim() || autoCartoonTexts.autoCaption;
      const createdId = await onPublishToPlatform({
        title: chosenTitle,
        body: chosenBody,
        category: publishBoard,
        tags,
        coverImage: coverUrl,
      });
      await syncCartoonToMakalaBridge({
        saveHistory: true,
        existingBlob: blob,
        uploadedImageUrl: coverUrl,
      });
      onToast(tr(`Katuni imechapishwa kwenye ${publishBoard}!`, `Cartoon published to ${publishBoard}!`));
      if (createdId && onOpenPublishedTopic) {
        onOpenPublishedTopic(createdId);
      } else if (onNavigateBoard) {
        onNavigateBoard(publishBoard);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : tr('Imeshindwa kuchapisha katuni.', 'Failed to publish cartoon.');
      onToast(msg);
    } finally {
      setPublishing(false);
    }
  };

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: CARTOON_CATALOG.length };
    for (const item of CARTOON_CATALOG) {
      counts[item.category] = (counts[item.category] || 0) + 1;
    }
    return counts;
  }, []);

  const filteredCatalog = useMemo(() => {
    const q = libSearch.trim().toLowerCase();
    return CARTOON_CATALOG.filter((asset) => {
      if (libCategory !== 'all' && asset.category !== libCategory) return false;
      if (!q) return true;
      return (
        asset.titleSw.toLowerCase().includes(q) ||
        asset.titleEn.toLowerCase().includes(q) ||
        asset.keywords.toLowerCase().includes(q) ||
        asset.defaultLabelText.toLowerCase().includes(q)
      );
    });
  }, [libCategory, libSearch]);

  const visibleCatalog = useMemo(
    () => filteredCatalog.slice(0, libVisibleCount),
    [filteredCatalog, libVisibleCount]
  );

  const selectedBubble = bubbles.find((b) => b.id === selectedBubbleId) || null;
  const selectedItem = sceneItems.find((i) => i.uid === selectedItemUid) || null;
  const selectedItemDef = selectedItem ? CARTOON_CATALOG_MAP.get(selectedItem.assetId) : null;

  const drawingTools: { id: DrawingToolId; labelSw: string; labelEn: string; icon: React.ReactNode }[] = [
    { id: 'select_item', labelSw: 'Chagua / Sogeza', labelEn: 'Move / Edit', icon: <MousePointer className="h-3.5 w-3.5" /> },
    { id: 'pencil', labelSw: 'Penseli', labelEn: 'Pencil', icon: <PenTool className="h-3.5 w-3.5" /> },
    { id: 'ink', labelSw: 'Wino (G-Pen)', labelEn: 'Ink Nib', icon: <PenTool className="h-3.5 w-3.5" /> },
    { id: 'marker', labelSw: 'Brashi Nene', labelEn: 'Marker', icon: <Brush className="h-3.5 w-3.5" /> },
    { id: 'wash', labelSw: 'Rangi ya Maji', labelEn: 'Watercolor', icon: <Brush className="h-3.5 w-3.5" /> },
    { id: 'hatch', labelSw: 'Kivuli ///', labelEn: 'Hatching', icon: <Grid className="h-3.5 w-3.5" /> },
    { id: 'fill', labelSw: 'Jaza Rangi', labelEn: 'Fill', icon: <PaintBucket className="h-3.5 w-3.5" /> },
    { id: 'line', labelSw: 'Mstari', labelEn: 'Line', icon: <Minus className="h-3.5 w-3.5" /> },
    { id: 'circle', labelSw: 'Duara', labelEn: 'Circle', icon: <Circle className="h-3.5 w-3.5" /> },
    { id: 'rect', labelSw: 'Bokisi', labelEn: 'Box', icon: <Square className="h-3.5 w-3.5" /> },
    { id: 'eraser', labelSw: 'Kifutio', labelEn: 'Eraser', icon: <Eraser className="h-3.5 w-3.5" /> },
    { id: 'eyedropper', labelSw: 'Chagua Rangi', labelEn: 'Picker', icon: <Pipette className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="space-y-4">
      <input
        ref={refPhotoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleUploadRefPhoto(e.target.files?.[0] || null);
          e.target.value = '';
        }}
      />

      {/* Top Studio Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-gradient-to-r from-[#0E2640] via-[#133356] to-[#1D4E89] p-4 text-white">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-slate-950 shadow-sm">
            <PenTool className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-display text-base font-extrabold tracking-tight sm:text-lg">
              {tr(
                `Studio ya Katuni (${CARTOON_CATALOG.length}+ Michoro Tayari & Mkono · Bila AI)`,
                `Editorial Cartoon Studio (${CARTOON_CATALOG.length}+ Ready Assets & Hand Drawing · Zero AI)`
              )}
            </h2>
            <p className="mt-0.5 text-xs text-sky-100/90">
              {tr(
                'Unganisha katuni za Rais, Uwanja, Barabara, Wananchi, Bendera, Magari, Kura & Siasa, hariri rangi na maneno popote, au chora kwa mkono.',
                'Combine ready cartoons (President, Stadium, Roads, Citizens, Flags, Govt Vehicles, Votes & Politicians), edit appearance & text anywhere, or draw by hand.'
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {draftSavedAt && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-200">
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr('Imehifadhiwa', 'Auto-saved')}</span>
            </span>
          )}

          <button
            type="button"
            onClick={() => setShowDwGuide((p) => !p)}
            className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
              showDwGuide
                ? 'border-amber-300 bg-amber-400 text-slate-950'
                : 'border-white/25 bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{tr('Dhana za Katuni DW', 'DW Concepts Guide')}</span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showDwGuide ? 'rotate-180' : ''}`} />
          </button>

          <button
            type="button"
            disabled={exporting}
            onClick={() => void handleDownloadPng()}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-amber-400 px-3.5 py-1.5 text-xs font-extrabold text-slate-950 shadow-sm hover:bg-amber-300 disabled:opacity-60"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span>{tr('Pakua Katuni (PNG)', 'Download PNG')}</span>
          </button>
        </div>
      </div>

      {/* Collapsible DW Cartoonist Concepts & Field Guide */}
      {showDwGuide && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-display text-sm font-bold text-slate-900 sm:text-base">
                {tr('Dhana 7 Kuu za Kuchora Katuni za Maoni (Mtindo wa DW)', '7 Core Concepts of DW Editorial Cartooning')}
              </h3>
              <p className="text-xs text-slate-600">
                {tr(
                  'Misingi halisi ya wachoraji wa katuni za kisiasa na kijamii bila kutumia AI — itumie kila unapoanza kuchora.',
                  'The real manual principles editorial & political cartoonists follow — apply these on your canvas.'
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowDwGuide(false)}
              className="min-h-[36px] rounded-lg border border-slate-200 px-3 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              {tr('Funga Mwongozo', 'Close Guide')}
            </button>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {DW_CARTOON_CONCEPTS.map((c) => (
              <div key={c.num} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                <p className="text-xs font-extrabold text-[#0E2640]">
                  {c.num}. {tr(c.titleSw, c.titleEn)}
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-700">
                  {tr(c.bodySw, c.bodyEn)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left 8 cols: Canvas + Tools + Selected Object Inspector + 570+ Library */}
        <div className="space-y-3 lg:col-span-8">
          {/* Row 1: Undo/Redo, Zoom, Layer blend & New Blank */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={!historyMeta.canUndo}
                onClick={handleUndo}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-100 disabled:opacity-40"
              >
                <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{tr('Tendua', 'Undo')}</span>
              </button>
              <button
                type="button"
                disabled={!historyMeta.canRedo}
                onClick={handleRedo}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-100 disabled:opacity-40"
              >
                <Redo2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{tr('Rudia', 'Redo')}</span>
              </button>

              <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />

              <button
                type="button"
                onClick={() => setZoomPct((z) => Math.max(100, z - 25))}
                disabled={zoomPct <= 100}
                aria-label={tr('Punguza ukubwa', 'Zoom out')}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 disabled:opacity-40"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[44px] text-center font-mono text-[11px] font-bold tabular-nums text-slate-700">
                {zoomPct}%
              </span>
              <button
                type="button"
                onClick={() => setZoomPct((z) => Math.min(250, z + 25))}
                disabled={zoomPct >= 250}
                aria-label={tr('Kuza ukurasa', 'Zoom in')}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 disabled:opacity-40"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={sceneBelowInk}
                  onChange={(e) => setSceneBelowInk(e.target.checked)}
                  className="h-3.5 w-3.5 rounded accent-[#0E2640]"
                />
                <span>{tr('Chora Wino Juu ya Katuni', 'Hand Ink Over Stamps')}</span>
              </label>

              {confirmClearAll ? (
                <>
                  <button
                    type="button"
                    onClick={() => void handleNewBlankCartoon()}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-800"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{tr('Thibitisha Futa Yote', 'Confirm Clear')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(false)}
                    className="min-h-[36px] rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700"
                  >
                    {tr('Ghairi', 'Cancel')}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(true)}
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{tr('Mchoro Mpya', 'New Blank')}</span>
                </button>
              )}
            </div>
          </div>

          {/* Row 2: Drawing & Object Manipulation Tools */}
          <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-slate-200 bg-white p-2 sm:grid-cols-6">
            {drawingTools.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => selectToolAndSmartLayer(t.id)}
                className={`flex min-h-[40px] items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold transition-colors ${
                  tool === t.id
                    ? 'bg-[#0E2640] text-amber-300 shadow-xs'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {t.icon}
                <span className="truncate">{tr(t.labelSw, t.labelEn)}</span>
              </button>
            ))}
          </div>

          {/* Row 3: Brush Colors & Size (when using drawing tools) */}
          {tool !== 'select_item' && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {CARTOON_SWATCHES.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setBrushColor(hex)}
                    aria-label={hex}
                    className={`h-6 w-6 rounded-full border-2 transition-transform ${
                      brushColor.toLowerCase() === hex.toLowerCase()
                        ? 'scale-110 border-[#0E2640] ring-2 ring-amber-400'
                        : 'border-slate-300'
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                ))}
                <input
                  type="color"
                  value={brushColor}
                  onChange={(e) => setBrushColor(e.target.value)}
                  title={tr('Chagua rangi yoyote', 'Custom color')}
                  className="h-6 w-7 cursor-pointer rounded border border-slate-300"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold tabular-nums text-slate-700">
                  {tr('Unene:', 'Size:')} {brushSize}px
                </span>
                <input
                  type="range"
                  min={2}
                  max={40}
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="w-24 accent-[#0E2640]"
                />
              </div>
            </div>
          )}

          {/* Interactive Canvas Stage */}
          <div className="max-h-[72vh] overflow-auto rounded-xl border-2 border-slate-900 bg-slate-800 p-1.5 shadow-inner">
            <div style={{ width: `${zoomPct}%`, margin: '0 auto' }}>
              <canvas
                ref={displayCanvasRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className={`block w-full touch-none rounded-lg shadow-md ${
                  tool === 'select_item'
                    ? 'cursor-grab active:cursor-grabbing'
                    : tool === 'fill' || tool === 'eyedropper'
                      ? 'cursor-pointer'
                      : 'cursor-crosshair'
                }`}
              />
            </div>
          </div>

          {/* Live Selected Cartoon Piece Editor (Appearance, Colors & Words) */}
          {selectedItem && selectedItemDef && (
            <div className="rounded-xl border border-sky-300 bg-sky-50/70 p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-extrabold text-[#0E2640]">
                    {tr('Hariri Katuni Iliyochaguliwa:', 'Edit Selected Cartoon:')}{' '}
                    {tr(selectedItemDef.titleSw, selectedItemDef.titleEn)}
                  </p>
                  <p className="text-[10px] text-slate-600">
                    {tr(
                      'Buruta katikati kusogeza, buruta kona ya bluu kukuza, au duara la njano kuzungusha.',
                      'Drag center to move, blue corner to resize, or yellow knob to rotate.'
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={() => updateSelectedItem({ flipX: !selectedItem.flipX })}
                    title={tr('Geuza Mwelekeo (Flip)', 'Flip Horizontal')}
                    className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-[11px] font-bold text-slate-800 hover:bg-slate-100"
                  >
                    <FlipHorizontal2 className="h-3.5 w-3.5" />
                    <span>{tr('Geuza', 'Flip')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSelectedItemLayer('up')}
                    title={tr('Peleka Mbele', 'Bring Forward')}
                    className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSelectedItemLayer('down')}
                    title={tr('Rudisha Nyuma', 'Send Backward')}
                    className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={duplicateSelectedItem}
                    title={tr('Rudufu', 'Duplicate')}
                    className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSelectedItem({ locked: !selectedItem.locked })}
                    title={selectedItem.locked ? tr('Fungua', 'Unlock') : tr('Funga mahali', 'Lock position')}
                    className={`flex h-[34px] w-[34px] items-center justify-center rounded-lg border ${
                      selectedItem.locked
                        ? 'border-amber-400 bg-amber-100 text-amber-900'
                        : 'border-slate-300 bg-white text-slate-800'
                    }`}
                  >
                    {selectedItem.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={deleteSelectedItem}
                    title={tr('Futa kipengele', 'Delete item')}
                    className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-rose-700 px-2.5 text-[11px] font-bold text-white hover:bg-rose-800"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{tr('Futa', 'Delete')}</span>
                  </button>
                </div>
              </div>

              {/* Editable Words inside Placard / Podium / Ballot Box / Car Plate / Sign */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700">
                    {tr('Maneno Ndani ya Mchoro (Bango/Gari/Sanduku/Jukwaa)', 'Words Inside Cartoon (Sign/Plate/Box)')}
                  </label>
                  <div className="mt-1 flex items-center gap-1.5">
                    <input
                      type="text"
                      maxLength={36}
                      value={selectedItem.labelText}
                      onChange={(e) => updateSelectedItem({ labelText: e.target.value })}
                      placeholder={tr('Andika chochote au acha tupu...', 'Type label or leave blank...')}
                      className="h-9 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-900 focus:border-[#0E2640] focus:outline-none"
                    />
                    <input
                      type="color"
                      value={selectedItem.textColor}
                      onChange={(e) => updateSelectedItem({ textColor: e.target.value })}
                      title={tr('Rangi ya Maneno', 'Text Color')}
                      className="h-9 w-9 cursor-pointer rounded-lg border border-slate-300 bg-white p-0.5"
                    />
                  </div>
                </div>

                {/* Color Customization: Primary, Secondary, Skin Tone */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block truncate text-[10px] font-bold text-slate-700">
                      {tr('Rangi Kuu', 'Main Color')}
                    </label>
                    <input
                      type="color"
                      value={selectedItem.primaryColor}
                      onChange={(e) => updateSelectedItem({ primaryColor: e.target.value })}
                      className="mt-1 h-9 w-full cursor-pointer rounded-lg border border-slate-300 bg-white p-0.5"
                    />
                  </div>
                  <div>
                    <label className="block truncate text-[10px] font-bold text-slate-700">
                      {tr('Rangi ya Pili', 'Accent')}
                    </label>
                    <input
                      type="color"
                      value={selectedItem.secondaryColor}
                      onChange={(e) => updateSelectedItem({ secondaryColor: e.target.value })}
                      className="mt-1 h-9 w-full cursor-pointer rounded-lg border border-slate-300 bg-white p-0.5"
                    />
                  </div>
                  <div>
                    <label className="block truncate text-[10px] font-bold text-slate-700">
                      {tr('Ngozi', 'Skin')}
                    </label>
                    <div className="mt-1 flex items-center gap-1">
                      <input
                        type="color"
                        value={selectedItem.skinColor}
                        onChange={(e) => updateSelectedItem({ skinColor: e.target.value })}
                        className="h-9 flex-1 cursor-pointer rounded-lg border border-slate-300 bg-white p-0.5"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Skin Quick Swatches + Sliders: Scale, Rotation, Opacity, Ink Stroke */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold text-slate-600">{tr('Ngozi Haraka:', 'Skin Presets:')}</span>
                {SKIN_TONE_SWATCHES.map((sk) => (
                  <button
                    key={sk}
                    type="button"
                    onClick={() => updateSelectedItem({ skinColor: sk })}
                    aria-label={sk}
                    className={`h-5 w-5 rounded-full border ${
                      selectedItem.skinColor.toLowerCase() === sk.toLowerCase()
                        ? 'border-[#0E2640] ring-2 ring-amber-400'
                        : 'border-slate-300'
                    }`}
                    style={{ backgroundColor: sk }}
                  />
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <label className="text-[10px] font-bold text-slate-700">
                  {tr('Ukubwa:', 'Size:')} {Math.round(selectedItem.widthPct)}%
                  <input
                    type="range"
                    min={8}
                    max={92}
                    value={Math.round(selectedItem.widthPct)}
                    onChange={(e) => {
                      const nextW = Number(e.target.value);
                      const ratio = selectedItem.heightPct / Math.max(1, selectedItem.widthPct);
                      updateSelectedItem({
                        widthPct: nextW,
                        heightPct: Math.max(8, Math.min(92, nextW * ratio)),
                      });
                    }}
                    className="mt-1 w-full accent-[#0E2640]"
                  />
                </label>

                <label className="text-[10px] font-bold text-slate-700">
                  {tr('Zungusha:', 'Rotate:')} {Math.round(selectedItem.rotationDeg)}°
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    value={Math.round(selectedItem.rotationDeg)}
                    onChange={(e) => updateSelectedItem({ rotationDeg: Number(e.target.value) })}
                    className="mt-1 w-full accent-[#0E2640]"
                  />
                </label>

                <label className="text-[10px] font-bold text-slate-700">
                  {tr('Uwazi:', 'Opacity:')} {Math.round(selectedItem.opacity * 100)}%
                  <input
                    type="range"
                    min={20}
                    max={100}
                    value={Math.round(selectedItem.opacity * 100)}
                    onChange={(e) => updateSelectedItem({ opacity: Number(e.target.value) / 100 })}
                    className="mt-1 w-full accent-[#0E2640]"
                  />
                </label>

                <label className="text-[10px] font-bold text-slate-700">
                  {tr('Wino:', 'Ink Weight:')} {selectedItem.strokeWidthScale.toFixed(1)}x
                  <input
                    type="range"
                    min={0.6}
                    max={2.2}
                    step={0.1}
                    value={selectedItem.strokeWidthScale}
                    onChange={(e) => updateSelectedItem({ strokeWidthScale: Number(e.target.value) })}
                    className="mt-1 w-full accent-[#0E2640]"
                  />
                </label>
              </div>
            </div>
          )}

          {/* 570+ Political & Editorial Cartoon Asset Library Browser */}
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="flex items-center gap-1.5 font-display text-sm font-extrabold text-slate-900">
                  <Sparkles className="h-4 w-4 text-amber-600" aria-hidden="true" />
                  <span>
                    {tr(
                      `Maktaba ya Katuni Tayari (${CARTOON_CATALOG.length} Michoro Tofauti · Bila AI)`,
                      `Ready Political Cartoon Library (${CARTOON_CATALOG.length} Unique Assets · Zero AI)`
                    )}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-600">
                  {tr(
                    'Bonyeza mchoro wowote kuuweka kwenye karatasi, kisha unganisha na kuhariri rangi au maneno yake.',
                    'Tap any cartoon to place it on canvas, combine pieces, and edit appearance or words.'
                  )}
                </p>
              </div>

              {/* Search Input */}
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={libSearch}
                  onChange={(e) => {
                    setLibSearch(e.target.value);
                    setLibVisibleCount(LIBRARY_PAGE_SIZE);
                  }}
                  placeholder={tr('Tafuta: rais, uwanja, barabara, kura...', 'Search: president, stadium, road...')}
                  className="h-9 w-full rounded-lg border border-slate-300 bg-slate-50 pl-8 pr-3 text-xs text-slate-900 focus:border-[#0E2640] focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            {/* Starter Multi-Piece Scene Combos */}
            <div className="space-y-1.5 border-t border-slate-100 pt-2.5">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                {tr('Matukio ya Kuanzia Haraka (Unganisha & Hariri Kila Kipande)', 'Starter Editable Scene Combos')}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {CARTOON_SCENE_COMBOS.map((combo) => (
                  <div
                    key={combo.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/80 p-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-900">
                        {tr(combo.titleSw, combo.titleEn)}
                      </p>
                      <p className="truncate text-[10px] text-slate-600">
                        {tr(combo.descSw, combo.descEn)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleApplySceneCombo(combo, false)}
                      className="shrink-0 rounded-lg bg-[#0E2640] px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-[#16395E]"
                    >
                      {tr('Pakia', 'Load')}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* 13 Category Filter Tabs */}
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {CARTOON_CATEGORIES.map((cat) => {
                const isActive = libCategory === cat.id;
                const cnt = categoryCounts[cat.id] || 0;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setLibCategory(cat.id);
                      setLibVisibleCount(LIBRARY_PAGE_SIZE);
                    }}
                    className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold tabular-nums transition-colors ${
                      isActive
                        ? 'border-[#0E2640] bg-[#0E2640] text-amber-300'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {tr(cat.labelSw, cat.labelEn)} ({cnt})
                  </button>
                );
              })}
            </div>

            {/* Paginated Cartoon Grid */}
            {visibleCatalog.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 py-8 text-center text-xs text-slate-500">
                {tr('Hakuna mchoro uliolingana na utafutaji huo.', 'No cartoon assets match your search.')}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {visibleCatalog.map((asset) => {
                    const thumbUrl = getCartoonThumbnailDataUrl(asset);
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => handleAddCartoonAsset(asset)}
                        className="group flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-50/70 p-2 text-left transition-colors hover:border-[#0E2640] hover:bg-sky-50/40"
                      >
                        <div className="flex h-20 w-full items-center justify-center overflow-hidden rounded-md bg-[#FAF6EA] p-1">
                          {thumbUrl ? (
                            <img
                              src={thumbUrl}
                              alt={tr(asset.titleSw, asset.titleEn)}
                              className="h-full w-full object-contain transition-transform group-hover:scale-105"
                              loading="lazy"
                            />
                          ) : null}
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-[11px] font-bold leading-snug text-slate-900">
                          {tr(asset.titleSw, asset.titleEn)}
                        </p>
                        <span className="mt-auto pt-1 text-[10px] font-bold text-[#0E2640]">
                          + {tr('Weka Kwenye Karatasi', 'Add to Canvas')}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {filteredCatalog.length > visibleCatalog.length && (
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setLibVisibleCount((c) => c + LIBRARY_PAGE_SIZE)}
                      className="min-h-[38px] rounded-lg border border-slate-300 bg-slate-50 px-4 py-1.5 text-xs font-bold tabular-nums text-slate-800 hover:bg-slate-100"
                    >
                      {tr(
                        `Onyesha Zaidi (${visibleCatalog.length} / ${filteredCatalog.length})`,
                        `Load More (${visibleCatalog.length} / ${filteredCatalog.length})`
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setLibVisibleCount(filteredCatalog.length)}
                      className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold tabular-nums text-[#0E2640] hover:bg-sky-50"
                    >
                      {tr(`Zote (${filteredCatalog.length})`, `Show All (${filteredCatalog.length})`)}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right 4 cols: Text Anywhere / Bubbles, Schart Guides, Layers, Paper, Publish */}
        <div className="space-y-3 lg:col-span-4">
          {/* 1. Maneno Popote & Mabubble (!?) */}
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5">
            <h3 className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-900">
              <Type className="h-3.5 w-3.5 text-[#0E2640]" aria-hidden="true" />
              <span>{tr('1. Maneno Popote & Mabubble (!?)', '1. Place Text Anywhere & Bubbles')}</span>
            </h3>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => handleAddBubble('free_text')}
                className="inline-flex min-h-[38px] items-center justify-center gap-1 rounded-lg bg-[#0E2640] px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-[#16395E]"
              >
                <Type className="h-3.5 w-3.5" /> + {tr('Maandishi Huru', 'Free Text')}
              </button>
              <button
                type="button"
                onClick={() => handleAddBubble('speech')}
                className="inline-flex min-h-[38px] items-center justify-center gap-1 rounded-lg bg-sky-50 px-2.5 py-1.5 text-[11px] font-bold text-sky-900 ring-1 ring-sky-200 hover:bg-sky-100"
              >
                <Plus className="h-3.5 w-3.5" /> {tr('Maneno (Speech)', 'Speech Bubble')}
              </button>
              <button
                type="button"
                onClick={() => handleAddBubble('thought')}
                className="inline-flex min-h-[38px] items-center justify-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100"
              >
                <MessageCircle className="h-3.5 w-3.5" /> + {tr('Wazo (!?)', 'Thought (!?)')}
              </button>
              <button
                type="button"
                onClick={() => handleAddBubble('banner')}
                className="inline-flex min-h-[38px] items-center justify-center gap-1 rounded-lg bg-yellow-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-900 ring-1 ring-yellow-300 hover:bg-yellow-200"
              >
                + {tr('Kichwa / Bango', 'Headline Banner')}
              </button>
            </div>

            {selectedBubble && (
              <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/60 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-800">
                    {tr('Hariri Maneno (Buruta popote)', 'Edit Selected Text (Drag anywhere)')}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const nextB = bubbles.filter((b) => b.id !== selectedBubble.id);
                      setBubbles(nextB);
                      setSelectedBubbleId(null);
                      pushHistorySnapshot(sceneItems, nextB);
                    }}
                    className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800"
                  >
                    {tr('Futa', 'Delete')}
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={selectedBubble.text}
                  onChange={(e) =>
                    setBubbles((prev) =>
                      prev.map((b) => (b.id === selectedBubble.id ? { ...b, text: e.target.value } : b))
                    )
                  }
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="range"
                    min={18}
                    max={84}
                    value={selectedBubble.fontSize}
                    onChange={(e) =>
                      setBubbles((prev) =>
                        prev.map((b) =>
                          b.id === selectedBubble.id ? { ...b, fontSize: Number(e.target.value) } : b
                        )
                      )
                    }
                    className="flex-1 accent-[#0E2640]"
                  />
                  <input
                    type="color"
                    value={selectedBubble.textColor || '#0F172A'}
                    onChange={(e) =>
                      setBubbles((prev) =>
                        prev.map((b) =>
                          b.id === selectedBubble.id ? { ...b, textColor: e.target.value } : b
                        )
                      )
                    }
                    title={tr('Rangi ya Maandishi', 'Text Color')}
                    className="h-7 w-7 cursor-pointer rounded border border-slate-300 bg-white"
                  />
                  {selectedBubble.kind !== 'free_text' && (
                    <button
                      type="button"
                      onClick={() =>
                        setBubbles((prev) =>
                          prev.map((b) =>
                            b.id === selectedBubble.id
                              ? { ...b, tailSide: b.tailSide === 'left' ? 'right' : 'left' }
                              : b
                          )
                        )
                      }
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-[10px] font-bold text-slate-700"
                    >
                      {tr('Geuza Mkia', 'Flip Tail')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 2. Sketch Charts ("Schart") & Reference Photo Underlay */}
          <div className="rounded-xl border border-amber-200 bg-white p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-900">
                <Grid className="h-3.5 w-3.5 text-[#D97706]" aria-hidden="true" />
                <span>{tr('2. Schart za Msaada (Guides)', '2. Tracing Sketch Charts')}</span>
              </h3>
              {activeChart !== 'none' && (
                <button
                  type="button"
                  onClick={handleStampChartToPencilLayer}
                  className="rounded-md bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-950 hover:bg-amber-200"
                >
                  {tr('Chapa kwenye Penseli', 'Stamp to Pencil')}
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { id: 'none', sw: 'Karatasi Tupu', en: 'Clean Paper' },
                  { id: 'head_caricature', sw: 'Schart: Kichwa (DW)', en: 'Chart: Head Ratio' },
                  { id: 'body_proportions', sw: 'Schart: Mwili & Mkao', en: 'Chart: Body Poses' },
                  { id: 'expressions', sw: 'Schart: Hisia 6 & Miwani', en: 'Chart: 6 Expressions' },
                  { id: 'perspective_thirds', sw: 'Schart: Gridi & Mtazamo', en: 'Chart: Perspective' },
                ] as { id: SketchChartId; sw: string; en: string }[]
              ).map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => setActiveChart(ch.id)}
                  className={`rounded-lg border px-2 py-1.5 text-left text-[11px] font-bold transition-colors ${
                    activeChart === ch.id
                      ? 'border-[#0E2640] bg-[#0E2640] text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {tr(ch.sw, ch.en)}
                </button>
              ))}
            </div>

            <div className="border-t border-slate-100 pt-2.5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => refPhotoInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-800 hover:bg-slate-100"
                >
                  <ImagePlus className="h-3.5 w-3.5 text-[#0E2640]" aria-hidden="true" />
                  <span>{tr('Picha ya Kuangalizia (Trace)', 'Trace Reference Photo')}</span>
                </button>
                {refPhotoImg && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowRefPhoto((p) => !p)}
                      className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-700"
                    >
                      {showRefPhoto ? tr('Ficha', 'Hide') : tr('Onyesha', 'Show')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRefPhotoBlob(null);
                        setRefPhotoImg(null);
                        if (refPhotoUrl) URL.revokeObjectURL(refPhotoUrl);
                        setRefPhotoUrl(null);
                      }}
                      className="rounded-md bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700"
                    >
                      {tr('Ondoa', 'Remove')}
                    </button>
                  </div>
                )}
              </div>
              {refPhotoImg && showRefPhoto && (
                <label className="block text-[11px] font-bold text-slate-600">
                  {tr('Ukungu wa Picha:', 'Reference Opacity:')} {refPhotoOpacity}%
                  <input
                    type="range"
                    min={10}
                    max={75}
                    value={refPhotoOpacity}
                    onChange={(e) => setRefPhotoOpacity(Number(e.target.value))}
                    className="mt-1 w-full accent-[#0E2640]"
                  />
                </label>
              )}
            </div>
          </div>

          {/* 3. 3-Layer Cartoonist Stack */}
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5">
            <h3 className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-900">
              <Layers className="h-3.5 w-3.5 text-[#0E2640]" aria-hidden="true" />
              <span>{tr('3. Tabaka 3 za Kuchora (Layers)', '3. 3 Drawing Layers')}</span>
            </h3>

            {(
              [
                {
                  id: 'ink' as LayerId,
                  nameSw: 'Wino Mweusi (Juu)',
                  nameEn: 'Ink Lineart (Top)',
                  descSw: 'Mistari ya mwisho na mipaka ya katuni',
                  descEn: 'Final crisp comic outlines',
                },
                {
                  id: 'color' as LayerId,
                  nameSw: 'Rangi & Kivuli (Kati)',
                  nameEn: 'Color & Wash (Under Ink)',
                  descSw: 'Rangi chini ya wino bila kufunika mistari',
                  descEn: 'Watercolor & fills safely below ink',
                },
                {
                  id: 'pencil' as LayerId,
                  nameSw: 'Penseli ya Mchoro (Chini)',
                  nameEn: 'Pencil Sketch (Base)',
                  descSw: 'Mchoro wa mwanzo wa kupima uwiano',
                  descEn: 'Rough underdrawing guide',
                },
              ]
            ).map((layer) => {
              const isAct = activeLayer === layer.id;
              const vis = layerVisibility[layer.id];
              return (
                <div
                  key={layer.id}
                  className={`flex items-center justify-between gap-2 rounded-lg border p-2 transition-colors ${
                    isAct ? 'border-[#0E2640] bg-sky-50/70' : 'border-slate-200 bg-slate-50/50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setActiveLayer(layer.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-xs font-bold text-slate-900">
                      {tr(layer.nameSw, layer.nameEn)}
                    </p>
                    <p className="truncate text-[10px] text-slate-500">
                      {tr(layer.descSw, layer.descEn)}
                    </p>
                  </button>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setLayerVisibility((prev) => ({ ...prev, [layer.id]: !prev[layer.id] }))
                      }
                      aria-label={tr('Onyesha au ficha tabaka', 'Toggle visibility')}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                    >
                      {vis ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-slate-400" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleClearLayer(layer.id)}
                      aria-label={tr('Futa tabaka hili', 'Clear this layer')}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-rose-700 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px]">
              <label className="inline-flex cursor-pointer items-center gap-1.5 font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={hidePencilOnExport}
                  onChange={(e) => setHidePencilOnExport(e.target.checked)}
                  className="h-3.5 w-3.5 rounded accent-[#0E2640]"
                />
                <span>{tr('Ficha Penseli ukipakua', 'Hide Pencil on Export')}</span>
              </label>
              <span className="font-mono text-[10px] tabular-nums text-slate-500">
                {tr('Penseli:', 'Pencil:')} {pencilOpacity}%
              </span>
            </div>
            <input
              type="range"
              min={15}
              max={100}
              value={pencilOpacity}
              onChange={(e) => setPencilOpacity(Number(e.target.value))}
              className="w-full accent-[#0E2640]"
            />
          </div>

          {/* 4. Paper Size, Tint, Emblem & Signature */}
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
              {tr('4. Karatasi, Nembo & Saini', '4. Paper, Emblem & Signature')}
            </h3>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                {(Object.keys(ASPECT_DIMENSIONS) as CartoonAspect[]).map((asp) => (
                  <button
                    key={asp}
                    type="button"
                    onClick={() => setAspect(asp)}
                    className={`rounded-md px-2 py-1 text-[11px] font-bold ${
                      aspect === asp
                        ? 'bg-[#0E2640] text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {asp}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                {PAPER_TINTS.map((pt) => (
                  <button
                    key={pt.hex}
                    type="button"
                    title={tr(pt.nameSw, pt.nameEn)}
                    onClick={() => setPaperTint(pt.hex)}
                    className={`h-6 w-6 rounded-md border-2 ${
                      paperTint === pt.hex ? 'border-[#0E2640] ring-1 ring-amber-400' : 'border-slate-300'
                    }`}
                    style={{ backgroundColor: pt.hex }}
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2">
              <div>
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-700">
                  <span>{tr('Nembo', 'Emblem')}</span>
                  <button
                    type="button"
                    onClick={() => setShowCornerBadge((p) => !p)}
                    className="text-[#0E2640] underline"
                  >
                    {showCornerBadge ? tr('Ficha', 'Hide') : tr('Onyesha', 'Show')}
                  </button>
                </div>
                <input
                  type="text"
                  maxLength={6}
                  value={cornerBadgeText}
                  onChange={(e) => setCornerBadgeText(e.target.value)}
                  className="mt-1 h-8 w-full rounded-lg border border-slate-300 px-2 text-xs font-bold text-slate-900"
                />
              </div>
              <div>
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-700">
                  <span>{tr('Saini', 'Signature')}</span>
                  <button
                    type="button"
                    onClick={() => setShowSignature((p) => !p)}
                    className="text-[#0E2640] underline"
                  >
                    {showSignature ? tr('Ficha', 'Hide') : tr('Onyesha', 'Show')}
                  </button>
                </div>
                <input
                  type="text"
                  maxLength={28}
                  value={signatureText}
                  onChange={(e) => setSignatureText(e.target.value)}
                  className="mt-1 h-8 w-full rounded-lg border border-slate-300 px-2 text-xs font-bold text-slate-900"
                />
              </div>
            </div>
          </div>

          {/* 5. Publish Directly to Malosha Forums */}
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
              {tr('5. Chapisha Jukwaani', '5. Publish to Malosha Forums')}
            </h3>
            <div className="grid grid-cols-3 gap-1.5">
              {(['Kijiweni', 'Fursa', 'Makala'] as PrimaryBoard[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setPublishBoard(b)}
                  className={`rounded-lg py-1.5 text-xs font-bold ${
                    publishBoard === b
                      ? 'bg-[#0E2640] text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-emerald-700">
                {!hasCustomTitle && !hasCustomCaption
                  ? tr('Inatumia maneno ya katuni yako kiotomatiki.', 'Auto-using your cartoon bubble text.')
                  : tr('Umehariri maneno hapa chini.', 'Custom caption active.')}
              </span>
              {(hasCustomTitle || hasCustomCaption) && (
                <button
                  type="button"
                  onClick={() => {
                    setHasCustomTitle(false);
                    setHasCustomCaption(false);
                    setPostTitle(autoCartoonTexts.autoTitle);
                    setPostCaption(autoCartoonTexts.autoCaption);
                  }}
                  className="text-[10px] font-bold text-[#0E2640] underline"
                >
                  {tr('Vuta kutoka Katuni', 'Sync Bubbles')}
                </button>
              )}
            </div>
            <input
              type="text"
              value={postTitle}
              maxLength={140}
              onChange={(e) => {
                setPostTitle(e.target.value);
                setHasCustomTitle(e.target.value.trim().length > 0 && e.target.value.trim() !== autoCartoonTexts.autoTitle);
              }}
              placeholder={tr('Kichwa cha katuni (kinatoka juu kiotomatiki)...', 'Cartoon headline (auto-filled)...')}
              className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs text-slate-900 focus:border-[#0E2640] focus:outline-none"
            />
            <textarea
              rows={2}
              value={postCaption}
              maxLength={publishBoard === 'Makala' ? 16000 : 8000}
              onChange={(e) => {
                setPostCaption(e.target.value);
                setHasCustomCaption(e.target.value.trim().length > 0 && e.target.value.trim() !== autoCartoonTexts.autoCaption);
              }}
              placeholder={tr('Ujumbe wa katuni kwa jamii (unatoka juu kiotomatiki)...', 'Commentary (auto-filled)...')}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-[#0E2640] focus:outline-none"
            />
            <input
              type="text"
              value={postTagsRaw}
              onChange={(e) => setPostTagsRaw(e.target.value)}
              placeholder="katuni, siasa, jamii"
              className="h-8 w-full rounded-lg border border-slate-300 px-3 text-[11px] text-slate-700"
            />

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                disabled={publishing}
                onClick={() => void handlePublishCartoon()}
                className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-extrabold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-60"
              >
                {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span>
                  {publishing
                    ? tr('Inachapisha...', 'Publishing...')
                    : tr(`Chapisha (${publishBoard})`, `Publish to ${publishBoard}`)}
                </span>
              </button>
              <button
                type="button"
                disabled={exporting}
                onClick={() => void handleShareCartoonAnywhere()}
                title={tr('Shiriki katuni na maneno popote', 'Share cartoon anywhere')}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-[#0E2640] px-3 text-xs font-bold text-white hover:bg-[#163A5F] disabled:opacity-60"
              >
                <Share2 className="h-4 w-4 text-amber-300" />
                <span>{tr('Share', 'Share')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  compositeCanvas(true);
                  onToast(tr('Umehakiki mwonekano safi wa kuchapisha.', 'Clean export previewed.'));
                  window.setTimeout(() => compositeCanvas(false), 1200);
                }}
                title={tr('Hakiki katuni safi bila mistari ya schart', 'Preview final without guide charts')}
                className="inline-flex min-h-[42px] items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 px-3 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                <Check className="h-4 w-4 text-emerald-700" />
              </button>
            </div>
            <button
              type="button"
              disabled={sendingToMakala}
              onClick={() => void handleSendCartoonToMakala()}
              className="inline-flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-lg border border-[#B80000] bg-red-50 px-3 py-1.5 text-xs font-bold text-[#B80000] hover:bg-red-100 disabled:opacity-60"
            >
              {sendingToMakala ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Newspaper className="h-3.5 w-3.5" />}
              <span>{tr('Andika Makala na Katuni Hii (Jaza Automatic)', 'Use in Makala Article (Auto-Fill)')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
