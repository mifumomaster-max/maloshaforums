import React from 'react';
import { WifiOff } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const { tr } = useLanguage();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-[62px] left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-950 shadow-md sm:top-[72px]"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden="true" />
      <span className="whitespace-nowrap">
        {tr('Huna mtandao — Maudhui yaliyohifadhiwa yanatumika', 'Offline — Viewing cached content')}
      </span>
    </div>
  );
};
