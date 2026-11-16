import React, { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useUserOnline } from '../context/UserPresenceContext';
import { optimizeCloudinaryUrl } from '../services/cloudinaryService';
import { getInitials } from '../utils/formatters';

interface AvatarProps {
  name: string;
  photoURL?: string;
  size?: 'sm' | 'md' | 'lg';
  uid?: string | null;
  showOnlineIndicator?: boolean;
  isOnline?: boolean;
}

export const OnlineStatusPill: React.FC<{
  uid?: string | null;
  isOnline?: boolean;
  darkSurface?: boolean;
}> = ({ uid, isOnline: isOnlineProp, darkSurface = false }) => {
  const { tr } = useLanguage();
  const contextOnline = useUserOnline(uid);
  const active = typeof isOnlineProp === 'boolean' ? isOnlineProp : contextOnline;

  if (!active) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
        darkSurface
          ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40'
          : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
      }`}
      title={tr('Yupo hewani sasa (Online)', 'Currently online')}
    >
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#25D366] opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#16A34A]" />
      </span>
      <span>Online</span>
    </span>
  );
};

export const Avatar: React.FC<AvatarProps> = ({
  name,
  photoURL,
  size = 'md',
  uid,
  showOnlineIndicator = false,
  isOnline: isOnlineProp,
}) => {
  const [failed, setFailed] = useState(false);
  const contextOnline = useUserOnline(showOnlineIndicator ? uid : null);
  const online =
    typeof isOnlineProp === 'boolean'
      ? isOnlineProp
      : showOnlineIndicator && contextOnline;

  const sizeClass =
    size === 'sm'
      ? 'h-7 w-7 text-[11px]'
      : size === 'lg'
        ? 'h-11 w-11 text-sm'
        : 'h-9 w-9 text-xs';

  const dotSizeClass =
    size === 'sm'
      ? 'h-2 w-2 right-0 bottom-0'
      : size === 'lg'
        ? 'h-3 w-3 right-0 bottom-0'
        : 'h-2.5 w-2.5 right-0 bottom-0';

  const optimizedUrl = optimizeCloudinaryUrl(photoURL, 128);

  const imgOrInitials =
    optimizedUrl && !failed ? (
      <img
        src={optimizedUrl}
        alt={name}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${sizeClass} shrink-0 rounded-full border border-stone-200 object-cover`}
      />
    ) : (
      <span
        aria-hidden="true"
        className={`${sizeClass} inline-flex shrink-0 items-center justify-center rounded-full border border-stone-200 bg-stone-100 font-semibold text-stone-700`}
      >
        {getInitials(name)}
      </span>
    );

  if (!showOnlineIndicator && typeof isOnlineProp !== 'boolean') {
    return imgOrInitials;
  }

  return (
    <span className="relative inline-flex shrink-0">
      {imgOrInitials}
      {online && (
        <span
          title="Online"
          aria-label="Online"
          className={`absolute ${dotSizeClass} rounded-full bg-[#22C55E] ring-2 ring-white`}
        />
      )}
    </span>
  );
};
