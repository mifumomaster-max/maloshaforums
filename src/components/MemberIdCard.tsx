import React, { useEffect, useId, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  CreditCard,
  Download,
  Loader2,
  Lock,
  Share2,
  ShieldCheck,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { syncMemberIdRecord } from '../services/forumService';
import {
  MemberIdRecord,
  UserProfile,
  computeMemberControlSerial,
  formatMemberCode,
  normalizeAccountStatus,
} from '../types';

export { formatMemberCode };

interface MemberIdCardProps {
  profile: UserProfile;
  isAdmin: boolean;
  onToast: (message: string, kind?: 'success' | 'error') => void;
}

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
    const timer = window.setTimeout(() => resolve(null), 5000);
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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'MF';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function splitDisplayName(displayName: string): { surname: string; givenName: string } {
  const clean = displayName.trim().replace(/\s+/g, ' ');
  if (!clean) return { surname: 'MWANACHAMA', givenName: 'MALOSHA' };
  const parts = clean.split(' ');
  if (parts.length === 1) {
    return { surname: 'MWANACHAMA', givenName: parts[0].toUpperCase() };
  }
  const surname = parts[parts.length - 1].toUpperCase();
  const givenName = parts.slice(0, -1).join(' ').toUpperCase();
  return { surname, givenName };
}

function formatDotDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function computeSecurityChecksum(uid: string, memberCode: string, controlSerial: string): string {
  const input = `${uid}:${memberCode}:${controlSerial}:MALOSHA`;
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ch, 0x85ebca6b) >>> 0;
  }
  const p1 = (h1 >>> 0).toString(36).toUpperCase().padStart(4, '0').slice(0, 4);
  const p2 = (h2 >>> 0).toString(36).toUpperCase().padStart(4, '0').slice(0, 4);
  return `VER-${p1}-${p2}`;
}

/**
 * Generates deterministic calligraphic signature coordinates inside a 200x44 box
 * unique to each cardholder's UID & display name.
 */
function buildCardholderSignaturePoints(uid: string, displayName: string): number[] {
  const seedStr = `${uid}:${displayName}`;
  const nums: number[] = [];
  let acc = 2166136261;
  for (let i = 0; i < 12; i++) {
    const ch = seedStr.charCodeAt(i % Math.max(1, seedStr.length));
    acc ^= ch + i * 31;
    acc = Math.imul(acc, 16777619) >>> 0;
    nums.push((acc % 1000) / 1000);
  }
  return nums;
}

function buildCardholderSvgPath(pts: number[]): string {
  const y1 = 10 + Math.round(pts[0] * 10);
  const y2 = 24 + Math.round(pts[1] * 10);
  const y3 = 8 + Math.round(pts[2] * 12);
  const y4 = 22 + Math.round(pts[3] * 12);
  const y5 = 12 + Math.round(pts[4] * 10);
  const xPeak = 44 + Math.round(pts[5] * 26);
  const xMid = 98 + Math.round(pts[6] * 24);
  return `M 10 31 C 22 ${y1}, ${xPeak} ${y2}, 52 16 C 68 ${y3}, ${xMid} ${y4}, 126 ${y5} C 146 14, 166 28, 188 20 M 16 36 Q 94 ${29 + Math.round(pts[7] * 6)}, 176 33`;
}

export const MemberIdCard: React.FC<MemberIdCardProps> = ({
  profile,
  isAdmin,
  onToast,
}) => {
  const { tr } = useLanguage();
  const svgUid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [generating, setGenerating] = useState(false);
  const [syncedRecord, setSyncedRecord] = useState<MemberIdRecord | null>(null);
  const [copiedField, setCopiedField] = useState<'card' | 'serial' | null>(null);

  const fallbackCode = useMemo(() => formatMemberCode(profile.uid), [profile.uid]);
  const fallbackSerial = useMemo(() => computeMemberControlSerial(profile.uid), [profile.uid]);

  useEffect(() => {
    let cancelled = false;
    void syncMemberIdRecord(profile)
      .then((rec) => {
        if (!cancelled) setSyncedRecord(rec);
      })
      .catch((err) => {
        console.error('Failed to sync member ID registry:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [
    profile.uid,
    profile.displayName,
    profile.photoURL,
    profile.role,
    profile.verificationBadge,
    profile.accountStatus,
  ]);

  const memberCode = syncedRecord?.cardNumber || fallbackCode;
  const controlSerial = syncedRecord?.controlSerial || fallbackSerial;
  const securityChecksum = useMemo(
    () => computeSecurityChecksum(profile.uid, memberCode, controlSerial),
    [profile.uid, memberCode, controlSerial]
  );

  const holderSigPoints = useMemo(
    () => buildCardholderSignaturePoints(profile.uid, profile.displayName),
    [profile.uid, profile.displayName]
  );
  const holderSigSvgPath = useMemo(
    () => buildCardholderSvgPath(holderSigPoints),
    [holderSigPoints]
  );

  const isClosed =
    !isAdmin &&
    normalizeAccountStatus(syncedRecord?.accountStatus || profile.accountStatus) === 'suspended';

  const { surname, givenName } = useMemo(
    () => splitDisplayName(profile.displayName),
    [profile.displayName]
  );

  const issueDateObj = useMemo(() => {
    if (syncedRecord?.issuedAt) return syncedRecord.issuedAt.toDate();
    if (profile.createdAt) return profile.createdAt.toDate();
    return new Date();
  }, [syncedRecord?.issuedAt, profile.createdAt]);

  const expiryDateObj = useMemo(() => {
    if (syncedRecord?.expiresAt) return syncedRecord.expiresAt.toDate();
    return new Date(
      issueDateObj.getFullYear() + 10,
      issueDateObj.getMonth(),
      issueDateObj.getDate()
    );
  }, [syncedRecord?.expiresAt, issueDateObj]);

  const issueDateDot = useMemo(() => formatDotDate(issueDateObj), [issueDateObj]);
  const expiryDateDot = useMemo(() => formatDotDate(expiryDateObj), [expiryDateObj]);

  const roleCode = isAdmin
    ? 'MMILIKI'
    : profile.role === 'moderator'
      ? 'MSIMAMIZI'
      : 'MWANACHAMA';

  const statusText = isClosed ? 'IMEFUNGWA' : 'HAI / ACTIVE';

  const handleCopyValue = async (value: string, kind: 'card' | 'serial') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(kind);
      window.setTimeout(() => setCopiedField(null), 1800);
    } catch {
      onToast(value, 'success');
    }
  };

  /**
   * Draws an exact high-resolution 1050x662 National-ID-style Malosha Forums card
   * with layered anti-counterfeit watermarks, holographic seal, dual signatures
   * (Platform Owner + Cardholder), and official issuing declaration.
   */
  const renderCardPngBlob = async (): Promise<Blob> => {
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

    // 1. Base Tanzania Horizon Sky-Turquoise Security Gradient
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#EEF9FD');
    bgGrad.addColorStop(0.42, '#DCF2FA');
    bgGrad.addColorStop(0.75, '#C9EBF6');
    bgGrad.addColorStop(1, '#E7F7F2');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // 1B. Top & Bottom Tanzania Flag National Tricolor Security Ribbon
    const drawTanzaniaRibbon = (ry: number, rh: number) => {
      ctx.save();
      ctx.fillStyle = '#1EB53A';
      ctx.fillRect(0, ry, W * 0.34, rh);
      ctx.fillStyle = '#FCD116';
      ctx.fillRect(W * 0.34, ry, W * 0.05, rh);
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(W * 0.39, ry, W * 0.22, rh);
      ctx.fillStyle = '#FCD116';
      ctx.fillRect(W * 0.61, ry, W * 0.05, rh);
      ctx.fillStyle = '#00A3DD';
      ctx.fillRect(W * 0.66, ry, W * 0.34, rh);
      ctx.restore();
    };
    drawTanzaniaRibbon(0, 8);
    drawTanzaniaRibbon(H - 8, 8);

    // 2. Golden Amber Sunburst Rays & Disc behind Kilimanjaro
    const sunX = 590;
    const sunY = 264;
    ctx.save();
    const sunGlow = ctx.createRadialGradient(sunX, sunY, 18, sunX, sunY, 215);
    sunGlow.addColorStop(0, 'rgba(252, 209, 22, 0.38)');
    sunGlow.addColorStop(0.45, 'rgba(245, 158, 11, 0.16)');
    sunGlow.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = sunGlow;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 215, 0, Math.PI * 2);
    ctx.fill();

    const rayCount = 24;
    for (let i = 0; i < rayCount; i++) {
      const angle = (i / rayCount) * Math.PI * 2;
      const spread = 0.055;
      ctx.beginPath();
      ctx.moveTo(sunX, sunY);
      ctx.lineTo(sunX + Math.cos(angle - spread) * 215, sunY + Math.sin(angle - spread) * 215);
      ctx.lineTo(sunX + Math.cos(angle + spread) * 215, sunY + Math.sin(angle + spread) * 215);
      ctx.closePath();
      ctx.fillStyle = i % 2 === 0 ? 'rgba(234, 179, 8, 0.20)' : 'rgba(253, 224, 71, 0.13)';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(sunX, sunY, 52, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(253, 224, 71, 0.28)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(217, 119, 6, 0.26)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // 3. Dual-Tone Tanzanian Emerald & Cerulean Guilloche Security Mesh
    ctx.save();
    for (let i = 0; i < 24; i++) {
      ctx.beginPath();
      const baseY = 58 + i * 24;
      ctx.strokeStyle =
        i % 5 === 0
          ? 'rgba(30, 181, 58, 0.11)'
          : i % 3 === 0
            ? 'rgba(217, 119, 6, 0.10)'
            : 'rgba(0, 163, 221, 0.15)';
      ctx.lineWidth = 1.2;
      for (let x = 0; x <= W; x += 20) {
        const y =
          baseY +
          Math.sin(x * 0.011 + i * 0.45) * 18 +
          Math.cos(x * 0.025 - i * 0.25) * 8;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();

    // 4. Mount Kilimanjaro (Mlima Kilimanjaro) Snow-Capped Horizon Watermark
    ctx.save();
    // Main mountain slope (Shira -> Kibo Dome -> Mawenzi Spire)
    ctx.fillStyle = 'rgba(14, 74, 102, 0.13)';
    ctx.beginPath();
    ctx.moveTo(210, 534);
    ctx.lineTo(310, 476);
    ctx.lineTo(372, 466);
    ctx.lineTo(432, 434);
    ctx.lineTo(506, 356);
    ctx.lineTo(536, 336);
    ctx.lineTo(582, 336);
    ctx.lineTo(618, 362);
    ctx.lineTo(652, 412);
    ctx.lineTo(676, 396);
    ctx.lineTo(708, 364);
    ctx.lineTo(736, 392);
    ctx.lineTo(776, 444);
    ctx.lineTo(890, 502);
    ctx.lineTo(980, 534);
    ctx.closePath();
    ctx.fill();

    // Kibo & Mawenzi Snow-Cap Glacier Watermark Highlights
    ctx.fillStyle = 'rgba(255, 255, 255, 0.56)';
    ctx.beginPath();
    ctx.moveTo(504, 359);
    ctx.lineTo(536, 336);
    ctx.lineTo(582, 336);
    ctx.lineTo(618, 362);
    ctx.lineTo(604, 376);
    ctx.lineTo(586, 368);
    ctx.lineTo(568, 384);
    ctx.lineTo(552, 370);
    ctx.lineTo(534, 382);
    ctx.lineTo(518, 368);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(694, 378);
    ctx.lineTo(708, 364);
    ctx.lineTo(724, 380);
    ctx.lineTo(712, 385);
    ctx.lineTo(702, 382);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(14, 74, 102, 0.16)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(458, 456);
    ctx.quadraticCurveTo(548, 412, 636, 460);
    ctx.moveTo(350, 494);
    ctx.quadraticCurveTo(540, 448, 760, 492);
    ctx.stroke();
    ctx.restore();

    // 4B. Tanzania Twiga (Giraffe) & Savanna Acacia Watermark Silhouette (Right Security Zone)
    ctx.save();
    // Subtle acacia crown behind Twiga
    ctx.fillStyle = 'rgba(30, 181, 58, 0.10)';
    ctx.beginPath();
    ctx.ellipse(918, 316, 74, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(15, 68, 92, 0.14)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(920, 520);
    ctx.quadraticCurveTo(918, 420, 916, 326);
    ctx.moveTo(917, 366);
    ctx.lineTo(886, 324);
    ctx.moveTo(917, 358);
    ctx.lineTo(948, 324);
    ctx.stroke();

    // Graceful Twiga Silhouette facing Mount Kilimanjaro
    ctx.fillStyle = 'rgba(15, 58, 86, 0.155)';
    ctx.beginPath();
    // Head + horns (ossicones) + long neck + sloped back + hind & front legs
    ctx.moveTo(784, 304); // muzzle tip
    ctx.lineTo(806, 293); // forehead
    ctx.lineTo(809, 281); // ossicone 1
    ctx.lineTo(813, 281);
    ctx.lineTo(814, 291);
    ctx.lineTo(818, 280); // ossicone 2
    ctx.lineTo(822, 281);
    ctx.lineTo(821, 293);
    ctx.lineTo(830, 298); // ear
    ctx.lineTo(823, 305); // nape
    ctx.lineTo(855, 386); // back of neck base
    ctx.lineTo(906, 405); // sloped croup / back
    ctx.lineTo(912, 444); // tail base
    ctx.lineTo(916, 476); // tail tuft
    ctx.lineTo(911, 476);
    ctx.lineTo(908, 446);
    ctx.lineTo(902, 522); // hind leg 1
    ctx.lineTo(895, 522);
    ctx.lineTo(893, 452);
    ctx.lineTo(884, 522); // hind leg 2
    ctx.lineTo(877, 522);
    ctx.lineTo(881, 446);
    ctx.lineTo(852, 442); // belly
    ctx.lineTo(847, 522); // front leg 1
    ctx.lineTo(840, 522);
    ctx.lineTo(841, 442);
    ctx.lineTo(831, 522); // front leg 2
    ctx.lineTo(824, 522);
    ctx.lineTo(832, 412); // chest
    ctx.lineTo(805, 314); // throat
    ctx.lineTo(785, 310); // lower jaw
    ctx.closePath();
    ctx.fill();

    // Faint reticulated spot watermarks across Twiga neck & body
    ctx.fillStyle = 'rgba(252, 209, 22, 0.24)';
    [
      [818, 326, 3.6],
      [826, 344, 4.2],
      [834, 364, 4.4],
      [843, 384, 4.8],
      [856, 404, 5.4],
      [872, 412, 5.6],
      [888, 418, 5.2],
      [862, 424, 5.0],
      [880, 430, 4.6],
    ].forEach(([sx, sy, sr]) => {
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // 5. Bottom Savanna & Lake Horizon Band
    ctx.save();
    const horizonGrad = ctx.createLinearGradient(0, 504, 0, H);
    horizonGrad.addColorStop(0, 'rgba(186, 230, 253, 0.42)');
    horizonGrad.addColorStop(0.5, 'rgba(125, 211, 252, 0.50)');
    horizonGrad.addColorStop(1, 'rgba(209, 250, 229, 0.85)');
    ctx.fillStyle = horizonGrad;
    ctx.beginPath();
    ctx.moveTo(0, 534);
    ctx.lineTo(130, 514);
    ctx.lineTo(240, 530);
    ctx.lineTo(360, 506);
    ctx.lineTo(485, 528);
    ctx.lineTo(620, 508);
    ctx.lineTo(760, 530);
    ctx.lineTo(905, 510);
    ctx.lineTo(W, 526);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(14, 116, 174, 0.20)';
    ctx.lineWidth = 1.4;
    for (let r = 0; r < 6; r++) {
      ctx.beginPath();
      const offset = r * 14;
      for (let x = 0; x <= W; x += 26) {
        const y = 550 + offset + Math.sin(x * 0.02 + r) * 7;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();

    // 6A. Multi-Layer Security Watermark 1: Official Micro-Text (-18 deg)
    ctx.save();
    ctx.fillStyle = 'rgba(14, 38, 64, 0.048)';
    ctx.font = '800 15px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.rotate((-18 * Math.PI) / 180);
    for (let y = -180; y < H + 360; y += 78) {
      for (let x = -280; x < W + 280; x += 285) {
        ctx.fillText('TANZANIA · MALOSHA FORUMS ID', x, y);
      }
    }
    ctx.restore();

    // 6B. Multi-Layer Security Watermark 2: Holder-Bound Dynamic Watermark (+14 deg)
    ctx.save();
    ctx.fillStyle = 'rgba(29, 78, 137, 0.042)';
    ctx.font = '700 12px "JetBrains Mono", monospace';
    ctx.rotate((14 * Math.PI) / 180);
    for (let y = -220; y < H + 320; y += 92) {
      for (let x = -140; x < W + 340; x += 310) {
        ctx.fillText(`${memberCode} · ${controlSerial} · ${securityChecksum}`, x, y);
      }
    }
    ctx.restore();

    // 6C. Central Faint Crest Watermark Seal (Behind Text Fields)
    ctx.save();
    ctx.translate(560, 315);
    ctx.strokeStyle = 'rgba(14, 116, 174, 0.08)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, 126, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 106, 0, Math.PI * 2);
    ctx.stroke();
    for (let s = 0; s < 16; s++) {
      const ang = (s * Math.PI) / 8;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * 90, Math.sin(ang) * 90);
      ctx.lineTo(Math.cos(ang) * 126, Math.sin(ang) * 126);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(14, 38, 64, 0.055)';
    ctx.font = '900 22px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TANZANIA · MALOSHA', 0, -8);
    ctx.font = '700 13px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('KILIMANJARO & TWIGA EDITION', 0, 14);
    ctx.restore();

    // 7. Top-Left Official Tanzania Flag Mini-Badge + Crest + Issuing Organization Identity
    ctx.save();
    ctx.translate(62, 60);
    ctx.fillStyle = '#0F2942';
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1EB53A';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = '#FCD116';
    drawRoundedRect(ctx, -11, -10, 22, 16, 5);
    ctx.fill();
    ctx.fillStyle = '#0F2942';
    [-5, 0, 5].forEach((dx) => {
      ctx.beginPath();
      ctx.arc(dx, -2, 2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // Compact Tanzania Flag Graphic beside title
    ctx.save();
    drawRoundedRect(ctx, 102, 34, 28, 18, 3);
    ctx.clip();
    ctx.fillStyle = '#1EB53A';
    ctx.fillRect(102, 34, 28, 18);
    ctx.fillStyle = '#00A3DD';
    ctx.beginPath();
    ctx.moveTo(130, 34);
    ctx.lineTo(130, 52);
    ctx.lineTo(102, 52);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#FCD116';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(100, 54);
    ctx.lineTo(132, 32);
    ctx.stroke();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(100, 54);
    ctx.lineTo(132, 32);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#0F172A';
    ctx.font = '800 15.5px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('MALOSHA FORUMS · TANZANIA', 138, 49);
    ctx.font = '700 11px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillStyle = '#1E293B';
    ctx.fillText('JAMHURI YA MUUNGANO WA TANZANIA', 102, 68);
    ctx.fillText('USAJILI RASMI WA WANACHAMA', 102, 84);

    // 8. Top-Right Metallic-Blue Outlined Title + Explicit Issuing Statement
    const titleX = 412;
    const titleY = 66;
    const headerTitle = 'KITAMBULISHO CHA MWANACHAMA';
    ctx.font = '800 30px "Plus Jakarta Sans", system-ui, sans-serif';
    const titleGrad = ctx.createLinearGradient(titleX, 36, titleX + 590, 72);
    titleGrad.addColorStop(0, '#0F4C81');
    titleGrad.addColorStop(0.5, '#00A3DD');
    titleGrad.addColorStop(1, '#1EB53A');
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0F2942';
    ctx.strokeText(headerTitle, titleX, titleY);
    ctx.fillStyle = titleGrad;
    ctx.fillText(headerTitle, titleX, titleY);

    ctx.fillStyle = '#0F2942';
    ctx.font = '800 11px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(
      'KITAMBULISHO HIKI KIMETOLEWA NA MALOSHA FORUMS · ISSUED IN TANZANIA',
      titleX + 2,
      88
    );

    // 9. Left Ornate Guilloche Rosette Frame + Member Portrait
    const photoCx = 186;
    const photoCy = 324;
    const photoW = 240;
    const photoH = 302;
    const photoX = photoCx - photoW / 2;
    const photoY = photoCy - photoH / 2;

    ctx.save();
    for (let ring = 0; ring < 3; ring++) {
      ctx.beginPath();
      const rx = 142 + ring * 13;
      const ry = 176 + ring * 13;
      for (let deg = 0; deg <= 360; deg += 3) {
        const rad = (deg * Math.PI) / 180;
        const lobe = Math.sin(rad * 12) * 8;
        const px = photoCx + Math.cos(rad) * (rx + lobe);
        const py = photoCy + Math.sin(rad) * (ry + lobe);
        if (deg === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = ring === 2 ? 'rgba(56, 189, 248, 0.24)' : 'rgba(14, 165, 233, 0.16)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(2, 132, 199, 0.42)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.restore();

    const loadedImg = await loadCorsImage(profile.photoURL);

    ctx.save();
    drawRoundedRect(ctx, photoX, photoY, photoW, photoH, 36);
    ctx.clip();
    ctx.fillStyle = '#E2F1FA';
    ctx.fillRect(photoX, photoY, photoW, photoH);
    if (loadedImg) {
      const scale = Math.max(photoW / loadedImg.width, photoH / loadedImg.height);
      const dw = loadedImg.width * scale;
      const dh = loadedImg.height * scale;
      ctx.drawImage(loadedImg, photoX + (photoW - dw) / 2, photoY + (photoH - dh) / 2, dw, dh);
    } else {
      ctx.fillStyle = '#0E2640';
      ctx.fillRect(photoX, photoY, photoW, photoH);
      ctx.fillStyle = '#F59E0B';
      ctx.font = '700 80px Georgia, serif';
      const initials = getInitials(profile.displayName);
      const m = ctx.measureText(initials);
      ctx.fillText(initials, photoCx - m.width / 2, photoCy + 26);
    }

    // Anti-tamper micro-watermark ribbon across bottom edge of portrait
    ctx.fillStyle = 'rgba(14, 38, 64, 0.58)';
    ctx.fillRect(photoX, photoY + photoH - 24, photoW, 24);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.font = '700 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`MALOSHA · ${memberCode}`, photoCx, photoY + photoH - 8);
    ctx.restore();

    // Rosette inner border + intersecting anti-tamper security seal on corner of photo
    ctx.strokeStyle = 'rgba(14, 116, 174, 0.45)';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, photoX, photoY, photoW, photoH, 36);
    ctx.stroke();

    ctx.save();
    ctx.translate(photoX + photoW - 8, photoY + photoH - 12);
    ctx.strokeStyle = 'rgba(29, 78, 137, 0.55)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(14, 38, 64, 0.72)';
    ctx.font = '800 7px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MALOSHA', 0, -4);
    ctx.fillText('FORUMS', 0, 6);
    ctx.restore();

    // 10. Iridescent Holographic Security Foil Emblem (Center-Right)
    ctx.save();
    const holoX = 768;
    const holoY = 398;
    const holoGrad = ctx.createLinearGradient(holoX - 40, holoY - 40, holoX + 40, holoY + 40);
    holoGrad.addColorStop(0, 'rgba(56, 189, 248, 0.42)');
    holoGrad.addColorStop(0.35, 'rgba(250, 204, 21, 0.34)');
    holoGrad.addColorStop(0.7, 'rgba(167, 139, 250, 0.30)');
    holoGrad.addColorStop(1, 'rgba(14, 165, 233, 0.42)');
    ctx.fillStyle = holoGrad;
    ctx.beginPath();
    ctx.arc(holoX, holoY, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(29, 78, 137, 0.45)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(holoX, holoY, 31, 0, Math.PI * 2);
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(15, 41, 66, 0.75)';
    ctx.font = '900 12px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MLF', holoX, holoY - 2);
    ctx.font = '700 7.5px "JetBrains Mono", monospace';
    ctx.fillText(controlSerial, holoX, holoY + 11);
    ctx.font = '700 6.5px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('HOLOGRAM', holoX, holoY + 22);
    ctx.restore();

    // 11. Top-Right Official Malosha Tanzania Circular Seal Crest (Single Portrait Photo Only)
    ctx.save();
    const sealX = 944;
    const sealY = 172;
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sealX, sealY, 44, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(sealX, sealY, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#0F172A';
    ctx.font = '800 8px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MALOSHA FORUMS', sealX, sealY - 21);
    ctx.fillText('TANZANIA SEAL', sealX, sealY + 27);
    ctx.font = '800 12px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('VERIFIED', sealX, sealY + 4);
    ctx.font = '700 8px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('KITAMBULISHO RASMI', sealX, sealY + 58);
    ctx.fillText('CHA TANZANIA', sealX, sealY + 69);
    ctx.restore();

    // 12. Center Member Structured Data Fields
    const fieldX = 368;

    const drawFieldLabel = (text: string, x: number, y: number) => {
      ctx.fillStyle = '#1D4E89';
      ctx.font = '700 14px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(text, x, y);
    };

    drawFieldLabel('Jina la Ukoo / Surname', fieldX, 138);
    ctx.fillStyle = '#0F172A';
    ctx.font = '700 27px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(surname.slice(0, 22), fieldX, 168);

    drawFieldLabel('Jina / Name', fieldX, 210);
    ctx.fillStyle = '#0F172A';
    ctx.font = '700 26px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(givenName.slice(0, 24), fieldX, 240);

    drawFieldLabel('Wadhifa / Role', fieldX, 286);
    ctx.fillStyle = '#0F172A';
    ctx.font = '700 19px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(roleCode, fieldX, 312);

    drawFieldLabel('Hadhi / Status', fieldX + 148, 286);
    ctx.fillStyle = isClosed ? '#B91C1C' : '#0F172A';
    ctx.font = '700 19px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(statusText, fieldX + 148, 312);

    drawFieldLabel('Amejiunga / Joined', fieldX + 332, 286);
    ctx.fillStyle = '#0F172A';
    ctx.font = '700 20px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(issueDateDot, fieldX + 332, 312);

    drawFieldLabel('Namba ya Kitambulisho / Document No.', fieldX, 356);
    ctx.fillStyle = '#0F172A';
    ctx.font = '800 35px "JetBrains Mono", monospace';
    ctx.fillText(memberCode, fieldX, 394);

    drawFieldLabel('Imetolewa / Date of issue', fieldX, 434);
    ctx.fillStyle = '#0F172A';
    ctx.font = '700 22px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(issueDateDot, fieldX, 462);

    drawFieldLabel('Mwisho / Date of expiry', fieldX + 226, 434);
    ctx.fillStyle = '#0F172A';
    ctx.font = '700 22px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(expiryDateDot, fieldX + 226, 462);

    // 13. Dual Official Signatures Row (Cardholder Signature + Platform Owner Signature)
    // A. Cardholder Signature (Left-Center)
    ctx.save();
    ctx.translate(368, 502);
    ctx.strokeStyle = '#0F2942';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const p = holderSigPoints;
    const y1 = 10 + Math.round(p[0] * 10);
    const y2 = 24 + Math.round(p[1] * 10);
    const y3 = 8 + Math.round(p[2] * 12);
    const y4 = 22 + Math.round(p[3] * 12);
    const y5 = 12 + Math.round(p[4] * 10);
    const xPeak = 44 + Math.round(p[5] * 26);
    const xMid = 98 + Math.round(p[6] * 24);
    ctx.beginPath();
    ctx.moveTo(10, 31);
    ctx.bezierCurveTo(22, y1, xPeak, y2, 52, 16);
    ctx.bezierCurveTo(68, y3, xMid, y4, 126, y5);
    ctx.bezierCurveTo(146, 14, 166, 28, 188, 20);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(16, 36);
    ctx.quadraticCurveTo(94, 29 + Math.round(p[7] * 6), 176, 33);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(30, 41, 59, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 44);
    ctx.lineTo(212, 44);
    ctx.stroke();

    ctx.fillStyle = '#1D4E89';
    ctx.font = '700 10px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('SAINI YA MWENYE KITAMBULISHO / HOLDER', 0, 58);
    ctx.restore();

    // B. System / Platform Owner Signature + Inked Seal (Center-Right)
    ctx.save();
    ctx.translate(608, 502);
    // Faint circular owner stamp behind signature
    ctx.strokeStyle = 'rgba(29, 78, 137, 0.28)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(176, 22, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(29, 78, 137, 0.34)';
    ctx.font = '800 6.5px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MALOSHA', 176, 19);
    ctx.fillText('MMILIKI', 176, 28);

    // Authoritative Owner Calligraphic Signature
    ctx.textAlign = 'left';
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(8, 34);
    ctx.bezierCurveTo(28, 4, 62, 6, 46, 32);
    ctx.bezierCurveTo(72, 22, 118, 10, 152, 24);
    ctx.bezierCurveTo(170, 32, 102, 38, 22, 39);
    ctx.bezierCurveTo(88, 30, 158, 26, 206, 34);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(30, 41, 59, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 44);
    ctx.lineTo(222, 44);
    ctx.stroke();

    ctx.fillStyle = '#1D4E89';
    ctx.font = '700 10px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('SAINI YA MMILIKI WA MFUMO / OWNER', 0, 58);
    ctx.restore();

    // 14. Bottom-Left Blue Emblem Chip & Official Issuing Footer Bar
    ctx.save();
    ctx.fillStyle = '#0284C7';
    drawRoundedRect(ctx, 56, 580, 62, 34, 5);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(64, 597);
    ctx.lineTo(110, 597);
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(87, 597, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0284C7';
    ctx.beginPath();
    ctx.arc(87, 597, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Tactile / Braille Security Dot Array
    ctx.save();
    const dotBaseX = 140;
    const dotBaseY = 582;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 6; c++) {
        const active = (r + c) % 2 === 0 || (c === 4 && r < 2);
        ctx.fillStyle = active ? 'rgba(15, 41, 66, 0.28)' : 'rgba(148, 163, 184, 0.16)';
        ctx.beginPath();
        ctx.arc(dotBaseX + c * 18, dotBaseY + r * 14, 3.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // Bottom Issuing Authority Micro-Bar + Security Hash
    ctx.save();
    ctx.fillStyle = 'rgba(14, 38, 64, 0.88)';
    drawRoundedRect(ctx, 270, 594, 580, 34, 6);
    ctx.fill();
    ctx.fillStyle = '#F8FAFC';
    ctx.font = '800 10.5px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      `KIMETOLEWA NA MALOSHA FORUMS · OFFICIAL MEMBER PASS · ${securityChecksum}`,
      560,
      615
    );
    ctx.restore();

    // 15. Vertical Right-Edge Security Serial Number
    ctx.save();
    ctx.translate(1004, 342);
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = '#0F172A';
    ctx.font = '700 22px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(controlSerial, 0, 0);
    ctx.restore();

    // Double Security Border Frame
    ctx.strokeStyle = 'rgba(29, 78, 137, 0.35)';
    ctx.lineWidth = 3;
    drawRoundedRect(ctx, 1.5, 1.5, W - 3, H - 3, 30);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(14, 165, 233, 0.32)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    drawRoundedRect(ctx, 9, 9, W - 18, H - 18, 24);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to encode ID card PNG'));
        },
        'image/png',
        1.0
      );
    });
  };

  const handleDownloadCard = async () => {
    setGenerating(true);
    try {
      const blob = await renderCardPngBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kitambulisho-malosha-${memberCode.toLowerCase()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 3000);
      onToast(
        tr(
          'Kitambulisho chako kimehifadhiwa kwenye simu yako kama kilivyo!',
          'Your official ID card has been saved directly to your phone!'
        )
      );
    } catch (err) {
      onToast(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kutengeneza kitambulisho.', 'Failed to generate ID card.'),
        'error'
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleShareCard = async () => {
    setGenerating(true);
    try {
      const blob = await renderCardPngBlob();
      const file = new File([blob], `kitambulisho-malosha-${memberCode.toLowerCase()}.png`, {
        type: 'image/png',
      });
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          title: `Kitambulisho cha Malosha Forums - ${profile.displayName}`,
          text: `${profile.displayName} · ID: ${memberCode} · Serial: ${controlSerial}`,
          files: [file],
        });
        return;
      }
      await handleDownloadCard();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      onToast(
        tr('Imeshindwa kushiriki kitambulisho.', 'Could not share ID card.'),
        'error'
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 sm:p-5">
      <div className="flex items-start gap-2.5">
        <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-[#1EB53A]" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="font-display text-base font-bold text-slate-900 sm:text-lg">
            {tr('Kitambulisho Chako Rasmi cha Mwanachama · Tanzania', 'Your Official Tanzania Member Identity Card')}
          </h3>
          <p className="text-xs leading-relaxed text-slate-600">
            {tr(
              'Kimeundwa kwa utambulisho wa Tanzania kikiwa na watermark ya Mlima Kilimanjaro na Twiga, picha moja pekee ya mwanachama, hologram na saini rasmi.',
              'Styled with Tanzania national identity featuring Mount Kilimanjaro and Twiga watermarks, a single member portrait, hologram seal, and official signatures.'
            )}
          </p>
        </div>
      </div>

      {/* Live National-ID Specimen Card Container */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-emerald-400/60 bg-gradient-to-br from-[#EEF9FD] via-[#DCF2FA] to-[#E7F7F2] shadow-lg">
        <div className="relative aspect-[1050/662] w-full select-none overflow-hidden text-slate-900">
          {/* SVG Background & Tanzania Security Watermark Layers */}
          <svg
            viewBox="0 0 1050 662"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            <defs>
              <radialGradient id={`sun-${svgUid}`} cx="56%" cy="40%" r="28%">
                <stop offset="0%" stopColor="#FCD116" stopOpacity="0.42" />
                <stop offset="45%" stopColor="#F59E0B" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
              </radialGradient>
              <linearGradient id={`ice-${svgUid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#BAE6FD" stopOpacity="0.42" />
                <stop offset="55%" stopColor="#7DD3FC" stopOpacity="0.52" />
                <stop offset="100%" stopColor="#D1FAE5" stopOpacity="0.86" />
              </linearGradient>
              <linearGradient id={`holo-${svgUid}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.42" />
                <stop offset="35%" stopColor="#FACC15" stopOpacity="0.34" />
                <stop offset="70%" stopColor="#1EB53A" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#0EA5E9" stopOpacity="0.42" />
              </linearGradient>
              <pattern
                id={`wm1-${svgUid}`}
                width="285"
                height="78"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(-18)"
              >
                <text
                  x="8"
                  y="44"
                  fill="#0E2640"
                  fillOpacity="0.05"
                  fontSize="14"
                  fontWeight="800"
                  fontFamily="sans-serif"
                >
                  TANZANIA · MALOSHA FORUMS ID
                </text>
              </pattern>
              <pattern
                id={`wm2-${svgUid}`}
                width="310"
                height="92"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(14)"
              >
                <text
                  x="10"
                  y="54"
                  fill="#1D4E89"
                  fillOpacity="0.045"
                  fontSize="11.5"
                  fontWeight="700"
                  fontFamily="monospace"
                >
                  {memberCode} · {controlSerial} · {securityChecksum}
                </text>
              </pattern>
            </defs>

            {/* Top & Bottom Tanzania National Flag Tricolor Security Ribbons */}
            <g>
              <rect x="0" y="0" width="357" height="8" fill="#1EB53A" />
              <rect x="357" y="0" width="52.5" height="8" fill="#FCD116" />
              <rect x="409.5" y="0" width="231" height="8" fill="#0F172A" />
              <rect x="640.5" y="0" width="52.5" height="8" fill="#FCD116" />
              <rect x="693" y="0" width="357" height="8" fill="#00A3DD" />

              <rect x="0" y="654" width="357" height="8" fill="#1EB53A" />
              <rect x="357" y="654" width="52.5" height="8" fill="#FCD116" />
              <rect x="409.5" y="654" width="231" height="8" fill="#0F172A" />
              <rect x="640.5" y="654" width="52.5" height="8" fill="#FCD116" />
              <rect x="693" y="654" width="357" height="8" fill="#00A3DD" />
            </g>

            {/* Sunburst Aura Behind Kilimanjaro */}
            <circle cx="590" cy="264" r="215" fill={`url(#sun-${svgUid})`} />
            <g transform="translate(590 264)" opacity="0.22">
              {Array.from({ length: 24 }).map((_, i) => (
                <polygon
                  key={i}
                  points="0,0 -10,-210 10,-210"
                  fill={i % 2 === 0 ? '#EAB308' : '#FDE047'}
                  transform={`rotate(${i * 15})`}
                />
              ))}
              <circle r="52" fill="#FDE047" fillOpacity="0.5" stroke="#D97706" strokeWidth="2" />
            </g>

            {/* Dual-Tone Tanzania Emerald & Cerulean Guilloche Curves */}
            {Array.from({ length: 20 }).map((_, i) => {
              const y0 = 56 + i * 28;
              return (
                <path
                  key={i}
                  d={`M 0 ${y0} Q 260 ${y0 - 24} 525 ${y0} T 1050 ${y0}`}
                  fill="none"
                  stroke={i % 5 === 0 ? '#1EB53A' : i % 3 === 0 ? '#D97706' : '#00A3DD'}
                  strokeOpacity={i % 5 === 0 ? '0.11' : '0.15'}
                  strokeWidth="1.25"
                />
              );
            })}

            {/* Mount Kilimanjaro (Mlima Kilimanjaro) Snow-Capped Silhouette Watermark */}
            <g>
              <path
                d="M 210 534 L 310 476 L 372 466 L 432 434 L 506 356 L 536 336 L 582 336 L 618 362 L 652 412 L 676 396 L 708 364 L 736 392 L 776 444 L 890 502 L 980 534 Z"
                fill="#0E4A66"
                fillOpacity="0.135"
              />
              <path
                d="M 504 359 L 536 336 L 582 336 L 618 362 L 604 376 L 586 368 L 568 384 L 552 370 L 534 382 L 518 368 Z"
                fill="#FFFFFF"
                fillOpacity="0.58"
              />
              <path
                d="M 694 378 L 708 364 L 724 380 L 712 385 L 702 382 Z"
                fill="#FFFFFF"
                fillOpacity="0.54"
              />
              <path
                d="M 458 456 Q 548 412 636 460 M 350 494 Q 540 448 760 492"
                fill="none"
                stroke="#0E4A66"
                strokeOpacity="0.16"
                strokeWidth="1.4"
              />
            </g>

            {/* Tanzania Twiga (Giraffe) & Acacia Silhouette Watermark */}
            <g>
              <ellipse cx="918" cy="316" rx="74" ry="16" fill="#1EB53A" fillOpacity="0.11" />
              <path
                d="M 920 520 Q 918 420 916 326 M 917 366 L 886 324 M 917 358 L 948 324"
                fill="none"
                stroke="#0F445C"
                strokeOpacity="0.14"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <path
                d="M 784 304 L 806 293 L 809 281 L 813 281 L 814 291 L 818 280 L 822 281 L 821 293 L 830 298 L 823 305 L 855 386 L 906 405 L 912 444 L 916 476 L 911 476 L 908 446 L 902 522 L 895 522 L 893 452 L 884 522 L 877 522 L 881 446 L 852 442 L 847 522 L 840 522 L 841 442 L 831 522 L 824 522 L 832 412 L 805 314 L 785 310 Z"
                fill="#0F3A56"
                fillOpacity="0.16"
              />
              {[
                [818, 326, 3.6],
                [826, 344, 4.2],
                [834, 364, 4.4],
                [843, 384, 4.8],
                [856, 404, 5.4],
                [872, 412, 5.6],
                [888, 418, 5.2],
                [862, 424, 5.0],
                [880, 430, 4.6],
              ].map(([cx, cy, r], sIdx) => (
                <circle
                  key={sIdx}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="#FCD116"
                  fillOpacity="0.24"
                />
              ))}
            </g>

            {/* Bottom Savanna & Lake Horizon */}
            <path
              d="M 0 534 L 130 514 L 240 530 L 360 506 L 485 528 L 620 508 L 760 530 L 905 510 L 1050 526 L 1050 662 L 0 662 Z"
              fill={`url(#ice-${svgUid})`}
            />

            {/* Multi-Layer Diagonal Micro Watermarks */}
            <rect width="1050" height="662" fill={`url(#wm1-${svgUid})`} />
            <rect width="1050" height="662" fill={`url(#wm2-${svgUid})`} />

            {/* Central Crest Watermark Seal */}
            <g transform="translate(560 315)" opacity="0.13">
              <circle r="126" fill="none" stroke="#0E74AE" strokeWidth="2.5" />
              <circle r="106" fill="none" stroke="#0E74AE" strokeWidth="2" />
              {Array.from({ length: 16 }).map((_, idx) => (
                <line
                  key={idx}
                  x1="0"
                  y1="-90"
                  x2="0"
                  y2="-126"
                  stroke="#0E74AE"
                  strokeWidth="2"
                  transform={`rotate(${idx * 22.5})`}
                />
              ))}
              <text
                x="0"
                y="-6"
                textAnchor="middle"
                fill="#0E2640"
                fontSize="20"
                fontWeight="900"
                fontFamily="sans-serif"
              >
                TANZANIA · MALOSHA
              </text>
              <text
                x="0"
                y="14"
                textAnchor="middle"
                fill="#0E2640"
                fontSize="12"
                fontWeight="700"
                fontFamily="sans-serif"
              >
                KILIMANJARO &amp; TWIGA EDITION
              </text>
            </g>

            {/* Iridescent Holographic Foil Seal */}
            <g transform="translate(768 398)">
              <circle
                r="40"
                fill={`url(#holo-${svgUid})`}
                stroke="#1D4E89"
                strokeOpacity="0.45"
                strokeWidth="1.6"
              />
              <circle
                r="31"
                fill="none"
                stroke="#1D4E89"
                strokeOpacity="0.45"
                strokeWidth="1.2"
                strokeDasharray="3 3"
              />
              <text
                x="0"
                y="-2"
                textAnchor="middle"
                fill="#0F2942"
                fillOpacity="0.78"
                fontSize="12"
                fontWeight="900"
                fontFamily="sans-serif"
              >
                MLF
              </text>
              <text
                x="0"
                y="11"
                textAnchor="middle"
                fill="#0F2942"
                fillOpacity="0.75"
                fontSize="7.5"
                fontWeight="700"
                fontFamily="monospace"
              >
                {controlSerial}
              </text>
              <text
                x="0"
                y="22"
                textAnchor="middle"
                fill="#0F2942"
                fillOpacity="0.7"
                fontSize="6.5"
                fontWeight="700"
                fontFamily="sans-serif"
              >
                HOLOGRAM
              </text>
            </g>

            {/* Dashed Security Inner Perimeter */}
            <rect
              x="9"
              y="9"
              width="1032"
              height="644"
              rx="24"
              fill="none"
              stroke="#0EA5E9"
              strokeOpacity="0.34"
              strokeWidth="1.2"
              strokeDasharray="6 4"
            />
          </svg>

          {/* Foreground Structured Card Layout */}
          <div className="relative z-10 flex h-full flex-col justify-between p-[2.8%] sm:p-[3.2%]">
            {/* Top Bar: Crest + Tanzania Flag + Organization Lines (Left) & Header + Issued By (Right) */}
            <div className="flex items-start justify-between gap-[2%]">
              <div className="flex min-w-0 items-center gap-[6px] sm:gap-2.5">
                <div className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full border border-[#1EB53A] bg-[#0F2942] text-[#FCD116] shadow-xs sm:h-10 sm:w-10 sm:border-2">
                  <ShieldCheck className="h-3 w-3 sm:h-5 sm:w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 leading-[1.12]">
                  <div className="flex items-center gap-1 sm:gap-1.5">
                    <svg
                      viewBox="0 0 28 18"
                      className="h-[9px] w-[14px] shrink-0 rounded-[1.5px] shadow-2xs sm:h-[13px] sm:w-[20px]"
                      aria-hidden="true"
                    >
                      <rect width="28" height="18" fill="#1EB53A" />
                      <polygon points="28,0 28,18 0,18" fill="#00A3DD" />
                      <line x1="-2" y1="20" x2="30" y2="-2" stroke="#FCD116" strokeWidth="5" />
                      <line x1="-2" y1="20" x2="30" y2="-2" stroke="#000000" strokeWidth="3" />
                    </svg>
                    <p className="truncate text-[6px] font-extrabold tracking-wide text-slate-900 uppercase sm:text-[10.5px]">
                      MALOSHA FORUMS · TANZANIA
                    </p>
                  </div>
                  <p className="truncate text-[4.8px] font-bold text-slate-700 uppercase sm:text-[7.8px]">
                    JAMHURI YA MUUNGANO WA TANZANIA
                  </p>
                  <p className="truncate text-[4.8px] font-bold text-slate-700 uppercase sm:text-[7.8px]">
                    USAJILI RASMI WA WANACHAMA
                  </p>
                </div>
              </div>

              <div className="min-w-0 flex-1 text-right">
                <p
                  className="truncate font-display text-[9px] font-black tracking-wide text-[#0077B6] uppercase sm:text-[16.5px] md:text-[18.5px]"
                  style={{
                    WebkitTextStroke: '0.5px #0F2942',
                    textShadow: '0 1px 0 rgba(255,255,255,0.75)',
                  }}
                >
                  KITAMBULISHO CHA MWANACHAMA
                </p>
                <p className="truncate text-[4.6px] font-extrabold tracking-wide text-[#0F2942] uppercase sm:text-[7.3px]">
                  KITAMBULISHO HIKI KIMETOLEWA NA MALOSHA FORUMS · ISSUED IN TANZANIA
                </p>
              </div>
            </div>

            {/* Middle Body: 3 Columns (Rosette Photo | Structured Member Details | Seal & Ghosts & Vertical Serial) */}
            <div className="my-auto grid flex-1 grid-cols-[26%_1fr_16%] items-center gap-[2.6%] pt-[1%]">
              {/* Left Column: Ornate Rosette Photo Frame with Anti-Tamper Overprint */}
              <div className="relative flex flex-col items-center justify-center">
                <div className="relative w-full aspect-[240/302] rounded-[18%] border-2 border-sky-500/50 bg-sky-200/40 p-[5%] shadow-inner ring-2 ring-cyan-400/35 sm:ring-4">
                  <div className="relative h-full w-full overflow-hidden rounded-[15%] border border-sky-600/40 bg-[#0E2640]">
                    {profile.photoURL ? (
                      <img
                        src={profile.photoURL}
                        alt={profile.displayName}
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center font-display text-lg font-bold text-amber-400 sm:text-3xl">
                        {getInitials(profile.displayName)}
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-[#0E2640]/65 py-[2px] text-center font-mono text-[4.5px] font-bold tracking-wider text-white/95 sm:py-0.5 sm:text-[7.5px]">
                      MALOSHA · {memberCode}
                    </div>
                  </div>

                  {/* Overlapping Anti-Tamper Corner Seal */}
                  <div className="pointer-events-none absolute -right-1 -bottom-1 flex h-[22px] w-[22px] flex-col items-center justify-center rounded-full border border-[#1D4E89]/60 bg-white/45 text-center backdrop-blur-[1px] sm:h-9 sm:w-9 sm:border-2">
                    <span className="text-[3.5px] font-black leading-none text-[#0F2942] sm:text-[5.5px]">
                      MALOSHA
                    </span>
                    <span className="text-[3.2px] font-extrabold leading-none text-[#1D4E89] sm:text-[5px]">
                      FORUMS
                    </span>
                  </div>
                </div>
              </div>

              {/* Center Column: Bilingual Structured Fields */}
              <div className="min-w-0 space-y-[1.8%] sm:space-y-1">
                <div className="leading-tight">
                  <p className="text-[6px] font-bold text-[#1D4E89] sm:text-[9.5px]">
                    Jina la Ukoo / Surname
                  </p>
                  <p className="truncate text-[9px] font-extrabold tracking-tight text-slate-900 uppercase sm:text-[15px]">
                    {surname}
                  </p>
                </div>

                <div className="leading-tight">
                  <p className="text-[6px] font-bold text-[#1D4E89] sm:text-[9.5px]">
                    Jina / Name
                  </p>
                  <p className="truncate text-[8.5px] font-extrabold tracking-tight text-slate-900 uppercase sm:text-[14px]">
                    {givenName}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-1 leading-tight">
                  <div className="min-w-0">
                    <p className="truncate text-[5.5px] font-bold text-[#1D4E89] sm:text-[8.5px]">
                      Wadhifa / Role
                    </p>
                    <p className="truncate text-[7px] font-bold text-slate-900 sm:text-[11px]">
                      {roleCode}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[5.5px] font-bold text-[#1D4E89] sm:text-[8.5px]">
                      Hadhi / Status
                    </p>
                    <p
                      className={`truncate text-[7px] font-bold sm:text-[11px] ${
                        isClosed ? 'text-red-700' : 'text-slate-900'
                      }`}
                    >
                      {statusText}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[5.5px] font-bold text-[#1D4E89] sm:text-[8.5px]">
                      Amejiunga / Joined
                    </p>
                    <p className="truncate text-[7px] font-bold text-slate-900 tabular-nums sm:text-[11px]">
                      {issueDateDot}
                    </p>
                  </div>
                </div>

                <div className="leading-none pt-[0.4%]">
                  <p className="text-[6px] font-bold text-[#1D4E89] sm:text-[9.5px]">
                    Namba ya Kitambulisho / Document No.
                  </p>
                  <p className="truncate font-mono text-[11px] font-black tracking-tight text-slate-950 tabular-nums sm:text-[20px]">
                    {memberCode}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-1 leading-tight">
                  <div className="min-w-0">
                    <p className="truncate text-[5.5px] font-bold text-[#1D4E89] sm:text-[9px]">
                      Imetolewa / Date of issue
                    </p>
                    <p className="text-[7.5px] font-bold text-slate-900 tabular-nums sm:text-[12px]">
                      {issueDateDot}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[5.5px] font-bold text-[#1D4E89] sm:text-[9px]">
                      Mwisho / Date of expiry
                    </p>
                    <p className="text-[7.5px] font-bold text-slate-900 tabular-nums sm:text-[12px]">
                      {expiryDateDot}
                    </p>
                  </div>
                </div>
              </div>

              {/* Right Security Column: Seal Crest & Vertical Serial (No Duplicate Small Photos) */}
              <div className="relative flex h-full flex-col items-end justify-between py-[1%]">
                <div className="flex w-full items-center justify-end">
                  <div className="flex h-[28px] w-[28px] shrink-0 flex-col items-center justify-center rounded-full border border-slate-800 bg-white/35 text-center sm:h-[52px] sm:w-[52px] sm:border-2">
                    <span className="text-[3.2px] font-black leading-none text-slate-900 sm:text-[5px]">
                      MALOSHA
                    </span>
                    <span className="text-[4.2px] font-black leading-tight text-slate-900 sm:text-[7px]">
                      VERIFIED
                    </span>
                    <span className="text-[3px] font-bold leading-none text-slate-800 sm:text-[4.8px]">
                      TANZANIA
                    </span>
                  </div>
                </div>

                {/* Vertical Right-Edge Security Serial */}
                <div className="my-auto pr-[2px] sm:pr-1">
                  <span
                    className="block font-mono text-[7.5px] font-bold tracking-wider text-slate-950 tabular-nums sm:text-[12.5px]"
                    style={{ writingMode: 'vertical-rl' }}
                  >
                    {controlSerial}
                  </span>
                </div>

                <div className="h-[14px] sm:h-[22px]" aria-hidden="true" />
              </div>
            </div>

            {/* Dual Signatures Row (Cardholder Signature + Platform Owner Signature) */}
            <div className="grid grid-cols-[22%_38%_40%] items-end gap-[2%] pt-[0.5%]">
              {/* Bottom-left Security Chip + Tactile Dot Array */}
              <div className="flex items-center gap-1.5 sm:gap-2.5">
                <div className="flex h-[13px] w-[24px] shrink-0 items-center justify-center rounded-[3px] bg-[#0284C7] shadow-xs sm:h-[20px] sm:w-[36px]">
                  <span className="h-[6px] w-[6px] rounded-full border border-white bg-white/90 sm:h-2 sm:w-2" />
                </div>
                <div className="grid grid-cols-6 gap-[2px] sm:gap-1" aria-hidden="true">
                  {Array.from({ length: 18 }).map((_, i) => (
                    <span
                      key={i}
                      className={`h-[2.5px] w-[2.5px] rounded-full sm:h-1 sm:w-1 ${
                        i % 2 === 0 ? 'bg-slate-800/30' : 'bg-slate-400/25'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Cardholder Signature */}
              <div className="min-w-0">
                <svg
                  viewBox="0 0 200 44"
                  className="h-[15px] w-[76px] sm:h-[26px] sm:w-[138px]"
                  aria-hidden="true"
                >
                  <path
                    d={holderSigSvgPath}
                    fill="none"
                    stroke="#0F2942"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div className="border-t border-slate-700/35 pt-[1px]">
                  <p className="truncate text-[4.5px] font-extrabold tracking-tight text-[#1D4E89] uppercase sm:text-[7.5px]">
                    SAINI YA MWENYE KITAMBULISHO
                  </p>
                </div>
              </div>

              {/* Platform Owner Signature + Inked Stamp */}
              <div className="relative min-w-0 pr-[16%]">
                <div className="relative flex items-end justify-between">
                  <svg
                    viewBox="0 0 220 44"
                    className="h-[15px] w-[82px] sm:h-[26px] sm:w-[146px]"
                    aria-hidden="true"
                  >
                    <path
                      d="M 8 34 C 28 4 62 6 46 32 C 72 22 118 10 152 24 C 170 32 102 38 22 39 C 88 30 158 26 206 34"
                      fill="none"
                      stroke="#1E293B"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="hidden h-7 w-7 shrink-0 flex-col items-center justify-center rounded-full border border-[#1D4E89]/35 text-center sm:flex">
                    <span className="text-[4.5px] font-black leading-none text-[#1D4E89]/65">
                      MALOSHA
                    </span>
                    <span className="text-[4.2px] font-bold leading-none text-[#1D4E89]/65">
                      MMILIKI
                    </span>
                  </div>
                </div>
                <div className="border-t border-slate-700/35 pt-[1px]">
                  <p className="truncate text-[4.5px] font-extrabold tracking-tight text-[#1D4E89] uppercase sm:text-[7.5px]">
                    SAINI YA MMILIKI WA MFUMO
                  </p>
                </div>
              </div>
            </div>

            {/* Bottom Official Issuing Authority Bar */}
            <div className="mt-[1%] flex items-center justify-center">
              <div className="w-[74%] rounded-[4px] bg-[#0E2640]/90 px-2 py-[2px] text-center sm:rounded-md sm:py-1">
                <p className="truncate font-mono text-[4.5px] font-extrabold tracking-wide text-slate-100 uppercase sm:text-[8px]">
                  KIMETOLEWA NA MALOSHA FORUMS · OFFICIAL MEMBER PASS · {securityChecksum}
                </p>
              </div>
            </div>
          </div>

          {isClosed && (
            <div className="pointer-events-none absolute top-2 right-2 z-20 inline-flex items-center gap-1 rounded bg-red-700/90 px-2 py-0.5 text-[9px] font-bold text-white uppercase">
              <Lock className="h-2.5 w-2.5" aria-hidden="true" />
              <span>{tr('Imefungwa', 'Suspended')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Verification Reference Strip (ID Number + Side Security Serial + Security Checksum) */}
      <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-slate-500 uppercase">
              {tr('Namba ya Kitambulisho (Uhakiki)', 'Member ID No. (Verification)')}
            </p>
            <p className="font-mono text-sm font-extrabold text-[#0E2640] tabular-nums">
              {memberCode}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleCopyValue(memberCode, 'card')}
            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
          >
            {copiedField === 'card' ? (
              <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
            )}
            <span>{copiedField === 'card' ? tr('Imenakiliwa', 'Copied') : tr('Nakili', 'Copy')}</span>
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-slate-500 uppercase">
              {tr('Namba ya Usalama (Serial ya Ubavuni)', 'Side Security Serial')}
            </p>
            <p className="font-mono text-sm font-extrabold text-[#0E2640] tabular-nums">
              {controlSerial}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleCopyValue(controlSerial, 'serial')}
            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
          >
            {copiedField === 'serial' ? (
              <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
            )}
            <span>
              {copiedField === 'serial' ? tr('Imenakiliwa', 'Copied') : tr('Nakili', 'Copy')}
            </span>
          </button>
        </div>
      </div>

      {/* Save / Share Actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          disabled={generating}
          onClick={() => void handleDownloadCard()}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#0E2640] px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-[#163A5F] disabled:opacity-60 sm:flex-none"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="h-4 w-4 text-amber-400" aria-hidden="true" />
          )}
          <span>
            {generating
              ? tr('Inatengeneza Kitambulisho...', 'Generating ID Card...')
              : tr('Hifadhi Kitambulisho Kwenye Simu (PNG)', 'Save ID Card to Phone (PNG)')}
          </span>
        </button>

        <button
          type="button"
          disabled={generating}
          onClick={() => void handleShareCard()}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 transition-colors hover:bg-slate-100 disabled:opacity-60"
        >
          <Share2 className="h-4 w-4 text-[#1D4E89]" aria-hidden="true" />
          <span>{tr('Shiriki', 'Share')}</span>
        </button>
      </div>
    </div>
  );
};
