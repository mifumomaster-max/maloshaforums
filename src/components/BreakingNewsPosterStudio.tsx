import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AtSign,
  BadgeCheck,
  Check,
  ChevronDown,
  ChevronUp,
  CirclePlus,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Globe,
  Hand,
  ImagePlus,
  LayoutGrid,
  Loader2,
  Lock,
  MessageSquareQuote,
  Move,
  Newspaper,
  Palette,
  Send,
  Share2,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Type,
  Unlock,
  UserCircle2,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { uploadImageToCloudinary } from '../services/cloudinaryService';
import { PrimaryBoard, TopicCategory } from '../types';
import { parseTagsInput } from '../utils/formatters';

type PosterLayoutId =
  | 'bbc_classic'
  | 'portrait_transparent'
  | 'split_editorial'
  | 'diagonal_magazine'
  | 'framed_spotlight'
  | 'urgent_ticker'
  | 'social_quote_stage';

type PosterAspect = '5:6' | '3:4' | '1:1' | '4:5' | '4:3' | '16:9';
type HeadlineSize = 'small' | 'normal' | 'large' | 'xlarge';
type FontStyleId = 'sans' | 'serif';
type PublishMode = 'image_only' | 'with_text';
type XVerifyType = 'blue' | 'gold' | 'gray' | 'none';
type XCardTheme = 'light' | 'dark' | 'dim';
type StudioTabId = 'design' | 'media' | 'xcard' | 'text' | 'publish';
type SocialPlatformKey = 'x' | 'facebook' | 'instagram' | 'youtube' | 'whatsapp';
type StampSealId = 'none' | 'official' | 'verified' | 'exclusive' | 'breaking';

interface PosterPalette {
  id: string;
  nameSw: string;
  nameEn: string;
  topBarBg: string;
  topBarText: string;
  blockBg: string;
  blockText: string;
  ribbonBg: string;
  ribbonText: string;
  accentColor: string;
  cardSurfaceBg: string;
  headlineColor: string;
  subheadlineColor: string;
  footerBg: string;
  footerText: string;
  studioBgTop: string;
  studioBgBottom: string;
  promoBg: string;
  promoText: string;
}

interface CirclePhotoItem {
  id: string;
  objectUrl: string;
  img: HTMLImageElement | null;
  xPct: number;
  yPct: number;
  sizePct: number;
  borderWidth: number;
  borderColor: string;
  caption: string;
}

interface XCardConfig {
  enabled: boolean;
  theme: XCardTheme;
  displayName: string;
  handle: string;
  verifyType: XVerifyType;
  body: string;
  timestamp: string;
  showMetrics: boolean;
  replies: string;
  reposts: string;
  likes: string;
  views: string;
  avatarUrl: string | null;
  avatarImg: HTMLImageElement | null;
  xPct: number;
  yPct: number;
  widthPct: number;
}

const LAYOUT_OPTIONS: {
  id: PosterLayoutId;
  nameSw: string;
  nameEn: string;
  descSw: string;
  descEn: string;
}[] = [
  {
    id: 'bbc_classic',
    nameSw: 'BBC Breaking',
    nameEn: 'BBC Breaking',
    descSw: 'Picha kubwa + utepe chini',
    descEn: 'Full photo + lower scrim',
  },
  {
    id: 'portrait_transparent',
    nameSw: 'Portrait (Transparent)',
    nameEn: 'Portrait (Transparent)',
    descSw: 'Picha halisi + maandishi angavu',
    descEn: 'Natural photo + transparent text',
  },
  {
    id: 'split_editorial',
    nameSw: 'Jarida Split',
    nameEn: 'Editorial Split',
    descSw: 'Picha kubwa juu + kadi chini',
    descEn: 'Large top photo + lower card',
  },
  {
    id: 'diagonal_magazine',
    nameSw: 'Mshazari (Diagonal)',
    nameEn: 'Diagonal Spotlight',
    descSw: 'Mchoro wa mshazari wa kisasa',
    descEn: 'Angled broadcast panel',
  },
  {
    id: 'framed_spotlight',
    nameSw: 'Fremu ya Studio',
    nameEn: 'Studio Frame',
    descSw: 'Picha kubwa ndani ya fremu',
    descEn: 'Large inset media frame',
  },
  {
    id: 'urgent_ticker',
    nameSw: 'Tahadhari / Alert',
    nameEn: 'Urgent Alert',
    descSw: 'Kadi ya dharura yenye mstari',
    descEn: 'High-contrast alert card',
  },
  {
    id: 'social_quote_stage',
    nameSw: 'Jukwaa la X & Picha',
    nameEn: 'X & Cutout Stage',
    descSw: 'Nafasi pana ya Kadi ya X & duara',
    descEn: 'Wide stage for X card & cutouts',
  },
];

const ASPECT_OPTIONS: {
  id: PosterAspect;
  labelSw: string;
  labelEn: string;
  width: number;
  height: number;
  hintSw: string;
}[] = [
  { id: '5:6', labelSw: '5:6 Wastani', labelEn: '5:6 Balanced', width: 960, height: 1152, hintSw: 'Bora Mitandaoni' },
  { id: '3:4', labelSw: '3:4 Wima', labelEn: '3:4 Portrait', width: 900, height: 1200, hintSw: 'Wima Safi' },
  { id: '1:1', labelSw: '1:1 Mraba', labelEn: '1:1 Square', width: 1000, height: 1000, hintSw: 'Mraba' },
  { id: '4:5', labelSw: '4:5 IG', labelEn: '4:5 IG', width: 960, height: 1200, hintSw: 'Instagram' },
  { id: '4:3', labelSw: '4:3 Fupi', labelEn: '4:3 Compact', width: 1040, height: 780, hintSw: 'Fupi' },
  { id: '16:9', labelSw: '16:9 Wide', labelEn: '16:9 Landscape', width: 1200, height: 675, hintSw: 'X / FB / YT' },
];

const PALETTE_PRESETS: PosterPalette[] = [
  {
    id: 'bbc_crimson',
    nameSw: 'BBC Nyekundu',
    nameEn: 'BBC Crimson',
    topBarBg: '#BB1919',
    topBarText: '#FFFFFF',
    blockBg: '#FFFFFF',
    blockText: '#111827',
    ribbonBg: '#DC2626',
    ribbonText: '#FFFFFF',
    accentColor: '#FACC15',
    cardSurfaceBg: '#0B1220',
    headlineColor: '#FFFFFF',
    subheadlineColor: '#E2E8F0',
    footerBg: '#090D16',
    footerText: '#F8FAFC',
    studioBgTop: '#450A0A',
    studioBgBottom: '#090D16',
    promoBg: '#141B2D',
    promoText: '#FACC15',
  },
  {
    id: 'malosha_navy',
    nameSw: 'Malosha Buluu',
    nameEn: 'Malosha Navy',
    topBarBg: '#0E2640',
    topBarText: '#FFFFFF',
    blockBg: '#F59E0B',
    blockText: '#0E2640',
    ribbonBg: '#D97706',
    ribbonText: '#FFFFFF',
    accentColor: '#38BDF8',
    cardSurfaceBg: '#091A2E',
    headlineColor: '#FFFFFF',
    subheadlineColor: '#CBD5E1',
    footerBg: '#071422',
    footerText: '#F8FAFC',
    studioBgTop: '#163A5F',
    studioBgBottom: '#071422',
    promoBg: '#0F2E4D',
    promoText: '#FBBF24',
  },
  {
    id: 'clean_broadsheet',
    nameSw: 'Nyeupe Safi',
    nameEn: 'Crisp White',
    topBarBg: '#BB1919',
    topBarText: '#FFFFFF',
    blockBg: '#FFFFFF',
    blockText: '#111827',
    ribbonBg: '#BB1919',
    ribbonText: '#FFFFFF',
    accentColor: '#1D4ED8',
    cardSurfaceBg: '#FFFFFF',
    headlineColor: '#0F172A',
    subheadlineColor: '#475569',
    footerBg: '#0F172A',
    footerText: '#FFFFFF',
    studioBgTop: '#E2E8F0',
    studioBgBottom: '#CBD5E1',
    promoBg: '#1E293B',
    promoText: '#FDE047',
  },
  {
    id: 'emerald_civic',
    nameSw: 'Kijani Kijanja',
    nameEn: 'Emerald Press',
    topBarBg: '#064E3B',
    topBarText: '#FFFFFF',
    blockBg: '#A7F3D0',
    blockText: '#064E3B',
    ribbonBg: '#059669',
    ribbonText: '#FFFFFF',
    accentColor: '#FDE047',
    cardSurfaceBg: '#022C22',
    headlineColor: '#FFFFFF',
    subheadlineColor: '#D1FAE5',
    footerBg: '#02221A',
    footerText: '#ECFDF5',
    studioBgTop: '#065F46',
    studioBgBottom: '#02221A',
    promoBg: '#064E3B',
    promoText: '#6EE7B7',
  },
  {
    id: 'midnight_obsidian',
    nameSw: 'Usiku (Obsidian)',
    nameEn: 'Midnight Dark',
    topBarBg: '#111827',
    topBarText: '#FFFFFF',
    blockBg: '#1D9BF0',
    blockText: '#FFFFFF',
    ribbonBg: '#1D9BF0',
    ribbonText: '#FFFFFF',
    accentColor: '#38BDF8',
    cardSurfaceBg: '#090D16',
    headlineColor: '#F8FAFC',
    subheadlineColor: '#94A3B8',
    footerBg: '#030712',
    footerText: '#F8FAFC',
    studioBgTop: '#1E293B',
    studioBgBottom: '#030712',
    promoBg: '#0F172A',
    promoText: '#38BDF8',
  },
  {
    id: 'royal_indigo',
    nameSw: 'Zambarau Royal',
    nameEn: 'Royal Indigo',
    topBarBg: '#311042',
    topBarText: '#FFFFFF',
    blockBg: '#F43F5E',
    blockText: '#FFFFFF',
    ribbonBg: '#E11D48',
    ribbonText: '#FFFFFF',
    accentColor: '#FBBF24',
    cardSurfaceBg: '#1E092B',
    headlineColor: '#FFFFFF',
    subheadlineColor: '#E9D5FF',
    footerBg: '#14051D',
    footerText: '#FAF5FF',
    studioBgTop: '#4C1D95',
    studioBgBottom: '#14051D',
    promoBg: '#2E1065',
    promoText: '#FDE047',
  },
  {
    id: 'warm_cream_press',
    nameSw: 'Gazeti (Cream)',
    nameEn: 'Print Cream',
    topBarBg: '#1C1917',
    topBarText: '#FAFAF9',
    blockBg: '#EA580C',
    blockText: '#FFFFFF',
    ribbonBg: '#C2410C',
    ribbonText: '#FFFFFF',
    accentColor: '#EA580C',
    cardSurfaceBg: '#FAF7F2',
    headlineColor: '#1C1917',
    subheadlineColor: '#57534E',
    footerBg: '#1C1917',
    footerText: '#FAFAF9',
    studioBgTop: '#E7E5E4',
    studioBgBottom: '#D6D3D1',
    promoBg: '#292524',
    promoText: '#FDBA74',
  },
  {
    id: 'gold_sport',
    nameSw: 'Dhahabu Michezo',
    nameEn: 'Gold Sports',
    topBarBg: '#18181B',
    topBarText: '#FFFFFF',
    blockBg: '#EAB308',
    blockText: '#18181B',
    ribbonBg: '#CA8A04',
    ribbonText: '#FFFFFF',
    accentColor: '#FACC15',
    cardSurfaceBg: '#18181B',
    headlineColor: '#FFFFFF',
    subheadlineColor: '#D4D4D8',
    footerBg: '#09090B',
    footerText: '#FAFAFA',
    studioBgTop: '#3F3F46',
    studioBgBottom: '#09090B',
    promoBg: '#27272A',
    promoText: '#FACC15',
  },
];

const RIBBON_PRESETS = [
  'BREAKING NEWS',
  'HABARI MPYA',
  'TAARIFA MAALUM',
  'EXCLUSIVE',
  'MICHEZO',
  'MATOKEO',
  'FURSA MPYA',
];

const CIRCLE_RING_COLORS = ['#FFFFFF', '#FACC15', '#DC2626', '#1D9BF0', '#10B981', '#0E2640'];

const SOCIAL_PLATFORMS: { id: SocialPlatformKey; label: string }[] = [
  { id: 'x', label: 'X' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'whatsapp', label: 'WhatsApp' },
];

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    const clean = para.trim();
    if (!clean) {
      if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
      continue;
    }
    const words = clean.split(/\s+/);
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth) {
        current = test;
      } else {
        if (current) lines.push(current);
        if (ctx.measureText(word).width > maxWidth) {
          let chunk = '';
          for (const ch of word) {
            if (ctx.measureText(chunk + ch).width <= maxWidth) {
              chunk += ch;
            } else {
              if (chunk) lines.push(chunk);
              chunk = ch;
            }
          }
          current = chunk;
        } else {
          current = word;
        }
      }
    }
    if (current) lines.push(current);
  }

  return lines;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawCoverImageInRect(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  zoom = 1,
  offsetXPct = 0,
  offsetYPct = 0
) {
  const imgRatio = img.naturalWidth / Math.max(1, img.naturalHeight);
  const boxRatio = rw / Math.max(1, rh);

  let drawW: number;
  let drawH: number;
  if (imgRatio > boxRatio) {
    drawH = rh * zoom;
    drawW = drawH * imgRatio;
  } else {
    drawW = rw * zoom;
    drawH = drawW / imgRatio;
  }

  const maxPanX = Math.max(50, (drawW - rw) / 2 + 60);
  const maxPanY = Math.max(50, (drawH - rh) / 2 + 60);
  const dx = rx + (rw - drawW) / 2 + (offsetXPct / 100) * maxPanX;
  const dy = ry + (rh - drawH) / 2 + (offsetYPct / 100) * maxPanY;

  ctx.drawImage(img, dx, dy, drawW, drawH);
}

function drawXVerifiedBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  type: XVerifyType
) {
  if (type === 'none') return;
  const r = size / 2;
  const fill = type === 'gold' ? '#E2B714' : type === 'gray' ? '#829AAB' : '#1D9BF0';

  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = fill;

  if (type === 'gold') {
    // Scalloped/square-ish official gold badge
    drawRoundedRect(ctx, -r, -r, size, size, r * 0.35);
    ctx.fill();
  } else {
    // 8-point X verification seal
    const points = 16;
    ctx.beginPath();
    for (let i = 0; i < points; i++) {
      const angle = (i * Math.PI * 2) / points;
      const rad = i % 2 === 0 ? r * 1.05 : r * 0.84;
      const px = Math.cos(angle) * rad;
      const py = Math.sin(angle) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Crisp white checkmark
  ctx.strokeStyle = type === 'gold' ? '#111827' : '#FFFFFF';
  ctx.lineWidth = Math.max(2, size * 0.14);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-r * 0.42, r * 0.04);
  ctx.lineTo(-r * 0.1, r * 0.36);
  ctx.lineTo(r * 0.44, -r * 0.32);
  ctx.stroke();

  ctx.restore();
}

function drawSocialGlyph(
  ctx: CanvasRenderingContext2D,
  platform: SocialPlatformKey,
  cx: number,
  cy: number,
  size: number
) {
  const r = size / 2;
  ctx.save();
  ctx.translate(cx, cy);

  if (platform === 'x') {
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `800 ${Math.round(size * 0.56)}px "Plus Jakarta Sans", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('𝕏', 0, 1);
  } else if (platform === 'facebook') {
    ctx.fillStyle = '#1877F2';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `800 ${Math.round(size * 0.68)}px "Plus Jakarta Sans", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('f', 0.5, 1.5);
  } else if (platform === 'instagram') {
    const grad = ctx.createLinearGradient(-r, r, r, -r);
    grad.addColorStop(0, '#F58529');
    grad.addColorStop(0.5, '#DD2A7B');
    grad.addColorStop(1, '#515BD4');
    ctx.fillStyle = grad;
    drawRoundedRect(ctx, -r, -r, size, size, r * 0.55);
    ctx.fill();

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = Math.max(1.5, size * 0.09);
    const box = size * 0.54;
    drawRoundedRect(ctx, -box / 2, -box / 2, box, box, box * 0.28);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, size * 0.14, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(size * 0.17, -size * 0.17, size * 0.045, 0, Math.PI * 2);
    ctx.fill();
  } else if (platform === 'youtube') {
    ctx.fillStyle = '#FF0000';
    drawRoundedRect(ctx, -r, -r * 0.76, size, size * 0.76, r * 0.42);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(-size * 0.12, -size * 0.2);
    ctx.lineTo(size * 0.22, 0);
    ctx.lineTo(-size * 0.12, size * 0.2);
    ctx.closePath();
    ctx.fill();
  } else if (platform === 'whatsapp') {
    ctx.fillStyle = '#25D366';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = Math.max(1.8, size * 0.1);
    ctx.beginPath();
    ctx.arc(0, -size * 0.02, size * 0.27, 0.75 * Math.PI, 2.52 * Math.PI);
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(-size * 0.18, size * 0.14);
    ctx.lineTo(-size * 0.28, size * 0.3);
    ctx.lineTo(-size * 0.08, size * 0.24);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function getFormattedTodayStamp(): string {
  try {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return 'LEO';
  }
}

function getFormattedXTimeStamp(): string {
  try {
    const d = new Date();
    const hours = d.getHours();
    const mins = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 || 12;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${h12}:${mins} ${ampm} · ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  } catch {
    return '10:30 AM · Leo';
  }
}

function isLightHex(hex: string): boolean {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62;
}

interface BreakingNewsPosterStudioProps {
  onPublishToPlatform: (data: {
    title: string;
    body: string;
    category: TopicCategory;
    tags: string[];
    coverImage: string;
  }) => Promise<string>;
  onOpenPublishedTopic: (topicId: string) => void;
  onNavigateBoard: (board: PrimaryBoard) => void;
  onToast: (message: string, kind?: 'success' | 'error') => void;
}

export const BreakingNewsPosterStudio: React.FC<BreakingNewsPosterStudioProps> = ({
  onPublishToPlatform,
  onOpenPublishedTopic,
  onNavigateBoard,
  onToast,
}) => {
  const { tr } = useLanguage();
  const [studioExpanded, setStudioExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<StudioTabId>('design');

  // Layout, Size, Font & Customizable Palette State
  const [layoutId, setLayoutId] = useState<PosterLayoutId>('bbc_classic');
  const [aspect, setAspect] = useState<PosterAspect>('5:6');
  const [fontStyle, setFontStyle] = useState<FontStyleId>('sans');
  const [paletteId, setPaletteId] = useState<string>('bbc_crimson');
  const [colors, setColors] = useState<PosterPalette>(PALETTE_PRESETS[0]);

  // Masthead, Official Verification Marks & Copy State
  const [showMonogram, setShowMonogram] = useState(true);
  const [monogramText, setMonogramText] = useState('MLS');
  const [channelLabel, setChannelLabel] = useState('MALOSHA FORUMS');
  const [showVerifiedMasthead, setShowVerifiedMasthead] = useState(true);
  const [stampSeal, setStampSeal] = useState<StampSealId>('official');
  const [showWatermarkMark, setShowWatermarkMark] = useState(true);
  const [showHeaderBar, setShowHeaderBar] = useState(true);
  const [showLivePill, setShowLivePill] = useState(true);
  const [dateStamp, setDateStamp] = useState(() => getFormattedTodayStamp());

  const [showRibbon, setShowRibbon] = useState(true);
  const [ribbonText, setRibbonText] = useState('BREAKING NEWS');
  const [locationTag, setLocationTag] = useState('TANZANIA');
  const [headline, setHeadline] = useState(
    'Taarifa Muhimu: Fursa Mpya za Kidijitali na Elimu kwa Vijana Zazinduliwa Rasmi'
  );
  const [subheadline, setSubheadline] = useState(
    'Fuata uchambuzi kamili na majadiliano ya wadau moja kwa moja ndani ya jukwaa.'
  );
  const [headlineSize, setHeadlineSize] = useState<HeadlineSize>('normal');
  const [scrimStrength, setScrimStrength] = useState(64);
  const [transparentTextMode, setTransparentTextMode] = useState(false);
  const [textBackdropOpacity, setTextBackdropOpacity] = useState(22);
  const [photoStageShare, setPhotoStageShare] = useState(65);
  const [circlesBehindText, setCirclesBehindText] = useState(false);

  // Custom Footer, Web Link, Social Icons & Malosha Results System Promo
  const [footerLink, setFooterLink] = useState('https://maloshaforums.web.app');
  const [footerHandle, setFooterHandle] = useState('');
  const [enabledSocials, setEnabledSocials] = useState<SocialPlatformKey[]>([
    'x',
    'facebook',
    'instagram',
    'youtube',
    'whatsapp',
  ]);
  const [showResultsBanner, setShowResultsBanner] = useState(true);
  const [resultsPromoText, setResultsPromoText] = useState(
    'Powered by Malosha Results System — Mfumo wa Matokeo Mtandaoni'
  );

  // Main Background Photo State
  const [photoObjectUrl, setPhotoObjectUrl] = useState<string | null>(null);
  const [loadedPhoto, setLoadedPhoto] = useState<HTMLImageElement | null>(null);
  const [photoZoom, setPhotoZoom] = useState(1);
  const [photoOffsetX, setPhotoOffsetX] = useState(0);
  const [photoOffsetY, setPhotoOffsetY] = useState(0);

  // Draggable Circular Cutout Photos State
  const [circlePhotos, setCirclePhotos] = useState<CirclePhotoItem[]>([]);
  const [selectedCircleId, setSelectedCircleId] = useState<string | null>(null);

  // Authentic X (Twitter) Comment Card State
  const [xCard, setXCard] = useState<XCardConfig>({
    enabled: false,
    theme: 'light',
    displayName: 'Malosha Official',
    handle: '@maloshaforums',
    verifyType: 'blue',
    body: 'Tunahakikisha taarifa sahihi, majadiliano huru na matokeo ya uhakika yanawafikia wananchi wote kwa wakati kupitia mfumo wetu.',
    timestamp: getFormattedXTimeStamp(),
    showMetrics: true,
    replies: '148',
    reposts: '620',
    likes: '3.4K',
    views: '89K',
    avatarUrl: null,
    avatarImg: null,
    xPct: 50,
    yPct: 40,
    widthPct: 76,
  });

  // Canvas Drag Interaction State
  const [dragModeEnabled, setDragModeEnabled] = useState(true);
  const [positionsLocked, setPositionsLocked] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<'xcard' | string | null>(null);
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mainFileInputRef = useRef<HTMLInputElement>(null);
  const circleFileInputRef = useRef<HTMLInputElement>(null);
  const xAvatarFileInputRef = useRef<HTMLInputElement>(null);

  // Keep latest hitboxes & stage bounds in refs for exact 1:1 pointer dragging
  const circleHitboxesRef = useRef<{ id: string; cx: number; cy: number; r: number }[]>([]);
  const xCardHitboxRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const stageBoundsRef = useRef<{ top: number; bottom: number; width: number; height: number }>({
    top: 84,
    bottom: 1056,
    width: 960,
    height: 1152,
  });
  const dragSessionRef = useRef<{
    target: 'xcard' | string;
    startXPct: number;
    startYPct: number;
    startClientX: number;
    startClientY: number;
    minXPct: number;
    maxXPct: number;
    minYPct: number;
    maxYPct: number;
  } | null>(null);

  // Cleanup URLs on unmount
  const circleUrlsRef = useRef<string[]>([]);
  useEffect(() => {
    circleUrlsRef.current = circlePhotos.map((c) => c.objectUrl);
  }, [circlePhotos]);

  useEffect(() => {
    return () => {
      if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl);
    };
  }, [photoObjectUrl]);

  useEffect(() => {
    return () => {
      if (xCard.avatarUrl) URL.revokeObjectURL(xCard.avatarUrl);
    };
  }, [xCard.avatarUrl]);

  useEffect(() => {
    return () => {
      circleUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  // Publish State
  const [publishBoard, setPublishBoard] = useState<PrimaryBoard>('Kijiweni');
  const [publishMode, setPublishMode] = useState<PublishMode>('image_only');
  const [postTitle, setPostTitle] = useState('');
  const [postBody, setPostBody] = useState('');
  const [postTagsRaw, setPostTagsRaw] = useState('habari, malosha');
  const [publishing, setPublishing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [publishedResult, setPublishedResult] = useState<{
    topicId: string;
    board: PrimaryBoard;
  } | null>(null);

  const applyPalettePreset = (preset: PosterPalette) => {
    setPaletteId(preset.id);
    setColors(preset);
  };

  const updateCustomColor = (key: keyof PosterPalette, value: string) => {
    setPaletteId('custom');
    setColors((prev) => ({ ...prev, [key]: value }));
  };

  const handleRandomizeDesign = () => {
    const otherLayouts = LAYOUT_OPTIONS.filter((l) => l.id !== layoutId);
    const nextLayout = otherLayouts[Math.floor(Math.random() * otherLayouts.length)] || LAYOUT_OPTIONS[0];
    const otherPalettes = PALETTE_PRESETS.filter((p) => p.id !== paletteId);
    const nextPalette = otherPalettes[Math.floor(Math.random() * otherPalettes.length)] || PALETTE_PRESETS[0];
    setLayoutId(nextLayout.id);
    applyPalettePreset(nextPalette);
    setFontStyle((prev) => (nextLayout.id === 'diagonal_magazine' || nextLayout.id === 'split_editorial' ? 'serif' : prev));
    onToast(
      tr(
        `Muonekano umebadilishwa: ${nextLayout.nameSw} (${nextPalette.nameSw})`,
        `Switched look: ${nextLayout.nameEn} (${nextPalette.nameEn})`
      )
    );
  };

  // Load main background photo cleanly
  useEffect(() => {
    if (!photoObjectUrl) {
      setLoadedPhoto(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setLoadedPhoto(img);
    };
    img.onerror = () => {
      if (!cancelled) {
        setLoadedPhoto(null);
        onToast(tr('Imeshindwa kusoma picha uliyochagua.', 'Could not read selected image.'), 'error');
      }
    };
    img.src = photoObjectUrl;
    return () => {
      cancelled = true;
    };
  }, [photoObjectUrl, onToast, tr]);

  const handleSelectMainPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      onToast(tr('Tafadhali chagua faili la picha pekee.', 'Please choose an image file only.'), 'error');
      return;
    }
    if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl);
    setPhotoObjectUrl(URL.createObjectURL(file));
    setPhotoZoom(1);
    setPhotoOffsetX(0);
    setPhotoOffsetY(0);
    setPublishedResult(null);
  };

  const handleClearMainPhoto = () => {
    if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl);
    setPhotoObjectUrl(null);
    setLoadedPhoto(null);
    setPhotoZoom(1);
    setPhotoOffsetX(0);
    setPhotoOffsetY(0);
  };

  // Add Draggable Circular Photo
  const handleAddCirclePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      onToast(tr('Chagua faili la picha pekee.', 'Choose an image file only.'), 'error');
      return;
    }
    const objUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const id = `circle-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const colSlot = circlePhotos.length % 3;
      const newItem: CirclePhotoItem = {
        id,
        objectUrl: objUrl,
        img,
        xPct: colSlot === 0 ? 80 : colSlot === 1 ? 20 : 50,
        yPct: colSlot === 2 ? 20 : 25,
        sizePct: 24,
        borderWidth: 6,
        borderColor: '#FFFFFF',
        caption: '',
      };
      setCirclePhotos((prev) => [...prev, newItem]);
      setSelectedCircleId(id);
      setSelectedTarget(id);
      setPositionsLocked(false);
      setDragModeEnabled(true);
      onToast(
        tr(
          'Picha ya duara imeongezwa juu! Iburute popote kisha bofya "Funga Nafasi" ikishakaa sawa.',
          'Circle photo added! Drag anywhere then lock position when ready.'
        )
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      onToast(tr('Imeshindwa kupakia picha ya duara.', 'Failed to load circle photo.'), 'error');
    };
    img.src = objUrl;
  };

  const updateCirclePhoto = (id: string, patch: Partial<CirclePhotoItem>) => {
    setCirclePhotos((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const removeCirclePhoto = (id: string) => {
    setCirclePhotos((prev) => {
      const target = prev.find((c) => c.id === id);
      if (target) URL.revokeObjectURL(target.objectUrl);
      const next = prev.filter((c) => c.id !== id);
      if (selectedCircleId === id) {
        setSelectedCircleId(next[0]?.id || null);
      }
      return next;
    });
    if (selectedTarget === id) setSelectedTarget(null);
  };

  // Load X Card Avatar
  const handleSelectXAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      onToast(tr('Chagua faili la picha pekee.', 'Choose an image file only.'), 'error');
      return;
    }
    const objUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setXCard((prev) => {
        if (prev.avatarUrl) URL.revokeObjectURL(prev.avatarUrl);
        return { ...prev, avatarUrl: objUrl, avatarImg: img, enabled: true };
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      onToast(tr('Imeshindwa kupakia picha ya akaunti ya X.', 'Failed to load X avatar.'), 'error');
    };
    img.src = objUrl;
  };

  const handleToggleSocial = (key: SocialPlatformKey) => {
    setEnabledSocials((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  // Master Canvas Renderer (supports separate offscreen canvas for 100% identical zero-shift PNG export)
  const renderPosterToCanvas = useCallback(
    (showSelectionGuide = false, targetCanvas?: HTMLCanvasElement) => {
      const canvas = targetCanvas || canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const isExportCanvas = Boolean(targetCanvas && targetCanvas !== canvasRef.current);

      const aspectCfg = ASPECT_OPTIONS.find((a) => a.id === aspect) || ASPECT_OPTIONS[0];
      const W = aspectCfg.width;
      const H = aspectCfg.height;
      if (canvas.width !== W) canvas.width = W;
      if (canvas.height !== H) canvas.height = H;

      const isCompactH = H <= 810;
      const padX = W >= 1150 ? 54 : 42;
      const topBarH = showHeaderBar ? (isCompactH ? 70 : 78) : 0;
      const promoBarH = showResultsBanner ? (isCompactH ? 32 : 36) : 0;
      const mainFooterH = isCompactH ? 48 : 54;
      const footerH = mainFooterH + promoBarH;

      const displayFont =
        fontStyle === 'serif'
          ? '"Fraunces", Georgia, serif'
          : '"Plus Jakarta Sans", system-ui, sans-serif';
      const sansFont = '"Plus Jakarta Sans", system-ui, sans-serif';
      const monoFont = '"JetBrains Mono", monospace';

      // 1. Studio Backdrop
      const studioGrad = ctx.createLinearGradient(0, 0, W, H);
      studioGrad.addColorStop(0, colors.studioBgTop);
      studioGrad.addColorStop(1, colors.studioBgBottom);
      ctx.fillStyle = studioGrad;
      ctx.fillRect(0, 0, W, H);

      // Subtle architectural grid when no background photo or framed layout
      if (!loadedPhoto || layoutId === 'framed_spotlight' || layoutId === 'social_quote_stage') {
        ctx.save();
        ctx.strokeStyle = isLightHex(colors.studioBgTop)
          ? 'rgba(15, 23, 42, 0.06)'
          : 'rgba(255, 255, 255, 0.055)';
        ctx.lineWidth = 1.5;
        const step = 64;
        for (let gx = 0; gx < W; gx += step) {
          ctx.beginPath();
          ctx.moveTo(gx, 0);
          ctx.lineTo(gx, H);
          ctx.stroke();
        }
        for (let gy = 0; gy < H; gy += step) {
          ctx.beginPath();
          ctx.moveTo(0, gy);
          ctx.lineTo(W, gy);
          ctx.stroke();
        }
        const rad = ctx.createRadialGradient(W * 0.72, H * 0.28, 30, W * 0.72, H * 0.28, W * 0.65);
        rad.addColorStop(0, 'rgba(255,255,255,0.12)');
        rad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = rad;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }

      // 2. Layout-Specific Background Photo & Panel Geometry (generous photo stage)
      const stageTop = topBarH;
      const stageBottom = H - footerH;
      const stageH = stageBottom - stageTop;
      if (!isExportCanvas) {
        stageBoundsRef.current = { top: stageTop, bottom: stageBottom, width: W, height: H };
      }

      const photoShare = Math.max(0.5, Math.min(0.74, photoStageShare / 100));
      const splitTopY = Math.round(stageTop + stageH * photoShare);
      const frameH = Math.round(stageH * Math.max(0.56, photoShare));
      const frameTop = stageTop + 16;
      const framePadX = 24;

      const effectiveTransparent = layoutId === 'portrait_transparent' || transparentTextMode;

      if (layoutId === 'split_editorial') {
        // Larger Photo in upper area
        const photoH = splitTopY - stageTop;
        if (loadedPhoto) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, stageTop, W, photoH);
          ctx.clip();
          drawCoverImageInRect(ctx, loadedPhoto, 0, stageTop, W, photoH, photoZoom, photoOffsetX, photoOffsetY);
          ctx.restore();
        }
        // Subtle shadow before card
        const edge = ctx.createLinearGradient(0, splitTopY - 36, 0, splitTopY);
        edge.addColorStop(0, 'rgba(0,0,0,0)');
        edge.addColorStop(1, 'rgba(0,0,0,0.32)');
        ctx.fillStyle = edge;
        ctx.fillRect(0, splitTopY - 36, W, 36);

        // Lower Editorial Surface (solid or translucent if transparentTextMode)
        ctx.save();
        ctx.globalAlpha = effectiveTransparent ? Math.max(0, textBackdropOpacity / 100) : 1;
        ctx.fillStyle = colors.cardSurfaceBg;
        ctx.fillRect(0, splitTopY, W, stageBottom - splitTopY);
        ctx.restore();
        ctx.fillStyle = colors.ribbonBg;
        ctx.fillRect(0, splitTopY, W, 6);
      } else if (layoutId === 'framed_spotlight') {
        // Larger Framed inset photo window
        const frameW = W - framePadX * 2;

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = 24;
        ctx.shadowOffsetY = 10;
        ctx.fillStyle = colors.cardSurfaceBg;
        drawRoundedRect(ctx, framePadX, frameTop, frameW, frameH, 20);
        ctx.fill();
        ctx.restore();

        if (loadedPhoto) {
          ctx.save();
          drawRoundedRect(ctx, framePadX, frameTop, frameW, frameH, 20);
          ctx.clip();
          drawCoverImageInRect(
            ctx,
            loadedPhoto,
            framePadX,
            frameTop,
            frameW,
            frameH,
            photoZoom,
            photoOffsetX,
            photoOffsetY
          );
          ctx.restore();
        }
        ctx.strokeStyle = colors.accentColor;
        ctx.lineWidth = 3;
        drawRoundedRect(ctx, framePadX, frameTop, frameW, frameH, 20);
        ctx.stroke();
      } else {
        // Full-bleed stage photo for bbc_classic, portrait_transparent, diagonal_magazine, urgent_ticker, social_quote_stage
        if (loadedPhoto) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, stageTop, W, stageH);
          ctx.clip();
          drawCoverImageInRect(ctx, loadedPhoto, 0, stageTop, W, stageH, photoZoom, photoOffsetX, photoOffsetY);
          ctx.restore();
        }

        if (layoutId === 'diagonal_magazine') {
          // Generous angled lower geometric slab leaving large top/mid photo visible
          const alpha = effectiveTransparent
            ? Math.max(0.08, textBackdropOpacity / 100)
            : Math.min(0.98, Math.max(0.45, scrimStrength / 100));
          const leftAnchorY = Math.round(stageTop + stageH * 0.57);
          const rightAnchorY = Math.round(stageTop + stageH * 0.71);

          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.fillStyle = colors.cardSurfaceBg;
          ctx.beginPath();
          ctx.moveTo(0, leftAnchorY);
          ctx.lineTo(W, rightAnchorY);
          ctx.lineTo(W, stageBottom);
          ctx.lineTo(0, stageBottom);
          ctx.closePath();
          ctx.fill();
          ctx.restore();

          ctx.strokeStyle = colors.accentColor;
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.moveTo(0, leftAnchorY);
          ctx.lineTo(W, rightAnchorY);
          ctx.stroke();
        } else if (layoutId === 'portrait_transparent') {
          // Pure natural portrait photo; only apply soft scrim if owner increases scrimStrength > 0
          if (scrimStrength > 0) {
            const alpha = Math.min(0.92, scrimStrength / 100);
            const scrimStart = Math.round(stageTop + stageH * 0.48);
            const scrim = ctx.createLinearGradient(0, scrimStart, 0, stageBottom);
            scrim.addColorStop(0, 'rgba(6,10,18,0)');
            scrim.addColorStop(1, `rgba(6,10,18,${alpha})`);
            ctx.fillStyle = scrim;
            ctx.fillRect(0, scrimStart, W, stageBottom - scrimStart);
          }
        } else if (layoutId === 'social_quote_stage') {
          const alpha = Math.min(0.9, (scrimStrength / 100) * 0.72);
          if (alpha > 0) {
            ctx.fillStyle = `rgba(6, 10, 18, ${alpha})`;
            ctx.fillRect(0, stageTop, W, stageH);
          }
        } else {
          // Scrim for bbc_classic & urgent_ticker (0% allowed so natural photo shines if desired!)
          const alphaStrong = Math.min(0.98, Math.max(0, scrimStrength / 100));
          if (alphaStrong > 0 && !effectiveTransparent) {
            const scrimStart = Math.round(stageTop + stageH * 0.34);
            const scrim = ctx.createLinearGradient(0, scrimStart, 0, stageBottom);
            scrim.addColorStop(0, 'rgba(6,10,18,0)');
            scrim.addColorStop(0.45, `rgba(6,10,18,${alphaStrong * 0.46})`);
            scrim.addColorStop(0.78, `rgba(6,10,18,${alphaStrong * 0.88})`);
            scrim.addColorStop(1, `rgba(6,10,18,${alphaStrong})`);
            ctx.fillStyle = scrim;
            ctx.fillRect(0, scrimStart, W, stageBottom - scrimStart);
          }
        }
      }

      // Subtle Brand Watermark on Stage
      if (showWatermarkMark) {
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.font = `800 18px ${sansFont}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('MALOSHA FORUMS · OFFICIAL', padX, stageTop + 18);
        ctx.restore();
      }

      // Official Corner Verification Stamp / Seal
      if (stampSeal !== 'none') {
        const sealMap: Record<Exclude<StampSealId, 'none'>, { label: string; badge: XVerifyType }> = {
          official: { label: 'MALOSHA FORUMS RASMI', badge: 'blue' },
          verified: { label: 'TAARIFA YA KWELI', badge: 'blue' },
          exclusive: { label: 'EXCLUSIVE DESK', badge: 'gold' },
          breaking: { label: 'HABARI KUU', badge: 'gold' },
        };
        const sealCfg = sealMap[stampSeal];
        ctx.save();
        ctx.font = `800 14px ${sansFont}`;
        const labelW = ctx.measureText(sealCfg.label).width;
        const sealW = labelW + 46;
        const sealH = 32;
        const sealX = W - padX - sealW;
        const sealY = stageTop + 16;

        ctx.fillStyle = 'rgba(9, 17, 32, 0.72)';
        drawRoundedRect(ctx, sealX, sealY, sealW, sealH, 999);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.34)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        drawXVerifiedBadge(ctx, sealX + 18, sealY + sealH / 2, 18, sealCfg.badge);
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(sealCfg.label, sealX + 33, sealY + sealH / 2 + 0.5);
        ctx.restore();
      }

      // 3. Top Broadcast Header Bar
      if (showHeaderBar) {
        ctx.fillStyle = colors.topBarBg;
        ctx.fillRect(0, 0, W, topBarH);
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.fillRect(0, topBarH - 2, W, 2);

        let cursorX = padX;
        const cleanMono = monogramText.trim().toUpperCase().slice(0, 3);
        if (showMonogram && cleanMono.length > 0) {
          const letters = cleanMono.split('');
          const blockSize = isCompactH ? 32 : 36;
          const blockGap = 5;
          const blockY = (topBarH - blockSize) / 2;
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'center';
          for (const ch of letters) {
            ctx.fillStyle = colors.blockBg;
            drawRoundedRect(ctx, cursorX, blockY, blockSize, blockSize, 4);
            ctx.fill();
            ctx.fillStyle = colors.blockText;
            ctx.font = `800 ${isCompactH ? 19 : 22}px ${sansFont}`;
            ctx.fillText(ch, cursorX + blockSize / 2, topBarH / 2 + 1);
            cursorX += blockSize + blockGap;
          }
          cursorX += 10;
        }

        const cleanChannel = (channelLabel.trim() || 'MALOSHA FORUMS').toUpperCase();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = colors.topBarText;
        ctx.font = `800 ${isCompactH ? 21 : 24}px ${sansFont}`;
        ctx.fillText(cleanChannel, cursorX, topBarH / 2 + 1);

        if (showVerifiedMasthead) {
          const chanW = ctx.measureText(cleanChannel).width;
          drawXVerifiedBadge(ctx, cursorX + chanW + 16, topBarH / 2, 20, 'blue');
        }

        // Right Side: Date + LIVE
        let rightEdge = W - padX;
        if (showLivePill) {
          const liveText = 'LIVE';
          ctx.font = `800 ${isCompactH ? 17 : 19}px ${sansFont}`;
          const pillW = ctx.measureText(liveText).width + 38;
          const pillH = isCompactH ? 30 : 34;
          const pillX = rightEdge - pillW;
          const pillY = (topBarH - pillH) / 2;

          ctx.fillStyle = colors.topBarBg.toUpperCase() === '#BB1919' ? '#111827' : '#DC2626';
          drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 6);
          ctx.fill();

          ctx.beginPath();
          ctx.arc(pillX + 15, topBarH / 2, 4.8, 0, Math.PI * 2);
          ctx.fillStyle = '#FFFFFF';
          ctx.fill();

          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'left';
          ctx.fillText(liveText, pillX + 26, topBarH / 2 + 1);
          rightEdge = pillX - 16;
        }

        if (dateStamp.trim()) {
          ctx.textAlign = 'right';
          ctx.fillStyle = isLightHex(colors.topBarBg) ? 'rgba(15,23,42,0.8)' : 'rgba(255,255,255,0.88)';
          ctx.font = `600 ${isCompactH ? 17 : 19}px ${monoFont}`;
          ctx.fillText(dateStamp.trim().toUpperCase(), rightEdge, topBarH / 2 + 1);
        }
      }

      // 4. Headline, Ribbon & Subheadline Rendering
      const contentWidth = W - padX * 2;
      const cleanHeadline = headline.trim();
      const cleanSub = subheadline.trim();

      let baseFontSize =
        headlineSize === 'xlarge'
          ? 64
          : headlineSize === 'large'
            ? 54
            : headlineSize === 'normal'
              ? 44
              : 36;

      if (isCompactH) baseFontSize = Math.round(baseFontSize * 0.84);
      if (layoutId === 'split_editorial' || layoutId === 'framed_spotlight') {
        baseFontSize = Math.min(baseFontSize, isCompactH ? 38 : 46);
      }
      if (cleanHeadline.length > 110) baseFontSize = Math.max(30, baseFontSize - 8);
      else if (cleanHeadline.length > 75) baseFontSize = Math.max(34, baseFontSize - 4);

      const headlineFont = `800 ${baseFontSize}px ${displayFont}`;
      const lineHeight = Math.round(baseFontSize * 1.18);

      const isUrgentCard = layoutId === 'urgent_ticker';
      const cardInnerPadX = isUrgentCard ? 30 : 0;
      const textWrapWidth = contentWidth - cardInnerPadX * 2;

      ctx.font = headlineFont;
      let headlineLines = cleanHeadline ? wrapCanvasText(ctx, cleanHeadline, textWrapWidth) : [];
      const maxHeadlineLines =
        layoutId === 'social_quote_stage' ? 2 : isCompactH ? 3 : layoutId === 'split_editorial' ? 4 : 5;
      if (headlineLines.length > maxHeadlineLines) {
        headlineLines = headlineLines.slice(0, maxHeadlineLines);
        const last = headlineLines[maxHeadlineLines - 1];
        headlineLines[maxHeadlineLines - 1] = `${last.slice(0, Math.max(0, last.length - 3))}...`;
      }

      const subFontSize = isCompactH ? 21 : layoutId === 'split_editorial' ? 23 : 25;
      const subLineHeight = Math.round(subFontSize * 1.32);
      ctx.font = `500 ${subFontSize}px ${sansFont}`;
      let subLines = cleanSub ? wrapCanvasText(ctx, cleanSub, textWrapWidth) : [];
      const maxSubLines = layoutId === 'social_quote_stage' ? 2 : isCompactH ? 2 : 3;
      if (subLines.length > maxSubLines) {
        subLines = subLines.slice(0, maxSubLines);
        const lastSub = subLines[maxSubLines - 1];
        subLines[maxSubLines - 1] = `${lastSub.slice(0, Math.max(0, lastSub.length - 3))}...`;
      }

      const ribbonH = showRibbon ? (isCompactH ? 42 : 48) : 0;
      const gapRibbonToHead = showRibbon && headlineLines.length > 0 ? 18 : 0;
      const gapHeadToSub = headlineLines.length > 0 && subLines.length > 0 ? 14 : 0;
      const totalHeadlineH = headlineLines.length * lineHeight;
      const totalSubH = subLines.length * subLineHeight;
      const totalBlockH = ribbonH + gapRibbonToHead + totalHeadlineH + gapHeadToSub + totalSubH;

      let blockTopY: number;
      if (layoutId === 'split_editorial') {
        const avail = stageBottom - splitTopY - 6;
        blockTopY = splitTopY + 6 + Math.max(16, (avail - totalBlockH) / 2);
      } else if (layoutId === 'framed_spotlight') {
        const frameBottom = frameTop + frameH;
        const avail = stageBottom - frameBottom;
        blockTopY = frameBottom + Math.max(14, (avail - totalBlockH) / 2);
      } else if (layoutId === 'social_quote_stage') {
        blockTopY = stageTop + 28;
      } else {
        blockTopY = stageBottom - 26 - totalBlockH - (isUrgentCard ? 20 : 0);
      }

      // Helper to render draggable circle photos (can sit either behind headline OR in front)
      const drawCircleCutoutsLayer = () => {
        const nextHitboxes: { id: string; cx: number; cy: number; r: number }[] = [];
        for (const item of circlePhotos) {
          if (!item.img) continue;
          const r = Math.round(((item.sizePct / 100) * Math.min(W, H)) / 2);
          const minCx = r + 12;
          const maxCx = W - r - 12;
          const minCy = stageTop + r + 10;
          const maxCy = stageBottom - r - 10;
          const cx = Math.max(minCx, Math.min(maxCx, Math.round((item.xPct / 100) * W)));
          const cy = Math.max(minCy, Math.min(maxCy, Math.round((item.yPct / 100) * H)));

          nextHitboxes.push({ id: item.id, cx, cy, r });

          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.45)';
          ctx.shadowBlur = 20;
          ctx.shadowOffsetY = 8;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fillStyle = item.borderColor;
          ctx.fill();
          ctx.restore();

          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(8, r - item.borderWidth), 0, Math.PI * 2);
          ctx.clip();
          drawCoverImageInRect(ctx, item.img, cx - r, cy - r, r * 2, r * 2, 1, 0, 0);
          ctx.restore();

          if (item.borderWidth > 0) {
            ctx.beginPath();
            ctx.arc(cx, cy, r - item.borderWidth / 2, 0, Math.PI * 2);
            ctx.strokeStyle = item.borderColor;
            ctx.lineWidth = item.borderWidth;
            ctx.stroke();
          }

          if (item.caption.trim()) {
            const cap = item.caption.trim();
            ctx.font = `700 17px ${sansFont}`;
            const capW = Math.min(r * 2.4, ctx.measureText(cap).width + 24);
            const capH = 28;
            const capX = cx - capW / 2;
            const capY = cy + r - 10;
            ctx.fillStyle = '#0F172A';
            drawRoundedRect(ctx, capX, capY, capW, capH, 14);
            ctx.fill();
            ctx.strokeStyle = item.borderColor;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(cap, cx, capY + capH / 2 + 1, capW - 14);
          }

          if (showSelectionGuide && !positionsLocked && selectedTarget === item.id) {
            ctx.save();
            ctx.strokeStyle = '#FACC15';
            ctx.lineWidth = 3.5;
            ctx.setLineDash([9, 6]);
            ctx.beginPath();
            ctx.arc(cx, cy, r + 7, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
        }
        if (!isExportCanvas) {
          circleHitboxesRef.current = nextHitboxes;
        }
      };

      if (circlesBehindText) {
        drawCircleCutoutsLayer();
      }

      // Transparent / Translucent Portrait Backdrop behind text OR Urgent Card box
      if (effectiveTransparent && layoutId !== 'split_editorial' && layoutId !== 'diagonal_magazine' && totalBlockH > 0) {
        const panelAlpha = Math.max(0, Math.min(0.95, textBackdropOpacity / 100));
        if (panelAlpha > 0.01) {
          const boxPadY = 20;
          const boxPadX = 24;
          const boxX = padX - 10;
          const boxY = blockTopY - boxPadY;
          const boxW = contentWidth + 20;
          const boxH = totalBlockH + boxPadY * 2;
          ctx.save();
          ctx.globalAlpha = panelAlpha;
          ctx.fillStyle = colors.cardSurfaceBg;
          drawRoundedRect(ctx, boxX, boxY, boxW, boxH, 18);
          ctx.fill();
          ctx.globalAlpha = Math.min(0.45, panelAlpha + 0.14);
          ctx.strokeStyle = 'rgba(255,255,255,0.45)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();
          void boxPadX;
        }
      } else if (isUrgentCard && totalBlockH > 0) {
        const boxPadY = 22;
        const boxX = padX;
        const boxY = blockTopY - boxPadY;
        const boxW = contentWidth;
        const boxH = totalBlockH + boxPadY * 2;
        ctx.save();
        ctx.fillStyle = colors.cardSurfaceBg;
        ctx.globalAlpha = effectiveTransparent ? Math.max(0.05, textBackdropOpacity / 100) : 0.92;
        drawRoundedRect(ctx, boxX, boxY, boxW, boxH, 16);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = colors.accentColor;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
      }

      // Safe-zone guide during active drag so user avoids overlapping headline accidentally
      if (showSelectionGuide && isDraggingCanvas && totalBlockH > 0) {
        ctx.save();
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.72)';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        drawRoundedRect(ctx, padX - 8, blockTopY - 12, contentWidth + 16, totalBlockH + 24, 10);
        ctx.stroke();
        ctx.restore();
      }

      const contentStartX = padX + cardInnerPadX;

      // Ribbon + Location Tag
      if (showRibbon) {
        const cleanRibbon = (ribbonText.trim() || 'BREAKING NEWS').toUpperCase();
        ctx.font = `800 ${isCompactH ? 20 : 23}px ${sansFont}`;
        const ribbonW = Math.min(textWrapWidth, ctx.measureText(cleanRibbon).width + 46);

        ctx.save();
        ctx.fillStyle = colors.ribbonBg;
        ctx.beginPath();
        ctx.moveTo(contentStartX, blockTopY);
        ctx.lineTo(contentStartX + ribbonW, blockTopY);
        ctx.lineTo(contentStartX + ribbonW - 12, blockTopY + ribbonH);
        ctx.lineTo(contentStartX, blockTopY + ribbonH);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = colors.accentColor;
        ctx.fillRect(contentStartX, blockTopY, 7, ribbonH);

        ctx.fillStyle = colors.ribbonText;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(cleanRibbon, contentStartX + 18, blockTopY + ribbonH / 2 + 1);
        ctx.restore();

        if (locationTag.trim()) {
          const locText = locationTag.trim().toUpperCase();
          ctx.font = `700 ${isCompactH ? 18 : 20}px ${sansFont}`;
          const locX = contentStartX + ribbonW + 12;
          const locW = Math.min(contentStartX + textWrapWidth - locX, ctx.measureText(locText).width + 28);
          if (locW > 64) {
            const lightSurface =
              (layoutId === 'split_editorial' || layoutId === 'diagonal_magazine' || layoutId === 'urgent_ticker') &&
              isLightHex(colors.cardSurfaceBg);
            ctx.fillStyle = lightSurface ? '#F1F5F9' : 'rgba(15, 23, 42, 0.85)';
            drawRoundedRect(ctx, locX, blockTopY + 3, locW, ribbonH - 6, 6);
            ctx.fill();
            ctx.strokeStyle = lightSurface ? '#CBD5E1' : 'rgba(255,255,255,0.28)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.fillStyle = lightSurface ? '#0F172A' : '#F8FAFC';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(locText, locX + locW / 2, blockTopY + ribbonH / 2 + 1, locW - 14);
          }
        }
      }

      // Headline Color Logic
      const usesCardSurface =
        layoutId === 'split_editorial' ||
        layoutId === 'diagonal_magazine' ||
        layoutId === 'urgent_ticker';
      const headColor =
        usesCardSurface || layoutId === 'framed_spotlight'
          ? layoutId === 'framed_spotlight'
            ? isLightHex(colors.studioBgBottom)
              ? '#0F172A'
              : colors.headlineColor
            : colors.headlineColor
          : colors.headlineColor;
      const subColor =
        usesCardSurface || layoutId === 'framed_spotlight'
          ? layoutId === 'framed_spotlight'
            ? isLightHex(colors.studioBgBottom)
              ? '#475569'
              : colors.subheadlineColor
            : colors.subheadlineColor
          : colors.subheadlineColor;

      let yCursor = blockTopY + ribbonH + gapRibbonToHead;
      if (headlineLines.length > 0) {
        ctx.font = headlineFont;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        if (!usesCardSurface && layoutId !== 'framed_spotlight') {
          ctx.shadowColor = effectiveTransparent ? 'rgba(0,0,0,0.88)' : 'rgba(0,0,0,0.68)';
          ctx.shadowBlur = effectiveTransparent ? 18 : 12;
          ctx.shadowOffsetY = 3;
        }
        ctx.fillStyle = headColor;
        for (const line of headlineLines) {
          if (effectiveTransparent && textBackdropOpacity <= 15) {
            ctx.strokeStyle = 'rgba(0,0,0,0.55)';
            ctx.lineWidth = 3;
            ctx.strokeText(line, contentStartX, yCursor);
          }
          ctx.fillText(line, contentStartX, yCursor);
          yCursor += lineHeight;
        }
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
      }

      if (subLines.length > 0) {
        yCursor += gapHeadToSub;
        ctx.font = `500 ${subFontSize}px ${sansFont}`;
        ctx.fillStyle = subColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        if (effectiveTransparent) {
          ctx.shadowColor = 'rgba(0,0,0,0.82)';
          ctx.shadowBlur = 12;
          ctx.shadowOffsetY = 2;
        }
        for (const sLine of subLines) {
          ctx.fillText(sLine, contentStartX, yCursor);
          yCursor += subLineHeight;
        }
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
      }

      // 5. Draggable Authentic X (Twitter) Comment Card
      if (xCard.enabled) {
        const cardW = Math.round((xCard.widthPct / 100) * W);
        const cardPad = 26;
        const avatarSize = 56;
        const isDark = xCard.theme !== 'light';
        const cardBg =
          xCard.theme === 'dark' ? '#000000' : xCard.theme === 'dim' ? '#15202B' : '#FFFFFF';
        const cardBorder =
          xCard.theme === 'dark' ? '#2F3336' : xCard.theme === 'dim' ? '#38444D' : '#E2E8F0';
        const primaryText = isDark ? '#F7F9F9' : '#0F1419';
        const mutedText = isDark ? '#8B98A5' : '#536471';

        const bodyFontSize = cardW < 620 ? 22 : 25;
        const bodyLineH = Math.round(bodyFontSize * 1.38);
        ctx.font = `400 ${bodyFontSize}px ${sansFont}`;
        const xBodyLines = wrapCanvasText(
          ctx,
          xCard.body.trim() || 'Andika maoni au ujumbe wa akaunti ya X hapa...',
          cardW - cardPad * 2
        ).slice(0, 6);

        const headerH = avatarSize + 14;
        const bodyH = xBodyLines.length * bodyLineH;
        const timeH = xCard.timestamp.trim() ? 32 : 0;
        const metricsH = xCard.showMetrics ? 42 : 0;
        const cardH = cardPad * 2 + headerH + bodyH + timeH + metricsH + 8;

        const cx = Math.max(
          20,
          Math.min(W - cardW - 20, Math.round((xCard.xPct / 100) * W - cardW / 2))
        );
        const cy = Math.max(
          stageTop + 14,
          Math.min(stageBottom - cardH - 14, Math.round((xCard.yPct / 100) * H - cardH / 2))
        );

        if (!isExportCanvas) {
          xCardHitboxRef.current = { x: cx, y: cy, w: cardW, h: cardH };
        }

        // Card container
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.38)';
        ctx.shadowBlur = 26;
        ctx.shadowOffsetY = 10;
        ctx.fillStyle = cardBg;
        drawRoundedRect(ctx, cx, cy, cardW, cardH, 22);
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = cardBorder;
        ctx.lineWidth = 2;
        drawRoundedRect(ctx, cx, cy, cardW, cardH, 22);
        ctx.stroke();

        // Avatar circle
        const avX = cx + cardPad;
        const avY = cy + cardPad;
        ctx.save();
        ctx.beginPath();
        ctx.arc(avX + avatarSize / 2, avY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.clip();
        if (xCard.avatarImg) {
          drawCoverImageInRect(ctx, xCard.avatarImg, avX, avY, avatarSize, avatarSize, 1, 0, 0);
        } else {
          ctx.fillStyle = '#0E2640';
          ctx.fillRect(avX, avY, avatarSize, avatarSize);
          ctx.fillStyle = '#FFFFFF';
          ctx.font = `800 24px ${sansFont}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const initial = (xCard.displayName.trim()[0] || 'M').toUpperCase();
          ctx.fillText(initial, avX + avatarSize / 2, avY + avatarSize / 2 + 1);
        }
        ctx.restore();

        // Display Name + Verified Badge + Handle
        const nameX = avX + avatarSize + 14;
        const nameText = xCard.displayName.trim() || 'Malosha Official';
        ctx.font = `800 22px ${sansFont}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = primaryText;

        const maxNameW = cardW - cardPad * 2 - avatarSize - 64;
        let renderedName = nameText;
        while (ctx.measureText(renderedName).width > maxNameW && renderedName.length > 3) {
          renderedName = `${renderedName.slice(0, -4)}...`;
        }
        ctx.fillText(renderedName, nameX, avY + 18);

        if (xCard.verifyType !== 'none') {
          const nameW = ctx.measureText(renderedName).width;
          drawXVerifiedBadge(ctx, nameX + nameW + 15, avY + 18, 22, xCard.verifyType);
        }

        const cleanHandle = xCard.handle.trim()
          ? xCard.handle.trim().startsWith('@')
            ? xCard.handle.trim()
            : `@${xCard.handle.trim()}`
          : '@maloshaforums';
        ctx.font = `500 18px ${sansFont}`;
        ctx.fillStyle = mutedText;
        ctx.fillText(cleanHandle, nameX, avY + 43);

        // X Logo top-right
        ctx.fillStyle = primaryText;
        ctx.font = `800 26px ${sansFont}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText('𝕏', cx + cardW - cardPad, avY + 4);

        // Body lines
        let xBodyY = avY + headerH;
        ctx.font = `400 ${bodyFontSize}px ${sansFont}`;
        ctx.fillStyle = primaryText;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        for (const line of xBodyLines) {
          ctx.fillText(line, cx + cardPad, xBodyY);
          xBodyY += bodyLineH;
        }

        // Timestamp
        if (xCard.timestamp.trim()) {
          xBodyY += 10;
          ctx.font = `500 17px ${sansFont}`;
          ctx.fillStyle = mutedText;
          ctx.fillText(xCard.timestamp.trim(), cx + cardPad, xBodyY);
          xBodyY += 26;
        }

        // Engagement Metrics Row
        if (xCard.showMetrics) {
          xBodyY += 6;
          ctx.fillStyle = cardBorder;
          ctx.fillRect(cx + cardPad, xBodyY, cardW - cardPad * 2, 1.5);
          xBodyY += 12;

          const items = [
            { icon: '💬', val: xCard.replies || '0' },
            { icon: '🔁', val: xCard.reposts || '0' },
            { icon: '♥', val: xCard.likes || '0' },
            { icon: '📊', val: xCard.views || '0' },
          ];
          ctx.font = `600 17px ${sansFont}`;
          ctx.textBaseline = 'top';
          let mx = cx + cardPad;
          const colStep = Math.floor((cardW - cardPad * 2) / 4);
          for (const it of items) {
            ctx.fillStyle = it.icon === '♥' ? '#F91880' : mutedText;
            ctx.fillText(`${it.icon} ${it.val}`, mx, xBodyY);
            mx += colStep;
          }
        }

        if (showSelectionGuide && !positionsLocked && selectedTarget === 'xcard') {
          ctx.save();
          ctx.strokeStyle = '#38BDF8';
          ctx.lineWidth = 3;
          ctx.setLineDash([10, 6]);
          drawRoundedRect(ctx, cx - 5, cy - 5, cardW + 10, cardH + 10, 26);
          ctx.stroke();
          ctx.restore();
        }
      } else if (!isExportCanvas) {
        xCardHitboxRef.current = null;
      }

      // 6. Draggable Circular Cutout Photos (if set in front of headline)
      if (!circlesBehindText) {
        drawCircleCutoutsLayer();
      }

      // 7. Bottom Footer Bar: https://maloshaforums.web.app + Social Media Icons + Malosha Results System Promo
      const footerY = H - footerH;
      ctx.fillStyle = colors.footerBg;
      ctx.fillRect(0, footerY, W, mainFooterH);

      // Thin top accent line on footer
      ctx.fillStyle = colors.ribbonBg;
      ctx.fillRect(0, footerY, W, 3.5);

      const midFooterY = footerY + mainFooterH / 2 + 2;

      // Left side of footer: Web URL
      const cleanWebUrl = footerLink.trim() || 'https://maloshaforums.web.app';
      ctx.save();
      const globeX = padX + 10;
      const globeR = 9;
      ctx.strokeStyle = colors.accentColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(globeX, midFooterY, globeR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(globeX, midFooterY, globeR * 0.48, globeR, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(globeX - globeR, midFooterY);
      ctx.lineTo(globeX + globeR, midFooterY);
      ctx.stroke();
      ctx.restore();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = colors.footerText;
      ctx.font = `700 ${isCompactH ? 18 : 20}px ${monoFont}`;
      ctx.fillText(cleanWebUrl, padX + 28, midFooterY);

      // Right side of footer: Social Media Icons + Optional Handle
      let socialRightX = W - padX;
      if (footerHandle.trim()) {
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.font = `600 ${isCompactH ? 17 : 18}px ${sansFont}`;
        ctx.fillText(footerHandle.trim(), socialRightX, midFooterY);
        socialRightX -= ctx.measureText(footerHandle.trim()).width + 16;
      }

      if (enabledSocials.length > 0) {
        const iconSize = isCompactH ? 24 : 26;
        const iconGap = 8;
        for (let i = enabledSocials.length - 1; i >= 0; i--) {
          const iconCx = socialRightX - iconSize / 2;
          drawSocialGlyph(ctx, enabledSocials[i], iconCx, midFooterY, iconSize);
          socialRightX -= iconSize + iconGap;
        }
      }

      // Powered by Malosha Results System Sub-Banner
      if (showResultsBanner) {
        const promoY = footerY + mainFooterH;
        ctx.fillStyle = colors.promoBg;
        ctx.fillRect(0, promoY, W, promoBarH);

        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(0, promoY, W, 1);

        const promoMidY = promoY + promoBarH / 2 + 1;
        const cleanPromo =
          resultsPromoText.trim() ||
          'Powered by Malosha Results System — Mfumo wa Matokeo Mtandaoni';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = colors.promoText;
        ctx.font = `700 ${isCompactH ? 15 : 16}px ${sansFont}`;
        ctx.fillText(`⚡  ${cleanPromo.toUpperCase()}`, W / 2, promoMidY, W - padX * 2);
      }
    },
    [
      aspect,
      layoutId,
      fontStyle,
      colors,
      showHeaderBar,
      showMonogram,
      monogramText,
      channelLabel,
      showVerifiedMasthead,
      stampSeal,
      showWatermarkMark,
      showLivePill,
      dateStamp,
      showRibbon,
      ribbonText,
      locationTag,
      headline,
      headlineSize,
      subheadline,
      scrimStrength,
      transparentTextMode,
      textBackdropOpacity,
      photoStageShare,
      circlesBehindText,
      loadedPhoto,
      photoZoom,
      photoOffsetX,
      photoOffsetY,
      circlePhotos,
      xCard,
      footerLink,
      footerHandle,
      enabledSocials,
      showResultsBanner,
      resultsPromoText,
      selectedTarget,
      positionsLocked,
      isDraggingCanvas,
    ]
  );

  useEffect(() => {
    renderPosterToCanvas(Boolean(selectedTarget) && !positionsLocked);
  }, [renderPosterToCanvas, selectedTarget, positionsLocked]);

  // Redraw once web fonts finish loading so Fraunces & Plus Jakarta Sans render crisply
  useEffect(() => {
    let active = true;
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (active) renderPosterToCanvas(Boolean(selectedTarget) && !positionsLocked);
      });
    }
    return () => {
      active = false;
    };
  }, [renderPosterToCanvas, selectedTarget, positionsLocked]);

  // Guarantee drag state cleans up even if finger/mouse releases outside canvas
  useEffect(() => {
    const clearDrag = () => {
      if (dragSessionRef.current) {
        dragSessionRef.current = null;
        setIsDraggingCanvas(false);
      }
    };
    window.addEventListener('pointerup', clearDrag);
    window.addEventListener('pointercancel', clearDrag);
    return () => {
      window.removeEventListener('pointerup', clearDrag);
      window.removeEventListener('pointercancel', clearDrag);
    };
  }, []);

  // Canvas Pointer Drag Handlers for Circular Photos & X Card
  const getCanvasCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
      w: canvas.width,
      h: canvas.height,
      rectW: rect.width,
      rectH: rect.height,
    };
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragModeEnabled || positionsLocked) return;
    const coords = getCanvasCoords(e.clientX, e.clientY);
    if (!coords) return;
    const bounds = stageBoundsRef.current;

    // Hit-test circular photos first (topmost rendered last)
    for (let i = circleHitboxesRef.current.length - 1; i >= 0; i--) {
      const box = circleHitboxesRef.current[i];
      const dist = Math.hypot(coords.x - box.cx, coords.y - box.cy);
      if (dist <= box.r + 14) {
        const item = circlePhotos.find((c) => c.id === box.id);
        if (!item) continue;
        // Start from exact rendered center so there is ZERO jump on drag
        const exactXPct = (box.cx / coords.w) * 100;
        const exactYPct = (box.cy / coords.h) * 100;
        const minXPct = ((box.r + 12) / coords.w) * 100;
        const maxXPct = ((coords.w - box.r - 12) / coords.w) * 100;
        const minYPct = ((bounds.top + box.r + 10) / coords.h) * 100;
        const maxYPct = ((bounds.bottom - box.r - 10) / coords.h) * 100;

        setSelectedCircleId(box.id);
        setSelectedTarget(box.id);
        setIsDraggingCanvas(true);
        dragSessionRef.current = {
          target: box.id,
          startXPct: exactXPct,
          startYPct: exactYPct,
          startClientX: e.clientX,
          startClientY: e.clientY,
          minXPct,
          maxXPct,
          minYPct,
          maxYPct,
        };
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Ignore on browsers without pointer capture
        }
        return;
      }
    }

    // Hit-test X Card
    const xBox = xCardHitboxRef.current;
    if (
      xCard.enabled &&
      xBox &&
      coords.x >= xBox.x - 10 &&
      coords.x <= xBox.x + xBox.w + 10 &&
      coords.y >= xBox.y - 10 &&
      coords.y <= xBox.y + xBox.h + 10
    ) {
      const exactXPct = ((xBox.x + xBox.w / 2) / coords.w) * 100;
      const exactYPct = ((xBox.y + xBox.h / 2) / coords.h) * 100;
      const minXPct = ((20 + xBox.w / 2) / coords.w) * 100;
      const maxXPct = ((coords.w - 20 - xBox.w / 2) / coords.w) * 100;
      const minYPct = ((bounds.top + 14 + xBox.h / 2) / coords.h) * 100;
      const maxYPct = ((bounds.bottom - 14 - xBox.h / 2) / coords.h) * 100;

      setSelectedTarget('xcard');
      setIsDraggingCanvas(true);
      dragSessionRef.current = {
        target: 'xcard',
        startXPct: exactXPct,
        startYPct: exactYPct,
        startClientX: e.clientX,
        startClientY: e.clientY,
        minXPct,
        maxXPct,
        minYPct,
        maxYPct,
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore on browsers without pointer capture
      }
      return;
    }

    setSelectedTarget(null);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const session = dragSessionRef.current;
    if (!session || positionsLocked) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const dxPct = ((e.clientX - session.startClientX) / rect.width) * 100;
    const dyPct = ((e.clientY - session.startClientY) / rect.height) * 100;
    const clampedX = Math.max(session.minXPct, Math.min(session.maxXPct, session.startXPct + dxPct));
    const clampedY = Math.max(session.minYPct, Math.min(session.maxYPct, session.startYPct + dyPct));
    const nextX = Math.round(clampedX * 10) / 10;
    const nextY = Math.round(clampedY * 10) / 10;

    if (session.target === 'xcard') {
      setXCard((prev) => ({ ...prev, xPct: nextX, yPct: nextY }));
    } else {
      setCirclePhotos((prev) =>
        prev.map((c) => (c.id === session.target ? { ...c, xPct: nextX, yPct: nextY } : c))
      );
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragSessionRef.current) {
      dragSessionRef.current = null;
      setIsDraggingCanvas(false);
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore
      }
    }
  };

  // Offscreen clean export — NEVER mutates the live preview canvas or shifts any dragged layer
  const exportPosterBlob = async (): Promise<Blob> => {
    const liveCanvas = canvasRef.current;
    if (!liveCanvas) throw new Error('Canvas haipo.');
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = liveCanvas.width;
    exportCanvas.height = liveCanvas.height;
    renderPosterToCanvas(false, exportCanvas);
    return await new Promise<Blob>((resolve, reject) => {
      exportCanvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error('Imeshindwa kutengeneza picha ya poster.'));
        },
        'image/png',
        0.96
      );
    });
  };

  const makeSafeFileName = (): string => {
    const slug = (headline.trim() || 'breaking-news')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 36);
    return `malosha-${slug || 'poster'}.png`;
  };

  const handleDownloadPoster = async () => {
    try {
      const blob = await exportPosterBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = makeSafeFileName();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      onToast(tr('Poster imepakuliwa kwenye kifaa chako!', 'Poster saved to your device!'));
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : tr('Imeshindwa kupakua poster.', 'Failed to download poster.'),
        'error'
      );
    }
  };

  const buildSocialShareCaption = (): string => {
    const parts = [
      `${showRibbon ? `${ribbonText.trim().toUpperCase() || 'BREAKING NEWS'}: ` : ''}${headline.trim()}`,
      subheadline.trim(),
      footerLink.trim() || 'https://maloshaforums.web.app',
    ].filter(Boolean);
    return parts.join('\n\n');
  };

  const handleCopyShareCaption = async () => {
    try {
      await navigator.clipboard.writeText(buildSocialShareCaption());
      setCopiedCaption(true);
      window.setTimeout(() => setCopiedCaption(false), 2000);
      onToast(tr('Maelezo ya kushare yamenakiliwa.', 'Share caption copied.'));
    } catch {
      onToast(tr('Imeshindwa kunakili maelezo.', 'Failed to copy caption.'), 'error');
    }
  };

  const handleShareToSocial = async () => {
    setSharing(true);
    try {
      const blob = await exportPosterBlob();
      const fileName = makeSafeFileName();
      const posterFile = new File([blob], fileName, { type: 'image/png' });
      const caption = buildSocialShareCaption();

      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        (!navigator.canShare || navigator.canShare({ files: [posterFile] }))
      ) {
        await navigator.share({
          files: [posterFile],
          title: headline.trim() || 'Malosha Forums',
          text: caption,
        });
        onToast(tr('Poster imeshirikiwa kikamilifu!', 'Poster shared successfully!'));
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(caption).catch(() => {});
      }

      onToast(
        tr(
          'Poster imepakuliwa na maelezo kunakiliwa — tuma moja kwa moja WhatsApp, Facebook, Instagram au X.',
          'Poster downloaded and caption copied — upload directly to WhatsApp, Facebook, Instagram, or X.'
        )
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      onToast(
        err instanceof Error ? err.message : tr('Imeshindwa kushare poster.', 'Failed to share poster.'),
        'error'
      );
    } finally {
      setSharing(false);
    }
  };

  const handlePublishPosterToForum = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = postTitle.trim();
    const cleanBody = postBody.trim();

    if (publishBoard === 'Makala') {
      if (cleanTitle.length < 5 || cleanBody.length < 10) {
        onToast(
          tr(
            'Kwa Makala, weka kichwa (angalau herufi 5) na maelezo (angalau herufi 10).',
            'For Makala articles, enter a title (min 5 chars) and body (min 10 chars).'
          ),
          'error'
        );
        return;
      }
    } else if (publishMode === 'with_text') {
      if (cleanTitle.length > 140) {
        onToast(tr('Kichwa kisizidi herufi 140.', 'Title cannot exceed 140 characters.'), 'error');
        return;
      }
      if (!cleanTitle && !cleanBody) {
        onToast(
          tr(
            'Andika kichwa au maelezo ya chapisho, au chagua "Post Kama Picha Pekee".',
            'Enter a title or caption, or select "Post as Image Only".'
          ),
          'error'
        );
        return;
      }
    }

    setPublishing(true);
    setPublishedResult(null);
    try {
      const blob = await exportPosterBlob();
      const posterFile = new File([blob], makeSafeFileName(), { type: 'image/png' });
      const uploadedUrl = await uploadImageToCloudinary(posterFile);

      const finalTitle =
        publishMode === 'image_only' && publishBoard === 'Kijiweni'
          ? ''
          : cleanTitle || headline.trim().slice(0, 140);
      const finalBody =
        publishMode === 'image_only' && publishBoard === 'Kijiweni' ? '' : cleanBody;

      const createdId = await onPublishToPlatform({
        title: finalTitle,
        body: finalBody,
        category: publishBoard,
        tags: parseTagsInput(postTagsRaw),
        coverImage: uploadedUrl,
      });

      setPublishedResult({ topicId: createdId, board: publishBoard });
      onToast(
        publishBoard === 'Kijiweni'
          ? tr('Poster imechapishwa moja kwa moja Kijiweni!', 'Poster published straight to Kijiweni!')
          : tr('Poster imechapishwa kwenye Makala!', 'Poster published to Makala!')
      );
    } catch (err) {
      onToast(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kuchapisha poster ndani ya mfumo.', 'Failed to publish poster.'),
        'error'
      );
    } finally {
      setPublishing(false);
    }
  };

  const selectedCircle = circlePhotos.find((c) => c.id === selectedCircleId) || null;
  const hasDraggables = circlePhotos.length > 0 || xCard.enabled;

  const studioTabs: { id: StudioTabId; labelSw: string; labelEn: string; icon: React.ReactNode }[] = [
    { id: 'design', labelSw: 'Muundo & Rangi', labelEn: 'Design & Color', icon: <Palette className="h-3.5 w-3.5" /> },
    { id: 'media', labelSw: 'Picha & Duara', labelEn: 'Photos & Circles', icon: <ImagePlus className="h-3.5 w-3.5" /> },
    { id: 'xcard', labelSw: 'Kadi ya X', labelEn: 'X Post Card', icon: <MessageSquareQuote className="h-3.5 w-3.5" /> },
    { id: 'text', labelSw: 'Maandishi & Chini', labelEn: 'Text & Footer', icon: <Type className="h-3.5 w-3.5" /> },
    { id: 'publish', labelSw: 'Post / Kijiweni', labelEn: 'Publish', icon: <Send className="h-3.5 w-3.5" /> },
  ];

  return (
    <section
      aria-label={tr('Studio Kamili ya Poster za Mmiliki', 'Owner Complete Poster Studio')}
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      {/* Top Studio Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-[#8B0000] via-[#0E2640] to-[#0A1929] px-5 py-4 text-white">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
            <LayoutGrid className="h-5 w-5 text-amber-300" aria-hidden="true" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-bold tracking-tight sm:text-xl">
                {tr('Malosha Poster Studio (Pro)', 'Malosha Poster Studio (Pro)')}
              </h2>
              <span className="rounded bg-white/15 px-2 py-0.5 text-[10px] font-bold tracking-wider text-amber-200 uppercase">
                {tr('Mmiliki Pekee', 'Owner Only')}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-200">
              {tr(
                'Buni miundo tofauti, weka Kadi ya X, picha za duara za kuburuta, linki ya maloshaforums.web.app na Malosha Results System.',
                'Create varied layouts, add authentic X comment cards, draggable circle photos, web link and promo footer.'
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRandomizeDesign}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-amber-300/40 bg-amber-400/15 px-3 py-1.5 text-xs font-bold text-amber-200 transition-colors hover:bg-amber-400/25"
          >
            <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{tr('Badili Muonekano', 'Shuffle Look')}</span>
          </button>

          <button
            type="button"
            onClick={() => setStudioExpanded((p) => !p)}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/20"
          >
            <span>{studioExpanded ? tr('Kunja', 'Minimize') : tr('Fungua', 'Open')}</span>
            {studioExpanded ? (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {studioExpanded && (
        <div className="grid grid-cols-1 gap-6 p-4 sm:p-6 lg:grid-cols-12 lg:items-start">
          {/* LEFT COLUMN: Interactive Live Canvas + Direct Export/Share */}
          <div className="space-y-3.5 lg:sticky lg:top-[128px] lg:col-span-6">
            <div className="rounded-xl border border-slate-200 bg-slate-950 p-3 sm:p-4">
              {hasDraggables && (
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <Move className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                    {positionsLocked
                      ? tr('Nafasi zimefungwa — hazitahama wakati wa kupakua', 'Positions locked — zero shift on export')
                      : dragModeEnabled
                        ? tr('Gusa na buruta picha ya duara au kadi ya X popote', 'Touch & drag circle photos or X card anywhere')
                        : tr('Kuburuta kumefungwa ili kusogeza ukurasa', 'Dragging paused for page scroll')}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPositionsLocked((v) => !v)}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold transition-colors ${
                        positionsLocked
                          ? 'border border-emerald-400/45 bg-emerald-500/20 text-emerald-300'
                          : 'border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {positionsLocked ? (
                        <Lock className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <Unlock className="h-3 w-3" aria-hidden="true" />
                      )}
                      <span>{positionsLocked ? tr('Nafasi: ZIMEFUNGWA', 'Locked') : tr('Funga Nafasi', 'Lock Pos')}</span>
                    </button>

                    <button
                      type="button"
                      disabled={positionsLocked}
                      onClick={() => setDragModeEnabled((v) => !v)}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold transition-colors disabled:opacity-45 ${
                        dragModeEnabled && !positionsLocked
                          ? 'border border-amber-400/40 bg-amber-400/20 text-amber-300'
                          : 'border border-slate-700 bg-slate-800 text-slate-300'
                      }`}
                    >
                      <Hand className="h-3 w-3" aria-hidden="true" />
                      <span>{dragModeEnabled ? tr('Kuburuta: WAZI', 'Drag: ON') : tr('Kuburuta: ZIMA', 'Drag: OFF')}</span>
                    </button>
                  </div>
                </div>
              )}

              <canvas
                ref={canvasRef}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onPointerCancel={handleCanvasPointerUp}
                className={`mx-auto block h-auto max-h-[72vh] w-auto max-w-full rounded-lg object-contain shadow-2xl sm:max-w-[440px] ${
                  hasDraggables && dragModeEnabled && !positionsLocked
                    ? isDraggingCanvas
                      ? 'cursor-grabbing touch-none'
                      : 'cursor-grab touch-none'
                    : ''
                }`}
              />
            </div>

            {/* Primary Download & Social Share Row */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void handleDownloadPoster()}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 transition-colors hover:bg-slate-50 sm:text-sm"
              >
                <Download className="h-4 w-4 text-[#1D4E89]" aria-hidden="true" />
                <span>{tr('Pakua Picha (PNG)', 'Download PNG')}</span>
              </button>

              <button
                type="button"
                disabled={sharing}
                onClick={() => void handleShareToSocial()}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#0E2640] px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-[#163A5F] disabled:opacity-60 sm:text-sm"
              >
                {sharing ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Share2 className="h-4 w-4 text-amber-400" aria-hidden="true" />
                )}
                <span>
                  {sharing
                    ? tr('Inaandaa...', 'Preparing...')
                    : tr('Shiriki Mitandaoni (Picha)', 'Share Poster Image')}
                </span>
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs">
              <span className="truncate text-slate-600">
                {tr('Nakili maelezo + linki ya https://maloshaforums.web.app', 'Copy caption + web link')}
              </span>
              <button
                type="button"
                onClick={() => void handleCopyShareCaption()}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
              >
                {copiedCaption ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                )}
                <span>{copiedCaption ? tr('Imenakiliwa', 'Copied') : tr('Nakili', 'Copy')}</span>
              </button>
            </div>
          </div>

          {/* RIGHT COLUMN: Full Studio Tabbed Controls */}
          <div className="space-y-4 lg:col-span-6">
            {/* Studio Navigation Tabs */}
            <div
              role="tablist"
              aria-label={tr('Zana za Studio', 'Studio tools')}
              className="grid grid-cols-2 gap-1.5 rounded-xl border border-slate-200 bg-slate-100 p-1.5 sm:grid-cols-5"
            >
              {studioTabs.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-bold transition-all ${
                      active
                        ? 'bg-white text-[#0E2640] shadow-sm ring-1 ring-slate-200'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.icon}
                    <span className="truncate">{tr(tab.labelSw, tab.labelEn)}</span>
                  </button>
                );
              })}
            </div>

            {/* TAB 1: DESIGN, LAYOUT, SIZE & CUSTOM COLORS */}
            {activeTab === 'design' && (
              <div className="space-y-4">
                {/* Aspect Ratio / Compact Social Sizes */}
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold tracking-wide text-slate-800 uppercase">
                      {tr('Ukubwa wa Mitandao ya Kijamii (Isijikate)', 'Social Media Aspect Ratio (No Crop)')}
                    </h3>
                  </div>
                  <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {ASPECT_OPTIONS.map((opt) => {
                      const active = aspect === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setAspect(opt.id)}
                          className={`rounded-lg border px-2.5 py-2 text-left transition-all ${
                            active
                              ? 'border-[#BB1919] bg-red-50/70 text-[#8B0000] ring-1 ring-[#BB1919]'
                              : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <div className="text-xs font-bold">{tr(opt.labelSw, opt.labelEn)}</div>
                          <div className="text-[10px] text-slate-500">
                            {opt.width}×{opt.height} · {opt.hintSw}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 7 Distinct Structural Layout Designs */}
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-bold tracking-wide text-slate-800 uppercase">
                      {tr('Chagua Muundo wa Template (Miundo 7 Tofauti)', 'Choose Structural Layout (7 Designs)')}
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        setTransparentTextMode((v) => {
                          const next = !v;
                          if (next) setScrimStrength((s) => Math.min(s, 18));
                          return next;
                        });
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                        transparentTextMode || layoutId === 'portrait_transparent'
                          ? 'border-[#1D4E89] bg-sky-50 text-[#0E2640]'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>
                        {transparentTextMode || layoutId === 'portrait_transparent'
                          ? tr('Portrait Transparent: WAZI ✓', 'Portrait Transparent: ON ✓')
                          : tr('Washa Portrait Transparent', 'Enable Portrait Transparent')}
                      </span>
                    </button>
                  </div>
                  <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {LAYOUT_OPTIONS.map((lay) => {
                      const active = layoutId === lay.id;
                      return (
                        <button
                          key={lay.id}
                          type="button"
                          onClick={() => {
                            setLayoutId(lay.id);
                            if (lay.id === 'portrait_transparent') {
                              setTransparentTextMode(true);
                              setScrimStrength((s) => Math.min(s, 15));
                            }
                          }}
                          className={`rounded-lg border p-2.5 text-left transition-all ${
                            active
                              ? 'border-[#0E2640] bg-sky-50 text-[#0E2640] ring-1 ring-[#0E2640]'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <div className="text-xs font-bold">{tr(lay.nameSw, lay.nameEn)}</div>
                          <div className="mt-0.5 text-[10px] leading-tight text-slate-500">
                            {tr(lay.descSw, lay.descEn)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Color Presets + Custom Color Pickers + Font Switch */}
                <div className="space-y-3.5 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-bold tracking-wide text-slate-800 uppercase">
                      {tr('Rangi & Fonti ya Maandishi', 'Colors & Typography')}
                    </h3>
                    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-bold">
                      <button
                        type="button"
                        onClick={() => setFontStyle('sans')}
                        className={`rounded-md px-2.5 py-1 ${
                          fontStyle === 'sans' ? 'bg-[#0E2640] text-white' : 'text-slate-600'
                        }`}
                      >
                        Sans (Kisasa)
                      </button>
                      <button
                        type="button"
                        onClick={() => setFontStyle('serif')}
                        className={`rounded-md px-2.5 py-1 font-serif ${
                          fontStyle === 'serif' ? 'bg-[#0E2640] text-white' : 'text-slate-600'
                        }`}
                      >
                        Serif (Jarida)
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {PALETTE_PRESETS.map((p) => {
                      const active = paletteId === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => applyPalettePreset(p)}
                          className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[11px] font-semibold transition-all ${
                            active
                              ? 'border-[#BB1919] bg-slate-50 text-slate-900 ring-1 ring-[#BB1919]'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <span
                            className="h-4 w-4 shrink-0 rounded-full border border-black/15"
                            style={{
                              background: `linear-gradient(135deg, ${p.topBarBg} 50%, ${p.accentColor} 50%)`,
                            }}
                            aria-hidden="true"
                          />
                          <span className="truncate">{tr(p.nameSw, p.nameEn)}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Full Custom Color Pickers */}
                  <div className="border-t border-slate-100 pt-3">
                    <div className="mb-2 text-[11px] font-bold text-slate-600">
                      {tr('Buni Rangi Zako Mwenyewe (Custom Colors):', 'Customize Any Color:')}
                    </div>
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                      {(
                        [
                          { key: 'topBarBg', labelSw: 'Baa ya Juu', labelEn: 'Top Bar' },
                          { key: 'ribbonBg', labelSw: 'Utepe (Ribbon)', labelEn: 'Ribbon' },
                          { key: 'accentColor', labelSw: 'Alama (Accent)', labelEn: 'Accent' },
                          { key: 'cardSurfaceBg', labelSw: 'Kadi / Mandhari', labelEn: 'Card Bg' },
                          { key: 'headlineColor', labelSw: 'Kichwa Kikuu', labelEn: 'Headline' },
                          { key: 'footerBg', labelSw: 'Chini (Footer)', labelEn: 'Footer Bg' },
                        ] as { key: keyof PosterPalette; labelSw: string; labelEn: string }[]
                      ).map((cItem) => (
                        <label
                          key={cItem.key}
                          className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-700"
                        >
                          <span className="truncate">{tr(cItem.labelSw, cItem.labelEn)}</span>
                          <input
                            type="color"
                            value={colors[cItem.key]}
                            onChange={(e) => updateCustomColor(cItem.key, e.target.value)}
                            className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: BACKGROUND PHOTO + DRAGGABLE CIRCULAR CUTOUT PHOTOS */}
            {activeTab === 'media' && (
              <div className="space-y-4">
                {/* Main Background Photo */}
                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-bold tracking-wide text-slate-800 uppercase">
                      {tr('Picha Kuu ya Nyuma (Background)', 'Main Background Photo')}
                    </h3>
                    <div className="flex items-center gap-2">
                      <input
                        ref={mainFileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        onChange={handleSelectMainPhoto}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => mainFileInputRef.current?.click()}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-[#1D4E89] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#163A5F]"
                      >
                        <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{loadedPhoto ? tr('Badilisha Picha', 'Change') : tr('Pakia Picha', 'Upload')}</span>
                      </button>
                      {loadedPhoto && (
                        <button
                          type="button"
                          onClick={handleClearMainPhoto}
                          className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{tr('Ondoa', 'Remove')}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {loadedPhoto ? (
                    <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:grid-cols-2">
                      <div>
                        <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                          <span>{tr('Zoom Picha', 'Zoom')}</span>
                          <span className="font-mono tabular-nums">{photoZoom.toFixed(2)}x</span>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={2}
                          step={0.02}
                          value={photoZoom}
                          onChange={(e) => setPhotoZoom(Number(e.target.value))}
                          className="mt-1 w-full accent-[#BB1919]"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                          <span>{tr('Giza la Nyuma (0% = Picha Halisi)', 'Scrim Darkness (0% = Natural)')}</span>
                          <span className="font-mono tabular-nums">{scrimStrength}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={95}
                          step={1}
                          value={scrimStrength}
                          onChange={(e) => setScrimStrength(Number(e.target.value))}
                          className="mt-1 w-full accent-[#BB1919]"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                          <span>{tr('Kushoto / Kulia', 'Pan X')}</span>
                          <span className="font-mono tabular-nums">{photoOffsetX}%</span>
                        </div>
                        <input
                          type="range"
                          min={-100}
                          max={100}
                          step={2}
                          value={photoOffsetX}
                          onChange={(e) => setPhotoOffsetX(Number(e.target.value))}
                          className="mt-1 w-full accent-[#1D4E89]"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                          <span>{tr('Juu / Chini', 'Pan Y')}</span>
                          <span className="font-mono tabular-nums">{photoOffsetY}%</span>
                        </div>
                        <input
                          type="range"
                          min={-100}
                          max={100}
                          step={2}
                          value={photoOffsetY}
                          onChange={(e) => setPhotoOffsetY(Number(e.target.value))}
                          className="mt-1 w-full accent-[#1D4E89]"
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="flex items-center gap-1.5 text-xs text-slate-500">
                      <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                      <span>
                        {tr(
                          'Pakia picha ya nyuma ya tukio, au tumia mandhari safi ya studio.',
                          'Upload a background event photo or keep the studio gradient.'
                        )}
                      </span>
                    </p>
                  )}

                  {/* Photo Stage Size & Portrait Transparent Mode Controls */}
                  <div className="space-y-2.5 rounded-lg border border-sky-200/80 bg-sky-50/50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-[#0E2640]">
                        <input
                          type="checkbox"
                          checked={transparentTextMode}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setTransparentTextMode(checked);
                            if (checked) {
                              setScrimStrength((s) => Math.min(s, 15));
                            }
                          }}
                          className="h-4 w-4 rounded accent-[#1D4E89]"
                        />
                        <span>
                          {tr(
                            'Portrait Mode (Maandishi Transparent, Picha Ionekane Halisi)',
                            'Portrait Mode (Transparent Text Backdrop, Clear Photo)'
                          )}
                        </span>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <div className="flex justify-between text-[11px] font-semibold text-slate-700">
                          <span>{tr('Ukubwa wa Eneo la Picha', 'Photo Area Size')}</span>
                          <span className="font-mono tabular-nums">{photoStageShare}%</span>
                        </div>
                        <input
                          type="range"
                          min={50}
                          max={74}
                          step={1}
                          value={photoStageShare}
                          onChange={(e) => setPhotoStageShare(Number(e.target.value))}
                          className="mt-1 w-full accent-[#0E2640]"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-[11px] font-semibold text-slate-700">
                          <span>{tr('Uwazi wa Sanduku la Maandishi', 'Text Box Opacity')}</span>
                          <span className="font-mono tabular-nums">{textBackdropOpacity}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={90}
                          step={2}
                          value={textBackdropOpacity}
                          onChange={(e) => {
                            setTextBackdropOpacity(Number(e.target.value));
                            if (!transparentTextMode && layoutId !== 'portrait_transparent') {
                              setTransparentTextMode(true);
                            }
                          }}
                          className="mt-1 w-full accent-[#1D4E89]"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Draggable Circular Cutout Photos */}
                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold tracking-wide text-slate-800 uppercase">
                        {tr('Picha za Duara za Kuburuta (Overlays)', 'Draggable Circle Cutouts')}
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        {tr(
                          'Ongeza picha moja au nyingi za duara kisha uziburute popote kwenye poster.',
                          'Add one or more circular photos and drag them anywhere on the canvas.'
                        )}
                      </p>
                    </div>
                    <div>
                      <input
                        ref={circleFileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        onChange={handleAddCirclePhoto}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => circleFileInputRef.current?.click()}
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#0E2640] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#163A5F]"
                      >
                        <CirclePlus className="h-4 w-4 text-amber-300" aria-hidden="true" />
                        <span>{tr('Ongeza Picha ya Duara', 'Add Circle Photo')}</span>
                      </button>
                    </div>
                  </div>

                  {circlePhotos.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
                          <span>{tr('Mpangilio na Maandishi:', 'Text Layer Order:')}</span>
                          <button
                            type="button"
                            onClick={() => setCirclesBehindText(false)}
                            className={`rounded px-2 py-0.5 text-[10px] font-bold transition-colors ${
                              !circlesBehindText
                                ? 'bg-[#0E2640] text-white'
                                : 'border border-slate-300 bg-white text-slate-600'
                            }`}
                          >
                            {tr('Mbele ya Maandishi', 'In Front')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setCirclesBehindText(true)}
                            className={`rounded px-2 py-0.5 text-[10px] font-bold transition-colors ${
                              circlesBehindText
                                ? 'bg-[#0E2640] text-white'
                                : 'border border-slate-300 bg-white text-slate-600'
                            }`}
                          >
                            {tr('Nyuma ya Maandishi', 'Behind Headline')}
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => setPositionsLocked((v) => !v)}
                          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold transition-colors ${
                            positionsLocked
                              ? 'bg-emerald-600 text-white'
                              : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {positionsLocked ? (
                            <Lock className="h-3 w-3" aria-hidden="true" />
                          ) : (
                            <Unlock className="h-3 w-3" aria-hidden="true" />
                          )}
                          <span>{positionsLocked ? tr('Nafasi Zimefungwa', 'Locked') : tr('Funga Nafasi', 'Lock Positions')}</span>
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {circlePhotos.map((item, idx) => {
                          const isSel = item.id === selectedCircleId;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setSelectedCircleId(item.id);
                                setSelectedTarget(item.id);
                              }}
                              className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs font-bold transition-all ${
                                isSel
                                  ? 'border-[#BB1919] bg-red-50 text-[#8B0000]'
                                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              <img
                                src={item.objectUrl}
                                alt=""
                                className="h-7 w-7 rounded-full object-cover"
                              />
                              <span>
                                {tr(`Duara ${idx + 1}`, `Circle ${idx + 1}`)}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {selectedCircle && (
                        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                              <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                                <span>{tr('Ukubwa wa Duara', 'Circle Size')}</span>
                                <span className="font-mono tabular-nums">{selectedCircle.sizePct}%</span>
                              </div>
                              <input
                                type="range"
                                min={10}
                                max={48}
                                step={1}
                                value={selectedCircle.sizePct}
                                onChange={(e) =>
                                  updateCirclePhoto(selectedCircle.id, { sizePct: Number(e.target.value) })
                                }
                                className="mt-1 w-full accent-[#BB1919]"
                              />
                            </div>
                            <div>
                              <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                                <span>{tr('Unene wa Fremu', 'Border Ring')}</span>
                                <span className="font-mono tabular-nums">{selectedCircle.borderWidth}px</span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={14}
                                step={1}
                                value={selectedCircle.borderWidth}
                                onChange={(e) =>
                                  updateCirclePhoto(selectedCircle.id, { borderWidth: Number(e.target.value) })
                                }
                                className="mt-1 w-full accent-[#0E2640]"
                              />
                            </div>
                            <div>
                              <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                                <span>{tr('Nafasi Mlalo (X)', 'Position X')}</span>
                                <span className="font-mono tabular-nums">{Math.round(selectedCircle.xPct)}%</span>
                              </div>
                              <input
                                type="range"
                                min={8}
                                max={92}
                                step={1}
                                value={selectedCircle.xPct}
                                onChange={(e) =>
                                  updateCirclePhoto(selectedCircle.id, { xPct: Number(e.target.value) })
                                }
                                className="mt-1 w-full accent-[#1D4E89]"
                              />
                            </div>
                            <div>
                              <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                                <span>{tr('Nafasi Wima (Y)', 'Position Y')}</span>
                                <span className="font-mono tabular-nums">{Math.round(selectedCircle.yPct)}%</span>
                              </div>
                              <input
                                type="range"
                                min={12}
                                max={88}
                                step={1}
                                value={selectedCircle.yPct}
                                onChange={(e) =>
                                  updateCirclePhoto(selectedCircle.id, { yPct: Number(e.target.value) })
                                }
                                className="mt-1 w-full accent-[#1D4E89]"
                              />
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-semibold text-slate-600">
                                {tr('Rangi ya Mzingo:', 'Ring Color:')}
                              </span>
                              {CIRCLE_RING_COLORS.map((rc) => (
                                <button
                                  key={rc}
                                  type="button"
                                  onClick={() =>
                                    updateCirclePhoto(selectedCircle.id, { borderColor: rc })
                                  }
                                  className={`h-5 w-5 rounded-full border ${
                                    selectedCircle.borderColor === rc
                                      ? 'ring-2 ring-[#0E2640] ring-offset-1'
                                      : 'border-slate-300'
                                  }`}
                                  style={{ backgroundColor: rc }}
                                  aria-label={rc}
                                />
                              ))}
                              <input
                                type="color"
                                value={selectedCircle.borderColor}
                                onChange={(e) =>
                                  updateCirclePhoto(selectedCircle.id, { borderColor: e.target.value })
                                }
                                className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0"
                              />
                            </div>

                            <button
                              type="button"
                              onClick={() => removeCirclePhoto(selectedCircle.id)}
                              className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700 hover:bg-red-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{tr('Ondoa Duara Hii', 'Remove')}</span>
                            </button>
                          </div>

                          <input
                            type="text"
                            maxLength={24}
                            value={selectedCircle.caption}
                            onChange={(e) =>
                              updateCirclePhoto(selectedCircle.id, { caption: e.target.value })
                            }
                            placeholder={tr('Jina fupi chini ya duara (hiari)...', 'Optional short label under circle...')}
                            className="min-h-[34px] w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800 focus:border-[#1D4E89] focus:outline-none"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: AUTHENTIC X (TWITTER) COMMENT CARD DESIGNER */}
            {activeTab === 'xcard' && (
              <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-slate-800 uppercase">
                      <BadgeCheck className="h-4 w-4 text-[#1D9BF0]" aria-hidden="true" />
                      <span>{tr('Kadi ya Maoni ya Akaunti ya X (Twitter)', 'X (Twitter) Account Comment Card')}</span>
                    </h3>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {tr(
                        'Itaonekana kama chapisho halisi la X lenye picha, jina, @username na tiki ya uthibitisho.',
                        'Renders an authentic X card with profile photo, name, @handle, and verification badge.'
                      )}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setXCard((prev) => {
                        const nextEnabled = !prev.enabled;
                        if (nextEnabled) setSelectedTarget('xcard');
                        return { ...prev, enabled: nextEnabled };
                      });
                    }}
                    className={`min-h-[38px] rounded-lg px-3.5 py-1.5 text-xs font-bold transition-colors ${
                      xCard.enabled
                        ? 'bg-[#1D9BF0] text-white'
                        : 'border border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {xCard.enabled ? tr('Kadi Imewashwa ✓', 'Card Active ✓') : tr('Washa Kadi ya X', 'Enable X Card')}
                  </button>
                </div>

                {/* X Avatar + Card Theme + Verification Badge */}
                <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:grid-cols-2">
                  <div className="flex items-center gap-3">
                    <input
                      ref={xAvatarFileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleSelectXAvatar}
                      className="hidden"
                    />
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-300 bg-[#0E2640] text-white">
                      {xCard.avatarUrl ? (
                        <img src={xCard.avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <UserCircle2 className="h-6 w-6 text-slate-200" aria-hidden="true" />
                      )}
                    </div>
                    <div className="space-y-1">
                      <button
                        type="button"
                        onClick={() => xAvatarFileInputRef.current?.click()}
                        className="rounded-md bg-[#0E2640] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#163A5F]"
                      >
                        {xCard.avatarUrl
                          ? tr('Badili Picha ya X', 'Change Avatar')
                          : tr('Pakia Picha ya X', 'Upload Avatar')}
                      </button>
                      {xCard.avatarUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            setXCard((p) => {
                              if (p.avatarUrl) URL.revokeObjectURL(p.avatarUrl);
                              return { ...p, avatarUrl: null, avatarImg: null };
                            })
                          }
                          className="ml-2 text-[11px] font-semibold text-red-600 hover:underline"
                        >
                          {tr('Ondoa', 'Clear')}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Theme & Badge */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-slate-600">{tr('Rangi:', 'Theme:')}</span>
                      {(
                        [
                          { id: 'light', label: 'Nyeupe' },
                          { id: 'dim', label: 'Dim' },
                          { id: 'dark', label: 'Nyeusi' },
                        ] as { id: XCardTheme; label: string }[]
                      ).map((th) => (
                        <button
                          key={th.id}
                          type="button"
                          onClick={() => setXCard((p) => ({ ...p, theme: th.id, enabled: true }))}
                          className={`rounded px-2 py-1 text-[10px] font-bold ${
                            xCard.theme === th.id
                              ? 'bg-[#0F172A] text-white'
                              : 'border border-slate-200 bg-white text-slate-600'
                          }`}
                        >
                          {th.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-slate-600">{tr('Tiki:', 'Badge:')}</span>
                      {(
                        [
                          { id: 'blue', label: 'Blue ✓', color: '#1D9BF0' },
                          { id: 'gold', label: 'Gold ✓', color: '#E2B714' },
                          { id: 'gray', label: 'Gray ✓', color: '#829AAB' },
                          { id: 'none', label: 'Hakuna', color: '#64748B' },
                        ] as { id: XVerifyType; label: string; color: string }[]
                      ).map((vb) => (
                        <button
                          key={vb.id}
                          type="button"
                          onClick={() => setXCard((p) => ({ ...p, verifyType: vb.id, enabled: true }))}
                          className={`rounded px-2 py-1 text-[10px] font-bold transition-all ${
                            xCard.verifyType === vb.id
                              ? 'text-white shadow-sm'
                              : 'border border-slate-200 bg-white text-slate-600'
                          }`}
                          style={xCard.verifyType === vb.id ? { backgroundColor: vb.color } : undefined}
                        >
                          {vb.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Display Name & Handle */}
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600">
                      {tr('Jina la Akaunti (Display Name)', 'Display Name')}
                    </label>
                    <input
                      type="text"
                      maxLength={36}
                      value={xCard.displayName}
                      onChange={(e) => setXCard((p) => ({ ...p, displayName: e.target.value, enabled: true }))}
                      className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-900 focus:border-[#1D9BF0] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600">
                      {tr('Username (@handle)', 'Handle')}
                    </label>
                    <input
                      type="text"
                      maxLength={30}
                      value={xCard.handle}
                      onChange={(e) => setXCard((p) => ({ ...p, handle: e.target.value, enabled: true }))}
                      className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 px-3 text-xs font-mono text-slate-800 focus:border-[#1D9BF0] focus:outline-none"
                    />
                  </div>
                </div>

                {/* Tweet / Comment Content */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">
                    {tr('Ujumbe / Maoni ya X', 'X Post / Comment Text')}
                  </label>
                  <textarea
                    rows={3}
                    maxLength={280}
                    value={xCard.body}
                    onChange={(e) => setXCard((p) => ({ ...p, body: e.target.value, enabled: true }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-[#1D9BF0] focus:outline-none"
                  />
                </div>

                {/* Timestamp + Engagement Stats */}
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600">
                      {tr('Muda & Tarehe (Kadi ya X)', 'X Post Timestamp')}
                    </label>
                    <input
                      type="text"
                      maxLength={34}
                      value={xCard.timestamp}
                      onChange={(e) => setXCard((p) => ({ ...p, timestamp: e.target.value }))}
                      className="mt-1 min-h-[36px] w-full rounded-lg border border-slate-300 px-3 text-xs text-slate-800 focus:border-[#1D9BF0] focus:outline-none"
                    />
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={xCard.showMetrics}
                        onChange={(e) => setXCard((p) => ({ ...p, showMetrics: e.target.checked }))}
                        className="h-4 w-4 rounded accent-[#1D9BF0]"
                      />
                      <span>{tr('Onyesha idadi ya Likes / Views', 'Show Likes / Views row')}</span>
                    </label>
                  </div>
                </div>

                {xCard.showMetrics && (
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <span className="text-[10px] font-semibold text-slate-500">Replies</span>
                      <input
                        type="text"
                        maxLength={8}
                        value={xCard.replies}
                        onChange={(e) => setXCard((p) => ({ ...p, replies: e.target.value }))}
                        className="mt-0.5 min-h-[32px] w-full rounded border border-slate-300 px-2 text-xs"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-slate-500">Reposts</span>
                      <input
                        type="text"
                        maxLength={8}
                        value={xCard.reposts}
                        onChange={(e) => setXCard((p) => ({ ...p, reposts: e.target.value }))}
                        className="mt-0.5 min-h-[32px] w-full rounded border border-slate-300 px-2 text-xs"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-slate-500">Likes</span>
                      <input
                        type="text"
                        maxLength={8}
                        value={xCard.likes}
                        onChange={(e) => setXCard((p) => ({ ...p, likes: e.target.value }))}
                        className="mt-0.5 min-h-[32px] w-full rounded border border-slate-300 px-2 text-xs"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-slate-500">Views</span>
                      <input
                        type="text"
                        maxLength={8}
                        value={xCard.views}
                        onChange={(e) => setXCard((p) => ({ ...p, views: e.target.value }))}
                        className="mt-0.5 min-h-[32px] w-full rounded border border-slate-300 px-2 text-xs"
                      />
                    </div>
                  </div>
                )}

                {/* X Card Width & Position Sliders */}
                <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:grid-cols-3">
                  <div>
                    <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                      <span>{tr('Upana wa Kadi', 'Width')}</span>
                      <span className="font-mono tabular-nums">{xCard.widthPct}%</span>
                    </div>
                    <input
                      type="range"
                      min={50}
                      max={92}
                      step={1}
                      value={xCard.widthPct}
                      onChange={(e) => setXCard((p) => ({ ...p, widthPct: Number(e.target.value) }))}
                      className="mt-1 w-full accent-[#1D9BF0]"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                      <span>{tr('Mlalo (X)', 'Pos X')}</span>
                      <span className="font-mono tabular-nums">{Math.round(xCard.xPct)}%</span>
                    </div>
                    <input
                      type="range"
                      min={15}
                      max={85}
                      step={1}
                      value={xCard.xPct}
                      onChange={(e) => setXCard((p) => ({ ...p, xPct: Number(e.target.value) }))}
                      className="mt-1 w-full accent-[#0E2640]"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                      <span>{tr('Wima (Y)', 'Pos Y')}</span>
                      <span className="font-mono tabular-nums">{Math.round(xCard.yPct)}%</span>
                    </div>
                    <input
                      type="range"
                      min={15}
                      max={85}
                      step={1}
                      value={xCard.yPct}
                      onChange={(e) => setXCard((p) => ({ ...p, yPct: Number(e.target.value) }))}
                      className="mt-1 w-full accent-[#0E2640]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: HEADLINES, TOP BAR & CUSTOM WEB/SOCIAL/RESULTS FOOTER */}
            {activeTab === 'text' && (
              <div className="space-y-4">
                {/* Headline & Ribbon */}
                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-bold tracking-wide text-slate-800 uppercase">
                      {tr('Kichwa Kikuu & Utepe', 'Headline & Banner')}
                    </h3>
                    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={showRibbon}
                        onChange={(e) => setShowRibbon(e.target.checked)}
                        className="h-4 w-4 rounded accent-[#BB1919]"
                      />
                      <span>{tr('Onyesha Utepe', 'Show Ribbon')}</span>
                    </label>
                  </div>

                  {showRibbon && (
                    <div>
                      <div className="flex flex-wrap gap-1.5">
                        {RIBBON_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setRibbonText(preset)}
                            className={`rounded-md border px-2 py-1 text-[10px] font-bold transition-colors ${
                              ribbonText.toUpperCase() === preset
                                ? 'border-[#BB1919] bg-[#BB1919] text-white'
                                : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <input
                          type="text"
                          maxLength={28}
                          value={ribbonText}
                          onChange={(e) => setRibbonText(e.target.value)}
                          placeholder="BREAKING NEWS"
                          className="min-h-[36px] w-full rounded-lg border border-slate-300 px-3 text-xs font-bold uppercase text-slate-900 focus:border-[#BB1919] focus:outline-none"
                        />
                        <input
                          type="text"
                          maxLength={26}
                          value={locationTag}
                          onChange={(e) => setLocationTag(e.target.value)}
                          placeholder={tr('Mahali (mfano: TANZANIA)', 'Location tag')}
                          className="min-h-[36px] w-full rounded-lg border border-slate-300 px-3 text-xs font-semibold uppercase text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="poster-headline" className="text-xs font-semibold text-slate-700">
                        {tr('Kichwa Kikuu cha Habari', 'Main Headline')}
                      </label>
                      <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-[10px] font-bold">
                        {(
                          [
                            { id: 'small', label: tr('Ndogo', 'S') },
                            { id: 'normal', label: tr('Wastani', 'M') },
                            { id: 'large', label: tr('Kubwa', 'L') },
                            { id: 'xlarge', label: tr('XL', 'XL') },
                          ] as { id: HeadlineSize; label: string }[]
                        ).map((sz) => (
                          <button
                            key={sz.id}
                            type="button"
                            onClick={() => setHeadlineSize(sz.id)}
                            className={`rounded px-2 py-0.5 ${
                              headlineSize === sz.id ? 'bg-[#0E2640] text-white' : 'text-slate-600'
                            }`}
                          >
                            {sz.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <textarea
                      id="poster-headline"
                      rows={3}
                      maxLength={190}
                      value={headline}
                      onChange={(e) => setHeadline(e.target.value)}
                      placeholder={tr('Andika kichwa kikuu au acha wazi...', 'Enter headline or leave blank...')}
                      className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-sm font-bold text-slate-900 focus:border-[#BB1919] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="poster-sub" className="block text-xs font-semibold text-slate-700">
                      {tr('Maelezo Mafupi (Hiari)', 'Sub-headline (Optional)')}
                    </label>
                    <textarea
                      id="poster-sub"
                      rows={2}
                      maxLength={220}
                      value={subheadline}
                      onChange={(e) => setSubheadline(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-800 focus:border-[#1D4E89] focus:outline-none"
                    />
                  </div>
                </div>

                {/* Top Masthead Controls */}
                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold tracking-wide text-slate-800 uppercase">
                      {tr('Baa ya Juu (Masthead)', 'Top Masthead Bar')}
                    </h3>
                    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={showHeaderBar}
                        onChange={(e) => setShowHeaderBar(e.target.checked)}
                        className="h-4 w-4 rounded accent-[#0E2640]"
                      />
                      <span>{tr('Onyesha Baa ya Juu', 'Show Top Bar')}</span>
                    </label>
                  </div>

                  {showHeaderBar && (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600">
                            {tr('Herufi za Logo (3)', 'Logo Letters')}
                          </label>
                          <input
                            type="text"
                            maxLength={3}
                            value={monogramText}
                            onChange={(e) => setMonogramText(e.target.value)}
                            className="mt-1 min-h-[36px] w-full rounded-lg border border-slate-300 px-3 text-xs font-bold uppercase text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600">
                            {tr('Jina la Kituo', 'Channel Label')}
                          </label>
                          <input
                            type="text"
                            maxLength={26}
                            value={channelLabel}
                            onChange={(e) => setChannelLabel(e.target.value)}
                            placeholder="MALOSHA FORUMS"
                            className="mt-1 min-h-[36px] w-full rounded-lg border border-slate-300 px-3 text-xs font-bold uppercase text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600">
                            {tr('Tarehe', 'Date')}
                          </label>
                          <input
                            type="text"
                            maxLength={24}
                            value={dateStamp}
                            onChange={(e) => setDateStamp(e.target.value)}
                            className="mt-1 min-h-[36px] w-full rounded-lg border border-slate-300 px-3 text-xs font-mono text-slate-900"
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-4 text-xs text-slate-700">
                        <label className="inline-flex cursor-pointer items-center gap-2 font-medium">
                          <input
                            type="checkbox"
                            checked={showMonogram}
                            onChange={(e) => setShowMonogram(e.target.checked)}
                            className="h-4 w-4 rounded accent-[#0E2640]"
                          />
                          <span>{tr('Onyesha Viboksi vya Logo', 'Show Logo Blocks')}</span>
                        </label>
                        <label className="inline-flex cursor-pointer items-center gap-2 font-medium">
                          <input
                            type="checkbox"
                            checked={showLivePill}
                            onChange={(e) => setShowLivePill(e.target.checked)}
                            className="h-4 w-4 rounded accent-[#BB1919]"
                          />
                          <span>{tr('Onyesha alama ya LIVE', 'Show LIVE badge')}</span>
                        </label>
                        <label className="inline-flex cursor-pointer items-center gap-2 font-medium">
                          <input
                            type="checkbox"
                            checked={showVerifiedMasthead}
                            onChange={(e) => setShowVerifiedMasthead(e.target.checked)}
                            className="h-4 w-4 rounded accent-[#1D9BF0]"
                          />
                          <span>{tr('Tiki ya Uthibitisho (Blue Check)', 'Verified Badge')}</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* Official Seals, Verification Marks & Watermark */}
                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-slate-800 uppercase">
                      <BadgeCheck className="h-4 w-4 text-[#1D9BF0]" aria-hidden="true" />
                      <span>{tr('Alama Rasmi za Malosha Forums & Watermark', 'Official Seals & Watermark')}</span>
                    </h3>
                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={showWatermarkMark}
                        onChange={(e) => setShowWatermarkMark(e.target.checked)}
                        className="h-4 w-4 rounded accent-[#0E2640]"
                      />
                      <span>{tr('Alama ya Watermark', 'Show Watermark')}</span>
                    </label>
                  </div>

                  <div>
                    <span className="block text-[11px] font-semibold text-slate-600">
                      {tr('Muhuri Rasmi wa Kona (Official Stamp Seal):', 'Corner Official Stamp Seal:')}
                    </span>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {(
                        [
                          { id: 'official', labelSw: 'Malosha Rasmi', labelEn: 'Official' },
                          { id: 'verified', labelSw: 'Taarifa ya Kweli ✓', labelEn: 'Verified ✓' },
                          { id: 'exclusive', labelSw: 'Exclusive Desk', labelEn: 'Exclusive' },
                          { id: 'breaking', labelSw: 'Habari Kuu', labelEn: 'Breaking' },
                          { id: 'none', labelSw: 'Hakuna', labelEn: 'None' },
                        ] as { id: StampSealId; labelSw: string; labelEn: string }[]
                      ).map((seal) => {
                        const active = stampSeal === seal.id;
                        return (
                          <button
                            key={seal.id}
                            type="button"
                            onClick={() => setStampSeal(seal.id)}
                            className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                              active
                                ? 'border-[#BB1919] bg-[#BB1919] text-white'
                                : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {tr(seal.labelSw, seal.labelEn)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Custom Footer: https://maloshaforums.web.app + Social Icons + Malosha Results System */}
                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-slate-800 uppercase">
                    <Globe className="h-4 w-4 text-[#1D4E89]" aria-hidden="true" />
                    <span>
                      {tr('Chini ya Poster: Linki, Ikoni za Mitandao & Tangazo', 'Footer: Link, Social Icons & Promo')}
                    </span>
                  </h3>

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600">
                        {tr('Linki ya Tovuti (Web Link)', 'Website Link')}
                      </label>
                      <input
                        type="text"
                        maxLength={48}
                        value={footerLink}
                        onChange={(e) => setFooterLink(e.target.value)}
                        placeholder="https://maloshaforums.web.app"
                        className="mt-1 min-h-[36px] w-full rounded-lg border border-slate-300 px-3 text-xs font-mono text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                        <AtSign className="h-3 w-3" aria-hidden="true" />
                        <span>{tr('Handle ya Ziada (Hiari)', 'Extra Handle (Optional)')}</span>
                      </label>
                      <input
                        type="text"
                        maxLength={28}
                        value={footerHandle}
                        onChange={(e) => setFooterHandle(e.target.value)}
                        placeholder={tr('Acha wazi au weka jina...', 'Leave blank or enter handle...')}
                        className="mt-1 min-h-[36px] w-full rounded-lg border border-slate-300 px-3 text-xs text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Social Media Icons Selector */}
                  <div>
                    <span className="block text-[11px] font-semibold text-slate-600">
                      {tr('Ikoni za Mitandao ya Kijamii Zinazoonekana:', 'Visible Social Media Icons:')}
                    </span>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {SOCIAL_PLATFORMS.map((sp) => {
                        const active = enabledSocials.includes(sp.id);
                        return (
                          <button
                            key={sp.id}
                            type="button"
                            onClick={() => handleToggleSocial(sp.id)}
                            className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                              active
                                ? 'border-[#0E2640] bg-[#0E2640] text-white'
                                : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {sp.label} {active ? '✓' : ''}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Malosha Results System Promo Bar */}
                  <div className="border-t border-slate-100 pt-3">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-800">
                      <input
                        type="checkbox"
                        checked={showResultsBanner}
                        onChange={(e) => setShowResultsBanner(e.target.checked)}
                        className="h-4 w-4 rounded accent-[#D97706]"
                      />
                      <span>
                        {tr(
                          'Onyesha Tangazo la "Powered by Malosha Results System"',
                          'Show "Powered by Malosha Results System" Banner'
                        )}
                      </span>
                    </label>
                    {showResultsBanner && (
                      <input
                        type="text"
                        maxLength={78}
                        value={resultsPromoText}
                        onChange={(e) => setResultsPromoText(e.target.value)}
                        className="mt-2 min-h-[36px] w-full rounded-lg border border-amber-300 bg-amber-50/40 px-3 text-xs font-semibold text-slate-900 focus:border-[#D97706] focus:outline-none"
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: DIRECT PUBLISH TO KIJIWENI / MAKALA */}
            {activeTab === 'publish' && (
              <form
                onSubmit={handlePublishPosterToForum}
                className="space-y-3.5 rounded-xl border border-[#BFD7F2] bg-sky-50/45 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-[#0E2640] uppercase">
                    <Sparkles className="h-4 w-4 text-[#D97706]" aria-hidden="true" />
                    <span>{tr('Post Ndani ya Mfumo (Kijiweni / Makala)', 'Publish Inside Malosha Forums')}</span>
                  </h3>
                  <div
                    role="group"
                    aria-label={tr('Chagua sehemu ya kupost', 'Choose destination board')}
                    className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-[11px] font-bold"
                  >
                    <button
                      type="button"
                      onClick={() => setPublishBoard('Kijiweni')}
                      className={`rounded-md px-2.5 py-1 transition-colors ${
                        publishBoard === 'Kijiweni'
                          ? 'bg-[#1D4E89] text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Kijiweni
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPublishBoard('Makala');
                        setPublishMode('with_text');
                        if (!postTitle.trim()) setPostTitle(headline.trim().slice(0, 140));
                        if (!postBody.trim()) setPostBody(subheadline.trim() || headline.trim());
                      }}
                      className={`rounded-md px-2.5 py-1 transition-colors ${
                        publishBoard === 'Makala'
                          ? 'bg-[#B80000] text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Makala
                    </button>
                  </div>
                </div>

                {publishBoard === 'Kijiweni' && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setPublishMode('image_only')}
                      className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-bold transition-all ${
                        publishMode === 'image_only'
                          ? 'border-[#1D4E89] bg-[#1D4E89] text-white shadow-sm'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <ImagePlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{tr('Post Kama Picha Pekee', 'Post as Poster Image Only')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPublishMode('with_text');
                        if (!postTitle.trim()) setPostTitle(headline.trim().slice(0, 140));
                      }}
                      className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-bold transition-all ${
                        publishMode === 'with_text'
                          ? 'border-[#1D4E89] bg-[#1D4E89] text-white shadow-sm'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Newspaper className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{tr('Ongeza Maneno Kisha Post', 'Add Caption Text & Post')}</span>
                    </button>
                  </div>
                )}

                {(publishMode === 'with_text' || publishBoard === 'Makala') && (
                  <div className="space-y-2.5 pt-1">
                    <input
                      type="text"
                      maxLength={140}
                      value={postTitle}
                      onChange={(e) => setPostTitle(e.target.value)}
                      placeholder={tr('Kichwa cha chapisho...', 'Post title...')}
                      className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 placeholder:font-normal focus:border-[#1D4E89] focus:outline-none"
                    />
                    <textarea
                      rows={3}
                      maxLength={8000}
                      value={postBody}
                      onChange={(e) => setPostBody(e.target.value)}
                      placeholder={tr(
                        'Andika maelezo au ujumbe wa nyongeza utakaoambatana na poster...',
                        'Write additional caption or article details...'
                      )}
                      className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                    />
                    <input
                      type="text"
                      value={postTagsRaw}
                      onChange={(e) => setPostTagsRaw(e.target.value)}
                      placeholder={tr('Lebo (hiari): habari, malosha', 'Tags (optional): news, malosha')}
                      className="min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800 focus:border-[#1D4E89] focus:outline-none"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={publishing}
                  className={`flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors disabled:opacity-60 ${
                    publishBoard === 'Makala'
                      ? 'bg-[#B80000] hover:bg-[#990000]'
                      : 'bg-[#1D4E89] hover:bg-[#163A5F]'
                  }`}
                >
                  {publishing ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span>
                    {publishing
                      ? tr('Inapakia na Kuchapisha...', 'Uploading & Publishing...')
                      : publishBoard === 'Kijiweni'
                        ? publishMode === 'image_only'
                          ? tr('Post Poster Kama Picha Kijiweni', 'Post Poster Image to Kijiweni')
                          : tr('Post Poster na Maneno Kijiweni', 'Post Poster & Caption to Kijiweni')
                        : tr('Chapisha Makala yenye Poster', 'Publish Article with Poster')}
                  </span>
                </button>

                {publishedResult && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-900">
                    <span className="font-semibold">
                      {tr(
                        `Imetumwa kikamilifu kwenye ${publishedResult.board}!`,
                        `Successfully published to ${publishedResult.board}!`
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onNavigateBoard(publishedResult.board)}
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-bold text-[#163A5F] hover:bg-emerald-100"
                      >
                        <span>{tr(`Nenda ${publishedResult.board}`, `View ${publishedResult.board}`)}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenPublishedTopic(publishedResult.topicId)}
                        className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-800"
                      >
                        <span>{tr('Fungua Chapisho', 'Open Post')}</span>
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
