import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
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
  NavTab,
  PrimaryBoard,
  SortMode,
  Topic,
  TopicCategory,
  normalizeBoardCategory,
} from '../types';
import { useLanguage } from '../context/LanguageContext';
import { Avatar } from './Avatar';
import { FursaInlineComposer } from './FursaInlineComposer';
import { FursaPostCard } from './FursaPostCard';
import { KijiweniPostCard } from './KijiweniPostCard';
import { KijiweniInlineComposer } from './KijiweniInlineComposer';
import { MakalaNewsroom } from './MakalaNewsroom';
import { AuthorVerificationBadge } from './VerificationBadge';

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
  onCreateKijiweniPost: (data: {
    title: string;
    body: string;
    tags: string[];
    coverImage?: string;
  }) => Promise<void>;
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
  onEditTopic: (topic: Topic) => void;
  onDeleteTopic: (topic: Topic) => void;
  onOpenReport: (targetType: 'topic' | 'reply', targetId: string, topicId: string) => void;
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
  onEditTopic,
  onDeleteTopic,
  onOpenReport,
  onSignIn,
  onToast,
  onRequestConfirm,
  onSeedStarterTopics,
  seeding,
  onVisibleTopicIdsChange,
}) => {
  const { tr, formatTime, getBoardLabel, getBoardDescription, getJobTypeLabel } = useLanguage();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const inlineComposerAnchorRef = useRef<HTMLDivElement>(null);
  const fursaComposerAnchorRef = useRef<HTMLDivElement>(null);
  const [selectedJobType, setSelectedJobType] = useState<string>('all');
  const [inlineComposerOpen, setInlineComposerOpen] = useState(false);
  const [fursaInlineOpen, setFursaInlineOpen] = useState(false);
  const [makalaInlineOpen, setMakalaInlineOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState<number>(8);

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
  }, [effectiveCategory]);

  useEffect(() => {
    if (inlineExpandRequest <= 0) return;
    if (effectiveCategory === 'Kijiweni') {
      setInlineComposerOpen(true);
      inlineComposerAnchorRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    } else if (effectiveCategory === 'Fursa') {
      setFursaInlineOpen(true);
      fursaComposerAnchorRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    } else if (effectiveCategory === 'Makala') {
      setMakalaInlineOpen(true);
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

  const trendingPreview = useMemo(() => {
    return [...topics]
      .sort((a, b) => {
        const scoreA = a.upvotesCount * 2 + a.repliesCount;
        const scoreB = b.upvotesCount * 2 + b.repliesCount;
        return scoreB - scoreA;
      })
      .slice(0, 4);
  }, [topics]);

  const filteredTopics = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const list = topics.filter((topic) => {
      const normalizedCat = normalizeBoardCategory(topic.category);
      if (onlyMine && userUid && topic.authorId !== userUid) {
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

    const getCreatedMillis = (t: Topic) => (t.createdAt ? t.createdAt.toMillis() : Date.now());
    const getActivityMillis = (t: Topic) =>
      t.lastActivityAt ? t.lastActivityAt.toMillis() : getCreatedMillis(t);

    return [...list].sort((a, b) => {
      if (activeTab === 'trending') {
        const scoreA = a.upvotesCount * 2 + a.repliesCount;
        const scoreB = b.upvotesCount * 2 + b.repliesCount;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return getActivityMillis(b) - getActivityMillis(a);
      }

      if (sortMode === 'votes') {
        if (b.upvotesCount !== a.upvotesCount) {
          return b.upvotesCount - a.upvotesCount;
        }
        if (b.repliesCount !== a.repliesCount) {
          return b.repliesCount - a.repliesCount;
        }
        return getCreatedMillis(b) - getCreatedMillis(a);
      }

      if (sortMode === 'oldest') {
        const diff = getCreatedMillis(a) - getCreatedMillis(b);
        if (diff !== 0) return diff;
        return a.id.localeCompare(b.id);
      }

      const diff = getCreatedMillis(b) - getCreatedMillis(a);
      if (diff !== 0) return diff;
      return getActivityMillis(b) - getActivityMillis(a);
    });
  }, [
    topics,
    activeTab,
    effectiveCategory,
    selectedJobType,
    sortMode,
    searchQuery,
    onlyMine,
    userUid,
  ]);

  useEffect(() => {
    setVisibleCount(8);
  }, [activeTab, effectiveCategory, selectedJobType, sortMode, searchQuery, onlyMine]);

  const paginatedTopics = useMemo(
    () => filteredTopics.slice(0, visibleCount),
    [filteredTopics, visibleCount]
  );

  const remainingTopicsCount = Math.max(0, filteredTopics.length - paginatedTopics.length);

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
    : activeTab === 'trending'
      ? tr('Zilizovuma', 'Trending')
      : tr('Ukumbi wa Mijadala', 'Community Forums');

  const pageSubheading = activeBoardMeta
    ? getBoardDescription(activeBoardMeta.id)
    : activeTab === 'trending'
      ? tr(
          'Mada zinazovuma zaidi kutoka Kijiweni, Fursa, na Makala kulingana na mapendekezo na maoni.',
          'Most active discussions across Kijiweni, Opportunities, and Articles based on likes and comments.'
        )
      : tr(
          'Karibu Malosha Forums — Kijiweni, Fursa za Vijana, Makala za Uchambuzi, na Zilizovuma.',
          'Welcome to Malosha Forums — Kijiweni, Youth Opportunities, Articles & Analysis, and Trending.'
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
        isSuspended={isSuspended}
        votedTopicIds={votedTopicIds}
        onToggleVote={onToggleVote}
        onShareTopic={onShareTopic}
        onOpenTopic={onOpenTopic}
        onCreateMakalaPost={onCreateMakalaPost}
        onSignIn={onSignIn}
        onToast={onToast}
        onBackToAll={() => handleBoardSelect('all')}
        inlineExpanded={makalaInlineOpen}
        onInlineExpandedChange={setMakalaInlineOpen}
        onVisibleTopicIdsChange={onVisibleTopicIdsChange}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-3.5 py-4 sm:px-6 sm:py-6">
      {/* Breadcrumb Bar when inside a specific section */}
      {effectiveCategory !== 'all' && (
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

      {/* Forum Masthead Banner */}
      <div className="mb-4 flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4 sm:mb-6 sm:flex-row sm:items-center sm:rounded-lg sm:px-5 sm:py-5">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-slate-900 sm:text-3xl [text-wrap:balance]">
            {pageHeading}
          </h1>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">{pageSubheading}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {(effectiveCategory !== 'all' || activeTab === 'trending') && (
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
              if (effectiveCategory === 'Kijiweni') {
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
                inlineComposerAnchorRef.current?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'nearest',
                });
              } else if (effectiveCategory === 'Fursa') {
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
                fursaComposerAnchorRef.current?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'nearest',
                });
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

      {/* Main Split Grid */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Left/Primary Feed */}
        <div className="min-w-0 flex-1">
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

            {activeTab !== 'trending' && (
              <div
                role="group"
                aria-label={tr('Mpangilio wa mada', 'Topic sorting')}
                className="grid grid-cols-3 rounded-lg border border-slate-300 bg-white p-1 sm:inline-flex shrink-0"
              >
                {(
                  [
                    { id: 'newest', label: tr('Mpya Zaidi', 'Newest') },
                    { id: 'votes', label: tr('Pendwa Zaidi', 'Most Liked') },
                    { id: 'oldest', label: tr('Zilizotangulia', 'Earlier') },
                  ] as { id: SortMode; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeSort(opt.id)}
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
            )}
          </div>

          {/* Mobile Quick Filter Row */}
          <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1 lg:hidden">
            <button
              type="button"
              onClick={() => handleBoardSelect('all')}
              className={`min-h-[38px] rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
                activeTab === 'all' && effectiveCategory === 'all'
                  ? 'border-[#163A5F] bg-[#163A5F] text-white'
                  : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              {tr('Zote', 'All')} ({categoryCounts.all})
            </button>
            {FORUM_BOARDS.map((board) => (
              <button
                key={board.id}
                type="button"
                onClick={() => handleBoardSelect(board.id)}
                className={`min-h-[38px] rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
                  effectiveCategory === board.id
                    ? 'border-[#163A5F] bg-[#163A5F] text-white'
                    : 'border-slate-300 bg-white text-slate-700'
                }`}
              >
                {getBoardLabel(board.id)} ({categoryCounts[board.id] ?? 0})
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                onSelectCategory('all');
                onSelectTab('trending');
              }}
              className={`min-h-[38px] rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
                activeTab === 'trending'
                  ? 'border-[#163A5F] bg-[#163A5F] text-white'
                  : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              {tr('Zilizovuma', 'Trending')}
            </button>
          </div>

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

          {/* Kijiweni Inline Composer — always inline inside the page, never a popup */}
          {effectiveCategory === 'Kijiweni' && (
            <div ref={inlineComposerAnchorRef} className="mb-4">
              <KijiweniInlineComposer
                expanded={inlineComposerOpen}
                onExpandedChange={setInlineComposerOpen}
                userUid={userUid}
                userDisplayName={userDisplayName}
                userPhoto={userPhoto}
                isSuspended={isSuspended}
                onSignIn={onSignIn}
                onSubmitPost={onCreateKijiweniPost}
                onToast={onToast}
              />
            </div>
          )}

          {/* Fursa Inline Composer — always inline inside the Fursa page, never a popup */}
          {effectiveCategory === 'Fursa' && (
            <div ref={fursaComposerAnchorRef} className="mb-4">
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
                          inlineComposerAnchorRef.current?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'nearest',
                          });
                        } else if (effectiveCategory === 'Fursa') {
                          setFursaInlineOpen(true);
                          fursaComposerAnchorRef.current?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'nearest',
                          });
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
                  onSignIn={onSignIn}
                  onToast={onToast}
                  onRequestConfirm={onRequestConfirm}
                />
              ))}
              {remainingTopicsCount > 0 && (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((prev) => prev + 8)}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-xs font-bold text-slate-800 transition-colors hover:border-[#1D4E89] hover:text-[#1D4E89]"
                  >
                    <span>
                      {tr(
                        `Onyesha Fursa Zaidi (${remainingTopicsCount} zimesalia)`,
                        `Load More Opportunities (${remainingTopicsCount} remaining)`
                      )}
                    </span>
                  </button>
                </div>
              )}
            </div>
          ) : effectiveCategory === 'Kijiweni' ? (
            /* ── KIJIWENI: Facebook-Style Feed with Threadlike Comments ─ */
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
                  onDeleteTopic={onDeleteTopic}
                  onOpenReport={onOpenReport}
                  onSignIn={onSignIn}
                  onToast={onToast}
                  onRequestConfirm={onRequestConfirm}
                />
              ))}
              {remainingTopicsCount > 0 && (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((prev) => prev + 8)}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-xs font-bold text-slate-800 transition-colors hover:border-[#1D4E89] hover:text-[#1D4E89]"
                  >
                    <span>
                      {tr(
                        `Onyesha Machapisho Zaidi (${remainingTopicsCount} yamesalia)`,
                        `Load More Posts (${remainingTopicsCount} remaining)`
                      )}
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
                          <Avatar name={topic.authorName} photoURL={topic.authorPhoto} size="sm" />
                          <span className="truncate font-semibold text-slate-800">
                            {topic.authorName}
                          </span>
                          <AuthorVerificationBadge uid={topic.authorId} size="xs" />
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
                        <div className="hidden pt-0.5 md:block shrink-0">
                          <Avatar name={topic.authorName} photoURL={topic.authorPhoto} size="md" />
                        </div>

                        <div className="min-w-0 flex-1">
                          {(topic.isPinned || topic.status === 'locked' || topic.acceptedReplyId) && (
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
                            <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                              <span>{topic.authorName}</span>
                              <AuthorVerificationBadge uid={topic.authorId} size="xs" />
                            </span>
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
                            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-2 font-mono tabular-nums text-slate-600 hover:text-slate-900 md:order-1 md:min-h-0 md:w-16 md:justify-end md:px-0"
                          >
                            <MessageCircle
                              className="h-4 w-4 text-slate-400 md:hidden"
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
                            aria-label={tr(`Shiriki ${topic.title}`, `Share ${topic.title}`)}
                            className="inline-flex min-h-[38px] items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-600 hover:bg-slate-50 hover:text-slate-900 md:order-3 md:min-h-0 md:w-16 md:border-0 md:bg-transparent md:px-1"
                          >
                            <Share2 className="h-4 w-4 md:h-3.5 md:w-3.5" aria-hidden="true" />
                            <span className="font-sans md:hidden">{tr('Shiriki', 'Share')}</span>
                          </button>
                        </div>

                        <div className="hidden text-right text-[11px] text-slate-500 md:block md:w-24">
                          {formatTime(topic.lastActivityAt || topic.createdAt)}
                        </div>

                        <button
                          type="button"
                          onClick={() => onOpenTopic(topic.id)}
                          className="inline-flex min-h-[38px] items-center gap-1 text-xs font-semibold text-[#1D4E89] md:hidden"
                        >
                          <span>{tr('Fungua', 'Open')}</span>
                          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
              {remainingTopicsCount > 0 && (
                <div className="border-t border-slate-200 bg-slate-50/70 p-3 text-center">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((prev) => prev + 8)}
                    className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2 text-xs font-bold text-[#163A5F] transition-colors hover:border-[#1D4E89] hover:bg-sky-50/50"
                  >
                    <span>
                      {tr(
                        `Onyesha Mada Zaidi (${remainingTopicsCount} zimesalia)`,
                        `Load More Topics (${remainingTopicsCount} remaining)`
                      )}
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
                <span>{tr('Mada Zote', 'All Topics')}</span>
                <span className="font-mono tabular-nums text-slate-500">
                  {categoryCounts.all}
                </span>
              </button>
              {FORUM_BOARDS.map((board) => {
                const active = effectiveCategory === board.id;
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
                    <span className="truncate pr-2">{getBoardLabel(board.id)}</span>
                    <span className="font-mono tabular-nums text-slate-500">
                      {categoryCounts[board.id] ?? 0}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  onSelectCategory('all');
                  onSelectTab('trending');
                }}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs transition-colors ${
                  activeTab === 'trending'
                    ? 'bg-sky-50 font-semibold text-[#163A5F]'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>{tr('Zilizovuma', 'Trending')}</span>
                <span className="font-mono tabular-nums text-slate-500">
                  {trendingPreview.length}
                </span>
              </button>
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

          {trendingPreview.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between bg-[#163A5F] px-4 py-2.5 text-white">
                <h3 className="text-xs font-semibold tracking-wide uppercase">
                  {tr('Zilizovuma', 'Trending')}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    onSelectCategory('all');
                    onSelectTab('trending');
                  }}
                  className="text-[11px] text-sky-200 hover:text-white hover:underline"
                >
                  {tr('Ona Zote', 'See All')}
                </button>
              </div>
              <div className="divide-y divide-slate-100">
                {trendingPreview.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onOpenTopic(item.id)}
                    className="block w-full px-4 py-3 text-left transition-colors hover:bg-slate-50"
                  >
                    <p className="line-clamp-2 text-xs font-semibold text-[#163A5F] hover:underline">
                      {item.title}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                      {getBoardLabel(normalizeBoardCategory(item.category))} ·{' '}
                      {tr('Maoni', 'Replies')} {item.repliesCount} · {tr('Penda', 'Likes')}{' '}
                      {item.upvotesCount}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

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
