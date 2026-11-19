import React, { useId } from 'react';

export type NavIconSection = 'all' | 'kijiweni' | 'video' | 'fursa' | 'makala' | 'chat' | 'trending';

interface NavSectionIconProps {
  section: NavIconSection;
  className?: string;
}

export const NavSectionIcon: React.FC<NavSectionIconProps> = ({
  section,
  className = 'h-5 w-5',
}) => {
  const uid = useId().replace(/:/g, '');

  if (section === 'kijiweni') {
    return (
      <svg viewBox="0 0 28 28" fill="none" className={className} aria-hidden="true">
        <defs>
          <linearGradient id={`kijCup-${uid}`} x1="5" y1="9" x2="20" y2="24" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FBBF24" />
            <stop offset="55%" stopColor="#EA580C" />
            <stop offset="100%" stopColor="#9A3412" />
          </linearGradient>
          <linearGradient id={`kijBubble-${uid}`} x1="15" y1="2" x2="26" y2="13" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#0284C7" />
          </linearGradient>
        </defs>
        {/* Saucer shadow */}
        <ellipse cx="12.5" cy="24.2" rx="8.5" ry="1.8" fill="#78350F" opacity="0.35" />
        {/* Warm ceramic saucer */}
        <path
          d="M4.5 22.5C4.5 21.7 8 21.2 12.5 21.2C17 21.2 20.5 21.7 20.5 22.5C20.5 23.6 17 24.4 12.5 24.4C8 24.4 4.5 23.6 4.5 22.5Z"
          fill="#D97706"
        />
        {/* Cup handle */}
        <path
          d="M18.6 12.6H20.2C21.7 12.6 22.8 13.7 22.8 15.1C22.8 16.5 21.7 17.6 20.2 17.6H18.4"
          stroke="#EA580C"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
        {/* Cup body */}
        <path
          d="M6 11.4C6 10.6 6.6 10 7.4 10H17.6C18.4 10 19 10.6 19 11.4V16.6C19 19.7 16.3 22 12.5 22C8.7 22 6 19.7 6 16.6V11.4Z"
          fill={`url(#kijCup-${uid})`}
        />
        {/* Cup highlight */}
        <path
          d="M8.1 12.6V16.4C8.1 18.2 9.2 19.6 10.8 20.3"
          stroke="#FEF3C7"
          strokeOpacity="0.6"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        {/* Latte foam rim */}
        <ellipse cx="12.5" cy="10.4" rx="6.2" ry="1.6" fill="#FEF3C7" />
        <ellipse cx="12.5" cy="10.5" rx="4.6" ry="0.9" fill="#92400E" opacity="0.65" />
        {/* Aromatic steam */}
        <path
          d="M9.6 7.8C9.2 6.6 10.3 5.7 9.9 4.4M13.2 7.5C12.8 6.2 13.9 5.3 13.5 4"
          stroke="#FDE68A"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* Small bright social chat spark bubble */}
        <path
          d="M17.2 3.2C17.2 2.4 17.9 1.8 18.7 1.8H24.6C25.5 1.8 26.2 2.5 26.2 3.4V7.6C26.2 8.5 25.5 9.2 24.6 9.2H20.6L18.1 10.9V9.1C17.6 8.9 17.2 8.3 17.2 7.6V3.2Z"
          fill={`url(#kijBubble-${uid})`}
          stroke="#FFFFFF"
          strokeWidth="0.9"
        />
        <circle cx="20.1" cy="5.5" r="0.75" fill="#FFFFFF" />
        <circle cx="22.1" cy="5.5" r="0.75" fill="#FFFFFF" />
        <circle cx="24" cy="5.5" r="0.75" fill="#FFFFFF" />
      </svg>
    );
  }

  if (section === 'video') {
    return (
      <svg viewBox="0 0 28 28" fill="none" className={className} aria-hidden="true">
        <defs>
          <linearGradient id={`vidFrame-${uid}`} x1="3" y1="4" x2="25" y2="24" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#0F172A" />
            <stop offset="100%" stopColor="#1E293B" />
          </linearGradient>
          <linearGradient id={`vidAccentA-${uid}`} x1="3" y1="5" x2="14" y2="23" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#22D3EE" />
            <stop offset="100%" stopColor="#06B6D4" />
          </linearGradient>
          <linearGradient id={`vidAccentB-${uid}`} x1="14" y1="5" x2="25" y2="23" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FB7185" />
            <stop offset="100%" stopColor="#E11D48" />
          </linearGradient>
        </defs>
        {/* Malosha Reels dual cyan / crimson glow layers */}
        <rect x="2.6" y="4.8" width="19.5" height="19.5" rx="5.2" fill={`url(#vidAccentA-${uid})`} opacity="0.9" />
        <rect x="5.9" y="3.7" width="19.5" height="19.5" rx="5.2" fill={`url(#vidAccentB-${uid})`} opacity="0.9" />
        {/* Crisp dark cinema frame */}
        <rect
          x="4.2"
          y="4.2"
          width="19.6"
          height="19.6"
          rx="5.2"
          fill={`url(#vidFrame-${uid})`}
          stroke="#FFFFFF"
          strokeWidth="1.1"
        />
        {/* Film sprockets top */}
        <rect x="7.5" y="6.2" width="2.8" height="1.6" rx="0.7" fill="#38BDF8" />
        <rect x="12.6" y="6.2" width="2.8" height="1.6" rx="0.7" fill="#FBBF24" />
        <rect x="17.7" y="6.2" width="2.8" height="1.6" rx="0.7" fill="#FB7185" />
        {/* Vibrant Play Triangle */}
        <path
          d="M11.6 10.6C11.6 10 12.2 9.6 12.8 9.9L18.4 13.3C18.9 13.6 18.9 14.4 18.4 14.7L12.8 18.1C12.2 18.4 11.6 18 11.6 17.4V10.6Z"
          fill="#FFFFFF"
        />
      </svg>
    );
  }

  if (section === 'fursa') {
    return (
      <svg viewBox="0 0 28 28" fill="none" className={className} aria-hidden="true">
        <defs>
          <linearGradient id={`fursaBody-${uid}`} x1="3" y1="8" x2="25" y2="25" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#0EA5E9" />
            <stop offset="55%" stopColor="#0369A1" />
            <stop offset="100%" stopColor="#0C4A6E" />
          </linearGradient>
          <linearGradient id={`fursaFlap-${uid}`} x1="4" y1="8" x2="24" y2="17" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#0284C7" />
          </linearGradient>
          <linearGradient id={`fursaGold-${uid}`} x1="11" y1="13" x2="17" y2="18" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FEF08A" />
            <stop offset="50%" stopColor="#FACC15" />
            <stop offset="100%" stopColor="#CA8A04" />
          </linearGradient>
        </defs>
        {/* Top handle */}
        <path
          d="M10.2 8V6.1C10.2 5 11.1 4.2 12.2 4.2H15.8C16.9 4.2 17.8 5 17.8 6.1V8"
          stroke="#1E293B"
          strokeWidth="2.3"
          strokeLinecap="round"
        />
        <path
          d="M10.7 7.6V6.2C10.7 5.5 11.3 4.9 12 4.9H16C16.7 4.9 17.3 5.5 17.3 6.2V7.6"
          stroke="#94A3B8"
          strokeOpacity="0.65"
          strokeWidth="0.8"
          strokeLinecap="round"
        />
        {/* Lower case body */}
        <rect x="3" y="8.2" width="22" height="16.2" rx="3.4" fill={`url(#fursaBody-${uid})`} />
        {/* Bottom leather edge shading */}
        <path
          d="M3.5 21.5C3.5 23 4.7 24.1 6.2 24.1H21.8C23.3 24.1 24.5 23 24.5 21.5"
          stroke="#082F49"
          strokeWidth="1.2"
        />
        {/* Sculpted front flap */}
        <path
          d="M3 11.4C3 9.6 4.4 8.2 6.2 8.2H21.8C23.6 8.2 25 9.6 25 11.4V13.6C25 14.9 24.1 16 22.8 16.3L15.6 17.5C14.5 17.7 13.5 17.7 12.4 17.5L5.2 16.3C3.9 16 3 14.9 3 13.6V11.4Z"
          fill={`url(#fursaFlap-${uid})`}
        />
        {/* Flap highlight */}
        <path
          d="M5 10.2H23"
          stroke="#BAE6FD"
          strokeOpacity="0.55"
          strokeWidth="1"
          strokeLinecap="round"
        />
        {/* Gold metal clasp */}
        <rect
          x="11.4"
          y="14.2"
          width="5.2"
          height="4.4"
          rx="1.2"
          fill={`url(#fursaGold-${uid})`}
          stroke="#854D0E"
          strokeWidth="0.7"
        />
        <circle cx="14" cy="16.4" r="0.9" fill="#78350F" />
        {/* Opportunity sparkle badge top-right */}
        <path
          d="M22.8 2.4L23.5 4.2L25.3 4.9L23.5 5.6L22.8 7.4L22.1 5.6L20.3 4.9L22.1 4.2L22.8 2.4Z"
          fill="#FACC15"
        />
      </svg>
    );
  }

  if (section === 'makala') {
    return (
      <svg viewBox="0 0 28 28" fill="none" className={className} aria-hidden="true">
        <defs>
          <linearGradient id={`makPaper-${uid}`} x1="3" y1="4" x2="21" y2="24" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#E2E8F0" />
          </linearGradient>
          <linearGradient id={`makRed-${uid}`} x1="5" y1="6" x2="19" y2="10" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#EF4444" />
            <stop offset="100%" stopColor="#991B1B" />
          </linearGradient>
          <linearGradient id={`makPhoto-${uid}`} x1="5.5" y1="11.5" x2="12.5" y2="17.5" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#0284C7" />
          </linearGradient>
        </defs>
        {/* Back folded page */}
        <path
          d="M20.5 7.5H23.2C24.3 7.5 25.2 8.4 25.2 9.5V21.2C25.2 22.8 23.9 24 22.3 24H19.5V7.5H20.5Z"
          fill="#CBD5E1"
          stroke="#94A3B8"
          strokeWidth="0.8"
        />
        {/* Main front broadsheet */}
        <rect
          x="3"
          y="4.2"
          width="18.2"
          height="19.8"
          rx="2.2"
          fill={`url(#makPaper-${uid})`}
          stroke="#94A3B8"
          strokeWidth="0.9"
        />
        {/* Crimson breaking masthead */}
        <rect x="5" y="6.3" width="14.2" height="3.2" rx="0.8" fill={`url(#makRed-${uid})`} />
        <path d="M6.3 7.9H13.6" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" />
        {/* Photo window */}
        <rect x="5" y="11" width="7.2" height="6.2" rx="1" fill={`url(#makPhoto-${uid})`} />
        <circle cx="7.1" cy="12.9" r="0.9" fill="#FEF08A" />
        <path
          d="M5.4 16.8L7.6 14.5L9.3 15.9L10.7 14.7L12 16.8H5.4Z"
          fill="#E0F2FE"
        />
        {/* Headline & column copy lines */}
        <path
          d="M13.6 11.7H19.1M13.6 14H19.1M13.6 16.3H17.8"
          stroke="#334155"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <path
          d="M5.2 19.3H19M5.2 21.5H15.6"
          stroke="#64748B"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (section === 'chat') {
    return (
      <svg viewBox="0 0 28 28" fill="none" className={className} aria-hidden="true">
        <defs>
          <linearGradient id={`chatBack-${uid}`} x1="11" y1="3" x2="26" y2="17" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#0284C7" />
          </linearGradient>
          <linearGradient id={`chatFront-${uid}`} x1="2" y1="7" x2="20" y2="24" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#4ADE80" />
            <stop offset="55%" stopColor="#22C55E" />
            <stop offset="100%" stopColor="#15803D" />
          </linearGradient>
        </defs>
        {/* Back cyan reply bubble */}
        <path
          d="M11.5 4.2C11.5 3.1 12.4 2.2 13.5 2.2H23.2C24.5 2.2 25.5 3.2 25.5 4.5V11.8C25.5 13.1 24.5 14.1 23.2 14.1H22.2L24.2 17L19.8 14.1H13.5C12.4 14.1 11.5 13.2 11.5 12.1V4.2Z"
          fill={`url(#chatBack-${uid})`}
        />
        {/* Front vivid emerald WhatsApp-style bubble */}
        <path
          d="M2.5 10.6C2.5 8.8 4 7.3 5.8 7.3H17.4C19.2 7.3 20.7 8.8 20.7 10.6V17.4C20.7 19.2 19.2 20.7 17.4 20.7H9.2L4.2 24.4L5.6 20.7C3.8 20.6 2.5 19.1 2.5 17.4V10.6Z"
          fill={`url(#chatFront-${uid})`}
          stroke="#FFFFFF"
          strokeWidth="1"
        />
        {/* Crisp white typing dots */}
        <circle cx="8" cy="14" r="1.25" fill="#FFFFFF" />
        <circle cx="11.6" cy="14" r="1.25" fill="#FFFFFF" />
        <circle cx="15.2" cy="14" r="1.25" fill="#FFFFFF" />
      </svg>
    );
  }

  if (section === 'trending') {
    return (
      <svg viewBox="0 0 28 28" fill="none" className={className} aria-hidden="true">
        <defs>
          <linearGradient id={`flameOuter-${uid}`} x1="14" y1="2.5" x2="14" y2="25.5" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FB7185" />
            <stop offset="45%" stopColor="#EF4444" />
            <stop offset="100%" stopColor="#EA580C" />
          </linearGradient>
          <linearGradient id={`flameInner-${uid}`} x1="14" y1="11" x2="14" y2="24" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FEF08A" />
            <stop offset="55%" stopColor="#FACC15" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>
        </defs>
        {/* Outer realistic flame */}
        <path
          d="M14.6 2.5C15.1 6.2 18.6 8.3 20.5 11.4C22.2 14.1 22.1 17.7 20.2 20.5C18.6 22.9 16.4 24.4 13.7 24.4C9.5 24.4 6 21 6 16.4C6 13.6 7.3 11 9 9.2C9.1 10.9 10.2 11.9 11.1 12.1C10.5 8.9 11.9 5.3 14.6 2.5Z"
          fill={`url(#flameOuter-${uid})`}
        />
        {/* Inner glowing core */}
        <path
          d="M14.2 11.6C15.8 13.7 17.4 15.3 17.4 17.9C17.4 20.4 15.8 22.4 13.6 22.4C11.4 22.4 9.8 20.5 9.8 18.1C9.8 16.6 10.5 15.2 11.6 14.2C11.8 15.2 12.4 15.8 13 15.9C12.7 14.2 13.2 12.8 14.2 11.6Z"
          fill={`url(#flameInner-${uid})`}
        />
        {/* Bright spark tip */}
        <ellipse cx="13.6" cy="19.3" rx="1.6" ry="2.1" fill="#FEF9C3" />
      </svg>
    );
  }

  // 'all' — Vibrant 4-tile Forum Hub
  return (
    <svg viewBox="0 0 28 28" fill="none" className={className} aria-hidden="true">
      <rect x="3.5" y="3.5" width="9.5" height="9.5" rx="2.6" fill="#0284C7" />
      <rect x="15" y="3.5" width="9.5" height="9.5" rx="2.6" fill="#F59E0B" />
      <rect x="3.5" y="15" width="9.5" height="9.5" rx="2.6" fill="#DC2626" />
      <rect x="15" y="15" width="9.5" height="9.5" rx="2.6" fill="#16A34A" />
    </svg>
  );
};
