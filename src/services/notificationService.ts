const PHONE_ALERTS_PREF_KEY = 'malosha_phone_notifications_enabled_v1';

export type PhoneNotificationPermission = NotificationPermission | 'unsupported';

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

export interface PhoneNotificationPayload {
  title: string;
  body: string;
  topicId?: string;
  url?: string;
  tag?: string;
}

export async function sendPhoneNotification(
  payload: PhoneNotificationPayload
): Promise<boolean> {
  if (!isNotificationSupported()) return false;
  if (window.Notification.permission !== 'granted') return false;
  if (!isPhoneAlertsEnabled()) return false;

  const targetUrl =
    payload.url ||
    (payload.topicId ? `/?mada=${encodeURIComponent(payload.topicId)}` : '/');

  const options: NotificationOptions = {
    body: payload.body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: payload.tag || (payload.topicId ? `malosha-topic-${payload.topicId}` : 'malosha-update'),
    data: { url: targetUrl },
  };

  try {
    if ('serviceWorker' in navigator) {
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 1500)),
      ]);
      if (registration && typeof registration.showNotification === 'function') {
        await registration.showNotification(payload.title, options);
        return true;
      }
    }
  } catch {
    // Fall back to standard Notification constructor below
  }

  try {
    const notif = new window.Notification(payload.title, options);
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

export async function dismissPhoneNotifications(tag?: string): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 1000)),
    ]);
    if (!registration || typeof registration.getNotifications !== 'function') return;
    const notifications = await registration.getNotifications(tag ? { tag } : undefined);
    notifications.forEach((n) => n.close());
  } catch {
    // Ignore unsupported getNotifications environments
  }
}
