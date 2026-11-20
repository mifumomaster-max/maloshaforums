import React, { useEffect, useId, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Download,
  Loader2,
  RotateCcw,
  Save,
  Share2,
  Shield,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { uploadImageToCloudinary } from '../services/cloudinaryService';
import { fetchOwnerCustomIdCard, saveOwnerCustomIdCard } from '../services/forumService';
import { OwnerCustomIdCardData } from '../types';
import { SignaturePadInput } from './SignaturePadInput';

interface OwnerEditableIdCardProps {
  ownerUid: string;
  ownerPhotoUrl?: string;
  ownerDisplayName?: string;
  onToast: (message: string, kind?: 'success' | 'error') => void;
}

type EditableCardFields = Omit<
  OwnerCustomIdCardData,
  'cardId' | 'ownerUid' | 'createdAt' | 'updatedAt'
>;

const DEFAULT_OWNER_SPECIMEN: EditableCardFields = {
  headerTopLeftSw: 'JAMHURI YA MUUNGANO WA TANZANIA',
  headerTopLeftEn: 'THE UNITED REPUBLIC OF TANZANIA',
  headerTopRightSw: 'KITAMBULISHO CHA TAIFA',
  headerTopRightEn: 'CITIZEN IDENTITY CARD',
  idNumberLabel: 'Namba ya Utambulisho | ID Number',
  idNumber: '2001061234567000001-29',
  surnameLabel: 'Jina la Ukoo | Surname',
  surname: 'MASAWE',
  givenNamesLabel: 'Jina | Given Names',
  givenNames: 'NEEMA SAMWEL',
  dobLabel: 'Tarehe ya Kuzaliwa | Date of Birth',
  dateOfBirth: '12 JAN 2001',
  sexLabel: 'Jinsia | Sex',
  sex: 'F',
  nationalityLabel: 'Utaifa | Nationality',
  nationality: 'TANZANIAN',
  signatureLabel: 'Saini | Signature',
  signatureText: 'R. Masawe',
  signaturePath:
    'M18 62 C34 18, 64 16, 52 54 C68 42, 92 26, 118 46 C132 58, 152 34, 178 44 C198 52, 224 34, 258 42 M26 70 Q138 56 268 62',
  portraitUrl: '',
  hologramPhotoUrl: '',
  showSpecimenStamp: true,
  specimenText: 'SPECIMEN',
  showRightEmblem: true,
};

function drawRoundedRect(
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

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  focusY = 0.2
) {
  const sw = img.naturalWidth || img.width || dw;
  const sh = img.naturalHeight || img.height || dh;
  const scale = Math.max(dw / sw, dh / sh);
  const cropW = dw / scale;
  const cropH = dh / scale;
  const sx = Math.max(0, (sw - cropW) / 2);
  const sy = Math.max(0, Math.min(sh - cropH, (sh - cropH) * focusY));
  ctx.drawImage(img, sx, sy, cropW, cropH, dx, dy, dw, dh);
}

function drawCoatOfArmsCanvas(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale = 1) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  // Uhuru golden flame & torch on top of shield
  ctx.fillStyle = '#F59E0B';
  ctx.beginPath();
  ctx.moveTo(0, -34);
  ctx.quadraticCurveTo(7, -26, 3, -18);
  ctx.lineTo(-3, -18);
  ctx.quadraticCurveTo(-7, -26, 0, -34);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#B45309';
  ctx.fillRect(-2.2, -19, 4.4, 7);

  // Two supporters (man & woman figures flanking the shield in green robes)
  ctx.fillStyle = '#15803D';
  // Left supporter
  ctx.beginPath();
  ctx.roundRect(-31, -6, 11, 24, 4);
  ctx.fill();
  // Right supporter
  ctx.beginPath();
  ctx.roundRect(20, -6, 11, 24, 4);
  ctx.fill();
  // Heads
  ctx.fillStyle = '#3F2316';
  ctx.beginPath();
  ctx.arc(-25.5, -12, 4.3, 0, Math.PI * 2);
  ctx.arc(25.5, -12, 4.3, 0, Math.PI * 2);
  ctx.fill();

  // Spears/tusks framing shield
  ctx.strokeStyle = '#78350F';
  ctx.lineWidth = 2.1;
  ctx.beginPath();
  ctx.moveTo(-34, -22);
  ctx.lineTo(-22, 24);
  ctx.moveTo(34, -22);
  ctx.lineTo(22, 24);
  ctx.stroke();

  // Central Shield
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-16, -13);
  ctx.lineTo(16, -13);
  ctx.lineTo(14, 7);
  ctx.quadraticCurveTo(0, 24, 0, 24);
  ctx.quadraticCurveTo(0, 24, -14, 7);
  ctx.closePath();
  ctx.clip();

  // Shield bands: Gold top, Black bar, Tanzania flag lower
  ctx.fillStyle = '#FACC15';
  ctx.fillRect(-16, -13, 32, 10);
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(-16, -3, 32, 6);
  ctx.fillStyle = '#16A34A';
  ctx.fillRect(-16, 3, 32, 10);
  ctx.fillStyle = '#0284C7';
  ctx.fillRect(-16, 13, 32, 12);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(-16, 10, 32, 3);
  ctx.restore();

  ctx.strokeStyle = '#78350F';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-16, -13);
  ctx.lineTo(16, -13);
  ctx.lineTo(14, 7);
  ctx.quadraticCurveTo(0, 24, 0, 24);
  ctx.quadraticCurveTo(0, 24, -14, 7);
  ctx.closePath();
  ctx.stroke();

  // Bottom green mound & motto scroll ("UHURU NA UMOJA")
  ctx.fillStyle = '#166534';
  ctx.beginPath();
  ctx.ellipse(0, 25, 27, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FEF3C7';
  ctx.strokeStyle = '#92400E';
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, -26, 25, 52, 8.5, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#451A03';
  ctx.font = '800 5.5px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('UHURU NA UMOJA', 0, 29.4);

  ctx.restore();
}

const CoatOfArmsSvg: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 80 72" className={className} aria-hidden="true">
    {/* Torch Flame & Handle */}
    <path d="M40 3 C45 10, 43 17, 40 19 C37 17, 35 10, 40 3 Z" fill="#F59E0B" />
    <rect x="38" y="18" width="4" height="6" rx="1" fill="#92400E" />
    {/* Spears */}
    <path d="M9 12 L19 56 M71 12 L61 56" stroke="#78350F" strokeWidth="2.2" strokeLinecap="round" />
    {/* Supporters */}
    <circle cx="15" cy="22" r="4.2" fill="#432818" />
    <rect x="10" y="27" width="10" height="23" rx="4" fill="#15803D" />
    <circle cx="65" cy="22" r="4.2" fill="#432818" />
    <rect x="60" y="27" width="10" height="23" rx="4" fill="#15803D" />
    {/* Shield */}
    <clipPath id="coa-shield-clip">
      <path d="M25 21 H55 L53 41 Q40 57 40 57 Q40 57 27 41 Z" />
    </clipPath>
    <g clipPath="url(#coa-shield-clip)">
      <rect x="24" y="20" width="32" height="10" fill="#FACC15" />
      <rect x="24" y="30" width="32" height="6" fill="#1E293B" />
      <rect x="24" y="36" width="32" height="8" fill="#16A34A" />
      <rect x="24" y="42" width="32" height="3" fill="#FFFFFF" />
      <rect x="24" y="45" width="32" height="14" fill="#0284C7" />
    </g>
    <path
      d="M25 21 H55 L53 41 Q40 57 40 57 Q40 57 27 41 Z"
      fill="none"
      stroke="#78350F"
      strokeWidth="1.7"
    />
    {/* Mound + Scroll */}
    <ellipse cx="40" cy="58" rx="26" ry="5" fill="#166534" />
    <rect x="14" y="58.5" width="52" height="9" rx="3" fill="#FEF3C7" stroke="#92400E" strokeWidth="1" />
    <text
      x="40"
      y="64.5"
      textAnchor="middle"
      fontSize="5.2"
      fontWeight="800"
      fill="#451A03"
      fontFamily="sans-serif"
    >
      UHURU NA UMOJA
    </text>
  </svg>
);

export const OwnerEditableIdCard: React.FC<OwnerEditableIdCardProps> = ({
  ownerUid,
  ownerPhotoUrl,
  ownerDisplayName,
  onToast,
}) => {
  const { tr } = useLanguage();
  const svgUid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const portraitInputRef = useRef<HTMLInputElement | null>(null);
  const hologramInputRef = useRef<HTMLInputElement | null>(null);

  const [fields, setFields] = useState<EditableCardFields>({
    ...DEFAULT_OWNER_SPECIMEN,
    portraitUrl: ownerPhotoUrl || '',
    hologramPhotoUrl: '',
  });
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPortrait, setUploadingPortrait] = useState(false);
  const [uploadingHolo, setUploadingHolo] = useState(false);
  const [generatingPng, setGeneratingPng] = useState(false);
  const [editorTab, setEditorTab] = useState<'details' | 'media' | 'headers'>('details');
  const [savedFlag, setSavedFlag] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingSaved(true);
    fetchOwnerCustomIdCard('primary')
      .then((saved) => {
        if (cancelled) return;
        if (saved) {
          setFields({
            headerTopLeftSw: saved.headerTopLeftSw || DEFAULT_OWNER_SPECIMEN.headerTopLeftSw,
            headerTopLeftEn: saved.headerTopLeftEn || DEFAULT_OWNER_SPECIMEN.headerTopLeftEn,
            headerTopRightSw: saved.headerTopRightSw || DEFAULT_OWNER_SPECIMEN.headerTopRightSw,
            headerTopRightEn: saved.headerTopRightEn || DEFAULT_OWNER_SPECIMEN.headerTopRightEn,
            idNumberLabel: saved.idNumberLabel || DEFAULT_OWNER_SPECIMEN.idNumberLabel,
            idNumber: saved.idNumber,
            surnameLabel: saved.surnameLabel || DEFAULT_OWNER_SPECIMEN.surnameLabel,
            surname: saved.surname,
            givenNamesLabel: saved.givenNamesLabel || DEFAULT_OWNER_SPECIMEN.givenNamesLabel,
            givenNames: saved.givenNames,
            dobLabel: saved.dobLabel || DEFAULT_OWNER_SPECIMEN.dobLabel,
            dateOfBirth: saved.dateOfBirth,
            sexLabel: saved.sexLabel || DEFAULT_OWNER_SPECIMEN.sexLabel,
            sex: saved.sex,
            nationalityLabel: saved.nationalityLabel || DEFAULT_OWNER_SPECIMEN.nationalityLabel,
            nationality: saved.nationality,
            signatureLabel: saved.signatureLabel || DEFAULT_OWNER_SPECIMEN.signatureLabel,
            signatureText: saved.signatureText,
            signaturePath: saved.signaturePath,
            portraitUrl: saved.portraitUrl,
            hologramPhotoUrl: saved.hologramPhotoUrl,
            showSpecimenStamp: saved.showSpecimenStamp,
            specimenText: saved.specimenText,
            showRightEmblem: saved.showRightEmblem,
          });
        }
      })
      .catch(() => {
        // Use specimen default cleanly
      })
      .finally(() => {
        if (!cancelled) setLoadingSaved(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ownerUid]);

  const updateField = <K extends keyof EditableCardFields>(
    key: K,
    value: EditableCardFields[K]
  ) => {
    setSavedFlag(false);
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const handleUploadImage = async (
    file: File,
    target: 'portraitUrl' | 'hologramPhotoUrl'
  ) => {
    const setBusy = target === 'portraitUrl' ? setUploadingPortrait : setUploadingHolo;
    setBusy(true);
    try {
      const url = await uploadImageToCloudinary(file);
      updateField(target, url);
      onToast(tr('Picha imepakiwa kikamilifu!', 'Image uploaded successfully!'), 'success');
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : tr('Imeshindwa kupakia picha.', 'Failed to upload image.'),
        'error'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSaveToAccount = async () => {
    setSaving(true);
    try {
      await saveOwnerCustomIdCard(ownerUid, fields, 'primary');
      setSavedFlag(true);
      onToast(
        tr('Mabadiliko yote ya kitambulisho yamehifadhiwa!', 'Owner ID card changes saved!'),
        'success'
      );
      window.setTimeout(() => setSavedFlag(false), 2600);
    } catch (err) {
      onToast(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kuhifadhi mabadiliko.', 'Failed to save changes.'),
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleResetSpecimen = () => {
    setFields({ ...DEFAULT_OWNER_SPECIMEN });
    setSavedFlag(false);
    onToast(
      tr('Kitambulisho kimerejeshwa kwenye muundo wa awali.', 'Reset to specimen layout.'),
      'success'
    );
  };

  const renderSpecimenPngBlob = async (): Promise<Blob> => {
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      await document.fonts.ready;
    }

    const W = 1050;
    const H = 662;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');

    ctx.save();
    drawRoundedRect(ctx, 0, 0, W, H, 32);
    ctx.clip();

    // 1. Sky-cyan base gradient matching the Tanzania specimen ID card
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#F1FBFF');
    bgGrad.addColorStop(0.35, '#D4F2FC');
    bgGrad.addColorStop(0.75, '#BCE9FA');
    bgGrad.addColorStop(1, '#CFEFFB');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // 2. Micro-wave guilloche mesh across entire card
    ctx.save();
    for (let i = 0; i < 36; i++) {
      ctx.beginPath();
      const baseY = 10 + i * 19;
      ctx.strokeStyle =
        i % 3 === 0 ? 'rgba(56, 189, 248, 0.22)' : 'rgba(14, 165, 233, 0.14)';
      ctx.lineWidth = 1.1;
      for (let x = 0; x <= W; x += 18) {
        const y =
          baseY +
          Math.sin(x * 0.015 + i * 0.42) * 10 +
          Math.cos(x * 0.032 - i * 0.2) * 4;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();

    // 3. Mount Kilimanjaro snowy silhouette across center-right
    ctx.save();
    ctx.fillStyle = 'rgba(147, 213, 243, 0.56)';
    ctx.beginPath();
    ctx.moveTo(310, 412);
    ctx.lineTo(410, 340);
    ctx.lineTo(476, 322);
    ctx.lineTo(548, 250);
    ctx.lineTo(585, 214);
    ctx.lineTo(638, 212);
    ctx.lineTo(682, 246);
    ctx.lineTo(745, 294);
    ctx.lineTo(800, 268);
    ctx.lineTo(845, 286);
    ctx.lineTo(940, 345);
    ctx.lineTo(1050, 392);
    ctx.lineTo(1050, 430);
    ctx.lineTo(310, 430);
    ctx.closePath();
    ctx.fill();

    // White snow-cap highlights on Kibo & Mawenzi
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.moveTo(542, 254);
    ctx.lineTo(585, 214);
    ctx.lineTo(638, 212);
    ctx.lineTo(684, 248);
    ctx.lineTo(662, 262);
    ctx.lineTo(638, 252);
    ctx.lineTo(616, 268);
    ctx.lineTo(596, 250);
    ctx.lineTo(574, 266);
    ctx.lineTo(558, 256);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(780, 278);
    ctx.lineTo(800, 268);
    ctx.lineTo(824, 278);
    ctx.lineTo(808, 284);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 4. Pink / Coral Reticulated Twiga (Giraffe) Watermark on lower-right
    ctx.save();
    ctx.fillStyle = 'rgba(239, 128, 134, 0.48)';
    ctx.beginPath();
    ctx.moveTo(748, 338); // muzzle
    ctx.lineTo(772, 326); // forehead
    ctx.lineTo(776, 311); // ossicone 1
    ctx.lineTo(781, 311);
    ctx.lineTo(782, 324);
    ctx.lineTo(788, 310); // ossicone 2
    ctx.lineTo(793, 312);
    ctx.lineTo(791, 326);
    ctx.lineTo(802, 331); // ear
    ctx.lineTo(794, 340); // nape
    ctx.lineTo(848, 466); // back of neck
    ctx.lineTo(906, 492); // back slope
    ctx.lineTo(918, 534); // hip
    ctx.lineTo(924, 650); // hind leg
    ctx.lineTo(892, 650);
    ctx.lineTo(892, 560);
    ctx.lineTo(846, 558); // belly
    ctx.lineTo(836, 650); // front leg
    ctx.lineTo(804, 650);
    ctx.lineTo(818, 488); // chest
    ctx.lineTo(772, 352); // throat
    ctx.lineTo(750, 346); // jaw
    ctx.closePath();
    ctx.fill();

    // Reticulated giraffe white patches
    ctx.fillStyle = 'rgba(225, 245, 254, 0.56)';
    [
      [796, 368, 7, 5],
      [808, 392, 8, 6],
      [818, 418, 9, 6],
      [830, 444, 10, 7],
      [842, 472, 11, 8],
      [866, 500, 12, 8],
      [888, 514, 11, 8],
      [848, 514, 12, 9],
      [872, 536, 10, 8],
      [896, 542, 10, 7],
    ].forEach(([rx, ry, rw, rh]) => {
      ctx.beginPath();
      ctx.ellipse(rx, ry, rw, rh, 0.25, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // 5. Top Header Row
    ctx.fillStyle = '#0F172A';
    ctx.font = '800 17px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(fields.headerTopLeftSw.toUpperCase(), 54, 52);

    ctx.fillStyle = '#1245A8';
    ctx.font = '800 15.5px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(fields.headerTopLeftEn.toUpperCase(), 54, 74);

    // Center Coat of Arms Emblem
    drawCoatOfArmsCanvas(ctx, 482, 54, 1.02);

    // Top-Right Title Lines
    ctx.fillStyle = '#0F172A';
    ctx.font = '800 17.5px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(fields.headerTopRightSw.toUpperCase(), 546, 52);

    ctx.fillStyle = '#1245A8';
    ctx.font = '800 16px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(fields.headerTopRightEn.toUpperCase(), 546, 74);

    // Far Top-Right Burgundy "-O-" Emblem
    if (fields.showRightEmblem) {
      ctx.save();
      ctx.fillStyle = '#8B1E2B';
      ctx.fillRect(906, 30, 84, 52);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(906, 53, 84, 6);
      ctx.beginPath();
      ctx.arc(948, 56, 15, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(948, 56, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#8B1E2B';
      ctx.fill();
      ctx.restore();
    }

    // 6. Main Portrait Box (Left)
    const pX = 54;
    const pY = 144;
    const pW = 286;
    const pH = 360;
    const activePortraitUrl = fields.portraitUrl.trim();
    const portraitImg = activePortraitUrl ? await loadCorsImage(activePortraitUrl) : null;

    ctx.save();
    drawRoundedRect(ctx, pX, pY, pW, pH, 10);
    ctx.clip();
    ctx.fillStyle = 'rgba(241, 249, 254, 0.85)';
    ctx.fillRect(pX, pY, pW, pH);
    if (portraitImg) {
      drawCoverImage(ctx, portraitImg, pX, pY, pW, pH, 0.22);
    } else {
      // Crisp studio avatar placeholder
      ctx.fillStyle = '#CBD5E1';
      ctx.beginPath();
      ctx.arc(pX + pW / 2, pY + 124, 54, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(pX + pW / 2, pY + 310, 96, 108, 0, Math.PI, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 7. ID Number Directly Under Portrait
    ctx.textAlign = 'left';
    ctx.fillStyle = '#1245A8';
    ctx.font = '700 14.5px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(fields.idNumberLabel, 54, 542);

    ctx.fillStyle = '#111827';
    ctx.font = '800 22px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(fields.idNumber, 54, 574);

    // 8. Center Bilingual Fields (5 Rows)
    const fieldRows = [
      { label: fields.surnameLabel, value: fields.surname, y: 158 },
      { label: fields.givenNamesLabel, value: fields.givenNames, y: 244 },
      { label: fields.dobLabel, value: fields.dateOfBirth, y: 330 },
      { label: fields.sexLabel, value: fields.sex, y: 416 },
      { label: fields.nationalityLabel, value: fields.nationality, y: 502 },
    ];
    fieldRows.forEach((row) => {
      ctx.fillStyle = '#1245A8';
      ctx.font = '700 14.5px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(row.label, 384, row.y);

      ctx.fillStyle = '#111827';
      ctx.font = '800 24.5px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(row.value.toUpperCase(), 384, row.y + 34);
    });

    // 9. Right Column: Tricolor-Bordered Ghost Mini Portrait Hologram
    const hX = 842;
    const hY = 172;
    const hSize = 132;
    ctx.save();
    drawRoundedRect(ctx, hX - 7, hY - 7, hSize + 14, hSize + 14, 22);
    ctx.clip();
    // Tanzania Flag multi-color frame around hologram square
    const holoFrameGrad = ctx.createLinearGradient(hX - 7, hY - 7, hX + hSize + 7, hY + hSize + 7);
    holoFrameGrad.addColorStop(0, '#1EB53A');
    holoFrameGrad.addColorStop(0.32, '#1EB53A');
    holoFrameGrad.addColorStop(0.38, '#FCD116');
    holoFrameGrad.addColorStop(0.45, '#0F172A');
    holoFrameGrad.addColorStop(0.55, '#0F172A');
    holoFrameGrad.addColorStop(0.62, '#FCD116');
    holoFrameGrad.addColorStop(0.68, '#00A3DD');
    holoFrameGrad.addColorStop(1, '#00A3DD');
    ctx.fillStyle = holoFrameGrad;
    ctx.fillRect(hX - 7, hY - 7, hSize + 14, hSize + 14);
    ctx.restore();

    const holoSrcUrl = fields.hologramPhotoUrl.trim() || activePortraitUrl;
    const holoImg =
      holoSrcUrl === activePortraitUrl ? portraitImg : await loadCorsImage(holoSrcUrl);
    ctx.save();
    drawRoundedRect(ctx, hX, hY, hSize, hSize, 16);
    ctx.clip();
    ctx.fillStyle = '#DDD6C5';
    ctx.fillRect(hX, hY, hSize, hSize);
    if (holoImg) {
      ctx.filter = 'grayscale(100%) sepia(35%) contrast(95%) opacity(78%)';
      drawCoverImage(ctx, holoImg, hX, hY, hSize, hSize, 0.2);
      ctx.filter = 'none';
    } else {
      ctx.fillStyle = 'rgba(100, 116, 139, 0.45)';
      ctx.beginPath();
      ctx.arc(hX + hSize / 2, hY + 48, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(hX + hSize / 2, hY + 122, 42, 46, 0, Math.PI, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 10. Signature Zone (Bottom-Right)
    ctx.fillStyle = '#1245A8';
    ctx.font = '700 14.5px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(fields.signatureLabel, 692, 496);

    if (fields.signaturePath.trim()) {
      ctx.save();
      ctx.translate(692, 502);
      ctx.scale(220 / 300, 62 / 90);
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      try {
        ctx.stroke(new Path2D(fields.signaturePath));
      } catch {
        // fallback text below if malformed
      }
      ctx.restore();
    } else if (fields.signatureText.trim()) {
      ctx.fillStyle = '#0F172A';
      ctx.font = '46px "Great Vibes", cursive';
      ctx.fillText(fields.signatureText, 694, 548);
    }

    // 11. Optional Outlined "SPECIMEN" Stamp
    if (fields.showSpecimenStamp && fields.specimenText.trim()) {
      ctx.save();
      ctx.font = '800 40px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.55)';
      ctx.lineWidth = 1.6;
      ctx.strokeText(fields.specimenText.toUpperCase(), 704, 608);
      ctx.restore();
    }

    // Subtle crisp card outer border
    ctx.restore();
    ctx.save();
    drawRoundedRect(ctx, 1, 1, W - 2, H - 2, 31);
    ctx.strokeStyle = 'rgba(14, 116, 174, 0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to generate PNG'));
        },
        'image/png',
        1
      );
    });
  };

  const handleDownloadPng = async () => {
    setGeneratingPng(true);
    try {
      const blob = await renderSpecimenPngBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const slug = (fields.surname || 'owner')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 24);
      a.href = url;
      a.download = `malosha-owner-id-${slug || 'card'}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      onToast(tr('Kitambulisho kimehifadhiwa kama picha (PNG)!', 'ID card saved as PNG!'), 'success');
    } catch {
      onToast(tr('Imeshindwa kutengeneza picha ya kitambulisho.', 'Failed to export PNG.'), 'error');
    } finally {
      setGeneratingPng(false);
    }
  };

  const handleSharePng = async () => {
    setGeneratingPng(true);
    try {
      const blob = await renderSpecimenPngBlob();
      const file = new File([blob], 'owner-id-card.png', { type: 'image/png' });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({
          files: [file],
          title: `${fields.givenNames} ${fields.surname}`.trim(),
        });
      } else {
        await handleDownloadPng();
      }
    } catch {
      // User dismissed share
    } finally {
      setGeneratingPng(false);
    }
  };

  const activeHoloPhoto = fields.hologramPhotoUrl.trim() || fields.portraitUrl.trim();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50/70 px-3.5 py-2.5 text-xs text-slate-800">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 shrink-0 text-[#1245A8]" aria-hidden="true" />
          <span>
            {tr(
              'Kitambulisho cha Pili (Mmiliki Pekee): Hariri sehemu zote kuanzia picha, namba, majina, saini hadi vichwa vya juu.',
              'Second Owner-Only ID Card: Edit every field including portrait, number, names, signature, and headers.'
            )}
          </span>
        </div>
        {loadingSaved && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1245A8]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            <span>{tr('Inapakia...', 'Loading...')}</span>
          </span>
        )}
      </div>

      {/* Live Preview Canvas matching Specimen 1050x662 */}
      <div className="mx-auto w-full max-w-[660px]">
        <div
          className="relative w-full overflow-hidden rounded-[18px] border border-sky-300/60 shadow-lg sm:rounded-[24px]"
          style={{
            aspectRatio: '1050 / 662',
            background: 'linear-gradient(135deg, #F1FBFF 0%, #D4F2FC 38%, #BCE9FA 78%, #CFEFFB 100%)',
          }}
        >
          {/* SVG Watermark Layer: Guilloche Waves + Kilimanjaro + Pink Reticulated Twiga */}
          <svg
            viewBox="0 0 1050 662"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            <defs>
              <pattern
                id={`owner-wave-${svgUid}`}
                width="160"
                height="24"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M0 12 Q40 2 80 12 T160 12"
                  fill="none"
                  stroke="rgba(14, 165, 233, 0.19)"
                  strokeWidth="1.2"
                />
                <path
                  d="M0 22 Q40 12 80 22 T160 22"
                  fill="none"
                  stroke="rgba(56, 189, 248, 0.14)"
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect width="1050" height="662" fill={`url(#owner-wave-${svgUid})`} />

            {/* Mount Kilimanjaro Silhouette */}
            <path
              d="M310 412 L410 340 L476 322 L548 250 L585 214 L638 212 L682 246 L745 294 L800 268 L845 286 L940 345 L1050 392 V430 H310 Z"
              fill="rgba(147, 213, 243, 0.56)"
            />
            <path
              d="M542 254 L585 214 L638 212 L684 248 L662 262 L638 252 L616 268 L596 250 L574 266 L558 256 Z"
              fill="rgba(255, 255, 255, 0.85)"
            />
            <path d="M780 278 L800 268 L824 278 L808 284 Z" fill="rgba(255,255,255,0.82)" />

            {/* Pink/Coral Reticulated Twiga Silhouette */}
            <path
              d="M748 338 L772 326 L776 311 L781 311 L782 324 L788 310 L793 312 L791 326 L802 331 L794 340 L848 466 L906 492 L918 534 L924 650 H892 V560 H846 L836 650 H804 L818 488 L772 352 L750 346 Z"
              fill="rgba(239, 128, 134, 0.48)"
            />
            <g fill="rgba(225, 245, 254, 0.56)">
              <ellipse cx="796" cy="368" rx="7" ry="5" />
              <ellipse cx="808" cy="392" rx="8" ry="6" />
              <ellipse cx="818" cy="418" rx="9" ry="6" />
              <ellipse cx="830" cy="444" rx="10" ry="7" />
              <ellipse cx="842" cy="472" rx="11" ry="8" />
              <ellipse cx="866" cy="500" rx="12" ry="8" />
              <ellipse cx="888" cy="514" rx="11" ry="8" />
              <ellipse cx="848" cy="514" rx="12" ry="9" />
              <ellipse cx="872" cy="536" rx="10" ry="8" />
            </g>
          </svg>

          {/* Foreground Content Layer (Percentage Coordinates Matching 1050x662 Canvas) */}
          <div className="relative z-10 h-full w-full">
            {/* Top Header Row */}
            <div className="flex items-start justify-between px-[5.1%] pt-[4.4%]">
              <div className="w-[37.5%] min-w-0">
                <p className="truncate text-[7.5px] font-extrabold leading-tight tracking-tight text-slate-950 uppercase sm:text-[11px]">
                  {fields.headerTopLeftSw}
                </p>
                <p className="truncate text-[6.8px] font-extrabold leading-tight tracking-tight text-[#1245A8] uppercase sm:text-[10px]">
                  {fields.headerTopLeftEn}
                </p>
              </div>

              <div className="-mt-1 flex w-[9%] shrink-0 justify-center">
                <CoatOfArmsSvg className="h-[28px] w-[30px] sm:h-[46px] sm:w-[50px]" />
              </div>

              <div className="w-[34%] min-w-0 pl-[1%]">
                <p className="truncate text-[7.5px] font-extrabold leading-tight tracking-tight text-slate-950 uppercase sm:text-[11.5px]">
                  {fields.headerTopRightSw}
                </p>
                <p className="truncate text-[6.8px] font-extrabold leading-tight tracking-tight text-[#1245A8] uppercase sm:text-[10.5px]">
                  {fields.headerTopRightEn}
                </p>
              </div>

              <div className="flex w-[9%] shrink-0 justify-end">
                {fields.showRightEmblem && (
                  <div className="relative flex h-[18px] w-[30px] items-center justify-center bg-[#8B1E2B] sm:h-[32px] sm:w-[52px]">
                    <div className="h-[2.5px] w-full bg-white sm:h-[4px]" />
                    <div className="absolute flex h-[11px] w-[11px] items-center justify-center rounded-full bg-white sm:h-[19px] sm:w-[19px]">
                      <div className="h-[6.5px] w-[6.5px] rounded-full bg-[#8B1E2B] sm:h-[11px] sm:w-[11px]" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Left Portrait Photo */}
            <div
              className="absolute left-[5.1%] top-[21.7%] h-[54.4%] w-[27.2%] overflow-hidden rounded-[6px] bg-sky-50/80 shadow-xs"
              style={{ border: '1px solid rgba(255,255,255,0.75)' }}
            >
              {fields.portraitUrl ? (
                <img
                  src={fields.portraitUrl}
                  alt={fields.givenNames || ownerDisplayName || 'Owner Portrait'}
                  className="h-full w-full object-cover object-[center_20%]"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center bg-slate-100/80 text-slate-400">
                  <Camera className="h-6 w-6 sm:h-10 sm:w-10" aria-hidden="true" />
                  <span className="mt-1 text-[7px] font-semibold uppercase sm:text-[10px]">
                    {tr('Picha', 'Photo')}
                  </span>
                </div>
              )}
            </div>

            {/* ID Number Directly Under Portrait */}
            <div className="absolute left-[5.1%] top-[79%] w-[32%]">
              <p className="truncate text-[6.5px] font-bold text-[#1245A8] sm:text-[9.5px]">
                {fields.idNumberLabel}
              </p>
              <p className="truncate font-sans text-[9.5px] font-extrabold tracking-tight text-slate-950 tabular-nums sm:text-[14.5px]">
                {fields.idNumber}
              </p>
            </div>

            {/* Center 5 Bilingual Fields */}
            <div className="absolute left-[36.5%] top-[21.8%] flex w-[41%] flex-col gap-[7px] sm:gap-[12px]">
              {[
                { label: fields.surnameLabel, value: fields.surname },
                { label: fields.givenNamesLabel, value: fields.givenNames },
                { label: fields.dobLabel, value: fields.dateOfBirth },
                { label: fields.sexLabel, value: fields.sex },
                { label: fields.nationalityLabel, value: fields.nationality },
              ].map((row, idx) => (
                <div key={idx} className="leading-none">
                  <p className="truncate text-[6.5px] font-bold text-[#1245A8] sm:text-[9.5px]">
                    {row.label}
                  </p>
                  <p className="mt-[1.5px] truncate text-[10px] font-extrabold tracking-tight text-slate-950 uppercase sm:text-[15.5px]">
                    {row.value || '—'}
                  </p>
                </div>
              ))}
            </div>

            {/* Top-Right Tricolor-Framed Ghost Mini Portrait */}
            <div
              className="absolute right-[7.2%] top-[25%] h-[20.5%] w-[13.2%] rounded-[10px] p-[2.5px] shadow-xs sm:rounded-[14px] sm:p-[4px]"
              style={{
                background:
                  'linear-gradient(135deg, #1EB53A 0%, #1EB53A 32%, #FCD116 38%, #0F172A 45%, #0F172A 55%, #FCD116 62%, #00A3DD 68%, #00A3DD 100%)',
              }}
            >
              <div className="h-full w-full overflow-hidden rounded-[7px] bg-[#DDD6C5] sm:rounded-[10px]">
                {activeHoloPhoto ? (
                  <img
                    src={activeHoloPhoto}
                    alt=""
                    className="h-full w-full object-cover object-[center_20%] opacity-80 sepia-[.35] grayscale"
                  />
                ) : (
                  <div className="h-full w-full bg-stone-300/70" />
                )}
              </div>
            </div>

            {/* Bottom-Right Signature + Optional Specimen Stamp */}
            <div className="absolute left-[65.9%] right-[4%] top-[73%]">
              <p className="truncate text-[6.5px] font-bold text-[#1245A8] sm:text-[9.5px]">
                {fields.signatureLabel}
              </p>
              <div className="mt-0.5 flex h-[22px] items-center sm:h-[38px]">
                {fields.signaturePath.trim() ? (
                  <svg viewBox="0 0 300 90" className="h-full w-auto max-w-[135px]">
                    <path
                      d={fields.signaturePath}
                      fill="none"
                      stroke="#0F172A"
                      strokeWidth="3.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <span
                    className="truncate text-lg leading-none text-slate-950 sm:text-3xl"
                    style={{ fontFamily: '"Great Vibes", cursive' }}
                  >
                    {fields.signatureText}
                  </span>
                )}
              </div>
              {fields.showSpecimenStamp && fields.specimenText.trim() && (
                <p
                  className="-mt-0.5 truncate text-[16px] font-extrabold tracking-wider uppercase sm:text-[26px]"
                  style={{
                    color: 'transparent',
                    WebkitTextStroke: '1px rgba(30, 41, 59, 0.52)',
                  }}
                >
                  {fields.specimenText}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons: Save Changes, Download PNG, Share, Reset */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSaveToAccount()}
          className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-[#1245A8] px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-[#0E3685] disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : savedFlag ? (
            <Check className="h-4 w-4 text-emerald-300" aria-hidden="true" />
          ) : (
            <Save className="h-4 w-4" aria-hidden="true" />
          )}
          <span>
            {saving
              ? tr('Inahifadhi...', 'Saving...')
              : savedFlag
                ? tr('Imehifadhiwa!', 'Saved!')
                : tr('Hifadhi Taarifa za Kitambulisho', 'Save ID Details')}
          </span>
        </button>

        <button
          type="button"
          disabled={generatingPng}
          onClick={() => void handleDownloadPng()}
          className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-[#0E2640] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#163A5F] disabled:opacity-60"
        >
          {generatingPng ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="h-4 w-4 text-amber-400" aria-hidden="true" />
          )}
          <span>{tr('Pakua Kitambulisho (PNG)', 'Download ID (PNG)')}</span>
        </button>

        <button
          type="button"
          disabled={generatingPng}
          onClick={() => void handleSharePng()}
          className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-100 disabled:opacity-60"
        >
          <Share2 className="h-4 w-4 text-[#1245A8]" aria-hidden="true" />
          <span>{tr('Shiriki', 'Share')}</span>
        </button>

        <button
          type="button"
          onClick={handleResetSpecimen}
          className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{tr('Rejesha Mfano', 'Reset Default')}</span>
        </button>
      </div>

      {/* Comprehensive Owner Editor Tabs */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
            <SlidersHorizontal className="h-4 w-4 text-[#1245A8]" aria-hidden="true" />
            <span>{tr('Hariri Taarifa Zote za Kitambulisho', 'Edit All ID Card Fields')}</span>
          </div>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setEditorTab('details')}
              className={`rounded-md px-2.5 py-1.5 transition-colors ${
                editorTab === 'details'
                  ? 'bg-[#0E2640] text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tr('Taarifa Kuu', 'Card Details')}
            </button>
            <button
              type="button"
              onClick={() => setEditorTab('media')}
              className={`rounded-md px-2.5 py-1.5 transition-colors ${
                editorTab === 'media'
                  ? 'bg-[#0E2640] text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tr('Picha & Saini', 'Photos & Signature')}
            </button>
            <button
              type="button"
              onClick={() => setEditorTab('headers')}
              className={`rounded-md px-2.5 py-1.5 transition-colors ${
                editorTab === 'headers'
                  ? 'bg-[#0E2640] text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tr('Vichwa & Lebo', 'Headers & Labels')}
            </button>
          </div>
        </div>

        {editorTab === 'details' && (
          <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-700">
                {tr('Namba ya Utambulisho (ID Number)', 'ID Number')}
              </label>
              <input
                type="text"
                maxLength={60}
                value={fields.idNumber}
                onChange={(e) => updateField('idNumber', e.target.value)}
                className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-[#1245A8] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700">
                {tr('Jina la Ukoo (Surname)', 'Surname')}
              </label>
              <input
                type="text"
                maxLength={80}
                value={fields.surname}
                onChange={(e) => updateField('surname', e.target.value)}
                className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#1245A8] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700">
                {tr('Majina Mengi (Given Names)', 'Given Names')}
              </label>
              <input
                type="text"
                maxLength={120}
                value={fields.givenNames}
                onChange={(e) => updateField('givenNames', e.target.value)}
                className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#1245A8] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700">
                {tr('Tarehe ya Kuzaliwa (Date of Birth)', 'Date of Birth')}
              </label>
              <input
                type="text"
                maxLength={60}
                value={fields.dateOfBirth}
                onChange={(e) => updateField('dateOfBirth', e.target.value)}
                placeholder="12 JAN 2001"
                className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#1245A8] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700">
                {tr('Jinsia (Sex)', 'Sex')}
              </label>
              <input
                type="text"
                maxLength={30}
                value={fields.sex}
                onChange={(e) => updateField('sex', e.target.value)}
                placeholder="F / M"
                className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#1245A8] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700">
                {tr('Utaifa (Nationality)', 'Nationality')}
              </label>
              <input
                type="text"
                maxLength={80}
                value={fields.nationality}
                onChange={(e) => updateField('nationality', e.target.value)}
                placeholder="TANZANIAN"
                className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#1245A8] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700">
                {tr('Neno la Muhuri (mf. SPECIMEN)', 'Watermark Stamp Text')}
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="text"
                  maxLength={40}
                  disabled={!fields.showSpecimenStamp}
                  value={fields.specimenText}
                  onChange={(e) => updateField('specimenText', e.target.value)}
                  className="min-h-[42px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#1245A8] focus:outline-none disabled:bg-slate-100"
                />
                <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={fields.showSpecimenStamp}
                    onChange={(e) => updateField('showSpecimenStamp', e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[#1245A8]"
                  />
                  <span>{tr('Onyesha', 'Show')}</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {editorTab === 'media' && (
          <div className="mt-3.5 space-y-4">
            <input
              ref={portraitInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void handleUploadImage(f, 'portraitUrl');
              }}
            />
            <input
              ref={hologramInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void handleUploadImage(f, 'hologramPhotoUrl');
              }}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <p className="text-xs font-bold text-slate-800">
                  {tr('Picha Kuu ya Kitambulisho', 'Main Portrait Photo')}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={uploadingPortrait}
                    onClick={() => portraitInputRef.current?.click()}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#0E2640] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#163A5F] disabled:opacity-60"
                  >
                    {uploadingPortrait ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Camera className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                    )}
                    <span>{tr('Pakia Picha', 'Upload Photo')}</span>
                  </button>
                  {ownerPhotoUrl && fields.portraitUrl !== ownerPhotoUrl && (
                    <button
                      type="button"
                      onClick={() => updateField('portraitUrl', ownerPhotoUrl)}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      {tr('Tumia Picha Yangu', 'Use Profile Photo')}
                    </button>
                  )}
                  {fields.portraitUrl && (
                    <button
                      type="button"
                      onClick={() => updateField('portraitUrl', '')}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                      <span>{tr('Ondoa', 'Remove')}</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <p className="text-xs font-bold text-slate-800">
                  {tr('Picha Ndogo ya Hologram (Kulia)', 'Mini Hologram Photo (Optional)')}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {tr(
                    'Usipoweka picha tofauti, inatumia picha kuu kiotomatiki.',
                    'Mirrors the main portrait automatically unless customized.'
                  )}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={uploadingHolo}
                    onClick={() => hologramInputRef.current?.click()}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-100 disabled:opacity-60"
                  >
                    {uploadingHolo ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Camera className="h-3.5 w-3.5 text-[#1245A8]" aria-hidden="true" />
                    )}
                    <span>{tr('Weka Picha Tofauti', 'Custom Hologram')}</span>
                  </button>
                  {fields.hologramPhotoUrl && (
                    <button
                      type="button"
                      onClick={() => updateField('hologramPhotoUrl', '')}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      {tr('Fuata Picha Kuu', 'Mirror Main')}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <SignaturePadInput
              label={tr('Saini ya Kwenye Kitambulisho', 'Cardholder Signature')}
              sigText={fields.signatureText}
              sigPath={fields.signaturePath}
              onChangeText={(val) => updateField('signatureText', val)}
              onChangePath={(p) => updateField('signaturePath', p)}
            />
          </div>
        )}

        {editorTab === 'headers' && (
          <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-bold text-slate-700">
                {tr('Kichwa cha Juu Kushoto (Kiswahili)', 'Top-Left Header (Line 1)')}
              </label>
              <input
                type="text"
                maxLength={100}
                value={fields.headerTopLeftSw}
                onChange={(e) => updateField('headerTopLeftSw', e.target.value)}
                className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-[#1245A8] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700">
                {tr('Kichwa cha Juu Kushoto (Kiingereza)', 'Top-Left Header (Line 2)')}
              </label>
              <input
                type="text"
                maxLength={100}
                value={fields.headerTopLeftEn}
                onChange={(e) => updateField('headerTopLeftEn', e.target.value)}
                className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-[#1245A8] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700">
                {tr('Kichwa cha Juu Kulia (Kiswahili)', 'Top-Right Header (Line 1)')}
              </label>
              <input
                type="text"
                maxLength={100}
                value={fields.headerTopRightSw}
                onChange={(e) => updateField('headerTopRightSw', e.target.value)}
                className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-[#1245A8] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700">
                {tr('Kichwa cha Juu Kulia (Kiingereza)', 'Top-Right Header (Line 2)')}
              </label>
              <input
                type="text"
                maxLength={100}
                value={fields.headerTopRightEn}
                onChange={(e) => updateField('headerTopRightEn', e.target.value)}
                className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-[#1245A8] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700">
                {tr('Lebo ya Namba ya Utambulisho', 'ID Number Label')}
              </label>
              <input
                type="text"
                maxLength={80}
                value={fields.idNumberLabel}
                onChange={(e) => updateField('idNumberLabel', e.target.value)}
                className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-[#1245A8] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700">
                {tr('Lebo ya Jina la Ukoo', 'Surname Label')}
              </label>
              <input
                type="text"
                maxLength={80}
                value={fields.surnameLabel}
                onChange={(e) => updateField('surnameLabel', e.target.value)}
                className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-[#1245A8] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700">
                {tr('Lebo ya Jina', 'Given Names Label')}
              </label>
              <input
                type="text"
                maxLength={80}
                value={fields.givenNamesLabel}
                onChange={(e) => updateField('givenNamesLabel', e.target.value)}
                className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-[#1245A8] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700">
                {tr('Lebo ya Tarehe ya Kuzaliwa', 'Date of Birth Label')}
              </label>
              <input
                type="text"
                maxLength={80}
                value={fields.dobLabel}
                onChange={(e) => updateField('dobLabel', e.target.value)}
                className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-[#1245A8] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700">
                {tr('Lebo ya Jinsia', 'Sex Label')}
              </label>
              <input
                type="text"
                maxLength={80}
                value={fields.sexLabel}
                onChange={(e) => updateField('sexLabel', e.target.value)}
                className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-[#1245A8] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700">
                {tr('Lebo ya Utaifa', 'Nationality Label')}
              </label>
              <input
                type="text"
                maxLength={80}
                value={fields.nationalityLabel}
                onChange={(e) => updateField('nationalityLabel', e.target.value)}
                className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-[#1245A8] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700">
                {tr('Lebo ya Saini', 'Signature Label')}
              </label>
              <input
                type="text"
                maxLength={80}
                value={fields.signatureLabel}
                onChange={(e) => updateField('signatureLabel', e.target.value)}
                className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-[#1245A8] focus:outline-none"
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={fields.showRightEmblem}
                  onChange={(e) => updateField('showRightEmblem', e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[#1245A8]"
                />
                <span>{tr('Onyesha Nembo ya Pembeni Juu Kulia', 'Show Top-Right Emblem')}</span>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
