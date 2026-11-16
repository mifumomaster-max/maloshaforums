import React, { useState } from 'react';
import { optimizeCloudinaryUrl } from '../services/cloudinaryService';
import { getInitials } from '../utils/formatters';

interface AvatarProps {
  name: string;
  photoURL?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const Avatar: React.FC<AvatarProps> = ({ name, photoURL, size = 'md' }) => {
  const [failed, setFailed] = useState(false);

  const sizeClass =
    size === 'sm'
      ? 'h-7 w-7 text-[11px]'
      : size === 'lg'
        ? 'h-11 w-11 text-sm'
        : 'h-9 w-9 text-xs';

  const optimizedUrl = optimizeCloudinaryUrl(photoURL, 128);

  if (optimizedUrl && !failed) {
    return (
      <img
        src={optimizedUrl}
        alt={name}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${sizeClass} shrink-0 rounded-full border border-stone-200 object-cover`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${sizeClass} inline-flex shrink-0 items-center justify-center rounded-full border border-stone-200 bg-stone-100 font-semibold text-stone-700`}
    >
      {getInitials(name)}
    </span>
  );
};
