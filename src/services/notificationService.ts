const PHONE_ALERTS_PREF_KEY = 'malosha_phone_notifications_enabled_v1';

export type PhoneNotificationPermission = NotificationPermission | 'unsupported';

export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return (
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

export function isMobileDeviceContext(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  return (
    /android|iphone|ipad|ipod|mobile/i.test(ua) ||
    window.innerWidth < 768 ||
    isStandalonePWA()
  );
}

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): PhoneNotificationPermission {
  if (!isNotificationSupported()) return 'unsupported';
  return window.Notification.permission;
}

export function isPhoneAlertsEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(PHONE_ALERTS_PREF_KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
}

export function setPhoneAlertsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PHONE_ALERTS_PREF_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage failures
  }
}

export async function requestPhoneNotificationPermission(): Promise<PhoneNotificationPermission> {
  if (!isNotificationSupported()) return 'unsupported';
  try {
    const result = await window.Notification.requestPermission();
    if (result === 'granted') {
      setPhoneAlertsEnabled(true);
    }
    return result;
  } catch {
    return getNotificationPermission();
  }
}

async function getActiveServiceWorkerRegistration(
  timeoutMs = 1200
): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration('/');
    if (existing && (existing.active || existing.waiting || existing.installing)) {
      return existing;
    }
  } catch {
    // Fallback to ready race below
  }
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), timeoutMs)),
    ]);
  } catch {
    return null;
  }
}

const BASE_DOCUMENT_TITLE = 'Malosha Forums — Jukwaa la Kiswahili';

export async function updateAppBadgeCount(
  rawCount: number,
  options?: { updateTitle?: boolean }
): Promise<void> {
  if (typeof window === 'undefined') return;
  const count = Number.isFinite(rawCount) ? Math.max(0, Math.min(999, Math.round(rawCount))) : 0;

  if (typeof document !== 'undefined' && options?.updateTitle !== false) {
    document.title = count > 0 ? `(${count}) ${BASE_DOCUMENT_TITLE}` : BASE_DOCUMENT_TITLE;
  }

  try {
    const nav = navigator as Navigator & {
      setAppBadge?: (contents?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (typeof nav.setAppBadge === 'function') {
      if (count > 0) {
        await nav.setAppBadge(count);
      } else if (typeof nav.clearAppBadge === 'function') {
        await nav.clearAppBadge();
      } else {
        await nav.setAppBadge(0);
      }
    }
  } catch {
    // Badging API may be restricted in non-installed contexts
  }

  try {
    if ('serviceWorker' in navigator) {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'SET_BADGE', count });
      }
      const reg = await getActiveServiceWorkerRegistration(600);
      if (reg?.active) {
        reg.active.postMessage({ type: 'SET_BADGE', count });
      }
    }
  } catch {
    // Ignore SW message errors
  }
}

export interface PhoneNotificationPayload {
  title: string;
  body: string;
  topicId?: string;
  url?: string;
  tag?: string;
  badgeCount?: number;
  silent?: boolean;
  renotify?: boolean;
}

export async function sendPhoneNotification(
  payload: PhoneNotificationPayload
): Promise<boolean> {
  if (typeof payload.badgeCount === 'number') {
    void updateAppBadgeCount(payload.badgeCount);
  }
  if (!isNotificationSupported()) return false;
  if (window.Notification.permission !== 'granted') return false;
  if (!isPhoneAlertsEnabled()) return false;

  const targetUrl =
    payload.url ||
    (payload.topicId ? `/?mada=${encodeURIComponent(payload.topicId)}` : '/');

  const swOptions: NotificationOptions & {
    renotify?: boolean;
    vibrate?: number[];
  } = {
    body: payload.body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: payload.tag || (payload.topicId ? `malosha-topic-${payload.topicId}` : 'malosha-update'),
    renotify: payload.renotify ?? true,
    silent: Boolean(payload.silent),
    vibrate: payload.silent ? undefined : [180, 90, 180],
    requireInteraction: false,
    data: { url: targetUrl },
  };

  try {
    const registration = await getActiveServiceWorkerRegistration(1400);
    if (registration && typeof registration.showNotification === 'function') {
      await registration.showNotification(payload.title, swOptions);
      return true;
    }
  } catch {
    // Fall back to standard Notification constructor below
  }

  try {
    const basicOptions: NotificationOptions = {
      body: payload.body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: swOptions.tag,
      silent: Boolean(payload.silent),
      data: { url: targetUrl },
    };
    const notif = new window.Notification(payload.title, basicOptions);
    notif.onclick = () => {
      window.focus();
      if (payload.topicId || payload.url) {
        window.history.replaceState({}, '', targetUrl);
      }
      notif.close();
    };
    return true;
  } catch {
    return false;
  }
}

export async function syncBackgroundSummaryNotification(
  unreadCount: number,
  summaryText: string,
  options?: { renotify?: boolean }
): Promise<void> {
  if (unreadCount <= 0) {
    await dismissPhoneNotifications('malosha-unread-summary');
    return;
  }
  if (!isNotificationSupported() || window.Notification.permission !== 'granted') return;
  if (!isPhoneAlertsEnabled()) return;

  try {
    const registration = await getActiveServiceWorkerRegistration(1000);
    if (!registration || typeof registration.showNotification !== 'function') return;
    await registration.showNotification(`Malosha Forums (${unreadCount})`, {
      body: summaryText,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: 'malosha-unread-summary',
      renotify: Boolean(options?.renotify),
      silent: !options?.renotify,
      requireInteraction: false,
      data: { url: '/' },
    } as NotificationOptions & { renotify?: boolean });
  } catch {
    // Ignore unsupported SW summary notifications
  }
}

export async function dismissPhoneNotifications(tag?: string): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    if (!tag && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'DISMISS_ALL_NOTIFICATIONS' });
    }
    const registration = await getActiveServiceWorkerRegistration(900);
    if (!registration) return;
    if (!tag && registration.active) {
      registration.active.postMessage({ type: 'DISMISS_ALL_NOTIFICATIONS' });
    }
    if (typeof registration.getNotifications === 'function') {
      const notifications = await registration.getNotifications(tag ? { tag } : undefined);
      notifications.forEach((n) => n.close());
    }
  } catch {
    // Ignore unsupported getNotifications environments
  }
}
