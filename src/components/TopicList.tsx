import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  EyeOff,
  Heart,
  Lock,
  MessageCircle,
  Pin,
  Plus,
  Search,
  Share2,
  Sparkles,
} from 'lucide-react';
import {
  AuthPromptReason,
  FORUM_BOARDS,
  JOB_TYPES,
  KijiweniFontStyle,
  NavTab,
  NavUnreadCounts,
  PrimaryBoard,
  SharedMediaPayload,
  SortMode,
  Topic,
  TopicCategory,
  normalizeBoardCategory,
} from '../types';
import { useLanguage } from '../context/LanguageContext';
import { AuthorName, Avatar } from './Avatar';
import { FursaInlineComposer } from './FursaInlineComposer';
import { FursaPostCard } from './FursaPostCard';
import { KijiweniPostCard } from './KijiweniPostCard';
import { KijiweniInlineComposer } from './KijiweniInlineComposer';
import { MakalaNewsroom } from './MakalaNewsroom';
import { NavIconSection, NavSectionIcon } from './NavIcons';
import { AuthorVerificationBadge } from './VerificationBadge';
import { hasPendingStudioMakalaImport } from '../utils/studioMakalaBridge';
import { sortTopicsList } from '../utils/topicSort';

const INITIAL_VISIBLE_POSTS = 8;
const SCROLL_STEP_POSTS = 8;
const KIJIWENI_GATE_BATCH = 100;

interface TopicListProps {
  topics: Topic[];
  loading: boolean;
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  selectedCategory: TopicCategory | 'all';
  onSelectCategory: (cat: TopicCategory | 'all') => void;
  sortMode: SortMode;
  onChangeSort: (mode: SortMode) => void;
  searchQuery: string;
  onChangeSearch: (q: string) => void;
  onlyMine: boolean;
  onToggleOnlyMine: () => void;
  userUid: string | null;
  userDisplayName: string;
  userPhoto: string;
  isAdmin: boolean;
  isSuspended?: boolean;
  votedTopicIds: Set<string>;
  onToggleVote: (topic: Topic) => void;
  onShareTopic: (topic: Topic) => void;
  onOpenTopic: (topicId: string) => void;
  onOpenComposer: () => void;
  onCreateKijiweniPost: (
    data: {
      title: string;
      body: string;
      tags: string[];
      coverImage?: string;
      images?: string[];
      bodyFontStyle?: KijiweniFontStyle;
      status?: 'open' | 'private';
    },
    options?: { silent?: boolean }
  ) => Promise<void>;
  onCreateFursaPost: (data: {
    title: string;
    body: string;
    tags: string[];
    company?: string;
    location?: string;
    jobType?: string;
    deadline?: string;
    applyInfo?: string;
    coverImage?: string;
  }) => Promise<void>;
  onCreateMakalaPost: (data: {
    title: string;
    body: string;
    tags: string[];
    coverImage?: string;
  }) => Promise<void>;
  inlineExpandRequest?: number;
  sharedKijiweniPayload?: SharedMediaPayload | null;
  onClearSharedKijiweniPayload?: (id: number) => void;
  onEditTopic: (topic: Topic) => void;
  onTogglePrivate?: (topic: Topic) => void;
  onToggleArchive?: (topic: Topic) => void;
  onDeleteTopic: (topic: Topic) => void;
  onOpenReport: (targetType: 'topic' | 'reply', targetId: string, topicId: string) => void;
  onAuthorClick?: (author: { uid: string; displayName: string; photoURL?: string }) => void;
  onSignIn: (reason?: AuthPromptReason) => void;
  onToast: (message: string, kind?: 'success' | 'error') => void;
  onRequestConfirm: (opts: {
    title: string;
    message: string;
    confirmLabel: string;
    destructive: boolean;
    action: () => Promise<void>;
  }) => void;
  onSeedStarterTopics: () => Promise<void>;
  seeding: boolean;
  onVisibleTopicIdsChange?: (ids: string[]) => void;
  unreadCounts?: NavUnreadCounts;
  hideMpollTab?: boolean;
  hasMoreCloudTopics?: boolean;
  loadingMoreCloudTopics?: boolean;
  onLoadMoreCloudTopics?: () => void;
}

function getBoardIconSection(board: PrimaryBoard): NavIconSection {
  if (board === 'Kijiweni') return 'kijiweni';
  if (board === 'Fursa') return 'fursa';
  return 'makala';
}

function stripMarkdownPreview(raw: string): string {
  return raw.replace(/[*`>#-]/g, ' ').replace(/\s+/g, ' ').trim();
}

export const TopicList: React.FC<TopicListProps> = ({
  topics,
  loading,
  activeTab,
  onSelectTab,
  selectedCategory,
  onSelectCategory,
  sortMode,
  onChangeSort,
  searchQuery,
  onChangeSearch,
  onlyMine,
  onToggleOnlyMine,
  userUid,
  userDisplayName,
  userPhoto,
  isAdmin,
  isSuspended = false,
  votedTopicIds,
  onToggleVote,
  onShareTopic,
  onOpenTopic,
  onOpenComposer,
  onCreateKijiweniPost,
  onCreateFursaPost,
  onCreateMakalaPost,
  inlineExpandRequest = 0,
  sharedKijiweniPayload = null,
  onClearSharedKijiweniPayload,
  onEditTopic,
  onTogglePrivate,
  onToggleArchive,
  onDeleteTopic,
  onOpenReport,
  onAuthorClick,
  onSignIn,
  onToast,
  onRequestConfirm,
  onSeedStarterTopics,
  seeding,
  onVisibleTopicIdsChange,
  unreadCounts,
  hideMpollTab = false,
  hasMoreCloudTopics = false,
  loadingMoreCloudTopics = false,
  onLoadMoreCloudTopics,
}) => {
  const getBoardUnread = (board: PrimaryBoard): number => {
    if (!unreadCounts) return 0;
    if (board === 'Kijiweni') return unreadCounts.kijiweni;
    if (board === 'Fursa') return unreadCounts.fursa;
    return unreadCounts.makala;
  };
  const { tr, formatTime, getBoardLabel, getBoardDescription, getJobTypeLabel } = useLanguage();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const inlineComposerAnchorRef = useRef<HTMLDivElement>(null);
  const fursaComposerAnchorRef = useRef<HTMLDivElement>(null);
  const scrollSentinelRef = useRef<HTMLDivElement>(null);
  const [selectedJobType, setSelectedJobType] = useState<string>('all');
  const [onlyPrivate, setOnlyPrivate] = useState(false);
  const [inlineComposerOpen, setInlineComposerOpen] = useState(false);
  const [fursaInlineOpen, setFursaInlineOpen] = useState(false);
  const [makalaInlineOpen, setMakalaInlineOpen] = useState(false);
  const [makalaExpandTrigger, setMakalaExpandTrigger] = useState(0);
  const lastHandledExpandRef = useRef<number>(inlineExpandRequest);
  const [mixSeed, setMixSeed] = useState<number>(1);
  const [visibleCount, setVisibleCount] = useState<number>(INITIAL_VISIBLE_POSTS);
  const [scrollCap, setScrollCap] = useState<number>(KIJIWENI_GATE_BATCH);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const effectiveCategory: PrimaryBoard | 'all' =
    activeTab === 'kijiweni'
      ? 'Kijiweni'
      : activeTab === 'fursa'
        ? 'Fursa'
        : activeTab === 'makala'
          ? 'Makala'
          : selectedCategory !== 'all'
            ? normalizeBoardCategory(selectedCategory)
            : 'all';

  useEffect(() => {
    if (effectiveCategory !== 'Fursa') {
      setSelectedJobType('all');
    }
    if (!sharedKijiweniPayload) {
      setInlineComposerOpen(false);
    }
    setFursaInlineOpen(false);
    if (effectiveCategory === 'Makala' && hasPendingStudioMakalaImport()) {
      setMakalaInlineOpen(true);
      setMakalaExpandTrigger((n) => n + 1);
    } else {
      setMakalaInlineOpen(false);
    }
  }, [effectiveCategory, sharedKijiweniPayload]);

  useEffect(() => {
    if (sharedKijiweniPayload && effectiveCategory === 'Kijiweni') {
      setInlineComposerOpen(true);
      const timer = window.setTimeout(() => {
        inlineComposerAnchorRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 90);
      return () => window.clearTimeout(timer);
    }
  }, [sharedKijiweniPayload, effectiveCategory]);

  useEffect(() => {
    if (inlineExpandRequest <= lastHandledExpandRef.current) return;
    lastHandledExpandRef.current = inlineExpandRequest;

    if (effectiveCategory === 'Kijiweni') {
      setInlineComposerOpen(true);
      const timer = window.setTimeout(() => {
        inlineComposerAnchorRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 70);
      return () => window.clearTimeout(timer);
    } else if (effectiveCategory === 'Fursa') {
      setFursaInlineOpen(true);
      const timer = window.setTimeout(() => {
        fursaComposerAnchorRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 70);
      return () => window.clearTimeout(timer);
    } else if (effectiveCategory === 'Makala') {
      setMakalaInlineOpen(true);
      setMakalaExpandTrigger((n) => n + 1);
    }
  }, [inlineExpandRequest, effectiveCategory]);

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = { all: topics.length };
    for (const board of FORUM_BOARDS) {
      map[board.id] = 0;
    }
    for (const t of topics) {
      const normalized = normalizeBoardCategory(t.category);
      map[normalized] = (map[normalized] || 0) + 1;
    }
    return map;
  }, [topics]);

  const totalReplies = useMemo(
    () => topics.reduce((sum, t) => sum + t.repliesCount, 0),
    [topics]
  );

  const myPrivatePostsCount = useMemo(() => {
    if (!userUid) return 0;
    return topics.filter((t) => t.authorId === userUid && t.status === 'private').length;
  }, [topics, userUid]);

  useEffect(() => {
    if (myPrivatePostsCount === 0 && onlyPrivate) {
      setOnlyPrivate(false);
    }
  }, [myPrivatePostsCount, onlyPrivate]);

  const filteredTopics = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const list = topics.filter((topic) => {
      const normalizedCat = normalizeBoardCategory(topic.category);
      if (onlyMine && userUid && topic.authorId !== userUid) {
        return false;
      }
      if (onlyPrivate && (topic.status !== 'private' || !userUid || topic.authorId !== userUid)) {
        return false;
      }
      if (effectiveCategory !== 'all' && normalizedCat !== effectiveCategory) {
        return false;
      }
      if (effectiveCategory === 'Fursa' && selectedJobType !== 'all') {
        if ((topic.jobType || '') !== selectedJobType) {
          return false;
        }
      }
      if (q) {
        const hay = [
          topic.title,
          topic.body,
          topic.authorName,
          normalizedCat,
          topic.company || '',
          topic.location || '',
          topic.jobType || '',
          ...topic.tags,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return sortTopicsList(list, sortMode, mixSeed);
  }, [
    topics,
    activeTab,
    effectiveCategory,
    selectedJobType,
    sortMode,
    mixSeed,
    searchQuery,
    onlyMine,
    onlyPrivate,
    userUid,
  ]);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_POSTS);
    setScrollCap(KIJIWENI_GATE_BATCH);
  }, [activeTab, effectiveCategory, selectedJobType, sortMode, searchQuery, onlyMine, onlyPrivate]);

  const paginatedTopics = useMemo(
    () => filteredTopics.slice(0, Math.min(visibleCount, scrollCap)),
    [filteredTopics, visibleCount, scrollCap]
  );

  const remainingTopicsCount = Math.max(0, filteredTopics.length - paginatedTopics.length);
  const reachedGateCap =
    paginatedTopics.length >= scrollCap && (remainingTopicsCount > 0 || hasMoreCloudTopics);
  const canAutoScrollMore =
    !reachedGateCap &&
    (paginatedTopics.length < Math.min(filteredTopics.length, scrollCap) || hasMoreCloudTopics);

  useEffect(() => {
    if (effectiveCategory === 'Makala' || loading || !canAutoScrollMore) return;
    const target = scrollSentinelRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setVisibleCount((prev) => {
          const cap = Math.min(filteredTopics.length, scrollCap);
          if (prev < cap) {
            return Math.min(cap, prev + SCROLL_STEP_POSTS);
          }
          return prev;
        });
        if (
          filteredTopics.length < scrollCap &&
          hasMoreCloudTopics &&
          !loadingMoreCloudTopics
        ) {
          onLoadMoreCloudTopics?.();
        }
      },
      { rootMargin: '500px 0px' }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [
    effectiveCategory,
    loading,
    canAutoScrollMore,
    filteredTopics.length,
    scrollCap,
    hasMoreCloudTopics,
    loadingMoreCloudTopics,
    onLoadMoreCloudTopics,
  ]);

  const handleUnlockNextBatch = () => {
    const nextCap = scrollCap + KIJIWENI_GATE_BATCH;
    setScrollCap(nextCap);
    setVisibleCount((prev) => Math.min(nextCap, prev + SCROLL_STEP_POSTS));
    if (filteredTopics.length - paginatedTopics.length < 25 && hasMoreCloudTopics && !loadingMoreCloudTopics) {
      onLoadMoreCloudTopics?.();
    }
  };

  useEffect(() => {
    if (!onVisibleTopicIdsChange || effectiveCategory === 'Makala') return;
    onVisibleTopicIdsChange(paginatedTopics.map((t) => t.id));
  }, [paginatedTopics, onVisibleTopicIdsChange, effectiveCategory]);

  const activeBoardMeta =
    effectiveCategory !== 'all'
      ? FORUM_BOARDS.find((b) => b.id === effectiveCategory)
      : undefined;

  const pageHeading = activeBoardMeta
    ? getBoardLabel(activeBoardMeta.id)
    : tr('Ukumbi wa Mijadala', 'Community Forums');

  const pageSubheading = activeBoardMeta
    ? getBoardDescription(activeBoardMeta.id)
    : hideMpollTab
      ? tr(
          'Karibu Malosha Forums — Kijiweni, Fursa za Vijana, na Makala za Uchambuzi.',
          'Welcome to Malosha Forums — Kijiweni, Youth Opportunities, and Articles & Analysis.'
        )
      : tr(
          'Karibu Malosha Forums — Kijiweni, Fursa za Vijana, Makala za Uchambuzi, na Mpoll.',
          'Welcome to Malosha Forums — Kijiweni, Youth Opportunities, Articles & Analysis, and Mpoll.'
        );

  const handleBoardSelect = (board: PrimaryBoard | 'all') => {
    if (board === 'all') {
      onSelectCategory('all');
      onSelectTab('all');
    } else if (board === 'Kijiweni') {
      onSelectCategory('Kijiweni');
      onSelectTab('kijiweni');
    } else if (board === 'Fursa') {
      onSelectCategory('Fursa');
      onSelectTab('fursa');
    } else if (board === 'Makala') {
      onSelectCategory('Makala');
      onSelectTab('makala');
    }
  };

  const composerButtonLabel =
    effectiveCategory === 'Fursa'
      ? tr('Tangaza Fursa', 'Post Opportunity')
      : effectiveCategory === 'Makala'
        ? tr('Andika Makala', 'Write Article')
        : effectiveCategory === 'Kijiweni'
          ? tr('Chapisha Kijiweni', 'Post to Kijiweni')
          : tr('Anzisha Mada', 'New Topic');

  const searchPlaceholder =
    effectiveCategory === 'Fursa'
      ? tr('Tafuta ajira, shirika au mkoa...', 'Search jobs, organizations, or location...')
      : effectiveCategory === 'Makala'
        ? tr('Tafuta makala au mwandishi...', 'Search articles or authors...')
        : tr('Tafuta mada, machapisho au mwandishi...', 'Search topics, posts, or authors...');

  if (effectiveCategory === 'Makala') {
    return (
      <MakalaNewsroom
        articles={filteredTopics}
        allMakalaCount={categoryCounts.Makala ?? 0}
        loading={loading}
        sortMode={sortMode}
        onChangeSort={onChangeSort}
        searchQuery={searchQuery}
        onChangeSearch={onChangeSearch}
        userUid={userUid}
        userDisplayName={userDisplayName}
        userPhoto={userPhoto}
        isAdmin={isAdmin}
        isSuspended={isSuspended}
        votedTopicIds={votedTopicIds}
        onToggleVote={onToggleVote}
        onShareTopic={onShareTopic}
        onOpenTopic={onOpenTopic}
        onTogglePrivate={onTogglePrivate}
        onToggleArchive={onToggleArchive}
        onCreateMakalaPost={onCreateMakalaPost}
        onSignIn={onSignIn}
        onToast={onToast}
        onBackToAll={() => handleBoardSelect('all')}
        inlineExpanded={makalaInlineOpen}
        onInlineExpandedChange={setMakalaInlineOpen}
        expandTrigger={makalaExpandTrigger}
        onVisibleTopicIdsChange={onVisibleTopicIdsChange}
        onAuthorClick={onAuthorClick}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-3.5 py-4 sm:px-6 sm:py-6">
      {/* Breadcrumb Bar when inside a specific section (hidden in Kijiweni to avoid wasted header space) */}
      {effectiveCategory !== 'all' && effectiveCategory !== 'Kijiweni' && (
        <div className="mb-3 flex items-center gap-1.5 text-xs text-slate-600 sm:mb-4">
          <button
            type="button"
            onClick={() => handleBoardSelect('all')}
            className="font-medium text-[#1D4E89] hover:underline"
          >
            {tr('Mada Zote', 'All Topics')}
          </button>
          <ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          <span className="truncate font-medium text-slate-800">
            {activeBoardMeta ? getBoardLabel(activeBoardMeta.id) : ''}
          </span>
        </div>
      )}

      {/* Forum Masthead Banner (hidden in Kijiweni where compact Chapisha Kijiweni + Search leads directly) */}
      {effectiveCategory !== 'Kijiweni' && (
        <div className="mb-4 flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4 sm:mb-6 sm:flex-row sm:items-center sm:rounded-lg sm:px-5 sm:py-5">
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-slate-900 sm:text-3xl [text-wrap:balance]">
              {pageHeading}
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">{pageSubheading}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {effectiveCategory !== 'all' && (
              <button
                type="button"
                onClick={() => handleBoardSelect('all')}
                className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                {tr('Onyesha Zote', 'Show All')}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (effectiveCategory === 'Fursa') {
                  if (!userUid) {
                    onToast(
                      tr(
                        'Tengeneza akaunti au ingia ili kutangaza fursa.',
                        'Create an account or sign in to post an opportunity.'
                      ),
                      'error'
                    );
                    onSignIn('post');
                    return;
                  }
                  if (isSuspended) {
                    onToast(
                      tr('Akaunti yako imefungwa na msimamizi.', 'Your account is suspended.'),
                      'error'
                    );
                    return;
                  }
                  setFursaInlineOpen(true);
                  window.setTimeout(() => {
                    fursaComposerAnchorRef.current?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    });
                  }, 70);
                } else {
                  onOpenComposer();
                }
              }}
              className="hidden sm:inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#1D4E89] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#163A5F] whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>{composerButtonLabel}</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Split Grid */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Left/Primary Feed */}
        <div className="min-w-0 flex-1">
          {/* Kijiweni Compact Top Action: ONLY "+ Chapisha Kijiweni" (or inline composer when open), then Search below */}
          {effectiveCategory === 'Kijiweni' && (
            <div
              ref={inlineComposerAnchorRef}
              className="mb-3 scroll-mt-[calc(var(--malosha-header-h,106px)+14px)]"
            >
              {!inlineComposerOpen && (
                <button
                  type="button"
                  onClick={() => {
                    if (!userUid) {
                      onToast(
                        tr(
                          'Tengeneza akaunti au ingia ili kuchapisha Kijiweni.',
                          'Create an account or sign in to post.'
                        ),
                        'error'
                      );
                      onSignIn('post');
                      return;
                    }
                    if (isSuspended) {
                      onToast(
                        tr('Akaunti yako imefungwa na msimamizi.', 'Your account is suspended.'),
                        'error'
                      );
                      return;
                    }
                    setInlineComposerOpen(true);
                  }}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#1D4E89] px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-[#163A5F] sm:w-auto sm:rounded-lg"
                >
                  <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{tr('Chapisha Kijiweni', 'Post to Kijiweni')}</span>
                </button>
              )}

              <KijiweniInlineComposer
                expanded={inlineComposerOpen}
                onExpandedChange={setInlineComposerOpen}
                userUid={userUid}
                userDisplayName={userDisplayName}
                userPhoto={userPhoto}
                isSuspended={isSuspended}
                sharedPayload={sharedKijiweniPayload}
                onClearSharedPayload={onClearSharedKijiweniPayload}
                onSignIn={onSignIn}
                onSubmitPost={onCreateKijiweniPost}
                onToast={onToast}
              />
            </div>
          )}

          {/* Toolbar: Search + Sort */}
          <div className="mb-3 flex flex-col gap-2.5 sm:mb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(e) => onChangeSearch(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={tr('Tafuta mada', 'Search topics')}
                className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white py-2 pr-4 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1D4E89] focus:outline-none sm:min-h-[40px]"
              />
            </div>

            <div
              role="group"
              aria-label={tr('Mpangilio wa mada', 'Topic sorting')}
              className="grid grid-cols-2 rounded-lg border border-slate-300 bg-white p-1 sm:inline-flex shrink-0"
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
                  className={`min-h-[36px] rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 sm:px-3 ${
                    sortMode === opt.id
                      ? 'bg-[#1D4E89] text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mobile Quick Filter Row */}
          <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1 lg:hidden">
            <button
              type="button"
              onClick={() => handleBoardSelect('all')}
              className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
                activeTab === 'all' && effectiveCategory === 'all'
                  ? 'border-[#163A5F] bg-[#163A5F] text-white'
                  : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              <NavSectionIcon section="all" className="h-4 w-4 shrink-0" />
              <span>
                {tr('Zote', 'All')} ({categoryCounts.all})
              </span>
            </button>
            {FORUM_BOARDS.map((board) => {
              const unread = effectiveCategory === board.id ? 0 : getBoardUnread(board.id);
              return (
                <button
                  key={board.id}
                  type="button"
                  onClick={() => handleBoardSelect(board.id)}
                  className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
                    effectiveCategory === board.id
                      ? 'border-[#163A5F] bg-[#163A5F] text-white'
                      : 'border-slate-300 bg-white text-slate-700'
                  }`}
                >
                  <NavSectionIcon
                    section={getBoardIconSection(board.id)}
                    className="h-4 w-4 shrink-0"
                  />
                  <span>
                    {getBoardLabel(board.id)} ({categoryCounts[board.id] ?? 0})
                  </span>
                  {unread > 0 && (
                    <span className="flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[#E11D48] px-1 text-[10px] font-bold leading-none text-white tabular-nums">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </button>
              );
            })}
            {!hideMpollTab && (
              <button
                type="button"
                onClick={() => {
                  onSelectCategory('all');
                  onSelectTab('votes');
                }}
                className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
                  activeTab === 'votes'
                    ? 'border-[#163A5F] bg-[#163A5F] text-white'
                    : 'border-slate-300 bg-white text-slate-700'
                }`}
              >
                <NavSectionIcon section="votes" className="h-4 w-4 shrink-0" />
                <span>Mpoll</span>
                {(unreadCounts?.votes || 0) > 0 && activeTab !== 'votes' && (
                  <span className="flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[#E11D48] px-1 text-[10px] font-bold leading-none text-white tabular-nums">
                    {(unreadCounts?.votes || 0) > 99 ? '99+' : unreadCounts?.votes}
                  </span>
                )}
              </button>
            )}
          </div>

          {userUid && myPrivatePostsCount > 0 && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
              <div className="flex items-center gap-2 text-slate-700">
                <EyeOff className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
                <span>
                  {tr(
                    `Una machapisho ${myPrivatePostsCount} yaliyofungwa kwa akaunti yako pekee.`,
                    `You have ${myPrivatePostsCount} private post${myPrivatePostsCount === 1 ? '' : 's'} visible only in your account.`
                  )}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOnlyPrivate((prev) => !prev)}
                className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                  onlyPrivate
                    ? 'border-[#0E2640] bg-[#0E2640] text-white'
                    : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <EyeOff className="h-3 w-3" aria-hidden="true" />
                <span>
                  {onlyPrivate
                    ? tr('Onyesha Zote', 'Show All')
                    : tr(`Zangu za Faragha (${myPrivatePostsCount})`, `Private (${myPrivatePostsCount})`)}
                </span>
              </button>
            </div>
          )}

          {/* Fursa Job Type Filter Bar */}
          {effectiveCategory === 'Fursa' && (
            <div
              role="group"
              aria-label={tr('Chuja aina ya fursa', 'Filter opportunity type')}
              className="mb-4 flex items-center gap-2 overflow-x-auto pb-1"
            >
              <button
                type="button"
                onClick={() => setSelectedJobType('all')}
                className={`min-h-[38px] rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  selectedJobType === 'all'
                    ? 'border-[#1D4E89] bg-sky-50 text-[#163A5F]'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {tr('Aina Zote', 'All Types')}
              </button>
              {JOB_TYPES.map((jt) => (
                <button
                  key={jt}
                  type="button"
                  onClick={() => setSelectedJobType(jt)}
                  className={`min-h-[38px] rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                    selectedJobType === jt
                      ? 'border-[#1D4E89] bg-sky-50 text-[#163A5F]'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {getJobTypeLabel(jt)}
                </button>
              ))}
            </div>
          )}

          {/* Fursa Inline Composer — always inline inside the Fursa page, never a popup */}
          {effectiveCategory === 'Fursa' && (
            <div
              ref={fursaComposerAnchorRef}
              className={`scroll-mt-[calc(var(--malosha-header-h,106px)+14px)] ${
                fursaInlineOpen ? 'mb-4' : ''
              }`}
            >
              <FursaInlineComposer
                expanded={fursaInlineOpen}
                onExpandedChange={setFursaInlineOpen}
                userUid={userUid}
                userDisplayName={userDisplayName}
                userPhoto={userPhoto}
                isSuspended={isSuspended}
                onSignIn={onSignIn}
                onSubmitPost={onCreateFursaPost}
                onToast={onToast}
              />
            </div>
          )}

          {/* Feed Body */}
          {loading ? (
            <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white sm:rounded-lg">
              {[1, 2, 3, 4].map((idx) => (
                <div key={idx} className="flex gap-3.5 p-4 animate-pulse">
                  <div className="h-10 w-10 rounded-full bg-slate-100 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 rounded bg-slate-100" />
                    <div className="h-3 w-1/2 rounded bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredTopics.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center sm:rounded-lg sm:py-14">
              <h2 className="font-display text-xl font-semibold text-slate-900">
                {tr('Hakuna machapisho yaliyopatikana', 'No posts found')}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
                {topics.length === 0
                  ? tr(
                      'Jukwaa bado halina machapisho yoyote. Anza kwa kuchapisha kwenye Kijiweni, Fursa, au Makala.',
                      'The forum has no posts yet. Start by posting in Kijiweni, Opportunities, or Articles.'
                    )
                  : tr(
                      'Jaribu kubadilisha maneno ya utafutaji au chagua sehemu nyingine.',
                      'Try changing your search terms or selecting another section.'
                    )}
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                {userUid ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (effectiveCategory === 'Kijiweni') {
                          setInlineComposerOpen(true);
                          window.setTimeout(() => {
                            inlineComposerAnchorRef.current?.scrollIntoView({
                              behavior: 'smooth',
                              block: 'start',
                            });
                          }, 70);
                        } else if (effectiveCategory === 'Fursa') {
                          setFursaInlineOpen(true);
                          window.setTimeout(() => {
                            fursaComposerAnchorRef.current?.scrollIntoView({
                              behavior: 'smooth',
                              block: 'start',
                            });
                          }, 70);
                        } else {
                          onOpenComposer();
                        }
                      }}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#1D4E89] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#163A5F]"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      <span>{composerButtonLabel}</span>
                    </button>
                    {topics.length === 0 && (
                      <button
                        type="button"
                        disabled={seeding}
                        onClick={onSeedStarterTopics}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-60"
                      >
                        <Sparkles className="h-4 w-4 text-[#D97706]" aria-hidden="true" />
                        <span>
                          {seeding
                            ? tr('Inapakia...', 'Loading...')
                            : tr('Pakia Maudhui ya Mfano', 'Load Sample Posts')}
                        </span>
                      </button>
                    )}
                  </>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-600">
                      {tr(
                        'Tengeneza akaunti (Google au Jisajili kawaida) ili kuchapisha mada au fursa mpya.',
                        'Create an account (Google or Register) to publish a new topic or opportunity.'
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() => onSignIn('post')}
                      className="inline-flex min-h-[42px] items-center rounded-lg bg-[#1D4E89] px-4 py-2 text-xs font-semibold text-white hover:bg-[#163A5F]"
                    >
                      {tr('Jisajili / Ingia', 'Register / Sign In')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : effectiveCategory === 'Fursa' ? (
            /* ── FURSA: Youth Job Announcements & Opportunities Feed ───────────── */
            <div className="space-y-4">
              {paginatedTopics.map((job) => (
                <FursaPostCard
                  key={job.id}
                  post={job}
                  userUid={userUid}
                  userDisplayName={userDisplayName}
                  userPhoto={userPhoto}
                  isAdmin={isAdmin}
                  isSuspended={isSuspended}
                  hasVoted={votedTopicIds.has(job.id)}
                  onToggleVote={onToggleVote}
                  onShareTopic={onShareTopic}
                  onOpenFullTopic={onOpenTopic}
                  onEditTopic={onEditTopic}
                  onDeleteTopic={onDeleteTopic}
                  onOpenReport={onOpenReport}
                  onAuthorClick={onAuthorClick}
                  onSignIn={onSignIn}
                  onToast={onToast}
                  onRequestConfirm={onRequestConfirm}
                />
              ))}
              {canAutoScrollMore && (
                <div ref={scrollSentinelRef} className="flex flex-col items-center gap-2 py-3 text-center">
                  <span className="text-xs font-medium text-slate-400">
                    {loadingMoreCloudTopics
                      ? tr('Inapakia fursa kutoka wingu...', 'Loading from cloud...')
                      : tr('Inapakia kadri unavyoshuka...', 'Loading as you scroll...')}
                  </span>
                </div>
              )}
              {reachedGateCap && (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={handleUnlockNextBatch}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-xs font-bold text-slate-800 transition-colors hover:border-[#1D4E89] hover:text-[#1D4E89]"
                  >
                    <span>
                      {remainingTopicsCount > 0
                        ? tr(
                            `Onyesha machapisho zaidi (${remainingTopicsCount} yamesalia)`,
                            `Show more posts (${remainingTopicsCount} remaining)`
                          )
                        : tr('Onyesha machapisho zaidi', 'Show more posts')}
                    </span>
                  </button>
                </div>
              )}
            </div>
          ) : effectiveCategory === 'Kijiweni' ? (
            /* ── KIJIWENI: Cloud-First Lazy Feed (100 posts progressive scroll before Load More) ─ */
            <div className="space-y-4">
              {paginatedTopics.map((post) => (
                <KijiweniPostCard
                  key={post.id}
                  post={post}
                  userUid={userUid}
                  userDisplayName={userDisplayName}
                  userPhoto={userPhoto}
                  isAdmin={isAdmin}
                  isSuspended={isSuspended}
                  hasVoted={votedTopicIds.has(post.id)}
                  onToggleVote={onToggleVote}
                  onShareTopic={onShareTopic}
                  onOpenFullTopic={onOpenTopic}
                  onEditTopic={onEditTopic}
                  onTogglePrivate={onTogglePrivate}
                  onDeleteTopic={onDeleteTopic}
                  onOpenReport={onOpenReport}
                  onAuthorClick={onAuthorClick}
                  onSignIn={onSignIn}
                  onToast={onToast}
                  onRequestConfirm={onRequestConfirm}
                />
              ))}
              {canAutoScrollMore && (
                <div ref={scrollSentinelRef} className="flex flex-col items-center gap-2 py-3 text-center">
                  <span className="text-xs font-medium text-slate-400">
                    {loadingMoreCloudTopics
                      ? tr('Inapakia machapisho kutoka wingu...', 'Loading posts from cloud...')
                      : tr('Inapakia machapisho kadri unavyoshuka...', 'Loading posts as you scroll...')}
                  </span>
                </div>
              )}
              {reachedGateCap && (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={handleUnlockNextBatch}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-xs font-bold text-slate-800 transition-colors hover:border-[#1D4E89] hover:text-[#1D4E89]"
                  >
                    <span>
                      {remainingTopicsCount > 0
                        ? tr(
                            `Onyesha machapisho zaidi (${remainingTopicsCount} yamesalia)`,
                            `Show more posts (${remainingTopicsCount} remaining)`
                          )
                        : tr('Onyesha machapisho zaidi', 'Show more posts')}
                    </span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* ── MADA ZOTE & ZILIZOVUMA: JamiiForums-Inspired Responsive Thread List ─ */
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white sm:rounded-lg">
              {/* Desktop Column Header Strip */}
              <div className="hidden md:flex items-center justify-between bg-[#1D4E89] px-5 py-2.5 text-xs font-semibold text-white">
                <span className="flex-1">{tr('Mada na Muanzishaji', 'Topic & Author')}</span>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="w-16 text-right">{tr('Maoni', 'Replies')}</span>
                  <span className="w-20 text-right">{tr('Penda', 'Likes')}</span>
                  <span className="w-16 text-center">{tr('Shiriki', 'Share')}</span>
                  <span className="w-24 text-right">{tr('Mwisho', 'Last')}</span>
                </div>
              </div>

              <div className="divide-y divide-slate-200">
                {paginatedTopics.map((topic) => {
                  const voted = votedTopicIds.has(topic.id);
                  const boardLabel = normalizeBoardCategory(topic.category);
                  const plainExcerpt = stripMarkdownPreview(topic.body);

                  return (
                    <article
                      key={topic.id}
                      className={`p-4 transition-colors hover:bg-slate-50 md:flex md:items-center md:justify-between md:gap-3 md:px-5 md:py-3.5 ${
                        topic.isPinned ? 'bg-amber-50/35' : ''
                      }`}
                    >
                      {/* Mobile Top Author Row */}
                      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-slate-500 md:hidden">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              onAuthorClick?.({
                                uid: topic.authorId,
                                displayName: topic.authorName,
                                photoURL: topic.authorPhoto,
                              })
                            }
                            className="flex min-w-0 items-center gap-1.5 hover:underline"
                          >
                            <Avatar
                              name={topic.authorName}
                              photoURL={topic.authorPhoto}
                              uid={topic.authorId}
                              size="sm"
                            />
                            <span className="truncate font-semibold text-slate-800 hover:text-[#1D4E89]">
                              <AuthorName uid={topic.authorId} fallback={topic.authorName} />
                            </span>
                            <AuthorVerificationBadge uid={topic.authorId} size="xs" />
                          </button>
                          <span aria-hidden="true">·</span>
                          <span className="shrink-0">
                            {formatTime(topic.lastActivityAt || topic.createdAt)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleBoardSelect(boardLabel)}
                          className={`shrink-0 font-semibold ${
                            boardLabel === 'Makala' ? 'text-[#B80000]' : 'text-[#1D4E89]'
                          }`}
                        >
                          {getBoardLabel(boardLabel)}
                        </button>
                      </div>

                      {/* Desktop Left Avatar + Thread Info */}
                      <div className="flex min-w-0 flex-1 items-start gap-3.5">
                        <button
                          type="button"
                          onClick={() =>
                            onAuthorClick?.({
                              uid: topic.authorId,
                              displayName: topic.authorName,
                              photoURL: topic.authorPhoto,
                            })
                          }
                          aria-label={tr(`Tazama wasifu wa ${topic.authorName}`, `View ${topic.authorName}'s profile`)}
                          className="hidden pt-0.5 md:block shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4E89]"
                        >
                          <Avatar
                            name={topic.authorName}
                            photoURL={topic.authorPhoto}
                            uid={topic.authorId}
                            size="md"
                          />
                        </button>

                        <div className="min-w-0 flex-1">
                          {(topic.isPinned ||
                            topic.status === 'locked' ||
                            topic.status === 'private' ||
                            topic.acceptedReplyId) && (
                            <div className="mb-1 flex flex-wrap items-center gap-3 text-[11px] font-semibold">
                              {topic.isPinned && (
                                <span className="inline-flex items-center gap-1 text-[#B45309]">
                                  <Pin className="h-3 w-3" aria-hidden="true" />
                                  <span>{tr('Mada Maalum', 'Pinned')}</span>
                                </span>
                              )}
                              {topic.acceptedReplyId && (
                                <span className="inline-flex items-center gap-1 text-emerald-800">
                                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                                  <span>{tr('Imepata Jibu', 'Answered')}</span>
                                </span>
                              )}
                              {topic.status === 'locked' && (
                                <span className="inline-flex items-center gap-1 text-slate-600">
                                  <Lock className="h-3 w-3" aria-hidden="true" />
                                  <span>{tr('Imefungwa', 'Locked')}</span>
                                </span>
                              )}
                              {topic.status === 'private' && (
                                <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
                                  <EyeOff className="h-3 w-3" aria-hidden="true" />
                                  <span>{tr('Akaunti Yako Tu', 'Only Me')}</span>
                                </span>
                              )}
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => onOpenTopic(topic.id)}
                            className="block w-full text-left font-sans text-[15px] font-semibold leading-snug text-[#163A5F] transition-colors hover:text-[#1D4E89] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4E89]"
                          >
                            {topic.title.trim() ||
                              plainExcerpt.slice(0, 80) ||
                              tr('Chapisho la picha Kijiweni', 'Kijiweni photo post')}
                          </button>

                          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-600 md:hidden">
                            {plainExcerpt}
                          </p>

                          {/* Desktop Unboxed Inline Metadata */}
                          <div className="mt-1 hidden flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500 md:flex">
                            <button
                              type="button"
                              onClick={() =>
                                onAuthorClick?.({
                                  uid: topic.authorId,
                                  displayName: topic.authorName,
                                  photoURL: topic.authorPhoto,
                                })
                              }
                              className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-[#1D4E89] hover:underline"
                            >
                              <span>
                                <AuthorName uid={topic.authorId} fallback={topic.authorName} />
                              </span>
                              <AuthorVerificationBadge uid={topic.authorId} size="xs" />
                            </button>
                            <span aria-hidden="true">·</span>
                            <button
                              type="button"
                              onClick={() => handleBoardSelect(boardLabel)}
                              className={`font-medium hover:underline ${
                                boardLabel === 'Makala' ? 'text-[#B80000]' : 'text-[#1D4E89]'
                              }`}
                            >
                              {getBoardLabel(boardLabel)}
                            </button>
                            {boardLabel === 'Fursa' && topic.company && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-medium text-slate-700">{topic.company}</span>
                              </>
                            )}
                            <span aria-hidden="true">·</span>
                            <span>{formatTime(topic.createdAt)}</span>
                            {topic.tags.length > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-slate-400">
                                  {topic.tags.map((t) => `#${t}`).join(' ')}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Mobile Bottom Action Bar & Desktop Tabular Columns */}
                      <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-2.5 text-xs md:mt-0 md:justify-end md:gap-4 md:border-t-0 md:pt-0 shrink-0">
                        <div className="flex items-center gap-2 md:gap-4">
                          <div className="md:order-2 md:w-20 md:text-right">
                            <button
                              type="button"
                              onClick={() => onToggleVote(topic)}
                              aria-pressed={voted}
                              aria-label={tr(`Penda ${topic.title}`, `Like ${topic.title}`)}
                              className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-xs font-medium tabular-nums transition-colors md:min-h-0 md:rounded-md md:px-2 ${
                                voted
                                  ? 'border-rose-300 bg-rose-50 text-rose-700'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                              }`}
                            >
                              <Heart
                                className={`h-4 w-4 md:h-3.5 md:w-3.5 ${
                                  voted ? 'fill-rose-600 text-rose-600' : ''
                                }`}
                                aria-hidden="true"
                              />
                              <span>{topic.upvotesCount}</span>
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => onOpenTopic(topic.id)}
                            aria-label={tr(`Maoni (${topic.repliesCount})`, `Comments (${topic.repliesCount})`)}
                            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-2 font-mono tabular-nums text-slate-600 hover:text-slate-900 md:order-1 md:min-h-0 md:w-16 md:justify-end md:px-0"
                          >
                            <MessageCircle
                              className="h-4 w-4 text-slate-400 md:h-3.5 md:w-3.5"
                              aria-hidden="true"
                            />
                            <span className="font-semibold text-slate-800">{topic.repliesCount}</span>
                            <span className="font-sans text-slate-500 md:hidden">
                              {tr('Maoni', 'Replies')}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onShareTopic(topic)}
                            aria-label={tr(
                              `Shiriki ${topic.title} (${topic.sharesCount ?? 0})`,
                              `Share ${topic.title} (${topic.sharesCount ?? 0})`
                            )}
                            className="inline-flex min-h-[38px] items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-600 hover:bg-slate-50 hover:text-slate-900 md:order-3 md:min-h-0 md:w-16 md:border-0 md:bg-transparent md:px-1"
                          >
                            <Share2 className="h-4 w-4 md:h-3.5 md:w-3.5" aria-hidden="true" />
                            <span className="font-mono font-semibold text-slate-800 tabular-nums">
                              {topic.sharesCount ?? 0}
                            </span>
                            <span className="font-sans md:hidden">{tr('Shiriki', 'Share')}</span>
                          </button>
                        </div>

                        <div className="hidden text-right text-[11px] text-slate-500 md:block md:w-24">
                          {formatTime(topic.lastActivityAt || topic.createdAt)}
                        </div>

                        <button
                          type="button"
                          onClick={() => onOpenTopic(topic.id)}
                          className={
                            boardLabel === 'Makala'
                              ? 'bbc-read-more-btn inline-flex min-h-[38px] items-center gap-1 px-3 py-1.5 text-[11px] font-extrabold tracking-wide uppercase whitespace-nowrap shrink-0 md:hidden'
                              : 'inline-flex min-h-[38px] items-center gap-1 text-xs font-semibold text-[#1D4E89] md:hidden'
                          }
                        >
                          <span>
                            {boardLabel === 'Makala'
                              ? tr('Soma Zaidi', 'Read More')
                              : tr('Fungua', 'Open')}
                          </span>
                          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
              {canAutoScrollMore && (
                <div ref={scrollSentinelRef} className="border-t border-slate-200 bg-slate-50/70 p-3 text-center">
                  <span className="text-xs font-medium text-slate-400">
                    {loadingMoreCloudTopics
                      ? tr('Inapakia mada kutoka wingu...', 'Loading topics from cloud...')
                      : tr('Inapakia kadri unavyoshuka...', 'Loading as you scroll...')}
                  </span>
                </div>
              )}
              {reachedGateCap && (
                <div className="border-t border-slate-200 bg-slate-50/70 p-3 text-center">
                  <button
                    type="button"
                    onClick={handleUnlockNextBatch}
                    className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2 text-xs font-bold text-[#163A5F] transition-colors hover:border-[#1D4E89] hover:bg-sky-50/50"
                  >
                    <span>
                      {remainingTopicsCount > 0
                        ? tr(
                            `Onyesha machapisho zaidi (${remainingTopicsCount} yamesalia)`,
                            `Show more posts (${remainingTopicsCount} remaining)`
                          )
                        : tr('Onyesha machapisho zaidi', 'Show more posts')}
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Sidebar (Desktop Only) */}
        <aside className="hidden w-76 shrink-0 space-y-5 lg:block">
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="bg-[#163A5F] px-4 py-2.5 text-white">
              <h3 className="text-xs font-semibold tracking-wide uppercase">
                {tr('Vipengele vya Jukwaa', 'Forum Sections')}
              </h3>
            </div>
            <div className="divide-y divide-slate-100 p-2">
              <button
                type="button"
                onClick={() => handleBoardSelect('all')}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-xs transition-colors ${
                  activeTab === 'all' && effectiveCategory === 'all'
                    ? 'bg-sky-50 font-semibold text-[#163A5F]'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-2">
                  <NavSectionIcon section="all" className="h-4 w-4 shrink-0" />
                  <span>{tr('Mada Zote', 'All Topics')}</span>
                </span>
                <span className="font-mono tabular-nums text-slate-500">
                  {categoryCounts.all}
                </span>
              </button>
              {FORUM_BOARDS.map((board) => {
                const active = effectiveCategory === board.id;
                const unread = active ? 0 : getBoardUnread(board.id);
                return (
                  <button
                    key={board.id}
                    type="button"
                    onClick={() => handleBoardSelect(board.id)}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs transition-colors ${
                      active
                        ? 'bg-sky-50 font-semibold text-[#163A5F]'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2 pr-2">
                      <NavSectionIcon
                        section={getBoardIconSection(board.id)}
                        className="h-4 w-4 shrink-0"
                      />
                      <span className="truncate">{getBoardLabel(board.id)}</span>
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {unread > 0 && (
                        <span className="flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[#E11D48] px-1 text-[10px] font-bold leading-none text-white tabular-nums">
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                      <span className="font-mono tabular-nums text-slate-500">
                        {categoryCounts[board.id] ?? 0}
                      </span>
                    </span>
                  </button>
                );
              })}
              {!hideMpollTab && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectCategory('all');
                    onSelectTab('votes');
                  }}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs transition-colors ${
                    activeTab === 'votes'
                      ? 'bg-sky-50 font-semibold text-[#163A5F]'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <NavSectionIcon section="votes" className="h-4 w-4 shrink-0" />
                    <span>Mpoll</span>
                  </span>
                  {(unreadCounts?.votes || 0) > 0 && (
                    <span className="flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[#E11D48] px-1 text-[10px] font-bold leading-none text-white tabular-nums">
                      {(unreadCounts?.votes || 0) > 99 ? '99+' : unreadCounts?.votes}
                    </span>
                  )}
                </button>
              )}
            </div>

            {userUid && (
              <div className="border-t border-slate-200 p-3">
                <button
                  type="button"
                  onClick={onToggleOnlyMine}
                  className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                    onlyMine
                      ? 'border-[#1D4E89] bg-sky-50 text-[#163A5F]'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>{tr('Mada Zangu Pekee', 'My Posts Only')}</span>
                  <span>{onlyMine ? tr('Washa', 'On') : tr('Zima', 'Off')}</span>
                </button>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="bg-[#163A5F] px-4 py-2.5 text-white">
              <h3 className="text-xs font-semibold tracking-wide uppercase">
                {tr('Takwimu za Malosha Forums', 'Malosha Forums Stats')}
              </h3>
            </div>
            <div className="grid grid-cols-2 divide-x divide-slate-200 p-4 text-center tabular-nums">
              <div>
                <span className="block font-mono text-lg font-bold text-slate-900">
                  {topics.length}
                </span>
                <span className="text-xs text-slate-500">{tr('Machapisho', 'Posts')}</span>
              </div>
              <div>
                <span className="block font-mono text-lg font-bold text-slate-900">
                  {totalReplies}
                </span>
                <span className="text-xs text-slate-500">{tr('Maoni', 'Comments')}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
