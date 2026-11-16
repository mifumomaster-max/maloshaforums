import React from 'react';
import { Lock } from 'lucide-react';
import { VERIFICATION_BADGE_META, VerificationBadgeType } from '../types';
import { useAuthorAccountStatus, useAuthorBadge } from '../context/UserBadgesContext';

interface VerificationBadgeProps {
  badge?: VerificationBadgeType | null;
  size?: 'xs' | 'sm' | 'md';
  showLabel?: boolean;
  fullLabel?: boolean;
}

const SIZE_MAP = {
  xs: 'h-3.5 w-3.5',
  sm: 'h-4 w-4',
  md: 'h-[18px] w-[18px]',
};

/**
 * Generates the exact 12-point rounded starburst rosette matching the reference badge
 * (valleys at 12, 3, 6, 9 o'clock and symmetric rounded star tips around them).
 */
function buildStarburstPath(): string {
  const cx = 50;
  const cy = 50;
  const outerR = 45.5;
  const innerR = 35.5;
  const points: Array<{ x: number; y: number; round: number }> = [];

  for (let i = 0; i < 24; i++) {
    const deg = -90 + i * 15;
    const rad = (deg * Math.PI) / 180;
    const isTip = i % 2 === 1;
    const r = isTip ? outerR : innerR;
    points.push({
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad),
      round: isTip ? 3.2 : 2.2,
    });
  }

  const cmds: string[] = [];
  const total = points.length;

  for (let i = 0; i < total; i++) {
    const prev = points[(i - 1 + total) % total];
    const curr = points[i];
    const next = points[(i + 1) % total];

    const dx1 = prev.x - curr.x;
    const dy1 = prev.y - curr.y;
    const len1 = Math.hypot(dx1, dy1);
    const p1x = curr.x + (dx1 / len1) * curr.round;
    const p1y = curr.y + (dy1 / len1) * curr.round;

    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const len2 = Math.hypot(dx2, dy2);
    const p2x = curr.x + (dx2 / len2) * curr.round;
    const p2y = curr.y + (dy2 / len2) * curr.round;

    if (i === 0) {
      cmds.push(`M ${p1x.toFixed(2)} ${p1y.toFixed(2)}`);
    } else {
      cmds.push(`L ${p1x.toFixed(2)} ${p1y.toFixed(2)}`);
    }
    cmds.push(`Q ${curr.x.toFixed(2)} ${curr.y.toFixed(2)} ${p2x.toFixed(2)} ${p2y.toFixed(2)}`);
  }

  cmds.push('Z');
  return cmds.join(' ');
}

const STARBURST_PATH = buildStarburstPath();
// Solid crisp geometric white checkmark matching the uploaded verified badge
const CHECKMARK_PATH = 'M 29 52.5 L 44.2 67.7 L 71.5 40.4 L 65.4 34.3 L 44.2 55.5 L 35.1 46.4 Z';

import { useLanguage } from '../context/LanguageContext';

export const VerificationBadge: React.FC<VerificationBadgeProps> = ({
  badge,
  size = 'sm',
  showLabel = false,
  fullLabel = false,
}) => {
  const { tr, getBadgeLabel } = useLanguage();

  if (!badge || badge === 'none') {
    return null;
  }

  const meta = VERIFICATION_BADGE_META[badge];
  const iconSizeClass = SIZE_MAP[size];
  const displayTitle = getBadgeLabel(badge, false);
  const displayText = getBadgeLabel(badge, !fullLabel);

  return (
    <span
      title={displayTitle}
      aria-label={`${tr('Akaunti iliyothibitishwa', 'Verified account')}: ${displayTitle}`}
      className="inline-flex items-center gap-1 align-middle shrink-0"
    >
      <svg
        viewBox="0 0 100 100"
        fill="none"
        aria-hidden="true"
        className={`${iconSizeClass} shrink-0`}
      >
        <path d={STARBURST_PATH} fill={meta.fillHex} />
        <path d={CHECKMARK_PATH} fill="#FFFFFF" />
      </svg>

      {showLabel && (
        <span className={`text-[11px] font-semibold leading-none ${meta.textClass}`}>
          {displayText}
        </span>
      )}
    </span>
  );
};

interface AuthorVerificationBadgeProps {
  uid?: string | null;
  size?: 'xs' | 'sm' | 'md';
  showLabel?: boolean;
  fullLabel?: boolean;
}

export const AuthorVerificationBadge: React.FC<AuthorVerificationBadgeProps> = ({
  uid,
  size = 'sm',
  showLabel = false,
  fullLabel = false,
}) => {
  const { tr } = useLanguage();
  const badge = useAuthorBadge(uid);
  const accountStatus = useAuthorAccountStatus(uid);

  return (
    <>
      <VerificationBadge
        badge={badge}
        size={size}
        showLabel={showLabel}
        fullLabel={fullLabel}
      />
      {accountStatus === 'suspended' && (
        <span
          title={tr('Akaunti hii imefungwa na msimamizi', 'This account is suspended')}
          className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-red-700 shrink-0"
        >
          <Lock className="h-3 w-3" aria-hidden="true" />
          <span>{tr('Akaunti Imefungwa', 'Account Closed')}</span>
        </span>
      )}
    </>
  );
};
