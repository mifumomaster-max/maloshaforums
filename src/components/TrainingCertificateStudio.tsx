import React, { useEffect, useMemo, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import {
  Award,
  Camera,
  Check,
  Download,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { uploadImageToCloudinary } from '../services/cloudinaryService';
import {
  deleteTrainingCertificate,
  fetchForumMembersDirectory,
  listTrainingCertificates,
  saveTrainingCertificate,
} from '../services/forumService';
import {
  CertificateOrientation,
  CertificateTheme,
  MemberDirectoryCandidate,
  TrainingCertificateData,
} from '../types';
import { SignaturePadInput } from './SignaturePadInput';

interface TrainingCertificateStudioProps {
  ownerUid: string;
  ownerDisplayName?: string;
  onToast: (message: string, kind?: 'success' | 'error') => void;
}

type CertificateFormState = Omit<
  TrainingCertificateData,
  'issuerUid' | 'createdAt' | 'updatedAt'
>;

interface WatermarkOptions {
  showAnimals: boolean;
  showTrees: boolean;
  showCodes: boolean;
  showLogo: boolean;
  strength: 'soft' | 'balanced' | 'bold';
}

interface ThemePalette {
  labelSw: string;
  labelEn: string;
  primary: string;
  primaryMid: string;
  primaryDark: string;
  secondaryAccent: string;
  gold: string;
  goldLight: string;
  goldDark: string;
  paperCenter: string;
  paperMid: string;
  paperEdge: string;
  tintFill: string;
  watermarkColor: string;
  watermarkSecondary: string;
}

const THEME_PALETTES: Record<CertificateTheme, ThemePalette> = {
  navy_gold: {
    labelSw: 'Samawati Kifalme & Dhahabu',
    labelEn: 'Royal Sapphire & 24k Gold',
    primary: '#0B2F6B',
    primaryMid: '#154C9E',
    primaryDark: '#061B42',
    secondaryAccent: '#9E1B32',
    gold: '#C9901E',
    goldLight: '#F3D078',
    goldDark: '#7C540B',
    paperCenter: '#FFFEFA',
    paperMid: '#FBF7EC',
    paperEdge: '#EFE7D4',
    tintFill: 'rgba(11, 47, 107, 0.065)',
    watermarkColor: 'rgba(11, 47, 107, 1)',
    watermarkSecondary: 'rgba(180, 130, 36, 1)',
  },
  emerald_gold: {
    labelSw: 'Zamaradi & Dhahabu (Taifa)',
    labelEn: 'Vibrant Emerald & Gold',
    primary: '#085C3F',
    primaryMid: '#10825B',
    primaryDark: '#043826',
    secondaryAccent: '#0E7490',
    gold: '#C9901E',
    goldLight: '#F5D57E',
    goldDark: '#7A520A',
    paperCenter: '#FCFEFC',
    paperMid: '#F3F9F5',
    paperEdge: '#E2EFE7',
    tintFill: 'rgba(8, 92, 63, 0.068)',
    watermarkColor: 'rgba(8, 92, 63, 1)',
    watermarkSecondary: 'rgba(180, 130, 36, 1)',
  },
  burgundy_gold: {
    labelSw: 'Zambarau-Nyekundu & Dhahabu',
    labelEn: 'Imperial Crimson & Champagne Gold',
    primary: '#72122B',
    primaryMid: '#9B1C3E',
    primaryDark: '#470919',
    secondaryAccent: '#1E3A8A',
    gold: '#C9901E',
    goldLight: '#F5D47D',
    goldDark: '#78510B',
    paperCenter: '#FFFCFA',
    paperMid: '#FCF4F2',
    paperEdge: '#F2E2DF',
    tintFill: 'rgba(114, 18, 43, 0.065)',
    watermarkColor: 'rgba(114, 18, 43, 1)',
    watermarkSecondary: 'rgba(180, 130, 36, 1)',
  },
};

function generateSerialNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const c1 = chars[Math.floor(Math.random() * chars.length)];
  const c2 = chars[Math.floor(Math.random() * chars.length)];
  return `CERT-MLF-${year}-${rand}${c1}${c2}`;
}

function getTodayFormatted(): string {
  const now = new Date();
  const months = [
    'Januari',
    'Februari',
    'Machi',
    'Aprili',
    'Mei',
    'Juni',
    'Julai',
    'Agosti',
    'Septemba',
    'Oktoba',
    'Novemba',
    'Desemba',
  ];
  return `${String(now.getDate()).padStart(2, '0')} ${months[now.getMonth()]} ${now.getFullYear()}`;
}

function createInitialCertificate(ownerDisplayName = 'Mmiliki wa Malosha'): CertificateFormState {
  const serial = generateSerialNumber();
  return {
    certId: serial,
    serialNumber: serial,
    orientation: 'landscape',
    theme: 'navy_gold',
    institutionName: 'TAASISI YA MAFUNZO · MALOSHA FORUMS',
    institutionSubtitle: 'IDARA YA ELIMU, UJUZI NA MAENDELEO YA TAALUMA · TANZANIA',
    institutionLogoUrl: '',
    kickerText: 'CHETI RASMI CHA TAALUMA · OFFICIAL INSTITUTIONAL CREDENTIAL',
    certificateTitle: 'CHETI CHA KUHITIMU MAFUNZO',
    certificateSubtitle: 'CERTIFICATE OF TRAINING COMPLETION',
    introLine: 'Hii ni kuthibitisha rasmi kuwa',
    recipientUid: '',
    recipientName: 'NEEMA SAMWEL MASAWE',
    completionLine: 'amehudhuria na kufuzu kwa kiwango cha juu mafunzo maalum ya:',
    courseTitle: 'Uongozi wa Kidijitali, Ujasiriamali & Mifumo ya Kisasa',
    courseDetails:
      'Mafunzo ya vitendo yakijumuisha uchambuzi wa mifumo, maadili ya taaluma, na matumizi bora ya teknolojia katika maendeleo ya jamii.',
    durationText: 'Saa 48 · Wiki 6',
    gradeText: 'Bora Zaidi (Distinction)',
    issueDateText: getTodayFormatted(),
    issueLocation: 'Dar es Salaam, Tanzania',
    signatory1Name: ownerDisplayName || 'Mifumo Master',
    signatory1Title: 'Mkurugenzi & Mkufunzi Mkuu',
    signatory1SigText: 'Mifumo Master',
    signatory1SigPath:
      'M16 58 C34 16, 68 14, 52 54 C74 40, 108 20, 146 42 C170 56, 206 24, 248 38 M24 68 Q138 54 270 60',
    showSignatory2: true,
    signatory2Name: 'Dk. Amina J. Mwinyi',
    signatory2Title: 'Mratibu wa Mafunzo & Msajili',
    signatory2SigText: 'A. J. Mwinyi',
    signatory2SigPath: '',
    sealText: 'TAASISI RASMI · MALOSHA',
    watermarkText: 'MALOSHA FORUMS OFFICIAL CERTIFICATE',
  };
}

function computeCertificateChecksum(cert: CertificateFormState): string {
  const seed = `${cert.serialNumber}|${cert.recipientName}|${cert.courseTitle}|${cert.issueDateText}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + i * 7), 0x85ebca6b) >>> 0;
  }
  const p1 = (h1 >>> 0).toString(36).toUpperCase().padStart(4, '0').slice(0, 4);
  const p2 = (h2 >>> 0).toString(36).toUpperCase().padStart(4, '0').slice(0, 4);
  return `VER-${p1}-${p2}`;
}

function buildVerificationMatrix(seed: string, size = 9): boolean[][] {
  let acc = 2166136261;
  const grid: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) {
      const isCornerAnchor =
        (r < 2 && c < 2) ||
        (r < 2 && c >= size - 2) ||
        (r >= size - 2 && c < 2);
      if (isCornerAnchor) {
        row.push(true);
        continue;
      }
      const ch = seed.charCodeAt((r * size + c) % Math.max(1, seed.length));
      acc ^= ch + r * 17 + c * 31;
      acc = Math.imul(acc, 16777619) >>> 0;
      row.push((acc & 1) === 1 || acc % 3 === 0);
    }
    grid.push(row);
  }
  return grid;
}

function loadCorsImage(url: string): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => resolve(null), 6500);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawStarShape(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  points = 5
) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rad = (i * Math.PI) / points - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const x = cx + Math.cos(rad) * r;
    const y = cy + Math.sin(rad) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/**
 * Watermark Motif 1: Wanyama (Twiga / Giraffe, Simba / Lion Crest, Peace Dove)
 */
function drawGiraffeSilhouette(
  ctx: CanvasRenderingContext2D,
  cx: number,
  bottomY: number,
  height: number,
  fillColor: string,
  spotColor: string,
  flipX = false
) {
  ctx.save();
  ctx.translate(cx, bottomY);
  if (flipX) ctx.scale(-1, 1);
  const s = height / 280;
  ctx.scale(s, s);

  ctx.fillStyle = fillColor;
  ctx.beginPath();
  // Hind leg & tail
  ctx.moveTo(-42, 0);
  ctx.lineTo(-35, -72);
  ctx.lineTo(-48, -110);
  ctx.quadraticCurveTo(-60, -82, -62, -55); // tail
  ctx.lineTo(-56, -55);
  ctx.quadraticCurveTo(-50, -85, -42, -118);
  // Back line up to neck
  ctx.quadraticCurveTo(-18, -138, 12, -155);
  // Long neck up
  ctx.lineTo(24, -242);
  // Ear & Ossicones
  ctx.lineTo(14, -258);
  ctx.lineTo(22, -252);
  ctx.lineTo(27, -274);
  ctx.lineTo(31, -274);
  ctx.lineTo(32, -254);
  ctx.lineTo(38, -272);
  ctx.lineTo(42, -271);
  ctx.lineTo(39, -252);
  // Muzzle
  ctx.lineTo(66, -242);
  ctx.quadraticCurveTo(69, -234, 58, -228);
  ctx.lineTo(42, -226);
  // Front neck & chest
  ctx.lineTo(34, -142);
  // Front right leg
  ctx.lineTo(36, 0);
  ctx.lineTo(28, 0);
  ctx.lineTo(22, -108);
  // Belly
  ctx.lineTo(-10, -102);
  // Front left leg
  ctx.lineTo(-8, 0);
  ctx.lineTo(-16, 0);
  ctx.lineTo(-22, -104);
  // Hind inner leg
  ctx.lineTo(-34, 0);
  ctx.closePath();
  ctx.fill();

  // Signature giraffe spots
  ctx.fillStyle = spotColor;
  const spots: [number, number, number, number][] = [
    [26, -214, 5, 4],
    [22, -196, 6, 5],
    [27, -178, 5, 5],
    [19, -160, 6, 6],
    [4, -138, 8, 7],
    [-16, -128, 8, 7],
    [-32, -118, 7, 6],
    [16, -124, 7, 6],
    [-4, -114, 7, 6],
  ];
  spots.forEach(([sx, sy, rx, ry]) => {
    ctx.beginPath();
    ctx.ellipse(sx, sy, rx, ry, 0.25, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function drawLionCrestSilhouette(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
  flipX = false
) {
  ctx.save();
  ctx.translate(cx, cy);
  if (flipX) ctx.scale(-1, 1);
  const s = size / 180;
  ctx.scale(s, s);

  ctx.fillStyle = color;
  // Regal lioness/lion body & proud raised tail
  ctx.beginPath();
  // Rear hind paw to haunch
  ctx.moveTo(-64, 70);
  ctx.lineTo(-52, 70);
  ctx.lineTo(-42, 26);
  ctx.lineTo(-12, 24);
  // Belly & front legs
  ctx.lineTo(18, 22);
  ctx.lineTo(22, 70);
  ctx.lineTo(34, 70);
  ctx.lineTo(36, 18);
  ctx.lineTo(48, 70);
  ctx.lineTo(60, 70);
  ctx.lineTo(52, 6);
  // Mane & head profile
  ctx.quadraticCurveTo(68, -22, 56, -48);
  ctx.lineTo(74, -44);
  ctx.quadraticCurveTo(78, -56, 64, -64);
  ctx.lineTo(48, -78);
  ctx.lineTo(38, -68);
  // Mane rays
  ctx.quadraticCurveTo(10, -76, -8, -42);
  ctx.quadraticCurveTo(-24, -14, -48, -12);
  // Raised curved tail
  ctx.quadraticCurveTo(-78, -22, -74, -56);
  ctx.quadraticCurveTo(-68, -68, -58, -58);
  ctx.quadraticCurveTo(-62, -26, -42, -2);
  ctx.lineTo(-64, 70);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawPeaceDoveSilhouette(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
  flipX = false
) {
  ctx.save();
  ctx.translate(cx, cy);
  if (flipX) ctx.scale(-1, 1);
  const s = size / 120;
  ctx.scale(s, s);

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-48, 10);
  ctx.quadraticCurveTo(-18, -6, 6, -4);
  ctx.quadraticCurveTo(-8, -38, -44, -48); // upper wing
  ctx.quadraticCurveTo(-8, -52, 22, -16);
  ctx.quadraticCurveTo(36, -26, 48, -18); // head
  ctx.lineTo(58, -14); // beak
  ctx.lineTo(46, -8);
  ctx.quadraticCurveTo(34, 8, 8, 12);
  ctx.quadraticCurveTo(-14, 16, -26, 32); // lower tail
  ctx.lineTo(-42, 24);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Watermark Motif 2: Miti (Baobab / Mbuyu, Acacia Savanna Tree & Laurel Branches)
 */
function drawBaobabTreeWatermark(
  ctx: CanvasRenderingContext2D,
  cx: number,
  bottomY: number,
  height: number,
  color: string
) {
  ctx.save();
  ctx.translate(cx, bottomY);
  const s = height / 260;
  ctx.scale(s, s);

  ctx.fillStyle = color;
  // Wide baobab trunk & root flares
  ctx.beginPath();
  ctx.moveTo(-42, 0);
  ctx.quadraticCurveTo(-24, -18, -22, -122);
  // Left branches
  ctx.lineTo(-68, -172);
  ctx.lineTo(-56, -178);
  ctx.lineTo(-20, -145);
  ctx.lineTo(-32, -196);
  ctx.lineTo(-18, -198);
  ctx.lineTo(-4, -150);
  ctx.lineTo(6, -202);
  ctx.lineTo(20, -196);
  ctx.lineTo(14, -148);
  ctx.lineTo(58, -176);
  ctx.lineTo(68, -168);
  ctx.lineTo(22, -124);
  ctx.quadraticCurveTo(24, -18, 44, 0);
  ctx.closePath();
  ctx.fill();

  // Clustered canopy clouds
  const canopy: [number, number, number, number][] = [
    [-58, -188, 40, 22],
    [-22, -214, 42, 26],
    [16, -216, 44, 26],
    [56, -186, 40, 22],
    [0, -188, 56, 26],
  ];
  canopy.forEach(([x, y, rx, ry]) => {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function drawAcaciaTreeWatermark(
  ctx: CanvasRenderingContext2D,
  cx: number,
  bottomY: number,
  height: number,
  color: string
) {
  ctx.save();
  ctx.translate(cx, bottomY);
  const s = height / 220;
  ctx.scale(s, s);

  ctx.fillStyle = color;
  // Slender curved savanna acacia trunk & Y-branches
  ctx.beginPath();
  ctx.moveTo(-12, 0);
  ctx.quadraticCurveTo(-6, -65, -8, -125);
  ctx.lineTo(-58, -164);
  ctx.lineTo(-48, -168);
  ctx.lineTo(-4, -140);
  ctx.lineTo(0, -168);
  ctx.lineTo(10, -168);
  ctx.lineTo(8, -138);
  ctx.lineTo(54, -164);
  ctx.lineTo(62, -158);
  ctx.lineTo(8, -122);
  ctx.quadraticCurveTo(6, -65, 14, 0);
  ctx.closePath();
  ctx.fill();

  // Layered flat umbrella canopy
  ctx.beginPath();
  ctx.ellipse(0, -174, 96, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-44, -165, 50, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(46, -164, 52, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawLaurelWreath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: string
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = color;
  [-1, 1].forEach((side) => {
    for (let i = 0; i < 11; i++) {
      const ang = (Math.PI * 0.62) - i * 0.14;
      const lx = side * Math.sin(ang) * radius;
      const ly = Math.cos(ang) * radius;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(side * (-ang + 0.55));
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * 0.085, radius * 0.036, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });
  ctx.restore();
}

function drawInstitutionalCrestCanvas(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  primary: string,
  gold: string,
  goldLight: string
) {
  ctx.save();
  ctx.translate(cx, cy);

  // Outer gold halo
  const goldGrad = ctx.createLinearGradient(-radius, -radius, radius, radius);
  goldGrad.addColorStop(0, goldLight);
  goldGrad.addColorStop(0.5, gold);
  goldGrad.addColorStop(1, '#8C5E12');

  ctx.strokeStyle = goldGrad;
  ctx.lineWidth = radius * 0.085;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = primary;
  ctx.lineWidth = radius * 0.045;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.87, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = primary;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.78, 0, Math.PI * 2);
  ctx.fill();

  // Inner shield
  ctx.fillStyle = goldGrad;
  ctx.beginPath();
  ctx.moveTo(-radius * 0.34, -radius * 0.35);
  ctx.lineTo(radius * 0.34, -radius * 0.35);
  ctx.lineTo(radius * 0.3, radius * 0.09);
  ctx.quadraticCurveTo(0, radius * 0.45, 0, radius * 0.45);
  ctx.quadraticCurveTo(0, radius * 0.45, -radius * 0.3, radius * 0.09);
  ctx.closePath();
  ctx.fill();

  // Torch flame
  ctx.fillStyle = primary;
  ctx.beginPath();
  ctx.moveTo(0, -radius * 0.24);
  ctx.quadraticCurveTo(radius * 0.13, -radius * 0.03, 0, radius * 0.15);
  ctx.quadraticCurveTo(-radius * 0.13, -radius * 0.03, 0, -radius * 0.24);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  drawStarShape(ctx, 0, -radius * 0.54, radius * 0.085, radius * 0.038);
  ctx.fill();

  ctx.restore();
}

function drawGoldFoilSealCanvas(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  sealText: string,
  yearText: string,
  primary: string,
  accent: string,
  gold: string,
  goldLight: string
) {
  ctx.save();
  ctx.translate(cx, cy);

  // Rich Silk Twin Ribbons beneath seal
  const leftRibGrad = ctx.createLinearGradient(0, r * 0.4, 0, r * 1.48);
  leftRibGrad.addColorStop(0, primary);
  leftRibGrad.addColorStop(1, accent);
  ctx.fillStyle = leftRibGrad;

  ctx.beginPath();
  ctx.moveTo(-r * 0.4, r * 0.52);
  ctx.lineTo(-r * 0.62, r * 1.42);
  ctx.lineTo(-r * 0.31, r * 1.22);
  ctx.lineTo(-r * 0.08, r * 1.46);
  ctx.lineTo(0, r * 0.56);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = goldLight;
  ctx.lineWidth = r * 0.03;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(r * 0.4, r * 0.52);
  ctx.lineTo(r * 0.62, r * 1.42);
  ctx.lineTo(r * 0.31, r * 1.22);
  ctx.lineTo(r * 0.08, r * 1.46);
  ctx.lineTo(0, r * 0.56);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Drop shadow under medallion
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.22)';
  ctx.shadowBlur = r * 0.18;
  ctx.shadowOffsetY = r * 0.06;

  const teeth = 36;
  const grad = ctx.createRadialGradient(-r * 0.28, -r * 0.28, r * 0.08, 0, 0, r);
  grad.addColorStop(0, '#FFF7D6');
  grad.addColorStop(0.32, goldLight);
  grad.addColorStop(0.75, gold);
  grad.addColorStop(1, '#754D0B');

  ctx.fillStyle = grad;
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const rad = (i * Math.PI) / teeth;
    const radLen = i % 2 === 0 ? r : r * 0.9;
    const x = Math.cos(rad) * radLen;
    const y = Math.sin(rad) * radLen;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Embossed rings
  ctx.strokeStyle = '#5C3D09';
  ctx.lineWidth = r * 0.025;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.77, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.72)';
  ctx.lineWidth = r * 0.02;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.69, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#3B2504';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${Math.round(r * 0.145)}px "Plus Jakarta Sans", sans-serif`;
  const parts = (sealText || 'OFFICIAL SEAL').toUpperCase().split('·');
  ctx.fillText((parts[0] || 'OFFICIAL SEAL').trim().slice(0, 18), 0, -r * 0.22);
  ctx.font = `800 ${Math.round(r * 0.25)}px "Playfair Display", Georgia, serif`;
  ctx.fillText(yearText, 0, r * 0.06);
  ctx.font = `700 ${Math.round(r * 0.12)}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillText((parts[1] || 'VERIFIED').trim().slice(0, 18), 0, r * 0.34);

  ctx.restore();
}

/**
 * Unified canonical A4 renderer shared 1:1 by:
 * - Live interactive preview canvas
 * - Full-res 300 DPI A4 PDF generator (jsPDF)
 * - Full-res 300 DPI PNG image download
 */
function drawCertificateScene(
  ctx: CanvasRenderingContext2D,
  targetCert: CertificateFormState,
  customLogoImg: HTMLImageElement | null,
  wmOptions: WatermarkOptions
) {
  const isLand = targetCert.orientation === 'landscape';
  const W = isLand ? 2480 : 1754;
  const H = isLand ? 1754 : 2480;
  const pal = THEME_PALETTES[targetCert.theme];
  const targetChecksum = computeCertificateChecksum(targetCert);
  const targetMatrix = buildVerificationMatrix(
    `${targetCert.serialNumber}:${targetChecksum}:${targetCert.recipientName}`,
    9
  );
  const wmScale = wmOptions.strength === 'bold' ? 1.38 : wmOptions.strength === 'soft' ? 0.72 : 1.0;

  const rgbaFrom = (baseRgbPrefix: string, alpha: number) =>
    baseRgbPrefix.replace(/,\s*1\)$/, `, ${Math.min(0.22, alpha * wmScale).toFixed(3)})`);

  // 1. Vibrant Ceremonial Outer Mat & Luminous Inner Paper
  const outerGrad = ctx.createLinearGradient(0, 0, W, H);
  outerGrad.addColorStop(0, pal.primaryDark);
  outerGrad.addColorStop(0.5, pal.primaryMid);
  outerGrad.addColorStop(1, pal.primaryDark);
  ctx.fillStyle = outerGrad;
  ctx.fillRect(0, 0, W, H);

  // Subtle decorative gold lattice pattern in outer mat margin
  ctx.save();
  ctx.strokeStyle = 'rgba(243, 208, 120, 0.14)';
  ctx.lineWidth = 1.4;
  for (let d = -H; d < W + H; d += 36) {
    ctx.beginPath();
    ctx.moveTo(d, 0);
    ctx.lineTo(d + H, H);
    ctx.stroke();
  }
  ctx.restore();

  // Inner parchment sheet
  const mSheet = 56;
  const paperGrad = ctx.createRadialGradient(W / 2, H * 0.48, W * 0.05, W / 2, H / 2, W * 0.72);
  paperGrad.addColorStop(0, pal.paperCenter);
  paperGrad.addColorStop(0.62, pal.paperMid);
  paperGrad.addColorStop(1, pal.paperEdge);
  ctx.fillStyle = paperGrad;
  ctx.fillRect(mSheet, mSheet, W - mSheet * 2, H - mSheet * 2);

  // Soft corner radial warmth glow inside the parchment
  const cornerGlow = ctx.createRadialGradient(0, 0, 20, 0, 0, W * 0.46);
  cornerGlow.addColorStop(0, rgbaFrom(pal.watermarkSecondary, 0.08));
  cornerGlow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = cornerGlow;
  ctx.fillRect(mSheet, mSheet, W - mSheet * 2, H - mSheet * 2);

  // 2. Fine Security Guilloche Mesh across parchment
  ctx.save();
  ctx.beginPath();
  ctx.rect(mSheet, mSheet, W - mSheet * 2, H - mSheet * 2);
  ctx.clip();

  for (let i = 0; i < 46; i++) {
    ctx.beginPath();
    const baseY = i * (H / 44);
    ctx.strokeStyle =
      i % 3 === 0
        ? rgbaFrom(pal.watermarkSecondary, 0.055)
        : rgbaFrom(pal.watermarkColor, 0.03);
    ctx.lineWidth = 1.3;
    for (let x = mSheet; x <= W - mSheet; x += 26) {
      const y =
        baseY +
        Math.sin(x * 0.0055 + i * 0.34) * 16 +
        Math.cos(x * 0.013 - i * 0.22) * 6;
      if (x === mSheet) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // 3A. WATERMARK: CODE (Diagonal Security Codes + Binary/Hex Traces)
  if (wmOptions.showCodes) {
    ctx.save();
    ctx.fillStyle = rgbaFrom(pal.watermarkColor, 0.052);
    ctx.font = '700 20px "JetBrains Mono", monospace';
    ctx.rotate((-24 * Math.PI) / 180);
    const wmCodeLine = `${(targetCert.watermarkText || 'MALOSHA FORUMS').toUpperCase()} · ${targetCert.serialNumber} · ${targetChecksum} · 0x4D4C46`;
    for (let y = -H; y < H * 2; y += 160) {
      for (let x = -W; x < W * 2; x += 1080) {
        ctx.fillText(wmCodeLine, x, y);
      }
    }
    ctx.restore();

    // Fine vertical/horizontal security micro-code rails inside inner frame
    ctx.save();
    ctx.fillStyle = rgbaFrom(pal.watermarkColor, 0.075);
    ctx.font = '700 13px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    const topCodeStrip = `CODE:${targetChecksum} · SERIAL:${targetCert.serialNumber} · VERIFIED:${targetChecksum} · CODE:${targetChecksum} · SERIAL:${targetCert.serialNumber}`;
    ctx.fillText(topCodeStrip, W / 2, 122);
    ctx.restore();
  }

  // 3B. WATERMARK: MITI (Baobab / Mbuyu, Acacia Trees & Laurel Branches)
  if (wmOptions.showTrees) {
    const treeColor = rgbaFrom(pal.watermarkColor, 0.068);
    const treeGold = rgbaFrom(pal.watermarkSecondary, 0.078);
    const treeBaseY = isLand ? H - 135 : H - 150;

    drawBaobabTreeWatermark(ctx, isLand ? 295 : 235, treeBaseY, isLand ? 370 : 350, treeColor);
    drawAcaciaTreeWatermark(ctx, isLand ? W - 310 : W - 240, treeBaseY, isLand ? 310 : 295, treeGold);
    drawLaurelWreath(ctx, W / 2, H * 0.51, Math.min(W, H) * 0.27, treeGold);
  }

  // 3C. WATERMARK: WANYAMA (Twiga / Giraffe, Simba / Lion, Peace Doves)
  if (wmOptions.showAnimals) {
    const animalColor = rgbaFrom(pal.watermarkSecondary, 0.078);
    const animalSpot = rgbaFrom(pal.watermarkColor, 0.045);
    const animalAccent = rgbaFrom(pal.watermarkColor, 0.065);
    const groundY = isLand ? H - 135 : H - 150;

    // Graceful Giraffe on right flank & Regal Lion on left flank
    drawGiraffeSilhouette(
      ctx,
      isLand ? W - 470 : W - 340,
      groundY,
      isLand ? 405 : 360,
      animalColor,
      animalSpot,
      true
    );
    drawLionCrestSilhouette(
      ctx,
      isLand ? 470 : 345,
      groundY - (isLand ? 120 : 110),
      isLand ? 255 : 225,
      animalAccent,
      false
    );

    // Subtle Twin Peace Doves / Heritage Birds framing upper flanks
    drawPeaceDoveSilhouette(ctx, isLand ? 310 : 240, isLand ? 330 : 360, 140, animalColor, false);
    drawPeaceDoveSilhouette(ctx, isLand ? W - 310 : W - 240, isLand ? 330 : 360, 140, animalColor, true);
  }

  // 3D. WATERMARK: LOGO (Large Centered Institutional Crest / Uploaded Logo Watermark)
  if (wmOptions.showLogo) {
    ctx.save();
    ctx.translate(W / 2, H * 0.51);
    const wmRadius = Math.min(W, H) * 0.24;

    // Outer double security medallion ring
    ctx.strokeStyle = rgbaFrom(pal.watermarkSecondary, 0.14);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, wmRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, wmRadius * 0.86, 0, Math.PI * 2);
    ctx.stroke();

    for (let s = 0; s < 36; s++) {
      const ang = (s * Math.PI) / 18;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * wmRadius * 0.74, Math.sin(ang) * wmRadius * 0.74);
      ctx.lineTo(Math.cos(ang) * wmRadius, Math.sin(ang) * wmRadius);
      ctx.stroke();
    }

    if (customLogoImg) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.16, 0.088 * wmScale);
      const logoWmSize = wmRadius * 1.25;
      ctx.beginPath();
      ctx.arc(0, 0, logoWmSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(customLogoImg, -logoWmSize / 2, -logoWmSize / 2, logoWmSize, logoWmSize);
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalAlpha = Math.min(0.16, 0.075 * wmScale);
      drawInstitutionalCrestCanvas(ctx, 0, 0, wmRadius * 0.62, pal.primary, pal.gold, pal.goldLight);
      ctx.restore();
    }

    ctx.fillStyle = rgbaFrom(pal.watermarkColor, 0.065);
    ctx.font = '800 32px "Playfair Display", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MALOSHA OFFICIAL CREDENTIAL', 0, wmRadius * 0.66);
    ctx.restore();
  }

  ctx.restore(); // end parchment clip

  // 4. Bold Jewel-Toned Ceremonial Corner Sashes + Triple Gold Borders
  const goldGrad = ctx.createLinearGradient(0, 0, W, H);
  goldGrad.addColorStop(0, pal.goldDark);
  goldGrad.addColorStop(0.25, pal.goldLight);
  goldGrad.addColorStop(0.5, pal.gold);
  goldGrad.addColorStop(0.75, pal.goldLight);
  goldGrad.addColorStop(1, pal.goldDark);

  const m1 = 68;
  const m2 = 90;
  const m3 = 104;

  // Triple borders
  ctx.strokeStyle = pal.primary;
  ctx.lineWidth = 10;
  ctx.strokeRect(m1, m1, W - m1 * 2, H - m1 * 2);

  ctx.strokeStyle = goldGrad;
  ctx.lineWidth = 6;
  ctx.strokeRect(m2, m2, W - m2 * 2, H - m2 * 2);

  ctx.strokeStyle = pal.gold;
  ctx.lineWidth = 2;
  ctx.strokeRect(m3, m3, W - m3 * 2, H - m3 * 2);

  // Diagonal Ceremonial Corner Ribbons (Top-Left, Top-Right, Bottom-Left, Bottom-Right)
  const drawCornerRibbon = (
    cornerX: number,
    cornerY: number,
    dirX: number,
    dirY: number
  ) => {
    ctx.save();
    // Jewel primary corner triangle
    ctx.fillStyle = pal.primary;
    ctx.beginPath();
    ctx.moveTo(cornerX, cornerY);
    ctx.lineTo(cornerX + dirX * 215, cornerY);
    ctx.lineTo(cornerX, cornerY + dirY * 215);
    ctx.closePath();
    ctx.fill();

    // Accent crimson/teal inner stripe
    ctx.fillStyle = pal.secondaryAccent;
    ctx.beginPath();
    ctx.moveTo(cornerX + dirX * 155, cornerY);
    ctx.lineTo(cornerX + dirX * 215, cornerY);
    ctx.lineTo(cornerX, cornerY + dirY * 215);
    ctx.lineTo(cornerX, cornerY + dirY * 155);
    ctx.closePath();
    ctx.fill();

    // Metallic Gold Foil diagonal trim
    ctx.strokeStyle = goldGrad;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(cornerX + dirX * 215, cornerY);
    ctx.lineTo(cornerX, cornerY + dirY * 215);
    ctx.stroke();

    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(cornerX + dirX * 150, cornerY);
    ctx.lineTo(cornerX, cornerY + dirY * 150);
    ctx.stroke();

    // Mini corner rosette star
    ctx.fillStyle = pal.goldLight;
    drawStarShape(ctx, cornerX + dirX * 56, cornerY + dirY * 56, 20, 9);
    ctx.fill();
    ctx.restore();
  };

  drawCornerRibbon(mSheet, mSheet, 1, 1);
  drawCornerRibbon(W - mSheet, mSheet, -1, 1);
  drawCornerRibbon(mSheet, H - mSheet, 1, -1);
  drawCornerRibbon(W - mSheet, H - mSheet, -1, -1);

  // 5. TOP CEREMONIAL HEADER ZONE
  const centerX = W / 2;
  let headY = isLand ? 204 : 230;

  // Flanking gold ceremonial stars beside Crest
  ctx.save();
  ctx.fillStyle = pal.gold;
  [-125, -165, 125, 165].forEach((offset, idx) => {
    drawStarShape(ctx, centerX + offset, headY, idx === 0 || idx === 2 ? 12 : 8, 5);
    ctx.fill();
  });
  ctx.restore();

  if (customLogoImg) {
    const logoSize = isLand ? 128 : 142;
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, headY, logoSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(
      customLogoImg,
      centerX - logoSize / 2,
      headY - logoSize / 2,
      logoSize,
      logoSize
    );
    ctx.restore();
    ctx.strokeStyle = goldGrad;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(centerX, headY, logoSize / 2 + 4, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    drawInstitutionalCrestCanvas(
      ctx,
      centerX,
      headY,
      isLand ? 66 : 74,
      pal.primary,
      pal.gold,
      pal.goldLight
    );
  }

  headY += isLand ? 104 : 118;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.primary;
  ctx.font = `800 ${isLand ? 34 : 30}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillText(targetCert.institutionName.toUpperCase(), centerX, headY);

  headY += isLand ? 38 : 42;
  ctx.fillStyle = '#57534E';
  ctx.font = `700 ${isLand ? 18 : 16}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillText(targetCert.institutionSubtitle.toUpperCase(), centerX, headY);

  // Ceremonial Ribbon Banner Cartouche for Kicker
  headY += isLand ? 52 : 60;
  ctx.font = `800 ${isLand ? 17 : 15}px "Plus Jakarta Sans", sans-serif`;
  const kickerUpper = (targetCert.kickerText || 'CHETI RASMI').toUpperCase();
  const kickerW = Math.min(W - 440, Math.max(680, ctx.measureText(kickerUpper).width + 130));
  const kickerH = 42;

  ctx.save();
  // Ribbon swallow-tails
  ctx.fillStyle = pal.secondaryAccent;
  ctx.beginPath();
  ctx.moveTo(centerX - kickerW / 2 - 26, headY - kickerH / 2 + 6);
  ctx.lineTo(centerX - kickerW / 2 + 8, headY - kickerH / 2 + 6);
  ctx.lineTo(centerX - kickerW / 2 + 8, headY + kickerH / 2 + 6);
  ctx.lineTo(centerX - kickerW / 2 - 26, headY + kickerH / 2 + 6);
  ctx.lineTo(centerX - kickerW / 2 - 10, headY + 6);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(centerX + kickerW / 2 + 26, headY - kickerH / 2 + 6);
  ctx.lineTo(centerX + kickerW / 2 - 8, headY - kickerH / 2 + 6);
  ctx.lineTo(centerX + kickerW / 2 - 8, headY + kickerH / 2 + 6);
  ctx.lineTo(centerX + kickerW / 2 + 26, headY + kickerH / 2 + 6);
  ctx.lineTo(centerX + kickerW / 2 + 10, headY + 6);
  ctx.closePath();
  ctx.fill();

  const ribGrad = ctx.createLinearGradient(centerX - kickerW / 2, 0, centerX + kickerW / 2, 0);
  ribGrad.addColorStop(0, pal.primaryDark);
  ribGrad.addColorStop(0.5, pal.primaryMid);
  ribGrad.addColorStop(1, pal.primaryDark);
  ctx.fillStyle = ribGrad;
  drawRoundedRectPath(ctx, centerX - kickerW / 2, headY - kickerH / 2, kickerW, kickerH, 6);
  ctx.fill();
  ctx.strokeStyle = goldGrad;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.fillStyle = '#FFF7DC';
  ctx.fillText(kickerUpper, centerX, headY + 1);
  ctx.restore();

  // Main Certificate Title
  headY += isLand ? 76 : 90;
  ctx.fillStyle = pal.primaryDark;
  const mainTitleText = targetCert.certificateTitle.toUpperCase();
  const mainTitleSize = mainTitleText.length > 32 ? (isLand ? 66 : 54) : isLand ? 76 : 64;
  ctx.font = `700 ${mainTitleSize}px "Playfair Display", Georgia, serif`;
  ctx.fillText(mainTitleText, centerX, headY);

  if (targetCert.certificateSubtitle.trim()) {
    headY += isLand ? 48 : 54;
    ctx.fillStyle = pal.goldDark;
    ctx.font = `700 ${isLand ? 24 : 22}px "Cormorant Garamond", Georgia, serif`;
    ctx.fillText(targetCert.certificateSubtitle.toUpperCase(), centerX, headY);
  }

  const headerBottomY = headY + 28;
  const metaY = isLand ? H - 465 : H - 595;
  const metaTopY = metaY - 52;

  // 6. DYNAMICALLY BALANCED MIDDLE CITATION ZONE (Centered between headerBottomY & metaTopY)
  const recName = (targetCert.recipientName || 'MWANACHAMA WA MALOSHA').toUpperCase();
  const recFontSize = recName.length > 28 ? (isLand ? 58 : 48) : isLand ? 74 : 62;

  ctx.font = `700 ${isLand ? 40 : 36}px "Cormorant Garamond", Georgia, serif`;
  const courseLines = wrapCanvasText(ctx, targetCert.courseTitle, W - 460).slice(0, 2);

  ctx.font = `500 ${isLand ? 23 : 22}px "Plus Jakarta Sans", sans-serif`;
  const detailLines = targetCert.courseDetails.trim()
    ? wrapCanvasText(ctx, targetCert.courseDetails, W - 520).slice(0, 3)
    : [];

  // Measure total height of middle zone blocks
  const introH = 38;
  const gap1 = isLand ? 62 : 76;
  const nameH = recFontSize + 22;
  const gap2 = isLand ? 56 : 70;
  const compH = 34;
  const gap3 = isLand ? 30 : 38;
  const courseBoxPad = 24;
  const courseBoxH = courseLines.length * 46 + courseBoxPad * 2;
  const gap4 = detailLines.length > 0 ? (isLand ? 30 : 42) : 0;
  const detailsH = detailLines.length > 0 ? detailLines.length * 32 : 0;

  const totalMidH =
    introH + gap1 + nameH + gap2 + compH + gap3 + courseBoxH + gap4 + detailsH;
  const midStart = headerBottomY + Math.max(24, (metaTopY - headerBottomY - totalMidH) / 2);

  let cy = midStart + introH / 2;
  ctx.fillStyle = '#44403C';
  ctx.font = `italic 600 ${isLand ? 32 : 30}px "Cormorant Garamond", Georgia, serif`;
  ctx.fillText(targetCert.introLine, centerX, cy);

  // Recipient Name + Ornamental Double Gold Underline
  cy += gap1 + recFontSize * 0.35;
  ctx.fillStyle = pal.primary;
  ctx.font = `700 ${recFontSize}px "Playfair Display", Georgia, serif`;
  ctx.fillText(recName, centerX, cy);

  const nameLineY = cy + recFontSize * 0.56;
  const nameW = Math.min(W - 440, Math.max(660, ctx.measureText(recName).width + 130));
  ctx.strokeStyle = goldGrad;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(centerX - nameW / 2, nameLineY);
  ctx.lineTo(centerX + nameW / 2, nameLineY);
  ctx.stroke();

  // Central diamond ornament on recipient rule
  ctx.fillStyle = pal.secondaryAccent;
  ctx.beginPath();
  ctx.moveTo(centerX, nameLineY - 9);
  ctx.lineTo(centerX + 12, nameLineY);
  ctx.lineTo(centerX, nameLineY + 9);
  ctx.lineTo(centerX - 12, nameLineY);
  ctx.closePath();
  ctx.fill();

  // Completion line
  cy = nameLineY + gap2;
  ctx.fillStyle = '#44403C';
  ctx.font = `italic 600 ${isLand ? 30 : 28}px "Cormorant Garamond", Georgia, serif`;
  ctx.fillText(targetCert.completionLine, centerX, cy);

  // Elevated Academic Citation Box for Course Title
  const courseBoxTop = cy + gap3;
  const courseBoxW = Math.min(W - 340, isLand ? 1680 : 1280);
  ctx.save();
  ctx.fillStyle = pal.tintFill;
  drawRoundedRectPath(ctx, centerX - courseBoxW / 2, courseBoxTop, courseBoxW, courseBoxH, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(201, 144, 30, 0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = pal.primaryDark;
  ctx.font = `700 ${isLand ? 40 : 36}px "Cormorant Garamond", Georgia, serif`;
  courseLines.forEach((line, idx) => {
    ctx.fillText(line, centerX, courseBoxTop + courseBoxPad + 23 + idx * 46);
  });

  if (detailLines.length > 0) {
    let dy = courseBoxTop + courseBoxH + gap4 + 10;
    ctx.fillStyle = '#57534E';
    ctx.font = `500 ${isLand ? 23 : 22}px "Plus Jakarta Sans", sans-serif`;
    detailLines.forEach((line, idx) => {
      ctx.fillText(line, centerX, dy + idx * 32);
    });
  }

  // 7. STRUCTURED 4-COLUMN METADATA GRID
  const metaItems = [
    { k: 'MUDA WA MAFUNZO', v: targetCert.durationText },
    { k: 'MATOKEO / DARAJA', v: targetCert.gradeText },
    { k: 'TAREHE YA KUTOLEWA', v: targetCert.issueDateText },
    { k: 'MAHALI', v: targetCert.issueLocation },
  ].filter((m) => m.v.trim().length > 0);

  if (metaItems.length > 0) {
    const spanW = Math.min(W - 340, isLand ? 1860 : 1340);
    const boxW = spanW / metaItems.length;
    const startX = centerX - spanW / 2 + boxW / 2;

    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.52)';
    drawRoundedRectPath(ctx, centerX - spanW / 2, metaY - 34, spanW, 78, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(201, 144, 30, 0.42)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();

    metaItems.forEach((m, idx) => {
      const mx = startX + idx * boxW;
      if (idx > 0) {
        const divX = centerX - spanW / 2 + idx * boxW;
        ctx.strokeStyle = 'rgba(201, 144, 30, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(divX, metaY - 22);
        ctx.lineTo(divX, metaY + 32);
        ctx.stroke();
      }
      ctx.fillStyle = '#78716C';
      ctx.font = '700 15px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(m.k, mx, metaY - 10);
      ctx.fillStyle = pal.primary;
      ctx.font = '700 22px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(m.v, mx, metaY + 18);
    });
  }

  // 8. SIGNATORIES & GOLD FOIL SEAL
  const sigY = isLand ? H - 265 : H - 345;
  const drawSignatoryBlock = (
    sx: number,
    name: string,
    title: string,
    sigText: string,
    sigPath: string
  ) => {
    if (sigPath.trim()) {
      ctx.save();
      ctx.translate(sx - 160, sigY - 94);
      ctx.scale(320 / 300, 84 / 90);
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      try {
        ctx.stroke(new Path2D(sigPath));
      } catch {
        // ignore invalid svg path
      }
      ctx.restore();
    } else if (sigText.trim()) {
      ctx.fillStyle = '#0F172A';
      ctx.font = '64px "Great Vibes", cursive';
      ctx.fillText(sigText, sx, sigY - 34);
    }

    ctx.strokeStyle = pal.primary;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(sx - 210, sigY);
    ctx.lineTo(sx + 210, sigY);
    ctx.stroke();

    ctx.fillStyle = pal.primaryDark;
    ctx.font = '800 22px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(name.toUpperCase(), sx, sigY + 32);

    ctx.fillStyle = '#57534E';
    ctx.font = '600 17px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(title, sx, sigY + 60);
  };

  const yearMatch = targetCert.issueDateText.match(/\b(20\d{2})\b/);
  const sealYear = yearMatch ? yearMatch[1] : String(new Date().getFullYear());

  if (targetCert.showSignatory2 && targetCert.signatory2Name.trim()) {
    drawSignatoryBlock(
      isLand ? 485 : 390,
      targetCert.signatory1Name,
      targetCert.signatory1Title,
      targetCert.signatory1SigText,
      targetCert.signatory1SigPath
    );
    drawGoldFoilSealCanvas(
      ctx,
      centerX,
      sigY - 26,
      isLand ? 96 : 86,
      targetCert.sealText,
      sealYear,
      pal.primary,
      pal.secondaryAccent,
      pal.gold,
      pal.goldLight
    );
    drawSignatoryBlock(
      isLand ? W - 485 : W - 390,
      targetCert.signatory2Name,
      targetCert.signatory2Title,
      targetCert.signatory2SigText,
      targetCert.signatory2SigPath
    );
  } else {
    drawSignatoryBlock(
      isLand ? 620 : 475,
      targetCert.signatory1Name,
      targetCert.signatory1Title,
      targetCert.signatory1SigText,
      targetCert.signatory1SigPath
    );
    drawGoldFoilSealCanvas(
      ctx,
      isLand ? W - 560 : W - 425,
      sigY - 26,
      isLand ? 100 : 88,
      targetCert.sealText,
      sealYear,
      pal.primary,
      pal.secondaryAccent,
      pal.gold,
      pal.goldLight
    );
  }

  // 9. BOTTOM VERIFICATION MATRIX + BARCODE SECURITY STRIP
  const stripY = H - 122;
  const qrX = 245;
  const qrY = stripY - 40;
  const cell = 6.8;

  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(qrX - 6, qrY - 6, cell * 9 + 12, cell * 9 + 12);
  ctx.strokeStyle = pal.gold;
  ctx.lineWidth = 1.8;
  ctx.strokeRect(qrX - 6, qrY - 6, cell * 9 + 12, cell * 9 + 12);
  ctx.fillStyle = pal.primary;
  targetMatrix.forEach((row, r) => {
    row.forEach((on, c) => {
      if (on) {
        ctx.fillRect(qrX + c * cell, qrY + r * cell, cell - 0.8, cell - 0.8);
      }
    });
  });
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.fillStyle = pal.primary;
  ctx.font = '700 16px "JetBrains Mono", monospace';
  ctx.fillText(`SERIAL: ${targetCert.serialNumber}`, qrX + 82, stripY - 18);
  ctx.fillStyle = '#57534E';
  ctx.font = '600 14px "JetBrains Mono", monospace';
  ctx.fillText(`CODE: ${targetChecksum} · A4 INSTITUTIONAL CREDENTIAL`, qrX + 82, stripY + 6);

  // Subtle verification barcode stripes on bottom right
  const barRightX = W - 245;
  ctx.save();
  for (let b = 0; b < 38; b++) {
    const bw = b % 3 === 0 ? 4 : b % 2 === 0 ? 2.5 : 1.5;
    const bx = barRightX - 180 + b * 4.8;
    ctx.fillStyle = b % 5 === 0 ? pal.goldDark : pal.primary;
    ctx.fillRect(bx, stripY - 32, bw, 22);
  }
  ctx.restore();

  ctx.textAlign = 'right';
  ctx.fillStyle = '#57534E';
  ctx.font = '700 13px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('IMETHIBITISHWA KIELEKTRONIKI · ANTI-FORGERY PROTECTED', barRightX, stripY + 8);
}

export const TrainingCertificateStudio: React.FC<TrainingCertificateStudioProps> = ({
  ownerUid,
  ownerDisplayName,
  onToast,
}) => {
  const { tr } = useLanguage();
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const logoCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  const [cert, setCert] = useState<CertificateFormState>(() =>
    createInitialCertificate(ownerDisplayName)
  );
  const [wmOptions, setWmOptions] = useState<WatermarkOptions>({
    showAnimals: true,
    showTrees: true,
    showCodes: true,
    showLogo: true,
    strength: 'balanced',
  });
  const [archive, setArchive] = useState<TrainingCertificateData[]>([]);
  const [members, setMembers] = useState<MemberDirectoryCandidate[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [showMemberPicker, setShowMemberPicker] = useState(false);

  const [fontsReadyTick, setFontsReadyTick] = useState(0);
  const [logoReadyTick, setLogoReadyTick] = useState(0);
  const [loadingArchive, setLoadingArchive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingImg, setExportingImg] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [editorSection, setEditorSection] = useState<
    'trainee' | 'institution' | 'signatories' | 'security'
  >('trainee');

  useEffect(() => {
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      void document.fonts.ready.then(() => {
        setFontsReadyTick((t) => t + 1);
      });
    }
  }, []);

  useEffect(() => {
    const url = cert.institutionLogoUrl.trim();
    if (!url || logoCacheRef.current.has(url)) return;
    let cancelled = false;
    void loadCorsImage(url).then((img) => {
      if (cancelled || !img) return;
      logoCacheRef.current.set(url, img);
      setLogoReadyTick((t) => t + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [cert.institutionLogoUrl]);

  useEffect(() => {
    let cancelled = false;
    setLoadingArchive(true);
    Promise.all([
      listTrainingCertificates().catch(() => []),
      fetchForumMembersDirectory().catch(() => []),
    ])
      .then(([certs, dirMembers]) => {
        if (cancelled) return;
        setArchive(certs);
        setMembers(dirMembers);
      })
      .finally(() => {
        if (!cancelled) setLoadingArchive(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 1:1 WYSIWYG Live Canvas Preview Draw Effect
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const isLand = cert.orientation === 'landscape';
    const baseW = isLand ? 2480 : 1754;
    const baseH = isLand ? 1754 : 2480;
    const previewScale = 0.6;
    const targetW = Math.round(baseW * previewScale);
    const targetH = Math.round(baseH * previewScale);

    if (canvas.width !== targetW) canvas.width = targetW;
    if (canvas.height !== targetH) canvas.height = targetH;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cachedImg = cert.institutionLogoUrl.trim()
      ? logoCacheRef.current.get(cert.institutionLogoUrl.trim()) || null
      : null;

    const rafId = window.requestAnimationFrame(() => {
      ctx.save();
      ctx.setTransform(previewScale, 0, 0, previewScale, 0, 0);
      drawCertificateScene(ctx, cert, cachedImg, wmOptions);
      ctx.restore();
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [cert, wmOptions, fontsReadyTick, logoReadyTick]);

  const checksum = useMemo(() => computeCertificateChecksum(cert), [cert]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members.slice(0, 25);
    return members.filter((m) => m.displayName.toLowerCase().includes(q)).slice(0, 25);
  }, [members, memberSearch]);

  const updateField = <K extends keyof CertificateFormState>(
    key: K,
    value: CertificateFormState[K]
  ) => {
    setSavedToast(false);
    setCert((prev) => ({ ...prev, [key]: value }));
  };

  const handleRegenerateSerial = () => {
    const newSerial = generateSerialNumber();
    setCert((prev) => ({
      ...prev,
      certId: newSerial,
      serialNumber: newSerial,
    }));
    setSavedToast(false);
  };

  const handleNewBlankCertificate = () => {
    const newSerial = generateSerialNumber();
    setCert((prev) => ({
      ...prev,
      certId: newSerial,
      serialNumber: newSerial,
      recipientUid: '',
      recipientName: '',
      issueDateText: getTodayFormatted(),
    }));
    setSavedToast(false);
    onToast(tr('Tayari kwa cheti kipya cha mhitimu!', 'Ready for a new trainee certificate!'), 'success');
  };

  const handleUploadLogo = async (file: File) => {
    setUploadingLogo(true);
    try {
      const url = await uploadImageToCloudinary(file);
      updateField('institutionLogoUrl', url);
      onToast(tr('Nembo ya taasisi imepakiwa!', 'Institution crest uploaded!'), 'success');
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : tr('Imeshindwa kupakia nembo.', 'Failed to upload logo.'),
        'error'
      );
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSaveCertificate = async () => {
    if (!cert.recipientName.trim() || !cert.courseTitle.trim()) {
      onToast(
        tr('Tafadhali jaza jina la mhitimu na jina la mafunzo.', 'Please enter trainee name and course title.'),
        'error'
      );
      return;
    }
    setSaving(true);
    try {
      const saved = await saveTrainingCertificate(ownerUid, cert);
      setArchive((prev) => {
        const rest = prev.filter((item) => item.certId !== saved.certId);
        return [saved, ...rest];
      });
      setSavedToast(true);
      onToast(tr('Cheti kimehifadhiwa kwenye kumbukumbu!', 'Certificate saved to archive!'), 'success');
      window.setTimeout(() => setSavedToast(false), 2600);
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : tr('Imeshindwa kuhifadhi cheti.', 'Failed to save certificate.'),
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteArchive = async (certId: string) => {
    try {
      await deleteTrainingCertificate(certId);
      setArchive((prev) => prev.filter((item) => item.certId !== certId));
      onToast(tr('Cheti kimeondolewa kwenye kumbukumbu.', 'Certificate removed from archive.'), 'success');
    } catch {
      onToast(tr('Imeshindwa kufuta cheti.', 'Failed to delete certificate.'), 'error');
    }
  };

  const handleLoadFromArchive = (item: TrainingCertificateData) => {
    setCert({
      certId: item.certId,
      serialNumber: item.serialNumber,
      orientation: item.orientation,
      theme: item.theme,
      institutionName: item.institutionName,
      institutionSubtitle: item.institutionSubtitle,
      institutionLogoUrl: item.institutionLogoUrl,
      kickerText: item.kickerText,
      certificateTitle: item.certificateTitle,
      certificateSubtitle: item.certificateSubtitle,
      introLine: item.introLine,
      recipientUid: item.recipientUid,
      recipientName: item.recipientName,
      completionLine: item.completionLine,
      courseTitle: item.courseTitle,
      courseDetails: item.courseDetails,
      durationText: item.durationText,
      gradeText: item.gradeText,
      issueDateText: item.issueDateText,
      issueLocation: item.issueLocation,
      signatory1Name: item.signatory1Name,
      signatory1Title: item.signatory1Title,
      signatory1SigText: item.signatory1SigText,
      signatory1SigPath: item.signatory1SigPath,
      showSignatory2: item.showSignatory2,
      signatory2Name: item.signatory2Name,
      signatory2Title: item.signatory2Title,
      signatory2SigText: item.signatory2SigText,
      signatory2SigPath: item.signatory2SigPath,
      sealText: item.sealText,
      watermarkText: item.watermarkText,
    });
    onToast(
      tr(`Cheti cha ${item.recipientName} kimepakiwa kwenye studio.`, `Loaded ${item.recipientName}'s certificate.`),
      'success'
    );
  };

  const renderExportCertificateCanvas = async (
    targetCert: CertificateFormState = cert
  ): Promise<HTMLCanvasElement> => {
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      await document.fonts.ready;
    }
    const isLand = targetCert.orientation === 'landscape';
    const W = isLand ? 2480 : 1754;
    const H = isLand ? 1754 : 2480;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');

    const logoUrl = targetCert.institutionLogoUrl.trim();
    let logoImg: HTMLImageElement | null = null;
    if (logoUrl) {
      logoImg = logoCacheRef.current.get(logoUrl) || (await loadCorsImage(logoUrl));
      if (logoImg) logoCacheRef.current.set(logoUrl, logoImg);
    }

    drawCertificateScene(ctx, targetCert, logoImg, wmOptions);
    return canvas;
  };

  const handleDownloadPdf = async () => {
    setExportingPdf(true);
    try {
      const canvas = await renderExportCertificateCanvas(cert);
      const imgData = canvas.toDataURL('image/jpeg', 0.96);
      const isLand = cert.orientation === 'landscape';
      const pdf = new jsPDF({
        orientation: isLand ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });
      const pdfW = isLand ? 297 : 210;
      const pdfH = isLand ? 210 : 297;
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH, undefined, 'FAST');

      const slug = (cert.recipientName || 'mhitimu')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 28);
      pdf.save(`cheti-a4-${slug || 'malosha'}.pdf`);
      onToast(tr('Cheti cha A4 kimepakuliwa kama PDF!', 'A4 Certificate downloaded as PDF!'), 'success');
    } catch (err) {
      console.error('PDF export error:', err);
      onToast(tr('Imeshindwa kutengeneza PDF ya cheti.', 'Failed to generate A4 PDF.'), 'error');
    } finally {
      setExportingPdf(false);
    }
  };

  const handleDownloadImage = async () => {
    setExportingImg(true);
    try {
      const canvas = await renderExportCertificateCanvas(cert);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png', 1)
      );
      if (!blob) throw new Error('Image failed');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const slug = (cert.recipientName || 'mhitimu')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 28);
      a.href = url;
      a.download = `cheti-a4-${slug || 'malosha'}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      onToast(
        tr('Cheti cha A4 kimehifadhiwa kama picha (PNG)!', 'A4 Certificate saved as PNG image!'),
        'success'
      );
    } catch {
      onToast(tr('Imeshindwa kuhifadhi picha ya cheti.', 'Failed to export PNG.'), 'error');
    } finally {
      setExportingImg(false);
    }
  };

  const isLandscape = cert.orientation === 'landscape';

  return (
    <div className="space-y-5">
      {/* Top Action & Quick Theme Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs text-slate-800">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 shrink-0 text-[#B48224]" aria-hidden="true" />
          <span>
            {tr(
              'Cheti cha Kiofisi A4 — Kina Watermark za Wanyama, Miti, Code & Logo pamoja na rangi za kuvutia.',
              'Institutional A4 Certificate — Protected with Animal, Tree, Security Code & Logo watermarks.'
            )}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(['navy_gold', 'emerald_gold', 'burgundy_gold'] as CertificateTheme[]).map((themeKey) => (
            <button
              key={themeKey}
              type="button"
              onClick={() => updateField('theme', themeKey)}
              className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                cert.theme === themeKey
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-amber-300 bg-white text-slate-800 hover:bg-amber-100/40'
              }`}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/60"
                style={{ backgroundColor: THEME_PALETTES[themeKey].primary }}
              />
              <span>
                {themeKey === 'navy_gold'
                  ? tr('Samawati', 'Sapphire')
                  : themeKey === 'emerald_gold'
                    ? tr('Zamaradi', 'Emerald')
                    : tr('Kifalme', 'Crimson')}
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={handleNewBlankCertificate}
            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-900 hover:bg-amber-100/50"
          >
            <Plus className="h-3.5 w-3.5 text-[#0E2640]" aria-hidden="true" />
            <span>{tr('Cheti Kipya', 'New Certificate')}</span>
          </button>
        </div>
      </div>

      {/* 1:1 WYSIWYG Live A4 Canvas Preview */}
      <div className="rounded-2xl border border-stone-200 bg-stone-100/90 p-3 sm:p-5">
        <div
          className={`mx-auto w-full overflow-hidden rounded-lg shadow-2xl ring-1 ring-black/10 ${
            isLandscape ? 'max-w-[820px]' : 'max-w-[540px]'
          }`}
          style={{ aspectRatio: isLandscape ? '297 / 210' : '210 / 297' }}
        >
          <canvas
            ref={previewCanvasRef}
            aria-label={tr('Hakikisho la Cheti cha A4', 'Live A4 Certificate Preview')}
            className="block h-full w-full"
          />
        </div>
        <p className="mt-2.5 text-center text-[11px] font-medium text-stone-600">
          {tr(
            'Muonekano halisi wa A4 (1:1 na PDF/Picha utakayopakua) · Watermark za Wanyama, Miti, Code & Logo zimewashwa.',
            'Exact 1:1 A4 preview matching exported PDF and PNG · Animals, Trees, Code & Logo watermarks active.'
          )}
        </p>
      </div>

      {/* Export & Save Actions */}
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          disabled={exportingPdf}
          onClick={() => void handleDownloadPdf()}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#B91C1C] px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-[#991B1B] disabled:opacity-60"
        >
          {exportingPdf ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <FileText className="h-4 w-4" aria-hidden="true" />
          )}
          <span>
            {exportingPdf
              ? tr('Inatengeneza PDF A4...', 'Generating A4 PDF...')
              : tr('Pakua Cheti (A4 PDF)', 'Download A4 PDF')}
          </span>
        </button>

        <button
          type="button"
          disabled={exportingImg}
          onClick={() => void handleDownloadImage()}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#0E2640] px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-[#163A5F] disabled:opacity-60"
        >
          {exportingImg ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <ImageIcon className="h-4 w-4 text-amber-400" aria-hidden="true" />
          )}
          <span>
            {exportingImg
              ? tr('Inahifadhi Picha...', 'Exporting PNG...')
              : tr('Hifadhi kama Picha (PNG)', 'Save as Image (PNG)')}
          </span>
        </button>

        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSaveCertificate()}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-900 transition-colors hover:bg-slate-50 disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : savedToast ? (
            <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          ) : (
            <Save className="h-4 w-4 text-[#1D4E89]" aria-hidden="true" />
          )}
          <span>
            {saving
              ? tr('Inahifadhi...', 'Saving...')
              : savedToast
                ? tr('Kimehifadhiwa!', 'Saved!')
                : tr('Hifadhi Kwenye Kumbukumbu', 'Save to Archive')}
          </span>
        </button>
      </div>

      {/* Editor Panel */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: 'trainee', label: tr('1. Mhitimu & Mafunzo', '1. Trainee & Course') },
                { id: 'institution', label: tr('2. Taasisi & Muundo A4', '2. Institution & A4') },
                { id: 'signatories', label: tr('3. Saini za Viongozi', '3. Signatories') },
                { id: 'security', label: tr('4. Watermark & Muhuri', '4. Security & Seal') },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setEditorSection(tab.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                  editorSection === tab.id
                    ? 'bg-[#0E2640] text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {editorSection === 'trainee' && (
          <div className="mt-3.5 space-y-3">
            {/* Quick Member Directory Picker */}
            <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <UserCheck className="h-4 w-4 text-[#1D4E89]" aria-hidden="true" />
                  <span>
                    {tr('Chagua Mwanachama Kutoka Jukwaani (Hiari)', 'Pick Forum Member (Optional)')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMemberPicker((prev) => !prev)}
                  className="rounded-lg border border-sky-300 bg-white px-2.5 py-1 text-[11px] font-bold text-[#1D4E89] hover:bg-sky-100/50"
                >
                  {showMemberPicker
                    ? tr('Funga Orodha', 'Hide List')
                    : tr(`Onyesha Wanachama (${members.length})`, `Browse Members (${members.length})`)}
                </button>
              </div>

              {showMemberPicker && (
                <div className="mt-2.5 space-y-2">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      type="text"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder={tr('Tafuta jina la mwanachama...', 'Search member name...')}
                      className="min-h-[38px] w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 text-xs text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                    />
                  </div>
                  <div className="max-h-40 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                    {filteredMembers.length === 0 ? (
                      <p className="p-3 text-center text-xs text-slate-500">
                        {tr('Hakuna mwanachama aliyepatikana.', 'No matching members found.')}
                      </p>
                    ) : (
                      filteredMembers.map((m) => (
                        <button
                          key={m.uid}
                          type="button"
                          onClick={() => {
                            setCert((prev) => ({
                              ...prev,
                              recipientUid: m.uid,
                              recipientName: m.displayName.toUpperCase(),
                            }));
                            setShowMemberPicker(false);
                          }}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-sky-50"
                        >
                          <span className="font-semibold text-slate-900">{m.displayName}</span>
                          <span className="text-[11px] font-bold text-[#1D4E89]">
                            {tr('Chagua', 'Select')}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-700">
                  {tr('Jina Kamili la Mhitimu / Mshiriki', 'Recipient Full Name')}
                </label>
                <input
                  type="text"
                  maxLength={120}
                  value={cert.recipientName}
                  onChange={(e) => updateField('recipientName', e.target.value)}
                  placeholder={tr('Mfano: NEEMA SAMWEL MASAWE', 'e.g. NEEMA SAMWEL MASAWE')}
                  className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-700">
                  {tr('Jina la Mafunzo / Kozi Aliyohitimu', 'Training / Course Title')}
                </label>
                <input
                  type="text"
                  maxLength={180}
                  value={cert.courseTitle}
                  onChange={(e) => updateField('courseTitle', e.target.value)}
                  className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-700">
                  {tr('Maelezo Mafupi ya Mtaala / Umahiri (Hiari)', 'Course Summary / Competencies')}
                </label>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={cert.courseDetails}
                  onChange={(e) => updateField('courseDetails', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700">
                  {tr('Muda wa Mafunzo / Saa', 'Training Duration / Hours')}
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={cert.durationText}
                  onChange={(e) => updateField('durationText', e.target.value)}
                  placeholder="Saa 48 · Wiki 6"
                  className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700">
                  {tr('Matokeo / Daraja (Grade)', 'Grade / Distinction')}
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={cert.gradeText}
                  onChange={(e) => updateField('gradeText', e.target.value)}
                  placeholder="Bora Zaidi (Distinction)"
                  className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700">
                  {tr('Tarehe ya Kutolewa', 'Issue Date')}
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={cert.issueDateText}
                  onChange={(e) => updateField('issueDateText', e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700">
                  {tr('Mahali Kilipotolewa', 'Issue Location')}
                </label>
                <input
                  type="text"
                  maxLength={100}
                  value={cert.issueLocation}
                  onChange={(e) => updateField('issueLocation', e.target.value)}
                  placeholder="Dar es Salaam, Tanzania"
                  className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {editorSection === 'institution' && (
          <div className="mt-3.5 space-y-3.5">
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void handleUploadLogo(f);
              }}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-700">
                  {tr('Mwelekeo wa Karatasi ya A4', 'A4 Orientation')}
                </label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: 'landscape', label: tr('Mlalo (297×210mm)', 'Landscape A4') },
                      { id: 'portrait', label: tr('Wima (210×297mm)', 'Portrait A4') },
                    ] as { id: CertificateOrientation; label: string }[]
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => updateField('orientation', opt.id)}
                      className={`min-h-[40px] rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
                        cert.orientation === opt.id
                          ? 'border-[#0E2640] bg-[#0E2640] text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700">
                  {tr('Rangi ya Kuvutia (Kiofisi)', 'Institutional Color Theme')}
                </label>
                <div className="mt-1 grid grid-cols-3 gap-1.5">
                  {(['navy_gold', 'emerald_gold', 'burgundy_gold'] as CertificateTheme[]).map(
                    (themeKey) => (
                      <button
                        key={themeKey}
                        type="button"
                        onClick={() => updateField('theme', themeKey)}
                        className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-bold ${
                          cert.theme === themeKey
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span
                          className="h-3 w-3 shrink-0 rounded-full border border-white/60"
                          style={{ backgroundColor: THEME_PALETTES[themeKey].primary }}
                        />
                        <span className="truncate">
                          {themeKey === 'navy_gold'
                            ? tr('Samawati', 'Sapphire')
                            : themeKey === 'emerald_gold'
                              ? tr('Zamaradi', 'Emerald')
                              : tr('Kifalme', 'Crimson')}
                        </span>
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-700">
                  {tr('Jina la Taasisi Inayotoa Cheti', 'Issuing Institution Name')}
                </label>
                <input
                  type="text"
                  maxLength={140}
                  value={cert.institutionName}
                  onChange={(e) => updateField('institutionName', e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-700">
                  {tr('Idara / Usajili wa Taasisi', 'Department / Registration Subtitle')}
                </label>
                <input
                  type="text"
                  maxLength={180}
                  value={cert.institutionSubtitle}
                  onChange={(e) => updateField('institutionSubtitle', e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700">
                  {tr('Kichwa Kikuu cha Cheti', 'Certificate Main Heading')}
                </label>
                <input
                  type="text"
                  maxLength={120}
                  value={cert.certificateTitle}
                  onChange={(e) => updateField('certificateTitle', e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700">
                  {tr('Kichwa Kidogo (Kiingereza / Maelezo)', 'Certificate Subtitle')}
                </label>
                <input
                  type="text"
                  maxLength={140}
                  value={cert.certificateSubtitle}
                  onChange={(e) => updateField('certificateSubtitle', e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700">
                  {tr('Mstari wa Utambulisho ("Hii ni kuthibitisha...")', 'Presentation Intro Line')}
                </label>
                <input
                  type="text"
                  maxLength={140}
                  value={cert.introLine}
                  onChange={(e) => updateField('introLine', e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700">
                  {tr('Mstari wa Kufuzu ("amehudhuria na kufuzu...")', 'Completion Citation Line')}
                </label>
                <input
                  type="text"
                  maxLength={180}
                  value={cert.completionLine}
                  onChange={(e) => updateField('completionLine', e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <div>
                    <p className="text-xs font-bold text-slate-800">
                      {tr('Nembo ya Taasisi (Juu & Kwenye Watermark)', 'Institution Crest / Watermark Logo')}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {tr(
                        'Pakia nembo yako maalum — itaonekana juu na kama watermark katikati ya cheti.',
                        'Upload a custom crest — appears at the top and as the center logo watermark.'
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={uploadingLogo}
                      onClick={() => logoInputRef.current?.click()}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#0E2640] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#163A5F] disabled:opacity-60"
                    >
                      {uploadingLogo ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Camera className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                      )}
                      <span>{tr('Pakia Nembo', 'Upload Logo')}</span>
                    </button>
                    {cert.institutionLogoUrl && (
                      <button
                        type="button"
                        onClick={() => updateField('institutionLogoUrl', '')}
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
                      >
                        {tr('Tumia ya Asili', 'Use Default')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {editorSection === 'signatories' && (
          <div className="mt-3.5 space-y-4">
            {/* Signatory 1 */}
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
              <p className="text-xs font-bold text-[#0E2640]">
                {tr('Msaini Mkuu wa Kwanza (Kushoto)', 'Primary Signatory (Left)')}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700">
                    {tr('Jina la Kiongozi / Mkufunzi', 'Signatory Name')}
                  </label>
                  <input
                    type="text"
                    maxLength={100}
                    value={cert.signatory1Name}
                    onChange={(e) => updateField('signatory1Name', e.target.value)}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700">
                    {tr('Cheo Chake', 'Title / Role')}
                  </label>
                  <input
                    type="text"
                    maxLength={100}
                    value={cert.signatory1Title}
                    onChange={(e) => updateField('signatory1Title', e.target.value)}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                  />
                </div>
              </div>
              <SignaturePadInput
                label={tr('Saini ya Msaini #1', 'Signature #1')}
                sigText={cert.signatory1SigText}
                sigPath={cert.signatory1SigPath}
                onChangeText={(v) => updateField('signatory1SigText', v)}
                onChangePath={(p) => updateField('signatory1SigPath', p)}
              />
            </div>

            {/* Signatory 2 Toggle + Fields */}
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-[#0E2640]">
                  {tr('Msaini wa Pili (Kulia)', 'Second Signatory (Right)')}
                </p>
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={cert.showSignatory2}
                    onChange={(e) => updateField('showSignatory2', e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[#0E2640]"
                  />
                  <span>{tr('Weka Msaini wa Pili', 'Include 2nd Signatory')}</span>
                </label>
              </div>

              {cert.showSignatory2 && (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700">
                        {tr('Jina la Kiongozi wa Pili', 'Signatory #2 Name')}
                      </label>
                      <input
                        type="text"
                        maxLength={100}
                        value={cert.signatory2Name}
                        onChange={(e) => updateField('signatory2Name', e.target.value)}
                        className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700">
                        {tr('Cheo Chake', 'Title / Role')}
                      </label>
                      <input
                        type="text"
                        maxLength={100}
                        value={cert.signatory2Title}
                        onChange={(e) => updateField('signatory2Title', e.target.value)}
                        className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                      />
                    </div>
                  </div>
                  <SignaturePadInput
                    label={tr('Saini ya Msaini #2', 'Signature #2')}
                    sigText={cert.signatory2SigText}
                    sigPath={cert.signatory2SigPath}
                    onChangeText={(v) => updateField('signatory2SigText', v)}
                    onChangePath={(p) => updateField('signatory2SigPath', p)}
                  />
                </>
              )}
            </div>
          </div>
        )}

        {editorSection === 'security' && (
          <div className="mt-3.5 space-y-4">
            {/* 4 Security Watermark Layers Controls */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold text-[#0E2640]">
                  {tr('Tabaka 4 za Watermark ya Usalama (Kuzuia Wizi)', '4 Security Watermark Layers')}
                </p>
                <div className="flex items-center gap-1">
                  {(['soft', 'balanced', 'bold'] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setWmOptions((prev) => ({ ...prev, strength: lvl }))}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${
                        wmOptions.strength === lvl
                          ? 'bg-[#0E2640] text-white'
                          : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {lvl === 'soft'
                        ? tr('Fifia', 'Subtle')
                        : lvl === 'balanced'
                          ? tr('Wastani', 'Balanced')
                          : tr('Kukolea', 'Bold')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(
                  [
                    { key: 'showAnimals', label: tr('Wanyama (Twiga/Simba)', 'Animals (Wildlife)') },
                    { key: 'showTrees', label: tr('Miti (Mbuyu & Matawi)', 'Trees & Laurels') },
                    { key: 'showCodes', label: tr('Code & Micro-print', 'Security Codes') },
                    { key: 'showLogo', label: tr('Logo ya Taasisi', 'Institution Logo') },
                  ] as const
                ).map((item) => (
                  <label
                    key={item.key}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] font-semibold text-slate-800"
                  >
                    <input
                      type="checkbox"
                      checked={wmOptions[item.key]}
                      onChange={(e) =>
                        setWmOptions((prev) => ({ ...prev, [item.key]: e.target.checked }))
                      }
                      className="h-4 w-4 rounded border-slate-300 text-[#0E2640]"
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-700">
                  {tr('Namba ya Usajili wa Cheti (Serial Number)', 'Certificate Serial Number')}
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={64}
                    value={cert.serialNumber}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      const cleanId = val.replace(/[^A-Z0-9_-]/g, '') || cert.certId;
                      setCert((prev) => ({
                        ...prev,
                        serialNumber: val,
                        certId: cleanId,
                      }));
                    }}
                    className="min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleRegenerateSerial}
                    className="inline-flex min-h-[40px] shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{tr('Mpya', 'New')}</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700">
                  {tr('Maandishi ya Muhuri wa Dhahabu', 'Gold Seal Text')}
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={cert.sealText}
                  onChange={(e) => updateField('sealText', e.target.value)}
                  placeholder="TAASISI RASMI · MALOSHA"
                  className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-700">
                  {tr('Maandishi ya Watermark ya Usalama (Kuzuia Wizi)', 'Anti-Forgery Watermark Text')}
                </label>
                <input
                  type="text"
                  maxLength={100}
                  value={cert.watermarkText}
                  onChange={(e) => updateField('watermarkText', e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-[#1D4E89] focus:outline-none"
                />
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-800">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    {tr(
                      `Msimbo wa kuzuia kughushi: ${checksum} (umeunganishwa kwenye matrix ya usalama na code watermark).`,
                      `Anti-tamper code: ${checksum} (bound to matrix & micro-code watermark).`
                    )}
                  </span>
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Saved Certificates Archive */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4">
        <div className="flex items-center justify-between gap-2 pb-3">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-[#1D4E89]" aria-hidden="true" />
            <h3 className="font-display text-sm font-bold text-slate-900">
              {tr('Kumbukumbu ya Vyeti Vilivyotolewa', 'Issued Certificates Archive')}
            </h3>
          </div>
          <span className="text-xs font-semibold text-slate-500 tabular-nums">
            {archive.length} {tr('vyeti', 'issued')}
          </span>
        </div>

        {loadingArchive ? (
          <div className="flex items-center justify-center py-6 text-xs text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            <span>{tr('Inapakia vyeti vilivyohifadhiwa...', 'Loading saved certificates...')}</span>
          </div>
        ) : archive.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 py-5 text-center text-xs text-slate-500">
            {tr(
              'Bado hujahifadhi cheti kwenye kumbukumbu. Tengeneza cheti hapo juu kisha bonyeza "Hifadhi Kwenye Kumbukumbu".',
              'No archived certificates yet. Design a certificate above and click "Save to Archive".'
            )}
          </p>
        ) : (
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {archive.map((item) => (
              <div
                key={item.certId}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-xs"
              >
                <div className="min-w-0">
                  <p className="truncate font-bold text-slate-900">{item.recipientName}</p>
                  <p className="truncate text-[11px] text-slate-600">
                    {item.courseTitle} · <span className="font-mono">{item.serialNumber}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleLoadFromArchive(item)}
                    className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-800 hover:bg-slate-50"
                  >
                    <Download className="h-3 w-3 text-[#0E2640]" aria-hidden="true" />
                    <span>{tr('Fungua / Pakua', 'Open / Export')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteArchive(item.certId)}
                    aria-label={tr('Futa cheti', 'Delete certificate')}
                    className="inline-flex min-h-[32px] items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-rose-700 hover:bg-rose-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
