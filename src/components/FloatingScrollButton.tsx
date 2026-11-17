import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface FloatingScrollButtonProps {
  resetKey?: string;
}

const SCROLL_SHOW_TOP_THRESHOLD = 260;

export const FloatingScrollButton: React.FC<FloatingScrollButtonProps> = ({
  resetKey = '',
}) => {
  const { tr } = useLanguage();
  const [scrollY, setScrollY] = useState(0);
  const [savedScrollY, setSavedScrollY] = useState<number | null>(null);

  useEffect(() => {
    setSavedScrollY(null);
  }, [resetKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const currentY = window.scrollY || window.pageYOffset || 0;
        setScrollY(currentY);
        ticking = false;
      });
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const showGoTop = scrollY > SCROLL_SHOW_TOP_THRESHOLD;
  const showReturnSpot = !showGoTop && savedScrollY !== null && savedScrollY > SCROLL_SHOW_TOP_THRESHOLD;

  if (!showGoTop && !showReturnSpot) {
    return null;
  }

  const handleClick = () => {
    if (showGoTop) {
      setSavedScrollY(scrollY);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (savedScrollY !== null) {
      const target = savedScrollY;
      setSavedScrollY(null);
      window.scrollTo({ top: target, behavior: 'smooth' });
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={
        showGoTop
          ? tr('Peleka juu kabisa', 'Scroll to top')
          : tr('Rudi pale ulipokuwa', 'Return to previous position')
      }
      title={
        showGoTop
          ? tr('Peleka mwanzo / juu', 'Jump to top')
          : tr('Rudi pale ulipokuwa', 'Return to previous spot')
      }
      className={`fixed right-4 bottom-[calc(154px+env(safe-area-inset-bottom,0px))] z-[41] inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-bold shadow-[0_8px_24px_rgba(14,38,64,0.28)] transition-all active:scale-95 md:right-6 md:bottom-[92px] ${
        showGoTop
          ? 'border-amber-400/40 bg-[#0E2640] text-white hover:bg-[#163A5F]'
          : 'border-[#D97706] bg-[#D97706] text-white hover:bg-[#B45309]'
      }`}
    >
      {showGoTop ? (
        <>
          <ArrowUp className="h-4 w-4 text-amber-400" aria-hidden="true" />
          <span>{tr('Juu', 'Top')}</span>
        </>
      ) : (
        <>
          <ArrowDown className="h-4 w-4 text-white" aria-hidden="true" />
          <span>{tr('Rudi Pale', 'Back Down')}</span>
        </>
      )}
    </button>
  );
};
