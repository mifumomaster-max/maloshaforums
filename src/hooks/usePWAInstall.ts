import { useCallback, useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface Window {
    __deferredPWAPrompt?: BeforeInstallPromptEvent | null;
  }
}


function checkStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function checkIsIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent.toLowerCase();
  const isLegacyIOS = /iphone|ipad|ipod/.test(ua);
  const isIPadOS =
    window.navigator.platform === 'MacIntel' &&
    typeof window.navigator.maxTouchPoints === 'number' &&
    window.navigator.maxTouchPoints > 1;
  return isLegacyIOS || isIPadOS;
}

function checkIsMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return /android|iphone|ipad|ipod|mobile/i.test(window.navigator.userAgent);
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.__deferredPWAPrompt || null;
  });
  const [isInstalled, setIsInstalled] = useState<boolean>(() => checkStandalone());
  const [isIOS] = useState<boolean>(() => checkIsIOS());
  const [isMobile] = useState<boolean>(() => checkIsMobile());
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    setIsInstalled(checkStandalone());

    const syncFromWindow = () => {
      if (window.__deferredPWAPrompt) {
        setDeferredPrompt(window.__deferredPWAPrompt);
      }
    };

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      window.__deferredPWAPrompt = promptEvent;
      setDeferredPrompt(promptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      window.__deferredPWAPrompt = null;
    };

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsInstalled(true);
      }
    };

    // Immediately sync in case beforeinstallprompt fired during hydration
    syncFromWindow();

    window.addEventListener('malosha-pwa-prompt-ready', syncFromWindow);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    mediaQuery.addEventListener('change', handleDisplayChange);

    return () => {
      window.removeEventListener('malosha-pwa-prompt-ready', syncFromWindow);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      mediaQuery.removeEventListener('change', handleDisplayChange);
    };
  }, []);

  const install = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    const promptEvent = deferredPrompt || window.__deferredPWAPrompt;
    if (!promptEvent) return 'unavailable';

    setInstalling(true);
    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
        window.__deferredPWAPrompt = null;
      }
      return outcome;
    } catch {
      return 'unavailable';
    } finally {
      setInstalling(false);
    }
  }, [deferredPrompt]);

  const dismissPrompt = useCallback(() => {
    // No permanent dismissal: banner component handles brief snooze and reminds again until installed
  }, []);

  const hasPromptReady = Boolean(
    deferredPrompt || (typeof window !== 'undefined' && window.__deferredPWAPrompt)
  );

  return {
    isInstallable: hasPromptReady,
    isInstalled,
    isIOS,
    isMobile,
    isDismissed: false,
    installing,
    install,
    dismissPrompt,
  };
}
