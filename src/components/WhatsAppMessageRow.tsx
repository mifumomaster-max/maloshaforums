import React, { useRef, useState } from 'react';
import { Reply } from 'lucide-react';

interface WhatsAppMessageRowProps {
  id?: string;
  isOwn: boolean;
  isSelected?: boolean;
  selectionActive?: boolean;
  disableSwipe?: boolean;
  onSwipeReply: () => void;
  onSelect: () => void;
  className?: string;
  children: React.ReactNode;
}

const SWIPE_THRESHOLD = 46;
const MAX_SWIPE_PX = 72;
const LONG_PRESS_MS = 400;

export const WhatsAppMessageRow: React.FC<WhatsAppMessageRowProps> = ({
  id,
  isOwn,
  isSelected = false,
  selectionActive = false,
  disableSwipe = false,
  onSwipeReply,
  onSelect,
  className = '',
  children,
}) => {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);

  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const lockModeRef = useRef<'none' | 'horizontal' | 'vertical'>('none');
  const activePointerIdRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);
  const thresholdBuzzedRef = useRef(false);

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const resetGesture = () => {
    clearLongPress();
    activePointerIdRef.current = null;
    lockModeRef.current = 'none';
    thresholdBuzzedRef.current = false;
    setDragging(false);
    setDragX(0);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 2) return;
    activePointerIdRef.current = e.pointerId;
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    lockModeRef.current = 'none';
    longPressFiredRef.current = false;
    thresholdBuzzedRef.current = false;

    clearLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      longPressFiredRef.current = true;
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
          navigator.vibrate(16);
        } catch {
          // Ignore vibrate failures
        }
      }
      onSelect();
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    const dx = e.clientX - startXRef.current;
    const dy = e.clientY - startYRef.current;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (absX > 8 || absY > 8) {
      clearLongPress();
    }

    if (disableSwipe || selectionActive) return;

    if (lockModeRef.current === 'none') {
      if (absY > 10 && absY >= absX) {
        lockModeRef.current = 'vertical';
        return;
      }
      if (dx > 10 && dx > absY * 1.15) {
        lockModeRef.current = 'horizontal';
        setDragging(true);
      } else {
        return;
      }
    }

    if (lockModeRef.current !== 'horizontal') return;

    const clamped = Math.max(0, Math.min(MAX_SWIPE_PX, dx * 0.85));
    setDragX(clamped);

    if (clamped >= SWIPE_THRESHOLD && !thresholdBuzzedRef.current) {
      thresholdBuzzedRef.current = true;
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
          navigator.vibrate(12);
        } catch {
          // Ignore vibrate failures
        }
      }
    } else if (clamped < SWIPE_THRESHOLD) {
      thresholdBuzzedRef.current = false;
    }
  };

  const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    const didSwipe = !disableSwipe && lockModeRef.current === 'horizontal' && dragX >= SWIPE_THRESHOLD;
    resetGesture();
    if (didSwipe) {
      onSwipeReply();
    }
  };

  const handleClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (selectionActive) {
      e.preventDefault();
      e.stopPropagation();
      onSelect();
    }
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.closest('a') || target.tagName === 'IMG')) {
      // Still allow WhatsApp-style context action on the message bubble itself
    }
    e.preventDefault();
    clearLongPress();
    onSelect();
  };

  const replyProgress = Math.min(1, dragX / SWIPE_THRESHOLD);

  return (
    <div
      id={id}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUpOrCancel}
      onPointerCancel={resetGesture}
      onClickCapture={handleClickCapture}
      onContextMenu={handleContextMenu}
      className={`group relative flex touch-pan-y select-none items-end gap-2 rounded-xl px-1 transition-colors ${
        isOwn ? 'justify-end' : 'justify-start'
      } ${isSelected ? 'bg-[#00A884]/18 ring-1 ring-[#00A884]/35' : ''} ${className}`}
    >
      {/* WhatsApp Circular Reply Indicator Revealed During Right Swipe */}
      {dragX > 4 && (
        <div
          aria-hidden="true"
          style={{
            opacity: replyProgress,
            transform: `translateY(-50%) scale(${0.65 + 0.35 * replyProgress})`,
          }}
          className="pointer-events-none absolute top-1/2 left-1 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-[#1DAB61] text-white shadow-md"
        >
          <Reply className="h-4 w-4" />
        </div>
      )}

      <div
        style={{
          transform: dragX > 0 ? `translate3d(${dragX}px, 0, 0)` : undefined,
          transition: dragging ? 'none' : 'transform 200ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        className={`flex w-full items-end gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}
      >
        {children}
      </div>
    </div>
  );
};
