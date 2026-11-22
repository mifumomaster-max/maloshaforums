import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  BellOff,
  BellRing,
  CheckCheck,
  ChevronRight,
  CornerDownRight,
  Globe,
  Lock,
  LogOut,
  MessageSquare,
  Newspaper,
  ShieldAlert,
  Sparkles,
  User as UserIcon,
  UserPlus,
  X,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import {
  NavTab,
  NavUnreadCounts,
  Topic,
  UserNotification,
  UserProfile,
  getMakalaSection,
  normalizeBoardCategory,
  resolveMakalaCover,
} from '../types';
import { optimizeCloudinaryUrl } from '../services/cloudinaryService';
import {
  PhoneNotificationPermission,
  getNotificationPermission,
  isNotificationSupported,
  isPhoneAlertsEnabled,
  requestPhoneNotificationPermission,
  sendPhoneNotification,
  setPhoneAlertsEnabled,
} from '../services/notificationService';
import { Avatar, OnlineStatusPill } from './Avatar';
import { NavIconSection, NavSectionIcon } from './NavIcons';
import { AuthorVerificationBadge, VerificationBadge } from './VerificationBadge';

interface HeaderProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenTopic: (topicId: string) => void;
  topics: Topic[];
  userUid: string | null;
  userProfile: UserProfile | null;
  userDisplayName: string;
  userPhoto: string;
  isAdmin: boolean;
  isSuspended?: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  authBusy: boolean;
  onToast?: (message: string, kind?: 'success' | 'error') => void;
  unreadCounts?: NavUnreadCounts;
  unreadChatCount?: number;
  userNotifications?: UserNotification[];
  onMarkNotificationRead?: (notificationId: string) => void | Promise<void>;
  onMarkAllNotificationsRead?: (notificationIds: string[]) => void | Promise<void>;
  hideVideoTab?: boolean;
  recentSignups?: UserProfile[];
  unreadSignupCount?: number;
  signupLastSeenMs?: number;
  onMarkSignupsSeen?: () => void;
  onOpenAdminMembers?: () => void;
}

const NOTIF_READ_IDS_KEY = 'malosha_notif_read_ids_v1';
const NOTIF_READ_TIMESTAMPS_KEY = 'malosha_notif_read_ts_v2';
const NOTIF_CLEARED_AT_KEY = 'malosha_notif_cleared_at_v1';
const NOTIF_BANNER_DISMISSED_KEY = 'malosha_notif_banner_dismissed_v1';
const NOTIF_READ_TTL_MS = 24 * 60 * 60 * 1000;

const GoogleGIcon: React.FC = () => (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
    />
    <path
      fill="#FBBC05"
      d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
    />
  </svg>
);

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  onOpenTopic,
  topics,
  userUid,
  userProfile,
  userDisplayName,
  userPhoto,
  isAdmin,
  isSuspended = false,
  onSignIn,
  onSignOut,
  authBusy,
  onToast,
  unreadCounts,
  unreadChatCount = 0,
  userNotifications = [],
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  hideVideoTab = false,
  recentSignups = [],
  unreadSignupCount = 0,
  signupLastSeenMs = 0,
  onMarkSignupsSeen,
  onOpenAdminMembers,
}) => {
  const { lang, setLang, tr, formatTime, getMakalaSectionLabel, getBoardLabel } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifFilter, setNotifFilter] = useState<'replies' | 'news' | 'signups' | 'all'>('replies');
  const [notifPermission, setNotifPermission] = useState<PhoneNotificationPermission>(() =>
    getNotificationPermission()
  );
  const [phoneAlertsOn, setPhoneAlertsOn] = useState<boolean>(() => isPhoneAlertsEnabled());
  const [notifBannerDismissed, setNotifBannerDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      return window.localStorage.getItem(NOTIF_BANNER_DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const fixedHeaderRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = fixedHeaderRef.current;
    if (!el || typeof window === 'undefined') return;

    const updateHeaderHeightVar = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (h > 0) {
        document.documentElement.style.setProperty('--malosha-header-h', `${h}px`);
      }
    };

    updateHeaderHeightVar();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateHeaderHeightVar);
      ro.observe(el);
      window.addEventListener('resize', updateHeaderHeightVar);
      return () => {
        ro.disconnect();
        window.removeEventListener('resize', updateHeaderHeightVar);
      };
    }

    window.addEventListener('resize', updateHeaderHeightVar);
    return () => window.removeEventListener('resize', updateHeaderHeightVar);
  }, []);

  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const [readTimestamps, setReadTimestamps] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return {};
    const map: Record<string, number> = {};
    try {
      const rawV2 = window.localStorage.getItem(NOTIF_READ_TIMESTAMPS_KEY);
      if (rawV2) {
        const parsed = JSON.parse(rawV2) as Record<string, unknown>;
        if (parsed && typeof parsed === 'object') {
          Object.entries(parsed).forEach(([k, v]) => {
            if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
              map[k] = v;
            }
          });
        }
      }
      const rawLegacy = window.localStorage.getItem(NOTIF_READ_IDS_KEY);
      if (rawLegacy) {
        const parsedLegacy = JSON.parse(rawLegacy);
        if (Array.isArray(parsedLegacy)) {
          const fallbackTs = Date.now();
          parsedLegacy.forEach((id) => {
            if (typeof id === 'string' && !map[id]) {
              map[id] = fallbackTs;
            }
          });
          window.localStorage.setItem(NOTIF_READ_TIMESTAMPS_KEY, JSON.stringify(map));
          window.localStorage.removeItem(NOTIF_READ_IDS_KEY);
        }
      }
    } catch {
      return map;
    }
    return map;
  });

  const [clearedAtMs, setClearedAtMs] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    try {
      const raw = window.localStorage.getItem(NOTIF_CLEARED_AT_KEY);
      const n = Number(raw || 0);
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  });

  // Prune deleted/removed topic IDs from readTimestamps cache to keep storage clean
  useEffect(() => {
    if (topics.length === 0) return;
    const topicIdsSet = new Set(topics.map((t) => t.id));
    setReadTimestamps((prev) => {
      const keys = Object.keys(prev);
      const hasOrphan = keys.some((k) => !topicIdsSet.has(k));
      if (!hasOrphan) return prev;
      const next: Record<string, number> = {};
      keys.forEach((k) => {
        if (topicIdsSet.has(k)) next[k] = prev[k];
      });
      try {
        window.localStorage.setItem(NOTIF_READ_TIMESTAMPS_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, [topics]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const getTopicReadAtMs = (topic: Topic): number | null => {
    const explicit = readTimestamps[topic.id];
    if (typeof explicit === 'number' && explicit > 0) return explicit;
    const createdMs = topic.createdAt ? topic.createdAt.toMillis() : nowMs;
    if (clearedAtMs > 0 && createdMs <= clearedAtMs) return clearedAtMs;
    return null;
  };

  const isUnread = (topic: Topic) => getTopicReadAtMs(topic) === null;

  const isExpiredReadTopic = (topic: Topic) => {
    const readAt = getTopicReadAtMs(topic);
    return readAt !== null && nowMs - readAt >= NOTIF_READ_TTL_MS;
  };

  const newsNotifications = useMemo(() => {
    return topics
      .filter((t) => normalizeBoardCategory(t.category) === 'Makala' && !isExpiredReadTopic(t))
      .sort((a, b) => {
        const am = a.createdAt ? a.createdAt.toMillis() : Date.now();
        const bm = b.createdAt ? b.createdAt.toMillis() : Date.now();
        return bm - am;
      })
      .slice(0, 20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topics, readTimestamps, clearedAtMs, nowMs]);

  const allNotifications = useMemo(() => {
    return topics
      .filter((t) => !isExpiredReadTopic(t))
      .sort((a, b) => {
        const am = a.createdAt ? a.createdAt.toMillis() : Date.now();
        const bm = b.createdAt ? b.createdAt.toMillis() : Date.now();
        return bm - am;
      })
      .slice(0, 20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topics, readTimestamps, clearedAtMs, nowMs]);

  const visibleUserNotifications = useMemo(() => {
    return userNotifications.filter((n) => {
      if (!n.isRead) return true;
      const readMs = n.readAt
        ? n.readAt.toMillis()
        : n.createdAt
          ? n.createdAt.toMillis()
          : 0;
      return readMs === 0 || nowMs - readMs < NOTIF_READ_TTL_MS;
    });
  }, [userNotifications, nowMs]);

  const unreadNewsCount = useMemo(() => {
    return newsNotifications.filter((t) => isUnread(t)).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newsNotifications, readTimestamps, clearedAtMs]);

  const unreadReplyIds = useMemo(
    () => visibleUserNotifications.filter((n) => !n.isRead).map((n) => n.id),
    [visibleUserNotifications]
  );
  const unreadRepliesCount = unreadReplyIds.length;
  const activeUnreadSignupCount = isAdmin ? unreadSignupCount : 0;
  const totalBellUnreadCount = unreadRepliesCount + unreadNewsCount + activeUnreadSignupCount;

  const visibleNewsOrTopics = notifFilter === 'news' ? newsNotifications : allNotifications;

  const markItemRead = (topicId: string) => {
    const now = Date.now();
    setReadTimestamps((prev) => {
      if (prev[topicId]) return prev;
      const next = { ...prev, [topicId]: now };
      try {
        window.localStorage.setItem(NOTIF_READ_TIMESTAMPS_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage failure
      }
      return next;
    });
  };

  const markAllRead = () => {
    const now = Date.now();
    setClearedAtMs(now);
    const nextMap = { ...readTimestamps };
    allNotifications.forEach((t) => {
      if (!nextMap[t.id]) nextMap[t.id] = now;
    });
    setReadTimestamps(nextMap);
    try {
      window.localStorage.setItem(NOTIF_CLEARED_AT_KEY, String(now));
      window.localStorage.setItem(NOTIF_READ_TIMESTAMPS_KEY, JSON.stringify(nextMap));
    } catch {
      // Ignore storage failure
    }
    if (unreadReplyIds.length > 0 && onMarkAllNotificationsRead) {
      void onMarkAllNotificationsRead(unreadReplyIds);
    }
    if (isAdmin && onMarkSignupsSeen) {
      onMarkSignupsSeen();
    }
  };

  const handleEnablePhoneAlerts = async () => {
    if (!isNotificationSupported()) {
      onToast?.(
        tr(
          'Kifaa au kivinjari hiki hakiauni arifa za moja kwa moja.',
          'This device or browser does not support push notifications.'
        ),
        'error'
      );
      return;
    }

    if (notifPermission === 'granted') {
      const next = !phoneAlertsOn;
      setPhoneAlertsEnabled(next);
      setPhoneAlertsOn(next);
      onToast?.(
        next
          ? tr('Arifa za simu zimewashwa!', 'Phone notifications enabled!')
          : tr('Arifa za simu zimezimwa.', 'Phone notifications paused.')
      );
      return;
    }

    const result = await requestPhoneNotificationPermission();
    setNotifPermission(result);
    if (result === 'granted') {
      setPhoneAlertsOn(true);
      onToast?.(
        tr(
          'Safi! Utapata arifa kwenye simu kila taarifa mpya ikichapishwa.',
          'All set! You will receive phone notifications for new posts.'
        )
      );
      void sendPhoneNotification({
        title: 'Malosha Forums',
        body: tr(
          'Arifa za simu zimewashwa kikamilifu! Utapata taarifa mpya papo hapo.',
          'Phone notifications are active! You will get updates right away.'
        ),
        tag: 'malosha-welcome-alert',
      });
    } else if (result === 'denied') {
      onToast?.(
        tr(
          'Ruhusa imezuiwa kwenye simu. Fungua Settings ya App au Browser kisha ruhusu Notifications.',
          'Permission blocked. Open App/Browser Settings and allow Notifications.'
        ),
        'error'
      );
    }
  };

  const activeMemberName = (userProfile?.displayName || userDisplayName || '').trim();
  const welcomePersonLabel = userUid
    ? activeMemberName || tr('Mwanachama', 'Member')
    : tr('Karibu Mgeni', 'Welcome Guest');

  const counts: NavUnreadCounts = unreadCounts || {
    kijiweni: 0,
    video: 0,
    fursa: 0,
    makala: 0,
    chat: unreadChatCount,
  };

  const allNavItems: {
    id: NavTab;
    iconSection: NavIconSection;
    label: string;
    unread: number;
    badgeTone: 'crimson' | 'green';
  }[] = [
    {
      id: 'kijiweni',
      iconSection: 'kijiweni',
      label: 'Kijiweni',
      unread: counts.kijiweni,
      badgeTone: 'crimson',
    },
    {
      id: 'video',
      iconSection: 'video',
      label: 'Video',
      unread: counts.video || 0,
      badgeTone: 'crimson',
    },
    {
      id: 'fursa',
      iconSection: 'fursa',
      label: tr('Fursa', 'Opportunities'),
      unread: counts.fursa,
      badgeTone: 'crimson',
    },
    {
      id: 'makala',
      iconSection: 'makala',
      label: tr('Makala', 'Articles'),
      unread: counts.makala,
      badgeTone: 'crimson',
    },
    {
      id: 'chat',
      iconSection: 'chat',
      label: 'Mchart',
      unread: counts.chat,
      badgeTone: 'green',
    },
    {
      id: 'votes',
      iconSection: 'votes',
      label: 'Mpoll',
      unread: counts.votes || 0,
      badgeTone: 'crimson',
    },
  ];

  const navItems = hideVideoTab
    ? allNavItems.filter((item) => item.id !== 'video')
    : allNavItems;

  return (
    <header
      ref={fixedHeaderRef}
      className="fixed inset-x-0 top-0 z-40 transform-gpu border-b border-white/10 bg-gradient-to-b from-[#0A1E33] via-[#0E2640] to-[#123050] text-white shadow-[0_4px_20px_rgba(10,25,47,0.22)] will-change-transform"
    >
      {/* Crisp Editorial Top Accent Line */}
      <div
        className="h-[3px] w-full bg-gradient-to-r from-[#D97706] via-[#F59E0B] to-[#38BDF8]"
        aria-hidden="true"
      />

      {/* Centered Compact Welcome Strip + Youth Handshake-to-Name Animation */}
      <div className="relative overflow-hidden border-b border-white/10 bg-gradient-to-r from-[#061322] via-[#0B2239] to-[#061322] px-3 py-1 text-center">
        <p className="text-[10.5px] font-extrabold tracking-[0.14em] text-amber-300 uppercase sm:text-[11.5px]">
          Welcome to Malosha Forums
        </p>

        {/* Animated Stage: Two Young People Shaking Hands -> Parting Out -> Signed-in User Name Appears */}
        <div className="relative mx-auto mt-0.5 flex h-[24px] w-full max-w-[300px] items-center justify-center overflow-hidden">
          {/* Youth Pair Shaking Hands */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            {/* Left Young Person */}
            <svg
              width="34"
              height="24"
              viewBox="0 0 36 26"
              fill="none"
              className="animate-malosha-youth-left -mr-2 will-change-transform"
            >
              {/* Head */}
              <circle cx="13" cy="6.2" r="3.4" fill="#FDE68A" />
              <path d="M9.7 5.5C10.2 3.2 12.6 2.3 15 3.1C16 3.5 16.4 4.4 16.4 5.2C14.3 4.4 11.7 4.4 9.7 5.5Z" fill="#0F172A" />
              {/* Shirt / Jacket */}
              <path d="M6.8 22C7.2 14.5 9.8 11.2 13.4 11.2C16.8 11.2 18.8 13.6 19.4 22H6.8Z" fill="#38BDF8" />
              {/* Extended Handshake Arm */}
              <path d="M16.8 13.8L31.5 14.8" stroke="#FDE68A" strokeWidth="2.8" strokeLinecap="round" />
            </svg>

            {/* Central Handshake Clasp & Spark */}
            <div className="animate-malosha-handshake-clasp relative z-10 flex items-center justify-center">
              <span className="h-3 w-3 rounded-full bg-amber-300/35 blur-[2px]" />
              <span className="absolute h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.95)]" />
            </div>

            {/* Right Young Person */}
            <svg
              width="34"
              height="24"
              viewBox="0 0 36 26"
              fill="none"
              className="animate-malosha-youth-right -ml-2 will-change-transform"
            >
              {/* Head */}
              <circle cx="23" cy="6.2" r="3.4" fill="#FCD34D" />
              <path d="M19.5 5.4C19.8 3.1 22.3 2.2 24.8 3C26.1 3.5 26.6 4.5 26.4 5.4C24.4 4.5 21.7 4.5 19.5 5.4Z" fill="#1E293B" />
              {/* Shirt / Jacket */}
              <path d="M16.6 22C17.2 13.6 19.2 11.2 22.6 11.2C26.2 11.2 28.8 14.5 29.2 22H16.6Z" fill="#F59E0B" />
              {/* Extended Handshake Arm */}
              <path d="M19.2 13.8L4.5 14.8" stroke="#FCD34D" strokeWidth="2.8" strokeLinecap="round" />
            </svg>
          </div>

          {/* Signed-in User Name Revealed in Center After Youths Exit */}
          <div className="animate-malosha-welcome-name relative z-10 flex max-w-full items-center justify-center gap-1.5 px-2 will-change-transform">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]"
              aria-hidden="true"
            />
            <span className="truncate text-[11.5px] font-bold tracking-tight text-white sm:text-xs">
              {userUid
                ? tr(`Karibu, ${welcomePersonLabel}`, `Welcome, ${welcomePersonLabel}`)
                : welcomePersonLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Primary Fixed Navigation Bar */}
      <div className="mx-auto flex h-[50px] max-w-6xl items-center justify-between gap-2 px-3 sm:h-[54px] sm:gap-5 sm:px-6">
        {/* Zone 1: Geometric Brand Emblem + Single-line Wordmark */}
        <button
          type="button"
          onClick={() => onSelectTab('kijiweni')}
          className="group flex items-center gap-2 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300 sm:gap-2.5"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#F59E0B] to-[#D97706] text-white shadow-sm ring-1 ring-white/20 transition-transform group-hover:scale-[1.03] sm:h-9 sm:w-9">
            <svg className="h-4 w-4 sm:h-[18px] sm:w-[18px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4 6.5C4 5.12 5.12 4 6.5 4h11C18.88 4 20 5.12 20 6.5v7.5c0 1.38-1.12 2.5-2.5 2.5H10l-4.5 3.5V16.5H6.5C5.12 16.5 4 15.38 4 14V6.5Z"
                fill="currentColor"
              />
              <circle cx="9" cy="10.25" r="1.25" fill="#0E2640" />
              <circle cx="12" cy="10.25" r="1.25" fill="#0E2640" />
              <circle cx="15" cy="10.25" r="1.25" fill="#0E2640" />
            </svg>
          </span>
          <span className="font-display text-[15.5px] font-bold tracking-tight text-white sm:text-xl">
            Malosha Forums
          </span>
        </button>

        {/* Zone 2: Desktop Single-Line Navigation Links with Modern Colored Icons & Unread Counts */}
        <nav
          aria-label={tr('Urambazaji mkuu', 'Main navigation')}
          className="hidden md:flex items-center gap-2 lg:gap-4 text-sm font-medium"
        >
          {navItems.map((item) => {
            const active = activeTab === item.id;
            const showBadge = item.unread > 0 && !active;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`relative inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 whitespace-nowrap shrink-0 transition-all focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300 lg:px-2 ${
                  active
                    ? 'bg-white/12 font-semibold text-white'
                    : 'text-slate-200 hover:bg-white/8 hover:text-white'
                }`}
              >
                <NavSectionIcon section={item.iconSection} className="h-[19px] w-[19px] shrink-0" />
                <span>{item.label}</span>
                {showBadge && (
                  <span
                    className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-extrabold leading-none tabular-nums shadow-sm ${
                      item.badgeTone === 'green'
                        ? 'bg-[#25D366] text-[#052e27]'
                        : 'bg-[#E11D48] text-white'
                    }`}
                  >
                    {item.unread > 99 ? '99+' : item.unread}
                  </span>
                )}
                {active && (
                  <span
                    className="absolute right-1.5 -bottom-[7px] left-1.5 h-0.5 rounded-full bg-amber-400"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 2B: Centered Notification Bell */}
        <div className="flex flex-1 items-center justify-center gap-2 md:flex-none md:mr-3 lg:mr-5">
          {/* Notification Bell (Facebook-Style Replies + News Alerts + Owner Signups) */}
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => {
                setNotifOpen((prev) => {
                  const next = !prev;
                  if (next) {
                    if (isAdmin && activeUnreadSignupCount > 0 && unreadRepliesCount === 0) {
                      setNotifFilter('signups');
                    } else if (unreadRepliesCount > 0 || (userUid && userNotifications.length > 0)) {
                      setNotifFilter('replies');
                    } else if (unreadNewsCount > 0) {
                      setNotifFilter('news');
                    }
                  }
                  return next;
                });
                setMenuOpen(false);
              }}
              aria-label={tr('Arifa za majibu na habari', 'Reply and news notifications')}
              aria-expanded={notifOpen}
              className={`relative flex h-10 w-10 items-center justify-center rounded-xl border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 ${
                notifOpen
                  ? 'border-amber-400/60 bg-white/20 text-white'
                  : 'border-white/15 bg-white/10 text-slate-100 hover:bg-white/20 hover:text-white'
              }`}
            >
              <Bell className="h-[19px] w-[19px]" aria-hidden="true" />
              {totalBellUnreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#E11D48] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-[#0E2640] tabular-nums">
                  {totalBellUnreadCount > 99 ? '99+' : totalBellUnreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div
                role="dialog"
                aria-label={tr('Kituo cha Arifa', 'Notifications Center')}
                className="fixed inset-x-3 top-[calc(var(--malosha-header-h,106px)+8px)] z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl sm:absolute sm:inset-x-auto sm:top-full sm:left-1/2 sm:-translate-x-1/2 sm:mt-2.5 sm:w-[400px] md:left-auto md:right-0 md:translate-x-0"
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-[#1877F2]" aria-hidden="true" />
                    <h2 className="text-sm font-bold text-slate-900">
                      {tr('Arifa Zako', 'Notifications')}
                    </h2>
                    {totalBellUnreadCount > 0 && (
                      <span className="text-xs font-semibold text-[#E11D48] tabular-nums">
                        ({totalBellUnreadCount} {tr('mpya', 'new')})
                      </span>
                    )}
                  </div>
                  {(userNotifications.length > 0 ||
                    visibleNewsOrTopics.length > 0 ||
                    (isAdmin && activeUnreadSignupCount > 0)) && (
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-[#1D4E89] transition-colors hover:bg-sky-50"
                    >
                      <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{tr('Zimesomwa zote', 'Mark all read')}</span>
                    </button>
                  )}
                </div>

                {/* Filter Tabs: Majibu (Replies) vs Habari vs Usajili (Owner) vs Zote */}
                <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 bg-white px-4 py-2">
                  <button
                    type="button"
                    onClick={() => setNotifFilter('replies')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                      notifFilter === 'replies'
                        ? 'bg-[#1877F2] text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span>{tr('Majibu', 'Replies')}</span>
                    {unreadRepliesCount > 0 && (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums ${
                          notifFilter === 'replies'
                            ? 'bg-white text-[#1877F2]'
                            : 'bg-[#E11D48] text-white'
                        }`}
                      >
                        {unreadRepliesCount}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotifFilter('news')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                      notifFilter === 'news'
                        ? 'bg-[#B80000] text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span>{tr('Habari', 'News')}</span>
                    {unreadNewsCount > 0 && (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums ${
                          notifFilter === 'news'
                            ? 'bg-white text-[#B80000]'
                            : 'bg-[#B80000] text-white'
                        }`}
                      >
                        {unreadNewsCount}
                      </span>
                    )}
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setNotifFilter('signups')}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                        notifFilter === 'signups'
                          ? 'bg-emerald-700 text-white'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <UserPlus className="h-3 w-3" aria-hidden="true" />
                      <span>{tr('Usajili', 'Signups')}</span>
                      {activeUnreadSignupCount > 0 && (
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums ${
                            notifFilter === 'signups'
                              ? 'bg-white text-emerald-800'
                              : 'bg-emerald-600 text-white'
                          }`}
                        >
                          {activeUnreadSignupCount}
                        </span>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setNotifFilter('all')}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                      notifFilter === 'all'
                        ? 'bg-[#163A5F] text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {tr('Zote', 'All')}
                  </button>
                </div>

                {/* Native Phone Notification Enable / Toggle Bar */}
                {isNotificationSupported() && (
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-sky-50/75 px-4 py-2.5 text-xs">
                    <div className="flex min-w-0 items-start gap-2 text-[#163A5F]">
                      {notifPermission === 'granted' && phoneAlertsOn ? (
                        <BellRing className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden="true" />
                      ) : (
                        <BellOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-semibold">
                          {notifPermission === 'granted' && phoneAlertsOn
                            ? tr(
                                'Arifa za skrini na namba ya App zimewashwa',
                                'Screen alerts & App icon badge active'
                              )
                            : notifPermission === 'denied'
                              ? tr('Arifa zimezuiwa kwenye Settings', 'Blocked in Settings')
                              : tr(
                                  'Washa arifa juu ya skrini na namba kwenye icon',
                                  'Enable screen alerts & App badge counter'
                                )}
                        </p>
                        <p className="truncate text-[10.5px] text-slate-500">
                          {tr(
                            'Utaona taarifa juu ya simu kama Facebook hata App ikiwa imefungwa',
                            'See alerts at top of screen like Facebook even when closed'
                          )}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleEnablePhoneAlerts()}
                      className={`min-h-[30px] shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                        notifPermission === 'granted' && phoneAlertsOn
                          ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                          : 'bg-[#0E2640] text-white hover:bg-[#163A5F]'
                      }`}
                    >
                      {notifPermission === 'granted'
                        ? phoneAlertsOn
                          ? tr('Zima', 'Mute')
                          : tr('Washa', 'Enable')
                        : tr('Washa Arifa', 'Enable')}
                    </button>
                  </div>
                )}

                {/* Notification List */}
                <div className="max-h-[360px] divide-y divide-slate-100 overflow-y-auto">
                  {notifFilter === 'replies' ? (
                    !userUid ? (
                      <div className="px-5 py-8 text-center">
                        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-sky-50 text-[#1877F2]">
                          <MessageSquare className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <p className="mt-3 text-sm font-semibold text-slate-800">
                          {tr(
                            'Ingia ili upate arifa za majibu ya maoni',
                            'Sign in to get comment reply alerts'
                          )}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {tr(
                            'Mtu akijibu maoni yako kwenye mada yoyote, utaona arifa hapa papo hapo.',
                            'Whenever someone replies to your comment, an alert will appear right here.'
                          )}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setNotifOpen(false);
                            onSignIn();
                          }}
                          className="mt-3 inline-flex min-h-[36px] items-center rounded-lg bg-[#1877F2] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#166FE5]"
                        >
                          {tr('Ingia / Jisajili', 'Sign In / Register')}
                        </button>
                      </div>
                    ) : visibleUserNotifications.length === 0 ? (
                      <div className="px-5 py-9 text-center">
                        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                          <CornerDownRight className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <p className="mt-3 text-sm font-semibold text-slate-800">
                          {tr('Bado huna arifa za majibu', 'No reply notifications yet')}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {tr(
                            'Mtu akijibu maoni yako au akiacha maoni kwenye chapisho lako, utaarifiwa hapa kama Facebook.',
                            'When someone replies to your comment or comments on your post, you will be notified here.'
                          )}
                        </p>
                      </div>
                    ) : (
                      visibleUserNotifications.map((notif) => {
                        const isModerationAlert =
                          notif.type === 'account_moderation' ||
                          notif.type === 'video_moderation' ||
                          notif.type === 'post_moderation';
                        return (
                        <button
                          key={notif.id}
                          type="button"
                          onClick={() => {
                            if (!notif.isRead) {
                              void onMarkNotificationRead?.(notif.id);
                            }
                            setNotifOpen(false);
                            if (isModerationAlert) {
                              onSelectTab('safety');
                            } else {
                              onOpenTopic(notif.topicId);
                            }
                          }}
                          className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
                            !notif.isRead
                              ? isModerationAlert
                                ? 'bg-rose-50/80'
                                : 'bg-sky-50/75'
                              : 'bg-white'
                          }`}
                        >
                          {/* Facebook-style Avatar + Corner Action Badge */}
                          <div className="relative shrink-0">
                            <Avatar
                              name={notif.actorName}
                              photoURL={notif.actorPhoto}
                              size="md"
                              uid={notif.actorId}
                            />
                            <span
                              className={`absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full text-white ring-2 ring-white ${
                                isModerationAlert
                                  ? 'bg-rose-600'
                                  : notif.type === 'comment_reply'
                                    ? 'bg-[#1877F2]'
                                    : 'bg-[#16A34A]'
                              }`}
                              aria-hidden="true"
                            >
                              {isModerationAlert ? (
                                <ShieldAlert className="h-3 w-3" />
                              ) : notif.type === 'comment_reply' ? (
                                <CornerDownRight className="h-3 w-3" />
                              ) : (
                                <MessageSquare className="h-2.5 w-2.5" />
                              )}
                            </span>
                          </div>

                          <div className="min-w-0 flex-1">
                            {isModerationAlert ? (
                              <>
                                <p className="text-[13px] leading-snug text-slate-900">
                                  <span className="font-bold text-rose-700">
                                    {notif.topicTitle ||
                                      tr('Taarifa ya Usalama', 'Safety Moderation Notice')}
                                  </span>
                                  {Boolean(notif.ruleNumber) && (
                                    <span className="ml-1.5 inline-block rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-extrabold text-rose-800">
                                      {tr(`Kanuni #${notif.ruleNumber}`, `Rule #${notif.ruleNumber}`)}
                                    </span>
                                  )}
                                </p>
                                {(notif.ruleTitle || notif.replyPreview) && (
                                  <p className="mt-1 line-clamp-2 rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-900">
                                    {notif.ruleTitle ? `${notif.ruleTitle}: ` : ''}
                                    {notif.replyPreview}
                                  </p>
                                )}
                              </>
                            ) : (
                              <>
                                <p className="text-[13px] leading-snug text-slate-800">
                                  <span className="font-bold text-slate-900">{notif.actorName}</span>{' '}
                                  <span>
                                    {notif.type === 'comment_reply'
                                      ? tr('alijibu maoni yako kwenye', 'replied to your comment on')
                                      : tr('alitoa maoni kwenye chapisho lako', 'commented on your post')}
                                  </span>{' '}
                                  {notif.topicTitle && (
                                    <span className="font-semibold text-[#163A5F]">
                                      «{notif.topicTitle}»
                                    </span>
                                  )}
                                </p>
                                {notif.replyPreview && (
                                  <p className="mt-1 line-clamp-2 rounded-lg bg-slate-100/80 px-2.5 py-1 text-xs text-slate-600">
                                    “{notif.replyPreview}”
                                  </p>
                                )}
                              </>
                            )}
                            <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                              <span
                                className={`font-semibold ${
                                  isModerationAlert ? 'text-rose-700' : 'text-[#1877F2]'
                                }`}
                              >
                                {isModerationAlert
                                  ? tr('Usalama wa Akaunti', 'Account Safety')
                                  : getBoardLabel(notif.topicCategory)}
                              </span>
                              <span className="text-slate-300">·</span>
                              <span className="text-slate-400">{formatTime(notif.createdAt)}</span>
                            </div>
                          </div>

                          {!notif.isRead && (
                            <span
                              aria-label={tr('Haijasomwa', 'Unread')}
                              className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${
                                isModerationAlert ? 'bg-rose-600' : 'bg-[#1877F2]'
                              }`}
                            />
                          )}
                        </button>
                      );
                      })
                    )
                  ) : notifFilter === 'signups' && isAdmin ? (
                    recentSignups.length === 0 ? (
                      <div className="px-5 py-9 text-center">
                        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                          <UserPlus className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <p className="mt-3 text-sm font-semibold text-slate-800">
                          {tr('Bado hakuna usajili wa hivi karibuni', 'No recent signups yet')}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {tr(
                            'Mwanachama mpya akijisajili kwenye jukwaa, taarifa yake itaonekana hapa papo hapo.',
                            'Whenever a new member registers on the forum, their alert will appear right here.'
                          )}
                        </p>
                      </div>
                    ) : (
                      recentSignups.map((member) => {
                        const createdMs = member.createdAt ? member.createdAt.toMillis() : 0;
                        const isUnreadSignup =
                          member.uid !== userUid && createdMs > signupLastSeenMs;
                        return (
                          <button
                            key={member.uid}
                            type="button"
                            onClick={() => {
                              onMarkSignupsSeen?.();
                              setNotifOpen(false);
                              onOpenAdminMembers?.();
                            }}
                            className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
                              isUnreadSignup ? 'bg-emerald-50/75' : 'bg-white'
                            }`}
                          >
                            <div className="relative shrink-0">
                              <Avatar
                                name={member.displayName}
                                photoURL={member.photoURL}
                                size="md"
                                uid={member.uid}
                              />
                              <span
                                className="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white ring-2 ring-white"
                                aria-hidden="true"
                              >
                                <UserPlus className="h-2.5 w-2.5" />
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="truncate text-[13px] font-bold text-slate-900">
                                  {member.displayName}
                                </span>
                                <VerificationBadge badge={member.verificationBadge} size="xs" />
                                {isUnreadSignup && (
                                  <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                                    {tr('Mpya', 'New')}
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 text-xs text-slate-600">
                                {tr(
                                  'Amejisajili kwenye Malosha Forums · Gusa kumhakiki.',
                                  'Registered on Malosha Forums · Tap to inspect profile.'
                                )}
                              </p>
                              <p className="mt-1 text-[11px] font-semibold text-emerald-700">
                                {member.createdAt ? formatTime(member.createdAt) : tr('Sasa hivi', 'Just now')}
                              </p>
                            </div>
                            {isUnreadSignup && (
                              <span
                                aria-label={tr('Haijasomwa', 'Unread')}
                                className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-600"
                              />
                            )}
                          </button>
                        );
                      })
                    )
                  ) : visibleNewsOrTopics.length === 0 ? (
                    <div className="px-5 py-9 text-center">
                      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                        <Bell className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <p className="mt-3 text-sm font-semibold text-slate-800">
                        {tr('Hakuna arifa mpya za habari', 'No news notifications yet')}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {tr(
                          'Habari na makala mpya zinapochapishwa zitaonekana hapa papo hapo.',
                          'When new news articles are published, alerts will appear here immediately.'
                        )}
                      </p>
                    </div>
                  ) : (
                    visibleNewsOrTopics.map((item) => {
                      const board = normalizeBoardCategory(item.category);
                      const isNews = board === 'Makala';
                      const unread = isUnread(item);
                      const thumb = resolveMakalaCover(item.coverImage);
                      const sectionLabel = isNews
                        ? getMakalaSectionLabel(getMakalaSection(item.tags))
                        : getBoardLabel(board);

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            markItemRead(item.id);
                            setNotifOpen(false);
                            onOpenTopic(item.id);
                          }}
                          className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
                            unread ? 'bg-amber-50/45' : 'bg-white'
                          }`}
                        >
                          {thumb ? (
                            <img
                              src={optimizeCloudinaryUrl(thumb, 128)}
                              alt={item.title}
                              loading="lazy"
                              decoding="async"
                              referrerPolicy="no-referrer"
                              className="h-12 w-12 shrink-0 rounded-lg object-cover border border-slate-200"
                            />
                          ) : (
                            <div
                              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                                isNews
                                  ? 'bg-red-50 text-[#B80000]'
                                  : 'bg-sky-50 text-[#1D4E89]'
                              }`}
                            >
                              {isNews ? (
                                <Newspaper className="h-5 w-5" aria-hidden="true" />
                              ) : (
                                <Sparkles className="h-5 w-5" aria-hidden="true" />
                              )}
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <span
                                className={`font-bold ${
                                  isNews ? 'text-[#B80000]' : 'text-[#1D4E89]'
                                }`}
                              >
                                {sectionLabel}
                              </span>
                              <span className="shrink-0 text-slate-400">
                                {formatTime(item.createdAt)}
                              </span>
                            </div>
                            <p className="mt-0.5 line-clamp-2 text-[13px] font-semibold leading-snug text-slate-900">
                              {item.title.trim() || tr('Chapisho jipya la picha', 'New photo post')}
                            </p>
                            <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                              <span className="truncate font-medium">{item.authorName}</span>
                              <AuthorVerificationBadge uid={item.authorId} size="xs" />
                            </div>
                          </div>

                          {unread && (
                            <span
                              aria-label={tr('Haijasomwa', 'Unread')}
                              className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#B80000]"
                            />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>

                {/* Footer Action & Auto-Cleanup Policy Notice */}
                <div className="border-t border-slate-100 bg-slate-50 px-4 py-2.5 space-y-1.5">
                  <p className="text-[10.5px] leading-snug text-slate-500">
                    {tr(
                      'Arifa zilizosomwa hufutwa kiotomatiki baada ya saa 24; ambazo hazijasomwa hubaki hadi uzisome.',
                      'Read alerts auto-delete after 24h; unread alerts remain until read.'
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setNotifOpen(false);
                      onSelectTab('makala');
                    }}
                    className="flex w-full items-center justify-between rounded-lg py-1 text-xs font-bold text-[#163A5F] transition-colors hover:text-[#B80000]"
                  >
                    <span>{tr('Fungua Chumba cha Habari (Makala)', 'Open Newsroom (Articles)')}</span>
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Zone 3: Dedicated Primary Auth / Account Profile (Clear & Uncluttered) */}
        <div className="flex items-center shrink-0">
          {userUid ? (
            <>
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen((prev) => !prev);
                    setNotifOpen(false);
                  }}
                  aria-label={tr('Menyu ya akaunti', 'Account menu')}
                  aria-expanded={menuOpen}
                  className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full p-0.5 ring-2 ring-white/25 transition-all hover:ring-amber-400/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
                >
                  <Avatar
                    name={userProfile?.displayName || userDisplayName}
                    photoURL={userProfile?.photoURL || userPhoto}
                    size="md"
                    uid={userUid}
                    showOnlineIndicator
                  />
                </button>

                {menuOpen && (
                  <div className="absolute right-0 mt-2.5 w-64 rounded-2xl border border-slate-200 bg-white p-2 text-slate-900 shadow-2xl">
                    <div className="border-b border-slate-100 px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {userProfile?.displayName || userDisplayName}
                        </p>
                        <VerificationBadge badge={userProfile?.verificationBadge} size="sm" />
                        <OnlineStatusPill uid={userUid} />
                      </div>
                      {isSuspended && !isAdmin && (
                        <div className="mt-1 inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-800">
                          <Lock className="h-3 w-3" aria-hidden="true" />
                          <span>{tr('Akaunti Imefungwa', 'Account Closed')}</span>
                        </div>
                      )}
                      {userProfile && userProfile.verificationBadge !== 'none' && (
                        <div className="mt-1">
                          <VerificationBadge
                            badge={userProfile.verificationBadge}
                            size="xs"
                            showLabel
                            fullLabel
                          />
                        </div>
                      )}
                      <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                        {tr('Mada', 'Posts')} {userProfile?.topicsCount ?? 0} ·{' '}
                        {tr('Majibu', 'Replies')} {userProfile?.repliesCount ?? 0}
                      </p>
                    </div>

                    {/* Language Selector strictly inside User Account */}
                    <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
                        <Globe className="h-3.5 w-3.5 text-[#1D4E89]" aria-hidden="true" />
                        <span>{tr('Lugha', 'Language')}</span>
                      </span>
                      <div
                        role="group"
                        aria-label={tr('Chagua lugha', 'Choose language')}
                        className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-[11px] font-bold"
                      >
                        <button
                          type="button"
                          onClick={() => setLang('sw')}
                          className={`rounded-md px-2 py-1 transition-colors ${
                            lang === 'sw'
                              ? 'bg-[#1D4E89] text-white'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Kiswahili
                        </button>
                        <button
                          type="button"
                          onClick={() => setLang('en')}
                          className={`rounded-md px-2 py-1 transition-colors ${
                            lang === 'en'
                              ? 'bg-[#1D4E89] text-white'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          English
                        </button>
                      </div>
                    </div>

                    <div className="mt-1 space-y-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          onSelectTab('safety');
                        }}
                        className="flex min-h-[40px] w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100"
                      >
                        <UserIcon className="h-4 w-4 text-[#1D4E89]" aria-hidden="true" />
                        <span>
                          {isAdmin
                            ? tr('Wasifu & Msimamizi', 'Profile & Admin')
                            : tr('Akaunti na Usalama', 'Account & Safety')}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          onSignOut();
                        }}
                        className="flex min-h-[40px] w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-red-700 transition-colors hover:bg-red-50"
                      >
                        <LogOut className="h-4 w-4" aria-hidden="true" />
                        <span>{tr('Toka', 'Sign Out')}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <button
              type="button"
              disabled={authBusy}
              onClick={onSignIn}
              aria-label={tr('Ingia au Jisajili', 'Sign in or Register')}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-100 disabled:opacity-60 sm:px-3.5 sm:text-sm whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
            >
              <GoogleGIcon />
              <span>
                {authBusy ? (
                  tr('Inaingia...', 'Signing in...')
                ) : (
                  <>
                    {tr('Ingia', 'Sign in')}
                    <span className="hidden min-[420px]:inline">
                      {tr(' / Jisajili', ' / Register')}
                    </span>
                  </>
                )}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Slim 1-tap Prompt for Facebook-style Top-of-Screen & App Badge Alerts */}
      {isNotificationSupported() && notifPermission === 'default' && !notifBannerDismissed && (
        <div className="border-t border-white/10 bg-[#0A1E33]/95 px-3 py-1.5 text-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 text-[11px] sm:text-xs">
              <BellRing className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
              <span className="truncate font-medium text-slate-100">
                {tr(
                  'Washa arifa juu ya skrini (kama Facebook) na namba kwenye icon ya App.',
                  'Enable top-screen alerts (like Facebook) & unread app icon badge.'
                )}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => void handleEnablePhoneAlerts()}
                className="rounded-lg bg-amber-400 px-2.5 py-1 text-[11px] font-extrabold text-[#0A1E33] hover:bg-amber-300"
              >
                {tr('Washa Sasa', 'Enable')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setNotifBannerDismissed(true);
                  try {
                    window.localStorage.setItem(NOTIF_BANNER_DISMISSED_KEY, '1');
                  } catch {
                    // Ignore storage error
                  }
                }}
                aria-label={tr('Funga', 'Dismiss')}
                className="rounded-lg p-1 text-slate-300 hover:bg-white/10 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
