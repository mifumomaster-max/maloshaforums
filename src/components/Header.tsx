import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  CheckCheck,
  ChevronRight,
  Globe,
  LogOut,
  Newspaper,
  Plus,
  Sparkles,
  User as UserIcon,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import {
  NavTab,
  Topic,
  UserProfile,
  getMakalaSection,
  normalizeBoardCategory,
  resolveMakalaCover,
} from '../types';
import { Avatar } from './Avatar';
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
  onOpenComposer: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  authBusy: boolean;
}

const NOTIF_READ_IDS_KEY = 'malosha_notif_read_ids_v1';
const NOTIF_CLEARED_AT_KEY = 'malosha_notif_cleared_at_v1';

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
  onOpenComposer,
  onSignIn,
  onSignOut,
  authBusy,
}) => {
  const { lang, setLang, tr, formatTime, getMakalaSectionLabel, getBoardLabel } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifFilter, setNotifFilter] = useState<'news' | 'all'>('news');
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const [readIds, setReadIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const raw = window.localStorage.getItem(NOTIF_READ_IDS_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? new Set(parsed.filter((x) => typeof x === 'string')) : new Set();
    } catch {
      return new Set();
    }
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

  const newsNotifications = useMemo(() => {
    return topics
      .filter((t) => normalizeBoardCategory(t.category) === 'Makala')
      .sort((a, b) => {
        const am = a.createdAt ? a.createdAt.toMillis() : Date.now();
        const bm = b.createdAt ? b.createdAt.toMillis() : Date.now();
        return bm - am;
      })
      .slice(0, 15);
  }, [topics]);

  const allNotifications = useMemo(() => {
    return [...topics]
      .sort((a, b) => {
        const am = a.createdAt ? a.createdAt.toMillis() : Date.now();
        const bm = b.createdAt ? b.createdAt.toMillis() : Date.now();
        return bm - am;
      })
      .slice(0, 15);
  }, [topics]);

  const isUnread = (topic: Topic) => {
    if (readIds.has(topic.id)) return false;
    const createdMs = topic.createdAt ? topic.createdAt.toMillis() : Date.now();
    return createdMs > clearedAtMs;
  };

  const unreadNewsCount = useMemo(() => {
    return newsNotifications.filter((t) => isUnread(t)).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newsNotifications, readIds, clearedAtMs]);

  const visibleNotifications = notifFilter === 'news' ? newsNotifications : allNotifications;

  const markItemRead = (topicId: string) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(topicId);
      try {
        window.localStorage.setItem(NOTIF_READ_IDS_KEY, JSON.stringify(Array.from(next).slice(-100)));
      } catch {
        // Ignore storage failure
      }
      return next;
    });
  };

  const markAllRead = () => {
    const now = Date.now();
    setClearedAtMs(now);
    const nextIds = new Set(readIds);
    allNotifications.forEach((t) => nextIds.add(t.id));
    setReadIds(nextIds);
    try {
      window.localStorage.setItem(NOTIF_CLEARED_AT_KEY, String(now));
      window.localStorage.setItem(NOTIF_READ_IDS_KEY, JSON.stringify(Array.from(nextIds).slice(-100)));
    } catch {
      // Ignore storage failure
    }
  };

  const navItems: { id: NavTab; label: string }[] = [
    { id: 'kijiweni', label: 'Kijiweni' },
    { id: 'fursa', label: tr('Fursa', 'Opportunities') },
    { id: 'makala', label: tr('Makala', 'Articles') },
    { id: 'trending', label: tr('Zilizovuma', 'Trending') },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0E2640]/95 text-white shadow-[0_4px_20px_rgba(10,25,47,0.18)] backdrop-blur-md">
      {/* Crisp Editorial Top Accent Line */}
      <div
        className="h-[3px] w-full bg-gradient-to-r from-[#D97706] via-[#F59E0B] to-[#38BDF8]"
        aria-hidden="true"
      />

      <div className="mx-auto flex h-[54px] max-w-6xl items-center justify-between gap-3 px-3.5 sm:h-16 sm:gap-8 sm:px-6">
        {/* Zone 1: Geometric Brand Emblem + Single-line Wordmark */}
        <button
          type="button"
          onClick={() => onSelectTab('all')}
          className="group flex items-center gap-2.5 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300"
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
          <span className="font-display text-[17px] font-bold tracking-tight text-white sm:text-xl">
            Malosha Forums
          </span>
        </button>

        {/* Zone 2: Desktop Single-Line Navigation Links */}
        <nav
          aria-label={tr('Urambazaji mkuu', 'Main navigation')}
          className="hidden md:flex items-center gap-7 text-sm font-medium"
        >
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`relative py-2 whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300 ${
                  active ? 'font-semibold text-white' : 'text-slate-200 hover:text-white'
                }`}
              >
                {item.label}
                {active && (
                  <span
                    className="absolute right-0 bottom-0 left-0 h-0.5 rounded-full bg-amber-400"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: News Notifications + Primary Auth / Account */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {/* News Notification Bell */}
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => {
                setNotifOpen((prev) => !prev);
                setMenuOpen(false);
              }}
              aria-label={tr('Arifa za habari', 'News notifications')}
              aria-expanded={notifOpen}
              className={`relative flex h-10 w-10 items-center justify-center rounded-xl border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 ${
                notifOpen
                  ? 'border-amber-400/60 bg-white/20 text-white'
                  : 'border-white/15 bg-white/10 text-slate-100 hover:bg-white/20 hover:text-white'
              }`}
            >
              <Bell className="h-[19px] w-[19px]" aria-hidden="true" />
              {unreadNewsCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#E11D48] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-[#0E2640] tabular-nums">
                  {unreadNewsCount > 9 ? '9+' : unreadNewsCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div
                role="dialog"
                aria-label={tr('Arifa za habari mpya', 'Latest news notifications')}
                className="fixed inset-x-3 top-[64px] z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2.5 sm:w-[380px]"
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Newspaper className="h-4 w-4 text-[#B80000]" aria-hidden="true" />
                    <h2 className="text-sm font-bold text-slate-900">
                      {tr('Arifa za Habari', 'News Alerts')}
                    </h2>
                    {unreadNewsCount > 0 && (
                      <span className="text-xs font-semibold text-[#B80000] tabular-nums">
                        ({unreadNewsCount} {tr('mpya', 'new')})
                      </span>
                    )}
                  </div>
                  {visibleNotifications.length > 0 && (
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-[#1D4E89] transition-colors hover:bg-sky-50"
                    >
                      <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{tr('Zimesomwa', 'Mark read')}</span>
                    </button>
                  )}
                </div>

                {/* Filter Tabs: Habari vs Zote */}
                <div className="flex items-center gap-1.5 border-b border-slate-100 bg-white px-4 py-2">
                  <button
                    type="button"
                    onClick={() => setNotifFilter('news')}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                      notifFilter === 'news'
                        ? 'bg-[#B80000] text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {tr('Habari & Makala', 'News & Articles')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotifFilter('all')}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                      notifFilter === 'all'
                        ? 'bg-[#163A5F] text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {tr('Zote', 'All Updates')}
                  </button>
                </div>

                {/* Notification List */}
                <div className="max-h-[340px] divide-y divide-slate-100 overflow-y-auto">
                  {visibleNotifications.length === 0 ? (
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
                    visibleNotifications.map((item) => {
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
                              src={thumb}
                              alt={item.title}
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

                {/* Footer Action */}
                <div className="border-t border-slate-100 bg-slate-50 px-4 py-2.5">
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

          {userUid ? (
            <>
              <button
                type="button"
                onClick={onOpenComposer}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#D97706] px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#B45309] sm:px-3.5 sm:text-sm whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span className="sm:hidden">{tr('Mada', 'Post')}</span>
                <span className="hidden sm:inline">{tr('Anzisha Mada', 'New Post')}</span>
              </button>

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
                  />
                </button>

                {menuOpen && (
                  <div className="absolute right-0 mt-2.5 w-64 rounded-2xl border border-slate-200 bg-white p-2 text-slate-900 shadow-2xl">
                    <div className="border-b border-slate-100 px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {userProfile?.displayName || userDisplayName}
                        </p>
                        <VerificationBadge badge={userProfile?.verificationBadge} size="sm" />
                      </div>
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
              aria-label={tr('Ingia na Google', 'Sign in with Google')}
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
                      {tr(' na Google', ' with Google')}
                    </span>
                  </>
                )}
              </span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
