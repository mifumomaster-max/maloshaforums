import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  Heart,
  MessageCircle,
  Newspaper,
  PenSquare,
  RotateCcw,
  Search,
  Share2,
} from 'lucide-react';
import {
  AuthPromptReason,
  MAKALA_SECTIONS,
  SortMode,
  Topic,
  getMakalaSection,
  matchesMakalaSection,
  resolveMakalaCover,
} from '../types';
import { optimizeCloudinaryUrl } from '../services/cloudinaryService';
import { extractEditorialPreview } from '../utils/editorialFormatter';
import { estimateReadMinutes } from '../utils/formatters';
import { sortTopicsList } from '../utils/topicSort';
import { useLanguage } from '../context/LanguageContext';
import { AuthorName, Avatar } from './Avatar';
import { MakalaInlineComposer } from './MakalaInlineComposer';
import { AuthorVerificationBadge } from './VerificationBadge';

interface MakalaNewsroomProps {
  articles: Topic[];
  allMakalaCount: number;
  loading: boolean;
  sortMode: SortMode;
  onChangeSort: (mode: SortMode) => void;
  searchQuery: string;
  onChangeSearch: (q: string) => void;
  userUid: string | null;
  userDisplayName: string;
  userPhoto: string;
  isAdmin?: boolean;
  isSuspended?: boolean;
  votedTopicIds: Set<string>;
  onToggleVote: (topic: Topic) => void;
  onShareTopic: (topic: Topic) => void;
  onOpenTopic: (topicId: string) => void;
  onTogglePrivate?: (topic: Topic) => void;
  onToggleArchive?: (topic: Topic) => void;
  onCreateMakalaPost: (data: {
    title: string;
    body: string;
    tags: string[];
    coverImage?: string;
  }) => Promise<void>;
  onSignIn: (reason?: AuthPromptReason) => void;
  onToast: (message: string, kind?: 'success' | 'error') => void;
  onBackToAll: () => void;
  inlineExpanded: boolean;
  onInlineExpandedChange: (next: boolean) => void;
  expandTrigger?: number;
  onVisibleTopicIdsChange?: (ids: string[]) => void;
  onAuthorClick?: (author: { uid: string; displayName: string; photoURL?: string }) => void;
}

const BbcCoverImage: React.FC<{
  src?: string;
  alt: string;
  wrapperClass?: string;
  imgClass?: string;
  widthHint?: number;
}> = ({
  src,
  alt,
  wrapperClass = 'w-full bg-slate-100',
  imgClass = 'block h-auto w-full',
  widthHint = 1080,
}) => {
  const { tr } = useLanguage();
  const [failed, setFailed] = useState(false);
  const resolved = optimizeCloudinaryUrl(resolveMakalaCover(src), widthHint, {
    quality: widthHint >= 1000 ? 'ultra' : 'good',
  });

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!resolved || failed) {
    return (
      <div className="flex aspect-[16/10] w-full flex-col items-center justify-center bg-gradient-to-br from-[#2A0808] via-[#6B0F0F] to-[#B80000] px-4 text-center text-white/90">
        <Newspaper className="h-7 w-7 opacity-85" aria-hidden="true" />
        <span className="mt-1.5 text-[11px] font-bold tracking-wider uppercase opacity-85">
          {tr('Malosha Makala', 'Malosha Articles')}
        </span>
      </div>
    );
  }

  return (
    <div className={`w-full overflow-hidden ${wrapperClass}`}>
      <img
        src={resolved}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${imgClass} transition-transform duration-300 group-hover:scale-[1.01]`}
      />
    </div>
  );
};

function getLeadPreviewText(raw: string): string {
  return extractEditorialPreview(raw).leadText;
}

function getCreatedMillis(topic: Topic): number {
  return topic.createdAt ? topic.createdAt.toMillis() : Date.now();
}

const INITIAL_MAKALA_PAGE_SIZE = 6;

export const MakalaNewsroom: React.FC<MakalaNewsroomProps> = ({
  articles,
  allMakalaCount,
  loading,
  sortMode,
  onChangeSort,
  searchQuery,
  onChangeSearch,
  userUid,
  userDisplayName,
  userPhoto,
  isAdmin = false,
  isSuspended = false,
  votedTopicIds,
  onToggleVote,
  onShareTopic,
  onOpenTopic,
  onTogglePrivate,
  onToggleArchive,
  onCreateMakalaPost,
  onSignIn,
  onToast,
  onBackToAll,
  inlineExpanded,
  onInlineExpandedChange,
  expandTrigger = 0,
  onVisibleTopicIdsChange,
  onAuthorClick,
}) => {
  const { lang, tr, formatTime, getMakalaSectionLabel } = useLanguage();
  const [selectedSection, setSelectedSection] = useState<string>('all');
  const [visibleCount, setVisibleCount] = useState<number>(INITIAL_MAKALA_PAGE_SIZE);
  const [mixSeed, setMixSeed] = useState<number>(1);
  const composerAnchorRef = useRef<HTMLDivElement>(null);
  const prevExpandedRef = useRef(inlineExpanded);
  const lastExpandTriggerRef = useRef(expandTrigger);

  useEffect(() => {
    setVisibleCount(INITIAL_MAKALA_PAGE_SIZE);
  }, [selectedSection, sortMode, searchQuery]);

  useEffect(() => {
    const justOpened = inlineExpanded && !prevExpandedRef.current;
    const triggered = expandTrigger > lastExpandTriggerRef.current;
    prevExpandedRef.current = inlineExpanded;
    lastExpandTriggerRef.current = expandTrigger;

    if ((justOpened || triggered) && inlineExpanded) {
      const timer = window.setTimeout(() => {
        composerAnchorRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 70);
      return () => window.clearTimeout(timer);
    }
  }, [inlineExpanded, expandTrigger]);

  const todayFormatted = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'sw-TZ', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date());
    } catch {
      return new Date().toLocaleDateString();
    }
  }, [lang]);

  const sectionCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: articles.length,
      recent: 0,
    };
    for (const sec of MAKALA_SECTIONS) {
      counts[sec] = 0;
    }
    for (const art of articles) {
      if (matchesMakalaSection(art, 'recent')) {
        counts.recent += 1;
      }
      const resolvedSec = getMakalaSection(art.tags, art.title);
      counts[resolvedSec] = (counts[resolvedSec] || 0) + 1;
    }
    return counts;
  }, [articles]);

  // Filter strictly by selectedSection FIRST so all visible sections & sidebars match
  const sectionFilteredArticles = useMemo(() => {
    return articles.filter((art) => matchesMakalaSection(art, selectedSection));
  }, [articles, selectedSection]);

  const latestMakala = useMemo(() => {
    return [...sectionFilteredArticles].sort((a, b) => {
      const diff = getCreatedMillis(b) - getCreatedMillis(a);
      return diff !== 0 ? diff : b.id.localeCompare(a.id);
    });
  }, [sectionFilteredArticles]);

  const popularMakala = useMemo(() => {
    return [...sectionFilteredArticles]
      .sort((a, b) => {
        if (b.upvotesCount !== a.upvotesCount) return b.upvotesCount - a.upvotesCount;
        if (b.repliesCount !== a.repliesCount) return b.repliesCount - a.repliesCount;
        return getCreatedMillis(b) - getCreatedMillis(a);
      })
      .slice(0, 5);
  }, [sectionFilteredArticles]);

  const displayedArticles = useMemo(() => {
    return sortTopicsList(sectionFilteredArticles, sortMode, mixSeed);
  }, [sectionFilteredArticles, sortMode, mixSeed]);

  const paginatedArticles = useMemo(
    () => displayedArticles.slice(0, visibleCount),
    [displayedArticles, visibleCount]
  );

  useEffect(() => {
    if (!onVisibleTopicIdsChange) return;
    onVisibleTopicIdsChange(paginatedArticles.map((a) => a.id));
  }, [paginatedArticles, onVisibleTopicIdsChange]);

  const handleOpenInlineWriter = () => {
    if (!userUid) {
      onToast(
        tr(
          'Tengeneza akaunti au ingia (Google au Jisajili kawaida) ili kuandika makala.',
          'Create an account or sign in to write an article.'
        ),
        'error'
      );
      onSignIn('post');
      return;
    }
    if (isSuspended) {
      onToast(
        tr(
          'Akaunti yako imefungwa na msimamizi — huwezi kuandika makala.',
          'Your account is suspended — writing articles is disabled.'
        ),
        'error'
      );
      return;
    }
    onInlineExpandedChange(true);
    window.setTimeout(() => {
      composerAnchorRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 70);
  };

  const leadArticle = paginatedArticles[0];
  const secondaryArticles = paginatedArticles.slice(1, 5);
  const archiveArticles = paginatedArticles.slice(5);
  const remainingCount = Math.max(0, displayedArticles.length - paginatedArticles.length);

  const activeSectionLabel =
    selectedSection === 'all'
      ? tr('Habari Zote', 'All News')
      : selectedSection === 'recent'
        ? tr('Mpya Hivi Punde', 'Just In')
        : getMakalaSectionLabel(selectedSection);

  const activeSortLabel =
    sortMode === 'votes'
      ? tr('Pendwa Zaidi', 'Most Liked')
      : sortMode === 'oldest'
        ? tr('Zilizotangulia', 'Earlier')
        : sortMode === 'mixed'
          ? tr('Mchanganyiko', 'Mixed')
          : tr('Mpya Zaidi', 'Newest');

  const leadKickerLabel =
    sortMode === 'votes'
      ? tr('Inayopendwa Zaidi', 'Most Liked')
      : sortMode === 'oldest'
        ? tr('Makala ya Awali', 'Earlier Story')
        : sortMode === 'mixed'
          ? tr('Mchanganyiko', 'Mixed Feed')
          : tr('Habari Kuu', 'Top Story');

  const renderVisibilityBadge = (art: Topic) => {
    if (art.status !== 'private' && art.status !== 'archived') return null;
    return (
      <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
        <EyeOff className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span>
          {tr(
            'Imeondolewa kwa wengine · Unaiona wewe tu',
            'Hidden from others · Visible to you only'
          )}
        </span>
      </span>
    );
  };

  const renderVisibilityToggle = (art: Topic) => {
    const isAuthor = Boolean(userUid && art.authorId === userUid);
    if (!isAuthor && !isAdmin) return null;
    const isHidden = art.status === 'private' || art.status === 'archived';
    const handleClick = () => {
      if (art.status === 'archived') {
        if (isAdmin) onToggleArchive?.(art);
        return;
      }
      if (isAuthor && onTogglePrivate) {
        onTogglePrivate(art);
      } else if (isAdmin && onToggleArchive) {
        onToggleArchive(art);
      }
    };
    if (art.status === 'archived' && !isAdmin) {
      return null;
    }
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`inline-flex min-h-[34px] items-center gap-1 border px-2 py-1 text-[11px] font-bold transition-colors whitespace-nowrap shrink-0 ${
          isHidden
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            : 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100'
        }`}
        title={
          isHidden
            ? tr('Rejesha ionekane kwa wote', 'Restore for everyone')
            : tr('Ondoa kwa wengine (ibaki kwako tu)', 'Hide from others (keep for yourself)')
        }
      >
        {isHidden ? (
          <>
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            <span>{tr('Rejesha', 'Restore')}</span>
          </>
        ) : (
          <>
            <Eye className="h-3 w-3" aria-hidden="true" />
            <span>{tr('Ondoa kwa Wengine', 'Hide')}</span>
          </>
        )}
      </button>
    );
  };

  return (
    <div className="mx-auto max-w-6xl px-3.5 py-4 sm:px-6 sm:py-6">
      {/* Top Breadcrumb */}
      <div className="mb-3 flex items-center justify-between gap-2 text-xs text-slate-600">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onBackToAll}
            className="font-medium text-[#1D4E89] hover:underline"
          >
            {tr('Mada Zote', 'All Topics')}
          </button>
          <ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          <span className="font-semibold text-slate-900">{tr('Makala', 'Articles')}</span>
        </div>
        <span className="hidden text-[11px] capitalize text-slate-500 sm:inline">
          {todayFormatted}
        </span>
      </div>

      {/* BBC News Swahili Authoritative Editorial Masthead */}
      <header className="-mx-3.5 overflow-hidden border-y border-slate-300 bg-white shadow-sm sm:mx-0 sm:border">
        {/* Top Institutional Dark BBC Utility Ribbon */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#141414] px-3.5 py-2 text-[11px] text-white/90 sm:px-6">
          <div className="flex items-center gap-2 font-sans font-bold tracking-wider uppercase">
            <span className="inline-block h-2 w-2 bg-[#B80000]" aria-hidden="true" />
            <span>{tr('DAWATI LA HABARI NA MAKALA', 'NEWS & EDITORIAL DESK')}</span>
          </div>
          <div className="flex items-center gap-2.5 text-[11px] text-slate-300 tabular-nums">
            <span className="capitalize">{todayFormatted}</span>
            <span aria-hidden="true" className="text-slate-600">|</span>
            <span className="font-semibold text-white">
              {tr(`Makala ${allMakalaCount}`, `${allMakalaCount} Articles`)}
            </span>
          </div>
        </div>

        {/* Signature BBC Crimson Masthead */}
        <div className="relative bg-gradient-to-r from-[#8C0000] via-[#B80000] to-[#980000] px-3.5 py-4 text-white sm:px-6 sm:py-5">
          <div className="flex items-center justify-between gap-3 sm:gap-4">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              {/* Mobile & Desktop BBC-style Letter Blocks */}
              <div className="flex shrink-0 items-center gap-0.5 sm:hidden" aria-hidden="true">
                {['M', 'L', 'S'].map((letter, idx) => (
                  <span
                    key={idx}
                    className="inline-flex h-8 w-6 items-center justify-center bg-white font-sans text-sm font-black text-[#B80000] shadow-sm"
                  >
                    {letter}
                  </span>
                ))}
              </div>
              <div className="hidden shrink-0 items-center gap-1 sm:flex" aria-hidden="true">
                {['M', 'A', 'L', 'O', 'S', 'H', 'A'].map((letter, idx) => (
                  <span
                    key={idx}
                    className="inline-flex h-9 w-8 items-center justify-center bg-white font-sans text-base font-black text-[#B80000] shadow-sm"
                  >
                    {letter}
                  </span>
                ))}
              </div>
              <div className="min-w-0 border-l border-white/30 pl-3 sm:pl-4">
                <h1 className="truncate font-display text-lg font-extrabold tracking-tight text-white sm:text-2xl [text-wrap:balance]">
                  {tr('HABARI & MAKALA', 'NEWS & ARTICLES')}
                </h1>
                <p className="mt-0.5 line-clamp-1 text-xs text-white/90 sm:text-[13px]">
                  {tr(
                    'Uchambuzi wa kina, ripoti maalum, na habari za jamii',
                    'In-depth analysis, special reports, and community news'
                  )}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleOpenInlineWriter}
              className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 border border-white/25 bg-white px-3.5 py-2 text-xs font-extrabold tracking-wide text-[#B80000] uppercase shadow-sm transition-colors hover:bg-[#141414] hover:text-white whitespace-nowrap sm:min-h-[42px] sm:px-4"
            >
              <PenSquare className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
              <span className="sm:hidden">{tr('Andika', 'Write')}</span>
              <span className="hidden sm:inline">{tr('Andika Makala', 'Write Article')}</span>
            </button>
          </div>
        </div>

        {/* BBC Section Navigation Bar */}
        <nav
          aria-label={tr('Vitengo vya Makala', 'Article Sections')}
          className="flex items-center gap-0.5 overflow-x-auto border-b border-slate-200 bg-white px-2.5 sm:px-5"
        >
          <button
            type="button"
            onClick={() => setSelectedSection('all')}
            className={`min-h-[44px] border-b-[3px] px-3 py-2.5 text-xs font-extrabold tracking-wide transition-colors whitespace-nowrap shrink-0 ${
              selectedSection === 'all'
                ? 'border-[#B80000] bg-rose-50/50 text-[#B80000]'
                : 'border-transparent text-slate-700 hover:border-slate-300 hover:text-slate-950'
            }`}
          >
            {tr('Habari Zote', 'All News')} ({allMakalaCount})
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedSection('recent');
              onChangeSort('newest');
            }}
            className={`min-h-[44px] border-b-[3px] px-3 py-2.5 text-xs font-extrabold tracking-wide transition-colors whitespace-nowrap shrink-0 ${
              selectedSection === 'recent'
                ? 'border-[#B80000] bg-rose-50/50 text-[#B80000]'
                : 'border-transparent text-slate-700 hover:border-slate-300 hover:text-slate-950'
            }`}
          >
            {tr('Mpya Hivi Punde', 'Just In')} ({sectionCounts.recent ?? 0})
          </button>
          {MAKALA_SECTIONS.map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => setSelectedSection(sec)}
              className={`min-h-[44px] border-b-[3px] px-3 py-2.5 text-xs font-extrabold tracking-wide transition-colors whitespace-nowrap shrink-0 ${
                selectedSection === sec
                  ? 'border-[#B80000] bg-rose-50/50 text-[#B80000]'
                  : 'border-transparent text-slate-700 hover:border-slate-300 hover:text-slate-950'
              }`}
            >
              {getMakalaSectionLabel(sec)}
              {(sectionCounts[sec] ?? 0) > 0 ? ` (${sectionCounts[sec]})` : ''}
            </button>
          ))}
        </nav>

        {/* Search & Quick Sort Toolbar */}
        <div className="flex flex-col gap-2.5 bg-[#F4F4F4] px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onChangeSearch(e.target.value)}
              placeholder={tr(
                'Tafuta makala mpya, mada au mwandishi...',
                'Search latest articles, topics, or authors...'
              )}
              aria-label={tr('Tafuta makala', 'Search articles')}
              className="min-h-[40px] w-full border border-slate-300 bg-white py-1.5 pr-3.5 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#B80000] focus:outline-none"
            />
          </div>

          <div
            role="group"
            aria-label={tr('Mpangilio wa makala', 'Article sorting')}
            className="grid grid-cols-2 border border-slate-300 bg-white p-0.5 sm:inline-flex shrink-0"
          >
            {(
              [
                { id: 'newest', label: tr('Mpya Zaidi', 'Newest') },
                { id: 'votes', label: tr('Pendwa Zaidi', 'Most Liked') },
                { id: 'oldest', label: tr('Zilizotangulia', 'Earlier') },
                { id: 'mixed', label: tr('Mchanganyiko', 'Mixed') },
              ] as { id: SortMode; label: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  if (opt.id === 'mixed') {
                    setMixSeed((s) => s + 1);
                  }
                  onChangeSort(opt.id);
                }}
                className={`min-h-[36px] px-3 py-1 text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                  sortMode === opt.id
                    ? 'bg-[#141414] text-white'
                    : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Inline Makala Composer (Always Inline Inside the Page, Never a Popup) */}
      <div
        ref={composerAnchorRef}
        className={`scroll-mt-[calc(var(--malosha-header-h,106px)+14px)] ${
          inlineExpanded ? 'mt-4' : ''
        }`}
      >
        <MakalaInlineComposer
          expanded={inlineExpanded}
          onExpandedChange={onInlineExpandedChange}
          initialSection={
            selectedSection !== 'all' && selectedSection !== 'recent'
              ? selectedSection
              : undefined
          }
          userUid={userUid}
          userDisplayName={userDisplayName}
          userPhoto={userPhoto}
          isSuspended={isSuspended}
          onSignIn={onSignIn}
          onSubmitArticle={onCreateMakalaPost}
          onToast={onToast}
        />
      </div>

      {/* Explicit Active Section & Sort Feedback Strip */}
      {(selectedSection !== 'all' || sortMode !== 'newest' || searchQuery.trim() !== '') && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border border-slate-200 bg-white px-4 py-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-700">
            <span className="font-bold text-[#B80000]">{activeSectionLabel}</span>
            <span aria-hidden="true">·</span>
            <span>
              {tr('Mpangilio:', 'Order:')} <strong>{activeSortLabel}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums text-slate-500">
              {tr(`Makala ${displayedArticles.length}`, `${displayedArticles.length} articles`)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedSection('all');
              onChangeSort('newest');
              onChangeSearch('');
            }}
            className="font-semibold text-[#1D4E89] hover:underline"
          >
            {tr('Rejesha Zote', 'Reset Filter')}
          </button>
        </div>
      )}

      {/* Latest Articles Quick-Access Strip ("Hivi Punde") — desktop/tablet only so mobile shows Lead Story immediately */}
      {!loading &&
        selectedSection === 'all' &&
        sortMode === 'newest' &&
        !searchQuery.trim() &&
        latestMakala.length > 0 && (
          <section
            aria-label={tr('Makala mpya hivi punde', 'Just in articles')}
            className="mt-4 hidden border border-slate-200 bg-white md:block"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
              <span className="text-xs font-black tracking-wide text-[#B80000] uppercase">
                {tr('Mpya Hivi Punde', 'Just In')}
              </span>
              <span className="text-[11px] text-slate-500">
                {tr('Makala za karibuni zaidi zilizochapishwa', 'Most recently published articles')}
              </span>
            </div>
            <div className="grid grid-cols-1 divide-y divide-slate-200 md:grid-cols-3 md:divide-x md:divide-y-0">
              {latestMakala.slice(0, 3).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpenTopic(item.id)}
                  className="flex flex-col justify-between p-3.5 text-left transition-colors hover:bg-[#F6F6F6]"
                >
                  <span className="line-clamp-2 text-sm font-bold leading-snug text-slate-900 hover:text-[#B80000]">
                    {item.title}
                  </span>
                  <span className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                    <span className="font-bold text-[#B80000]">
                      {getMakalaSectionLabel(getMakalaSection(item.tags, item.title))}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{formatTime(item.createdAt)}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

      {/* Main BBC Newsroom Content Grid */}
      {loading ? (
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-8">
            <div className="border border-slate-200 bg-white p-5 animate-pulse">
              <div className="aspect-[16/9] w-full bg-slate-100" />
              <div className="mt-4 h-7 w-3/4 bg-slate-100" />
              <div className="mt-2 h-4 w-full bg-slate-100" />
            </div>
          </div>
          <div className="border border-slate-200 bg-white p-4 animate-pulse lg:col-span-4">
            <div className="h-5 w-1/2 bg-slate-100" />
            <div className="mt-4 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 bg-slate-100" />
              ))}
            </div>
          </div>
        </div>
      ) : displayedArticles.length === 0 ? (
        <div className="mt-5 border border-slate-200 bg-white px-6 py-12 text-center">
          <h2 className="font-display text-xl font-bold text-slate-900">
            {tr(
              'Hakuna makala zilizopatikana katika sehemu hii',
              'No articles found in this section'
            )}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            {selectedSection !== 'all'
              ? tr(
                  'Bonyeza "Habari Zote" kuona makala nyingine au andika makala mpya kwenye kitengo hiki.',
                  'Click "All News" to view other articles or write a new article in this section.'
                )
              : tr(
                  'Kuwa wa kwanza kuchapisha makala mpya yenye picha na uchambuzi wa kina.',
                  'Be the first to publish a new article with images and in-depth analysis.'
                )}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            {selectedSection !== 'all' && (
              <button
                type="button"
                onClick={() => setSelectedSection('all')}
                className="min-h-[42px] border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50"
              >
                {tr('Onyesha Habari Zote', 'Show All News')}
              </button>
            )}
            <button
              type="button"
              onClick={handleOpenInlineWriter}
              className="inline-flex min-h-[42px] items-center gap-1.5 bg-[#B80000] px-5 py-2 text-xs font-bold text-white hover:bg-[#990000]"
            >
              <PenSquare className="h-4 w-4" aria-hidden="true" />
              <span>{tr('Andika Makala Mpya', 'Write New Article')}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
          {/* Left 8 Columns: BBC Lead Story + Grid + Archive */}
          <div className="space-y-6 lg:col-span-8">
            {/* Tier 1: Lead Top Story (BBC Hero Split) */}
            {leadArticle && (
              <article className="group -mx-3.5 overflow-hidden border-y border-slate-200 bg-white sm:mx-0 sm:border">
                <div className="grid grid-cols-1 md:grid-cols-12 md:items-center">
                  <div className="order-2 flex min-w-0 flex-col justify-between p-4 sm:p-6 md:order-1 md:col-span-5">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
                        <span className="font-black tracking-wide text-[#B80000] uppercase">
                          {leadKickerLabel}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-slate-800">
                          {getMakalaSectionLabel(
                            getMakalaSection(leadArticle.tags, leadArticle.title)
                          )}
                        </span>
                        {renderVisibilityBadge(leadArticle)}
                      </div>

                      <button
                        type="button"
                        onClick={() => onOpenTopic(leadArticle.id)}
                        className="block w-full break-words text-left font-display text-[20px] font-bold leading-snug text-slate-950 transition-colors hover:text-[#B80000] sm:text-2xl [text-wrap:balance]"
                      >
                        {leadArticle.title}
                      </button>

                      {(() => {
                        const preview = extractEditorialPreview(leadArticle.body);
                        return (
                          <>
                            <p className="mt-2.5 line-clamp-3 break-words text-[14.5px] leading-relaxed text-slate-700 sm:text-sm">
                              {preview.leadText}
                            </p>
                            {preview.bulletHighlights.length > 0 && (
                              <ul className="mt-2.5 space-y-1.5 border-t border-slate-100 pt-2.5 text-xs text-slate-600">
                                {preview.bulletHighlights.map((bullet, bIdx) => (
                                  <li key={bIdx} className="flex min-w-0 items-start gap-2">
                                    <span
                                      aria-hidden="true"
                                      className="mt-1.5 h-1.5 w-1.5 shrink-0 bg-[#B80000]"
                                    />
                                    <span className="min-w-0 flex-1 line-clamp-1 break-words">{bullet}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        <button
                          type="button"
                          onClick={() =>
                            onAuthorClick?.({
                              uid: leadArticle.authorId,
                              displayName: leadArticle.authorName,
                              photoURL: leadArticle.authorPhoto,
                            })
                          }
                          className="inline-flex items-center gap-1.5 font-semibold text-slate-800 hover:text-[#1D4E89] hover:underline"
                        >
                          <Avatar
                            name={leadArticle.authorName}
                            photoURL={leadArticle.authorPhoto}
                            uid={leadArticle.authorId}
                            size="sm"
                          />
                          <span>
                            <AuthorName uid={leadArticle.authorId} fallback={leadArticle.authorName} />
                          </span>
                          <AuthorVerificationBadge uid={leadArticle.authorId} size="xs" />
                        </button>
                        <span aria-hidden="true">·</span>
                        <span>{formatTime(leadArticle.createdAt)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                          <span>
                            {tr(
                              `Dakika ${estimateReadMinutes(leadArticle.body)}`,
                              `${estimateReadMinutes(leadArticle.body)} min read`
                            )}
                          </span>
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onToggleVote(leadArticle)}
                            aria-pressed={votedTopicIds.has(leadArticle.id)}
                            className={`inline-flex min-h-[36px] items-center gap-1 border px-2.5 py-1 font-semibold transition-colors ${
                              votedTopicIds.has(leadArticle.id)
                                ? 'border-rose-300 bg-rose-50 text-rose-700'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <Heart
                              className={`h-3.5 w-3.5 ${
                                votedTopicIds.has(leadArticle.id)
                                  ? 'fill-rose-600 text-rose-600'
                                  : ''
                              }`}
                              aria-hidden="true"
                            />
                            <span className="font-mono tabular-nums">
                              {leadArticle.upvotesCount}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onOpenTopic(leadArticle.id)}
                            className="inline-flex min-h-[36px] items-center gap-1 border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <MessageCircle className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                            <span className="font-mono tabular-nums">
                              {leadArticle.repliesCount}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onShareTopic(leadArticle)}
                            aria-label={tr(
                              `Shiriki ${leadArticle.title} (${leadArticle.sharesCount ?? 0})`,
                              `Share ${leadArticle.title} (${leadArticle.sharesCount ?? 0})`
                            )}
                            className="inline-flex min-h-[36px] items-center gap-1 border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <Share2 className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                            <span className="font-mono tabular-nums">
                              {leadArticle.sharesCount ?? 0}
                            </span>
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {renderVisibilityToggle(leadArticle)}
                          <button
                            type="button"
                            onClick={() => onOpenTopic(leadArticle.id)}
                            className="bbc-read-more-btn inline-flex min-h-[40px] items-center gap-1.5 px-4 py-2 text-xs font-extrabold tracking-wide uppercase whitespace-nowrap shrink-0"
                          >
                            <span>{tr('Soma Zaidi', 'Read More')}</span>
                            <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenTopic(leadArticle.id)}
                    className="order-1 block w-full overflow-hidden bg-slate-100 text-left md:order-2 md:col-span-7"
                  >
                    <BbcCoverImage
                      src={leadArticle.coverImage}
                      alt={leadArticle.title}
                      wrapperClass="w-full bg-slate-100"
                      imgClass="block h-auto w-full"
                      widthHint={1080}
                    />
                  </button>
                </div>
              </article>
            )}

            {/* Tier 2: Secondary BBC Grid */}
            {secondaryArticles.length > 0 && (
              <div>
                <div className="mb-3 flex items-center justify-between border-b-2 border-slate-900 pb-1.5">
                  <h2 className="font-sans text-sm font-black tracking-wide text-slate-900 uppercase">
                    {tr('Ripoti & Uchambuzi', 'Reports & Analysis')}
                  </h2>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {tr(
                      `Makala ${displayedArticles.length}`,
                      `${displayedArticles.length} articles`
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {secondaryArticles.map((article) => {
                    const voted = votedTopicIds.has(article.id);
                    const readMins = estimateReadMinutes(article.body);
                    const sectionLabel = getMakalaSectionLabel(
                      getMakalaSection(article.tags, article.title)
                    );

                    return (
                      <article
                        key={article.id}
                        className="group -mx-3.5 flex flex-col overflow-hidden border-y border-slate-200 bg-white sm:mx-0 sm:border"
                      >
                        <button
                          type="button"
                          onClick={() => onOpenTopic(article.id)}
                          className="block w-full overflow-hidden bg-slate-100 text-left"
                        >
                          <BbcCoverImage
                            src={article.coverImage}
                            alt={article.title}
                            wrapperClass="w-full bg-slate-100"
                            imgClass="block h-auto w-full"
                            widthHint={1080}
                          />
                        </button>

                        <div className="flex flex-1 flex-col justify-between p-4">
                          <div>
                            <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                              <span className="font-bold text-[#B80000] uppercase">
                                {sectionLabel}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{formatTime(article.createdAt)}</span>
                              <span aria-hidden="true">·</span>
                              <span>
                                {tr(`Dakika ${readMins}`, `${readMins} min read`)}
                              </span>
                              {renderVisibilityBadge(article)}
                            </div>

                            <button
                              type="button"
                              onClick={() => onOpenTopic(article.id)}
                              className="block text-left font-display text-lg font-bold leading-snug text-slate-950 transition-colors hover:text-[#B80000] [text-wrap:balance]"
                            >
                              {article.title}
                            </button>

                            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600">
                              {getLeadPreviewText(article.body)}
                            </p>
                          </div>

                          <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onToggleVote(article)}
                                aria-pressed={voted}
                                aria-label={tr(`Penda ${article.title}`, `Like ${article.title}`)}
                                className={`inline-flex min-h-[34px] items-center gap-1 border px-2 py-1 transition-colors ${
                                  voted
                                    ? 'border-rose-300 bg-rose-50 text-rose-700'
                                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                <Heart
                                  className={`h-3.5 w-3.5 ${
                                    voted ? 'fill-rose-600 text-rose-600' : ''
                                  }`}
                                  aria-hidden="true"
                                />
                                <span className="font-mono tabular-nums">
                                  {article.upvotesCount}
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() => onOpenTopic(article.id)}
                                aria-label={tr(
                                  `Maoni kwenye ${article.title}`,
                                  `Comments on ${article.title}`
                                )}
                                className="inline-flex min-h-[34px] items-center gap-1 border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50"
                              >
                                <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                <span className="font-mono tabular-nums">
                                  {article.repliesCount}
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() => onShareTopic(article)}
                                aria-label={tr(
                                  `Shiriki ${article.title} (${article.sharesCount ?? 0})`,
                                  `Share ${article.title} (${article.sharesCount ?? 0})`
                                )}
                                className="inline-flex min-h-[34px] items-center gap-1 border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50"
                              >
                                <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                                <span className="font-mono tabular-nums">
                                  {article.sharesCount ?? 0}
                                </span>
                              </button>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                              {renderVisibilityToggle(article)}
                              <button
                                type="button"
                                onClick={() => onOpenTopic(article.id)}
                                className="bbc-read-more-btn inline-flex min-h-[38px] items-center gap-1 px-3.5 py-1.5 text-[11px] font-extrabold tracking-wide uppercase whitespace-nowrap shrink-0"
                              >
                                <span>{tr('Soma Zaidi', 'Read More')}</span>
                                <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tier 3: Compact BBC Lower News List (Full Soma Zaidi & Actions on Mobile + Desktop) */}
            {archiveArticles.length > 0 && (
              <section aria-label={tr('Makala nyingine', 'More articles')}>
                <div className="mb-3 flex items-center justify-between border-b-2 border-slate-900 pb-1.5">
                  <h2 className="font-sans text-sm font-black tracking-wide text-slate-900 uppercase">
                    {tr('Makala Zaidi', 'More Articles')}
                  </h2>
                  <span className="text-xs font-semibold text-slate-500 tabular-nums">
                    {archiveArticles.length}
                  </span>
                </div>
                <div className="-mx-3.5 divide-y divide-slate-200 border-y border-slate-200 bg-white sm:mx-0 sm:border">
                  {archiveArticles.map((art) => {
                    const artVoted = votedTopicIds.has(art.id);
                    const artReadMins = estimateReadMinutes(art.body);
                    return (
                      <article
                        key={art.id}
                        className="group flex flex-col gap-3 py-4 transition-colors hover:bg-slate-50 sm:flex-row sm:items-start sm:px-4"
                      >
                        <button
                          type="button"
                          onClick={() => onOpenTopic(art.id)}
                          className="block w-full overflow-hidden bg-slate-100 text-left sm:w-48 shrink-0"
                        >
                          <BbcCoverImage
                            src={art.coverImage}
                            alt={art.title}
                            wrapperClass="w-full bg-slate-100"
                            imgClass="block h-auto w-full"
                            widthHint={760}
                          />
                        </button>
                        <div className="flex min-w-0 flex-1 flex-col justify-between px-3.5 sm:px-0">
                          <div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                              <span className="font-bold text-[#B80000] uppercase">
                                {getMakalaSectionLabel(getMakalaSection(art.tags, art.title))}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{formatTime(art.createdAt)}</span>
                              <span aria-hidden="true">·</span>
                              <span>
                                {tr(`Dakika ${artReadMins}`, `${artReadMins} min`)}
                              </span>
                              {renderVisibilityBadge(art)}
                            </div>
                            <button
                              type="button"
                              onClick={() => onOpenTopic(art.id)}
                              className="mt-1 block w-full text-left font-display text-lg font-bold leading-snug text-slate-950 transition-colors hover:text-[#B80000] sm:text-base [text-wrap:balance]"
                            >
                              {art.title}
                            </button>
                            <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-600">
                              {getLeadPreviewText(art.body)}
                            </p>
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-xs">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onToggleVote(art)}
                                aria-pressed={artVoted}
                                aria-label={tr(`Penda ${art.title}`, `Like ${art.title}`)}
                                className={`inline-flex min-h-[36px] items-center gap-1 border px-2 py-1 transition-colors ${
                                  artVoted
                                    ? 'border-rose-300 bg-rose-50 text-rose-700'
                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                <Heart
                                  className={`h-3.5 w-3.5 ${
                                    artVoted ? 'fill-rose-600 text-rose-600' : ''
                                  }`}
                                  aria-hidden="true"
                                />
                                <span className="font-mono tabular-nums">{art.upvotesCount}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => onOpenTopic(art.id)}
                                aria-label={tr(
                                  `Maoni kwenye ${art.title}`,
                                  `Comments on ${art.title}`
                                )}
                                className="inline-flex min-h-[36px] items-center gap-1 border border-slate-200 bg-white px-2 py-1 text-slate-600 hover:bg-slate-50"
                              >
                                <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                <span className="font-mono tabular-nums">{art.repliesCount}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => onShareTopic(art)}
                                aria-label={tr(
                                  `Shiriki ${art.title} (${art.sharesCount ?? 0})`,
                                  `Share ${art.title} (${art.sharesCount ?? 0})`
                                )}
                                className="inline-flex min-h-[36px] items-center gap-1 border border-slate-200 bg-white px-2 py-1 text-slate-600 hover:bg-slate-50"
                              >
                                <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                                <span className="font-mono tabular-nums">
                                  {art.sharesCount ?? 0}
                                </span>
                              </button>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                              {renderVisibilityToggle(art)}
                              <button
                                type="button"
                                onClick={() => onOpenTopic(art.id)}
                                className="bbc-read-more-btn inline-flex min-h-[38px] items-center gap-1 px-3.5 py-1.5 text-[11px] font-extrabold tracking-wide uppercase whitespace-nowrap shrink-0"
                              >
                                <span>{tr('Soma Zaidi', 'Read More')}</span>
                                <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Progressive Load More Button to Save Mobile Data */}
            {remainingCount > 0 && (
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => setVisibleCount((prev) => prev + INITIAL_MAKALA_PAGE_SIZE)}
                  className="inline-flex min-h-[44px] items-center gap-2 border border-slate-300 bg-white px-6 py-2.5 text-xs font-bold text-slate-800 transition-colors hover:border-[#B80000] hover:text-[#B80000]"
                >
                  <span>
                    {tr(
                      `Onyesha Makala Zaidi (${remainingCount} zimesalia)`,
                      `Load More Articles (${remainingCount} remaining)`
                    )}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Right 4 Columns: BBC "Makala Mpya Zaidi" + "Pendwa Zaidi" */}
          <aside className="space-y-5 lg:col-span-4">
            {/* Makala Mpya Zaidi Rail */}
            <div className="border border-slate-200 bg-white">
              <div className="border-b-2 border-[#B80000] bg-[#141414] px-4 py-2.5 text-white">
                <h2 className="text-xs font-black tracking-wider uppercase">
                  {tr('Makala Mpya Zaidi', 'Latest Articles')}
                </h2>
              </div>
              <div className="divide-y divide-slate-200">
                {latestMakala.slice(0, 6).map((item, idx) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onOpenTopic(item.id)}
                    className="group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F6F6F6]"
                  >
                    <span className="font-display text-xl font-black leading-none text-[#B80000] tabular-nums shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-bold leading-snug text-slate-900 group-hover:text-[#B80000]">
                        {item.title}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                        <span className="flex flex-wrap items-center gap-x-1.5">
                          <span className="font-semibold text-slate-700">
                            {getMakalaSectionLabel(getMakalaSection(item.tags, item.title))}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{formatTime(item.createdAt)}</span>
                        </span>
                        <span className="bbc-read-more-btn inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-extrabold tracking-wide uppercase whitespace-nowrap shrink-0">
                          <span>{tr('Soma Zaidi', 'Read More')}</span>
                          <ChevronRight className="h-3 w-3" aria-hidden="true" />
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Zilizosomwa / Pendwa Zaidi Rail */}
            {popularMakala.length > 0 && (
              <div className="border border-slate-200 bg-white">
                <div className="border-b-2 border-[#B80000] bg-white px-4 py-2.5">
                  <h2 className="text-xs font-black tracking-wider text-slate-900 uppercase">
                    {tr('Zilizovuma Kwenye Makala', 'Most Popular')}
                  </h2>
                </div>
                <div className="divide-y divide-slate-200">
                  {popularMakala.map((item, idx) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onOpenTopic(item.id)}
                      className="group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F6F6F6]"
                    >
                      <span className="font-mono text-sm font-bold text-slate-400 tabular-nums shrink-0">
                        0{idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-xs font-bold leading-snug text-slate-900 group-hover:text-[#B80000]">
                          {item.title}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 tabular-nums">
                          <span>
                            {tr('Penda', 'Likes')} {item.upvotesCount} · {tr('Maoni', 'Comments')}{' '}
                            {item.repliesCount}
                          </span>
                          <span className="bbc-read-more-btn inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-extrabold tracking-wide uppercase whitespace-nowrap shrink-0">
                            <span>{tr('Soma Zaidi', 'Read More')}</span>
                            <ChevronRight className="h-3 w-3" aria-hidden="true" />
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
};
