import React, { useEffect, useState } from 'react';
import { Download, MoreVertical, Share, Smartphone, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface PWAInstallBannerProps {
  isInstalled: boolean;
  isInstallable: boolean;
  isIOS: boolean;
  isMobile: boolean;
  isDismissed: boolean;
  installing: boolean;
  splashReady: boolean;
  externalGuideOpen: boolean;
  onCloseExternalGuide: () => void;
  onInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  onDismiss: () => void;
  onToast: (message: string, kind?: 'success' | 'error') => void;
}

export const PWAInstallBanner: React.FC<PWAInstallBannerProps> = ({
  isInstalled,
  isInstallable,
  isIOS,
  isMobile,
  isDismissed,
  installing,
  splashReady,
  externalGuideOpen,
  onCloseExternalGuide,
  onInstall,
  onDismiss,
  onToast,
}) => {
  const { tr } = useLanguage();
  const [bannerVisible, setBannerVisible] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [snoozedUntil, setSnoozedUntil] = useState<number>(0);

  // Persistently remind the user to install until the app is actually installed
  useEffect(() => {
    if (isInstalled || !splashReady || !(isInstallable || isIOS)) {
      setBannerVisible(false);
      return;
    }

    const now = Date.now();
    const delayMs = snoozedUntil > now ? snoozedUntil - now : 600;

    const timer = window.setTimeout(() => {
      setBannerVisible(true);
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [isInstalled, splashReady, isInstallable, isIOS, snoozedUntil]);

  useEffect(() => {
    if (externalGuideOpen && isIOS) {
      setGuideOpen(true);
    }
  }, [externalGuideOpen, isIOS]);

  const closeGuide = () => {
    setGuideOpen(false);
    onCloseExternalGuide();
  };

  const snoozeBrieflyAndRemind = () => {
    setBannerVisible(false);
    onDismiss();
    setSnoozedUntil(Date.now() + 7500);
  };

  const handleInstallClick = async () => {
    const outcome = await onInstall();
    if (outcome === 'accepted') {
      setBannerVisible(false);
      closeGuide();
      onToast(
        tr(
          'Malosha Forums imesakinishwa kwenye kifaa chako!',
          'Malosha Forums has been installed on your device!'
        )
      );
      return;
    }
    if (outcome === 'dismissed') {
      snoozeBrieflyAndRemind();
      return;
    }
    // Only iOS Safari lacks beforeinstallprompt and requires Share -> Add to Home Screen
    if (isIOS) {
      setGuideOpen(true);
      return;
    }
    snoozeBrieflyAndRemind();
  };

  if (isInstalled) return null;

  return (
    <>
      {bannerVisible && !guideOpen && (
        <aside
          role="region"
          aria-label={tr('Arifa ya kusakinisha app', 'Install app notification')}
          className="fixed inset-x-3 top-[calc(var(--malosha-header-h,98px)+8px)] z-45 mx-auto max-w-md rounded-2xl border border-amber-300/60 bg-white/97 p-3 shadow-[0_14px_34px_rgba(14,38,64,0.22)] backdrop-blur-md md:right-5 md:left-auto md:w-[392px]"
        >
          <div className="flex items-center gap-3">
            <img
              src="/pwa-192x192.png"
              alt="Malosha Forums"
              className="h-11 w-11 shrink-0 rounded-xl shadow-sm ring-1 ring-slate-200"
            />

            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold text-slate-900">
                {tr('Sakinisha App ya Malosha', 'Install Malosha App')}
              </p>
              <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-slate-600">
                {tr(
                  'Bonyeza Sakinisha uweke app ya Malosha moja kwa moja kwenye simu yako.',
                  'Tap Install to add Malosha Forums directly to your device.'
                )}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                disabled={installing}
                onClick={handleInstallClick}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-[#0E2640] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#163A5F] active:scale-[0.98] disabled:opacity-60 whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                <span>
                  {installing
                    ? tr('Inasakinisha...', 'Installing...')
                    : tr('Sakinisha', 'Install')}
                </span>
              </button>

              <button
                type="button"
                onClick={snoozeBrieflyAndRemind}
                aria-label={tr('Funga kwa muda', 'Remind me shortly')}
                className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* Guided Installation Modal (iOS Safari & Fallback Browsers) */}
      {guideOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-guide-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-3 backdrop-blur-xs sm:items-center sm:p-4"
        >
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 bg-[#0E2640] px-5 py-4 text-white">
              <div className="flex items-center gap-3">
                <img
                  src="/pwa-192x192.png"
                  alt="Malosha Forums"
                  className="h-10 w-10 rounded-xl ring-1 ring-white/25"
                />
                <div>
                  <h2 id="pwa-guide-title" className="font-display text-base font-bold text-white">
                    {tr('Sakinisha Malosha Forums', 'Install Malosha Forums')}
                  </h2>
                  <p className="text-xs text-slate-300">
                    {isIOS
                      ? tr('Kwa watumiaji wa iPhone / iPad (Safari)', 'For iPhone / iPad (Safari)')
                      : tr('Hatua za haraka kwenye kivinjari chako', 'Quick steps in your browser')}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeGuide}
                aria-label={tr('Funga', 'Close')}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-4 p-5 text-sm text-slate-700">
              {isIOS ? (
                <ol className="space-y-3">
                  <li className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#0E2640] text-xs font-bold text-amber-400">
                      1
                    </span>
                    <div className="flex-1">
                      <p className="font-semibold text-slate-900">
                        {tr('Gusa kitufe cha Share', 'Tap the Share button')}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-600">
                        <Share className="h-3.5 w-3.5 text-[#1D4E89]" aria-hidden="true" />
                        <span>
                          {tr(
                            'Kipo chini katikati ya skrini ya Safari.',
                            'Located at the bottom toolbar of Safari.'
                          )}
                        </span>
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#0E2640] text-xs font-bold text-amber-400">
                      2
                    </span>
                    <div className="flex-1">
                      <p className="font-semibold text-slate-900">
                        {tr('Chagua "Add to Home Screen"', 'Tap "Add to Home Screen"')}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-600">
                        {tr(
                          'Kisha gusa "Add" ili app icon ya Malosha ionekane kwenye simu yako.',
                          'Then tap "Add" to place the Malosha app icon on your home screen.'
                        )}
                      </p>
                    </div>
                  </li>
                </ol>
              ) : (
                <ol className="space-y-3">
                  <li className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#0E2640] text-xs font-bold text-amber-400">
                      1
                    </span>
                    <div className="flex-1">
                      <p className="font-semibold text-slate-900">
                        {tr('Fungua menyu ya kivinjari', 'Open your browser menu')}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-600">
                        <MoreVertical className="h-3.5 w-3.5 text-[#1D4E89]" aria-hidden="true" />
                        <span>
                          {tr(
                            'Gusa alama ya nukta tatu juu kulia (au fungua kupitia Chrome).',
                            'Tap the three-dot menu icon in Chrome or Edge.'
                          )}
                        </span>
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#0E2640] text-xs font-bold text-amber-400">
                      2
                    </span>
                    <div className="flex-1">
                      <p className="font-semibold text-slate-900">
                        {tr('Chagua "Install app" au "Add to Home screen"', 'Select "Install app" or "Add to Home screen"')}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-600">
                        <Smartphone className="h-3.5 w-3.5 text-[#D97706]" aria-hidden="true" />
                        <span>
                          {tr(
                            'Malosha Forums itasakinishwa na icon yake kamili.',
                            'Malosha Forums will install directly with its app icon.'
                          )}
                        </span>
                      </p>
                    </div>
                  </li>
                </ol>
              )}

              <button
                type="button"
                onClick={closeGuide}
                className="flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[#0E2640] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#163A5F]"
              >
                {tr('Nimeelewa', 'Got it')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
