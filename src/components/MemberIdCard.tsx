import React, { useMemo, useState } from 'react';
import {
  BadgeCheck,
  CreditCard,
  Download,
  Loader2,
  Lock,
  Share2,
  ShieldCheck,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import {
  UserProfile,
  VERIFICATION_BADGE_META,
  normalizeAccountStatus,
} from '../types';
import { Avatar } from './Avatar';
import { VerificationBadge } from './VerificationBadge';

interface MemberIdCardProps {
  profile: UserProfile;
  isAdmin: boolean;
  onToast: (message: string, kind?: 'success' | 'error') => void;
}

export function formatMemberCode(uid: string): string {
  const clean = uid.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const suffix = (clean.slice(0, 8) || 'MEMBER01').padEnd(8, '0');
  return `MLF-${suffix}`;
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
    const timer = window.setTimeout(() => resolve(null), 4000);
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

export const MemberIdCard: React.FC<MemberIdCardProps> = ({
  profile,
  isAdmin,
  onToast,
}) => {
  const { lang, tr } = useLanguage();
  const [generating, setGenerating] = useState(false);

  const memberCode = useMemo(() => formatMemberCode(profile.uid), [profile.uid]);
  const isClosed = !isAdmin && normalizeAccountStatus(profile.accountStatus) === 'suspended';

  const joinedLabel = useMemo(() => {
    const date = profile.createdAt ? profile.createdAt.toDate() : new Date();
    try {
      return new Intl.DateTimeFormat(lang === 'sw' ? 'sw-TZ' : 'en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(date);
    } catch {
      return date.toLocaleDateString();
    }
  }, [profile.createdAt, lang]);

  const roleLabel = isAdmin
    ? tr('Mmiliki & Msimamizi', 'Owner & Admin')
    : profile.role === 'moderator'
      ? tr('Msimamizi', 'Moderator')
      : tr('Mwanachama Rasmi', 'Official Member');

  const badgeMeta = VERIFICATION_BADGE_META[profile.verificationBadge || 'none'];

  const renderCardPngBlob = async (): Promise<Blob> => {
    const W = 1050;
    const H = 640;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');

    // Outer white card background with rounded corners
    ctx.fillStyle = '#FFFFFF';
    drawRoundedRect(ctx, 0, 0, W, H, 32);
    ctx.fill();

    // Subtle diagonal watermark across card body
    ctx.save();
    ctx.fillStyle = 'rgba(14, 38, 64, 0.045)';
    ctx.font = '700 20px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.rotate((-20 * Math.PI) / 180);
    for (let y = -200; y < H + 360; y += 90) {
      for (let x = -300; x < W + 300; x += 270) {
        ctx.fillText('malosha forums', x, y);
      }
    }
    ctx.restore();

    // Top Navy Official Header
    const headerGrad = ctx.createLinearGradient(0, 0, W, 170);
    headerGrad.addColorStop(0, '#0A1E33');
    headerGrad.addColorStop(0.6, '#0E2640');
    headerGrad.addColorStop(1, '#163A5F');
    ctx.fillStyle = headerGrad;
    drawRoundedRect(ctx, 0, 0, W, 174, 0);
    ctx.fill();

    // Gold/Sky Accent Stripe
    const stripeGrad = ctx.createLinearGradient(0, 0, W, 0);
    stripeGrad.addColorStop(0, '#D97706');
    stripeGrad.addColorStop(0.55, '#F59E0B');
    stripeGrad.addColorStop(1, '#38BDF8');
    ctx.fillStyle = stripeGrad;
    ctx.fillRect(0, 170, W, 8);

    // Emblem Box in Header
    ctx.fillStyle = '#F59E0B';
    drawRoundedRect(ctx, 48, 40, 82, 82, 20);
    ctx.fill();

    // Speech icon inside emblem
    ctx.fillStyle = '#FFFFFF';
    drawRoundedRect(ctx, 64, 57, 50, 38, 10);
    ctx.fill();
    ctx.fillStyle = '#0E2640';
    [77, 89, 101].forEach((cx) => {
      ctx.beginPath();
      ctx.arc(cx, 76, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Header Titles
    ctx.fillStyle = '#FCD34D';
    ctx.font = '700 18px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('JAMHURI YA WANACHAMA · OFFICIAL DIGITAL PASS', 154, 68);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 40px Georgia, serif';
    ctx.fillText('MALOSHA FORUMS', 154, 114);

    ctx.fillStyle = '#CBD5E1';
    ctx.font = '600 18px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(
      tr('KITAMBULISHO RASMI CHA MWANACHAMA', 'OFFICIAL MEMBER IDENTIFICATION CARD'),
      154,
      146
    );

    // Right ID Serial Pill in Header
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    drawRoundedRect(ctx, 760, 50, 242, 68, 14);
    ctx.fill();
    ctx.fillStyle = '#FDE68A';
    ctx.font = '700 14px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(tr('NAMBA YA KITAMBULISHO', 'MEMBER ID NO.'), 780, 76);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 24px "JetBrains Mono", monospace';
    ctx.fillText(memberCode, 780, 105);

    // Member Photo Frame
    const photoX = 52;
    const photoY = 224;
    const photoSize = 216;
    ctx.fillStyle = '#F1F5F9';
    drawRoundedRect(ctx, photoX, photoY, photoSize, photoSize, 24);
    ctx.fill();
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 3;
    ctx.stroke();

    const loadedImg = await loadCorsImage(profile.photoURL);
    if (loadedImg) {
      ctx.save();
      drawRoundedRect(ctx, photoX + 4, photoY + 4, photoSize - 8, photoSize - 8, 20);
      ctx.clip();
      const scale = Math.max(
        (photoSize - 8) / loadedImg.width,
        (photoSize - 8) / loadedImg.height
      );
      const dw = loadedImg.width * scale;
      const dh = loadedImg.height * scale;
      const dx = photoX + 4 + (photoSize - 8 - dw) / 2;
      const dy = photoY + 4 + (photoSize - 8 - dh) / 2;
      ctx.drawImage(loadedImg, dx, dy, dw, dh);
      ctx.restore();
    } else {
      ctx.fillStyle = '#0E2640';
      drawRoundedRect(ctx, photoX + 4, photoY + 4, photoSize - 8, photoSize - 8, 20);
      ctx.fill();
      ctx.fillStyle = '#F59E0B';
      ctx.font = '700 72px Georgia, serif';
      const initials = getInitials(profile.displayName);
      const metrics = ctx.measureText(initials);
      ctx.fillText(
        initials,
        photoX + (photoSize - metrics.width) / 2,
        photoY + photoSize / 2 + 24
      );
    }

    // Account Status Badge under Photo
    ctx.fillStyle = isClosed ? '#FEE2E2' : '#DCFCE7';
    drawRoundedRect(ctx, photoX, photoY + photoSize + 18, photoSize, 46, 12);
    ctx.fill();
    ctx.fillStyle = isClosed ? '#991B1B' : '#166534';
    ctx.font = '700 18px "Plus Jakarta Sans", system-ui, sans-serif';
    const statusTxt = isClosed
      ? tr('HALI: IMEFUNGWA', 'STATUS: CLOSED')
      : tr('HALI: HAI (ACTIVE)', 'STATUS: ACTIVE');
    const stW = ctx.measureText(statusTxt).width;
    ctx.fillText(statusTxt, photoX + (photoSize - stW) / 2, photoY + photoSize + 47);

    // Member Details Column
    const infoX = 304;
    ctx.fillStyle = '#64748B';
    ctx.font = '700 16px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(tr('JINA KAMILI LA MWANACHAMA', 'MEMBER FULL NAME'), infoX, 242);

    ctx.fillStyle = '#0F172A';
    ctx.font = '700 38px Georgia, serif';
    const safeDisplayName =
      profile.displayName.length > 26
        ? `${profile.displayName.slice(0, 25)}…`
        : profile.displayName;
    ctx.fillText(safeDisplayName, infoX, 286);

    // Verification & Role Pill
    ctx.fillStyle = '#F8FAFC';
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, infoX, 308, 692, 54, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = badgeMeta.fillHex;
    ctx.beginPath();
    ctx.arc(infoX + 26, 335, 11, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0F172A';
    ctx.font = '700 20px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(
      profile.verificationBadge !== 'none'
        ? badgeMeta.label
        : tr('Mwanachama Aliyesajiliwa wa Malosha Forums', 'Registered Malosha Forums Member'),
      infoX + 48,
      342
    );

    // Metadata Grid (Role, Joined Date, Activity)
    const drawMetaBox = (bx: number, by: number, bw: number, label: string, val: string) => {
      ctx.fillStyle = '#F8FAFC';
      drawRoundedRect(ctx, bx, by, bw, 98, 16);
      ctx.fill();
      ctx.fillStyle = '#64748B';
      ctx.font = '700 14px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(label, bx + 18, by + 32);
      ctx.fillStyle = '#0E2640';
      ctx.font = '700 22px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(val, bx + 18, by + 68);
    };

    drawMetaBox(infoX, 386, 220, tr('HADHI', 'ROLE'), roleLabel);
    drawMetaBox(infoX + 236, 386, 220, tr('AMEJIUNGA', 'JOINED'), joinedLabel);
    drawMetaBox(
      infoX + 472,
      386,
      220,
      tr('USHIRIKI', 'ACTIVITY'),
      `${profile.topicsCount} ${tr('Mada', 'Posts')} · ${profile.repliesCount}`
    );

    // Footer Security Strip
    ctx.fillStyle = '#F1F5F9';
    ctx.fillRect(0, 560, W, 80);
    ctx.fillStyle = '#334155';
    ctx.font = '600 17px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(
      tr(
        'Kitambulisho hiki kimetolewa kidijitali na mfumo rasmi wa Malosha Forums.',
        'Issued digitally by the official Malosha Forums platform.'
      ),
      48,
      606
    );
    ctx.fillStyle = '#1D4E89';
    ctx.font = '700 17px "JetBrains Mono", monospace';
    ctx.fillText(`ID: ${memberCode}`, 840, 606);

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
          'Kitambulisho chako kimehifadhiwa kwenye simu/kifaa chako!',
          'Your Member ID card has been saved to your device!'
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
          text: `${profile.displayName} (${memberCode}) · Malosha Forums`,
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
    <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-[#1D4E89]" aria-hidden="true" />
          <div>
            <h3 className="font-display text-base font-bold text-slate-900 sm:text-lg">
              {tr('Kitambulisho Chako cha Mwanachama', 'Your Official Member ID Card')}
            </h3>
            <p className="text-xs text-slate-600">
              {tr(
                'Hifadhi kitambulisho chako cha kidijitali moja kwa moja kwenye simu yako kama picha (PNG).',
                'Save your official Malosha Forums digital ID directly to your phone as a PNG image.'
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Interactive Preview of Official Digital ID Card */}
      <div className="bg-id-watermark relative mt-4 overflow-hidden rounded-2xl border border-slate-300 shadow-md">
        {/* Card Header */}
        <div className="bg-gradient-to-r from-[#0A1E33] via-[#0E2640] to-[#163A5F] px-4 py-3.5 text-white sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#F59E0B] to-[#D97706] shadow-xs">
                <ShieldCheck className="h-5 w-5 text-white" aria-hidden="true" />
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-wider text-amber-300 uppercase">
                  {tr('Kitambulisho Rasmi', 'Official Member Pass')}
                </p>
                <p className="font-display text-base font-bold leading-tight text-white sm:text-lg">
                  MALOSHA FORUMS
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-right">
              <p className="text-[9px] font-bold tracking-wider text-amber-200 uppercase">
                {tr('Namba ya ID', 'Member ID')}
              </p>
              <p className="font-mono text-xs font-bold text-white tabular-nums">{memberCode}</p>
            </div>
          </div>
        </div>

        {/* Gold/Sky Accent */}
        <div
          className="h-1 w-full bg-gradient-to-r from-[#D97706] via-[#F59E0B] to-[#38BDF8]"
          aria-hidden="true"
        />

        {/* Card Body */}
        <div className="relative z-10 flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl border-2 border-slate-200 bg-white p-1 shadow-xs">
              <Avatar name={profile.displayName} photoURL={profile.photoURL} size="lg" />
            </div>
            <div className="sm:hidden">
              <div className="flex items-center gap-1.5">
                <p className="font-display text-lg font-bold text-slate-900">
                  {profile.displayName}
                </p>
                <VerificationBadge badge={profile.verificationBadge} size="sm" />
              </div>
              <p className="text-xs font-medium text-slate-600">{roleLabel}</p>
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="hidden sm:block">
              <div className="flex items-center gap-2">
                <p className="truncate font-display text-xl font-bold text-slate-900">
                  {profile.displayName}
                </p>
                <VerificationBadge badge={profile.verificationBadge} size="md" />
              </div>
              <p className="text-xs font-semibold text-[#1D4E89]">{roleLabel}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {profile.verificationBadge !== 'none' ? (
                <VerificationBadge
                  badge={profile.verificationBadge}
                  size="xs"
                  showLabel
                  fullLabel
                />
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                  <BadgeCheck className="h-3.5 w-3.5 text-[#1D4E89]" aria-hidden="true" />
                  <span>{tr('Mwanachama Aliyesajiliwa', 'Registered Member')}</span>
                </span>
              )}

              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold ${
                  isClosed ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {isClosed && <Lock className="h-3 w-3" aria-hidden="true" />}
                <span>{isClosed ? tr('Imefungwa', 'Closed') : tr('Akaunti Hai', 'Active')}</span>
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
              <div className="rounded-lg border border-slate-200/80 bg-white/90 px-2.5 py-1.5">
                <p className="text-[10px] font-semibold text-slate-500 uppercase">
                  {tr('Amejiunga', 'Joined')}
                </p>
                <p className="mt-0.5 truncate font-bold text-slate-900">{joinedLabel}</p>
              </div>
              <div className="rounded-lg border border-slate-200/80 bg-white/90 px-2.5 py-1.5">
                <p className="text-[10px] font-semibold text-slate-500 uppercase">
                  {tr('Mada', 'Posts')}
                </p>
                <p className="mt-0.5 font-bold text-slate-900 tabular-nums">
                  {profile.topicsCount}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200/80 bg-white/90 px-2.5 py-1.5">
                <p className="text-[10px] font-semibold text-slate-500 uppercase">
                  {tr('Majibu', 'Replies')}
                </p>
                <p className="mt-0.5 font-bold text-slate-900 tabular-nums">
                  {profile.repliesCount}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save / Share Actions */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
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
