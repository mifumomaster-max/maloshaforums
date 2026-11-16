import React, { useEffect, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

interface AppLaunchLoaderProps {
  ready: boolean;
}

export const AppLaunchLoader: React.FC<AppLaunchLoaderProps> = ({ ready }) => {
  const { tr } = useLanguage();
  const [minElapsed, setMinElapsed] = useState(false);
  const [maxElapsed, setMaxElapsed] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const [unmounted, setUnmounted] = useState(false);

  useEffect(() => {
    const minTimer = window.setTimeout(() => setMinElapsed(true), 160);
    const maxTimer = window.setTimeout(() => setMaxElapsed(true), 900);
    return () => {
      window.clearTimeout(minTimer);
      window.clearTimeout(maxTimer);
    };
  }, []);

  const canDismiss = (ready && minElapsed) || maxElapsed;

  useEffect(() => {
    if (!canDismiss || fadingOut) return;
    setFadingOut(true);
    const hideTimer = window.setTimeout(() => {
      setUnmounted(true);
    }, 300);
    return () => window.clearTimeout(hideTimer);
  }, [canDismiss, fadingOut]);

  if (unmounted) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={tr('Inapakia Malosha Forums', 'Loading Malosha Forums')}
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center px-6 text-center text-white transition-all duration-300 ease-out ${
        fadingOut ? 'pointer-events-none scale-[1.015] opacity-0' : 'scale-100 opacity-100'
      }`}
      style={{
        background: 'radial-gradient(circle at 50% 35%, #163A5F 0%, #0E2640 55%, #09192B 100%)',
      }}
    >
      {/* Signature Top Editorial Accent Bar */}
      <div
        className="fixed top-0 right-0 left-0 h-[3px] bg-gradient-to-r from-[#D97706] via-[#F59E0B] to-[#38BDF8]"
        aria-hidden="true"
      />

      {/* Dual-Orbit Precision Spinner + Malosha Emblem */}
      <div className="relative flex h-24 w-24 items-center justify-center" aria-hidden="true">
        <div className="animate-malosha-spin absolute inset-0 rounded-full border-[3px] border-white/10 border-t-[#F59E0B] border-r-[#F59E0B]/45" />
        <div className="animate-malosha-spin-rev absolute inset-[10px] rounded-full border-[2.5px] border-sky-400/15 border-b-[#38BDF8]" />
        <div className="flex h-[54px] w-[54px] items-center justify-center rounded-2xl bg-gradient-to-br from-[#FBBF24] to-[#D97706] shadow-[0_10px_25px_rgba(217,119,6,0.35)] ring-1 ring-white/30">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 6.5C4 5.12 5.12 4 6.5 4h11C18.88 4 20 5.12 20 6.5v7.5c0 1.38-1.12 2.5-2.5 2.5H10l-4.5 3.5V16.5H6.5C5.12 16.5 4 15.38 4 14V6.5Z"
              fill="#0E2640"
            />
            <circle cx="9" cy="10.25" r="1.35" fill="#FBBF24" />
            <circle cx="12" cy="10.25" r="1.35" fill="#FBBF24" />
            <circle cx="15" cy="10.25" r="1.35" fill="#FBBF24" />
          </svg>
        </div>
      </div>

      <h1 className="font-display mt-5 text-2xl font-bold tracking-tight text-white">
        Malosha Forums
      </h1>
      <p className="mt-2 text-[13px] font-medium text-slate-200/85">
        {tr('Inapakia jukwaa la mijadala...', 'Loading community forum...')}
      </p>

      {/* Smooth Indeterminate Progress Track */}
      <div
        className="mt-5 h-[3px] w-36 overflow-hidden rounded-full bg-white/15"
        aria-hidden="true"
      >
        <div className="animate-malosha-slide h-full w-[45%] rounded-full bg-gradient-to-r from-[#F59E0B] to-[#38BDF8]" />
      </div>
    </div>
  );
};
