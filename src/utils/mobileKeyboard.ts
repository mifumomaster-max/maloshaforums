import { useEffect, useState } from 'react';

export interface MobileKeyboardState {
  isKeyboardOpen: boolean;
  keyboardHeight: number;
  viewportTop: number;
  viewportHeight: number;
}

const KEYBOARD_THRESHOLD_PX = 120;

export function useMobileKeyboardState(): MobileKeyboardState {
  const [state, setState] = useState<MobileKeyboardState>(() => {
    if (typeof window === 'undefined') {
      return { isKeyboardOpen: false, keyboardHeight: 0, viewportTop: 0, viewportHeight: 0 };
    }
    const vv = window.visualViewport;
    const innerH = window.innerHeight || 0;
    const vvH = vv ? vv.height : innerH;
    const vvTop = vv ? vv.offsetTop : 0;
    const kh = Math.max(0, Math.round(innerH - (vvH + vvTop)));
    const isMobile = window.innerWidth < 768;
    return {
      isKeyboardOpen: Boolean(isMobile && vv && vvH < innerH - KEYBOARD_THRESHOLD_PX),
      keyboardHeight: isMobile ? kh : 0,
      viewportTop: Math.round(vvTop),
      viewportHeight: Math.round(vvH),
    };
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const update = () => {
      const vv = window.visualViewport;
      const innerH = window.innerHeight || 0;
      const vvH = vv ? vv.height : innerH;
      const vvTop = vv ? vv.offsetTop : 0;
      const isMobile = window.innerWidth < 768;
      const kh = isMobile ? Math.max(0, Math.round(innerH - (vvH + vvTop))) : 0;
      const open = Boolean(isMobile && vv && vvH < innerH - KEYBOARD_THRESHOLD_PX);

      setState((prev) => {
        const nextTop = Math.round(vvTop);
        const nextHeight = Math.round(vvH);
        if (
          prev.isKeyboardOpen === open &&
          prev.keyboardHeight === kh &&
          prev.viewportTop === nextTop &&
          prev.viewportHeight === nextHeight
        ) {
          return prev;
        }
        return {
          isKeyboardOpen: open,
          keyboardHeight: kh,
          viewportTop: nextTop,
          viewportHeight: nextHeight,
        };
      });
    };

    update();
    window.addEventListener('resize', update);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);

    return () => {
      window.removeEventListener('resize', update);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
    };
  }, []);

  return state;
}

function findScrollableAncestor(el: HTMLElement | null): HTMLElement | null {
  let curr = el?.parentElement || null;
  while (curr && curr !== document.body && curr !== document.documentElement) {
    const style = window.getComputedStyle(curr);
    const overflowY = style.overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && curr.scrollHeight > curr.clientHeight + 4) {
      return curr;
    }
    curr = curr.parentElement;
  }
  return null;
}

export function scrollCommentInputAboveKeyboard(target: HTMLElement | null): () => void {
  if (!target || typeof window === 'undefined') return () => {};

  const adjust = () => {
    if (!target.isConnected) return;
    const composerBox = (target.closest('form') as HTMLElement | null) || target;
    const rect = composerBox.getBoundingClientRect();
    const vv = window.visualViewport;
    const vvTop = vv ? vv.offsetTop : 0;
    const vvHeight = vv ? vv.height : window.innerHeight;
    const safeBottom = vvTop + vvHeight - 16;

    if (rect.bottom > safeBottom) {
      const delta = Math.ceil(rect.bottom - safeBottom);
      const scrollParent = findScrollableAncestor(composerBox);
      if (scrollParent) {
        const parentRect = scrollParent.getBoundingClientRect();
        if (parentRect.bottom <= safeBottom + 4) {
          scrollParent.scrollBy({ top: delta, behavior: 'smooth' });
        } else {
          window.scrollBy({ top: delta, behavior: 'smooth' });
        }
      } else {
        window.scrollBy({ top: delta, behavior: 'smooth' });
      }
    } else if (rect.top < vvTop + 68) {
      const delta = Math.floor(rect.top - (vvTop + 80));
      const scrollParent = findScrollableAncestor(composerBox);
      if (scrollParent) {
        scrollParent.scrollBy({ top: delta, behavior: 'smooth' });
      } else {
        window.scrollBy({ top: delta, behavior: 'smooth' });
      }
    }
  };

  const t1 = window.setTimeout(adjust, 60);
  const t2 = window.setTimeout(adjust, 220);
  const t3 = window.setTimeout(adjust, 420);

  return () => {
    window.clearTimeout(t1);
    window.clearTimeout(t2);
    window.clearTimeout(t3);
  };
}
