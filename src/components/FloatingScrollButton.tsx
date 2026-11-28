import React, { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface FloatingScrollButtonProps {
  resetKey?: string;
  hasBottomRightFab?: boolean;
}

const SCROLL_SHOW_TOP_THRESHOLD = 180;

function isTextInputLike(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName === 'INPUT') {
    const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
    return ['text', 'email', 'password', 'tel', 'url', 'number'].includes(type);
  }
  return false;
}

function hasActiveCommentDraft(): boolean {
  if (typeof document === 'undefined') return false;
  const composers = document.querySelectorAll<HTMLElement>('[data-comment-composer="true"]');
  for (let i = 0; i < composers.length; i += 1) {
    const form = composers[i];
    if (form.offsetParent === null) continue;
    const fields = form.querySelectorAll<HTMLTextAreaElement | HTMLInputElement>('textarea, input');
    for (let j = 0; j < fields.length; j += 1) {
      if (fields[j].value.trim().length > 0) {
        return true;
      }
    }
  }
  return false;
}

export const FloatingScrollButton: React.FC<FloatingScrollButtonProps> = ({
  resetKey = '',
  hasBottomRightFab = false,
}) => {
  const { tr } = useLanguage();
  const [scrollY, setScrollY] = useState(0);
  const [savedScrollY, setSavedScrollY] = useState<number | null>(null);
  const [inputSuppressed, setInputSuppressed] = useState(false);
  const [avoidBottomPx, setAvoidBottomPx] = useState<number | null>(null);

  useEffect(() => {
    setSavedScrollY(null);
  }, [resetKey]);

  const recomputeSuppressionAndDodge = useCallback(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const activeFocused = isTextInputLike(document.activeElement);
    const hasDraft = hasActiveCommentDraft();
    if (activeFocused || hasDraft) {
      setInputSuppressed(true);
      setAvoidBottomPx(null);
      return;
    }

    setInputSuppressed(false);

    // Check if any visible comment composer overlaps the default bottom-right resting zone
    const winW = window.innerWidth || 0;
    const winH = window.innerHeight || 0;
    const isDesktop = winW >= 768;
    const defaultBottom = hasBottomRightFab ? (isDesktop ? 92 : 154) : isDesktop ? 24 : 86;
    const btnTop = winH - defaultBottom - 44;
    const btnBottom = winH - defaultBottom;
    const btnLeft = winW - (isDesktop ? 24 : 16) - 120;

    let dodgeToBottom: number | null = null;
    const composers = document.querySelectorAll<HTMLElement>('[data-comment-composer="true"]');
    for (let i = 0; i < composers.length; i += 1) {
      const form = composers[i];
      if (form.offsetParent === null) continue;
      const rect = form.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const overlapsHoriz = rect.right >= btnLeft;
      const overlapsVert = rect.bottom >= btnTop - 10 && rect.top <= btnBottom + 10;
      if (overlapsHoriz && overlapsVert) {
        const candidateAbove = Math.ceil(winH - rect.top + 14);
        if (candidateAbove + 52 < winH - 72) {
          dodgeToBottom = dodgeToBottom === null ? candidateAbove : Math.max(dodgeToBottom, candidateAbove);
        } else {
          // If the comment bar fills the upper screen too, hide instead of blocking send
          setInputSuppressed(true);
          setAvoidBottomPx(null);
          return;
        }
      }
    }

    setAvoidBottomPx(dodgeToBottom);
  }, [hasBottomRightFab]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    let ticking = false;
    let blurTimer: number | null = null;

    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const currentY = window.scrollY || window.pageYOffset || 0;
        setScrollY(currentY);
        recomputeSuppressionAndDodge();
        ticking = false;
      });
    };

    const handleFocusIn = () => {
      if (blurTimer !== null) {
        window.clearTimeout(blurTimer);
        blurTimer = null;
      }
      recomputeSuppressionAndDodge();
    };

    const handleFocusOut = () => {
      if (blurTimer !== null) window.clearTimeout(blurTimer);
      // Grace period lets user finish tapping the Send button right after input blur
      blurTimer = window.setTimeout(() => {
        blurTimer = null;
        recomputeSuppressionAndDodge();
      }, 450);
    };

    const handleInput = () => {
      recomputeSuppressionAndDodge();
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', recomputeSuppressionAndDodge);
    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('focusout', handleFocusOut, true);
    document.addEventListener('input', handleInput, true);

    return () => {
      if (blurTimer !== null) window.clearTimeout(blurTimer);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', recomputeSuppressionAndDodge);
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('focusout', handleFocusOut, true);
      document.removeEventListener('input', handleInput, true);
    };
  }, [recomputeSuppressionAndDodge]);

  const showGoTop = scrollY > SCROLL_SHOW_TOP_THRESHOLD;
  const showReturnSpot = !showGoTop && savedScrollY !== null && savedScrollY > SCROLL_SHOW_TOP_THRESHOLD;

  if (inputSuppressed || (!showGoTop && !showReturnSpot)) {
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

  const defaultPositionClass = hasBottomRightFab
    ? 'bottom-[calc(154px+env(safe-area-inset-bottom,0px))] md:bottom-[92px]'
    : 'bottom-[calc(86px+env(safe-area-inset-bottom,0px))] md:bottom-6';

  return (
    <button
      type="button"
      onClick={handleClick}
      style={avoidBottomPx !== null ? { bottom: `${avoidBottomPx}px` } : undefined}
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
      className={`fixed right-4 z-[41] inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-bold shadow-[0_8px_24px_rgba(14,38,64,0.28)] transition-all active:scale-95 md:right-6 ${
        avoidBottomPx === null ? defaultPositionClass : ''
      } ${
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
