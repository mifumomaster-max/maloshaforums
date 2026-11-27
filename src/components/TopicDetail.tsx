import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  Flag,
  Heart,
  Lock,
  MapPin,
  MessageCircle,
  Pin,
  RotateCcw,
  Share2,
  Trash2,
  Unlock,
} from 'lucide-react';
import {
  AuthPromptReason,
  Topic,
  getMakalaSection,
  normalizeBoardCategory,
  resolveMakalaCover,
} from '../types';
import { optimizeCloudinaryUrl } from '../services/cloudinaryService';
import { estimateReadMinutes } from '../utils/formatters';
import { useLanguage } from '../context/LanguageContext';
import { AuthorName, Avatar, OnlineStatusPill } from './Avatar';
import { MakalaArticleRenderer } from './MakalaArticleRenderer';
import { LinkedText, RichText, extractFirstUrl } from './RichText';
import { FacebookCommentsThread } from './FacebookCommentsThread';
import { AuthorVerificationBadge } from './VerificationBadge';
import { OrderedPhotoAlbum } from './OrderedPhotoAlbum';

interface TopicDetailProps {
  topic: Topic;
  latestMakala?: Topic[];
  onOpenTopic?: (topicId: string) => void;
  userUid: string | null;
  userDisplayName: string;
  userPhoto: string;
  isAdmin: boolean;
  isSuspended?: boolean;
  hasVotedTopic: boolean;
  onBack: () => void;
  onSelectBoard: (board: Topic['category']) => void;
  onToggleTopicVote: (topic: Topic) => void;
  onShareTopic: (topic: Topic) => void;
  onEditTopic: (topic: Topic) => void;
  onToggleLock: (topic: Topic) => void;
  onTogglePin: (topic: Topic) => void;
  onToggleArchive?: (topic: Topic) => void;
  onTogglePrivate?: (topic: Topic) => void;
  onDeleteTopic: (topic: Topic) => void;
  onOpenReport: (targetType: 'topic' | 'reply', targetId: string) => void;
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
}

export const TopicDetail: React.FC<TopicDetailProps> = ({
  topic,
  latestMakala = [],
  onOpenTopic,
  userUid,
  userDisplayName,
  userPhoto,
  isAdmin,
  isSuspended = false,
  hasVotedTopic,
  onBack,
  onSelectBoard,
  onToggleTopicVote,
  onShareTopic,
  onEditTopic,
  onToggleLock,
  onTogglePin,
  onToggleArchive,
  onTogglePrivate,
  onDeleteTopic,
  onOpenReport,
  onAuthorClick,
  onSignIn,
  onToast,
  onRequestConfirm,
}) => {
  const { tr, formatTime, getBoardLabel, getJobTypeLabel, getMakalaSectionLabel } = useLanguage();
  const [coverFailed, setCoverFailed] = useState(false);

  useEffect(() => {
    setCoverFailed(false);
  }, [topic.id, topic.coverImage]);

  const isTopicAuthor = userUid !== null && topic.authorId === userUid;
  const canManageTopic = isTopicAuthor || isAdmin;
  const isPrivateTopic = topic.status === 'private';
  const normalizedBoard = normalizeBoardCategory(topic.category);
  const isMakala = normalizedBoard === 'Makala';
  const isFursa = normalizedBoard === 'Fursa';
  const isKijiweni = normalizedBoard === 'Kijiweni';
  const readMinutes = estimateReadMinutes(topic.body);
  const albumImages = React.useMemo(() => {
    if (Array.isArray(topic.images) && topic.images.length > 0) {
      return topic.images;
    }
    return topic.coverImage ? [topic.coverImage] : [];
  }, [topic.images, topic.coverImage]);

  const otherLatestMakala = latestMakala.filter((item) => item.id !== topic.id).slice(0, 6);
  const makalaSection = getMakalaSection(topic.tags);

  return (
    <div className={`mx-auto px-3.5 py-4 sm:px-6 sm:py-6 ${isMakala ? 'max-w-6xl' : 'max-w-4xl'}`}>
      {/* Mobile Back Button + Desktop Breadcrumb */}
      <div className="mb-3 flex items-center justify-between sm:mb-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[40px] items-center gap-1.5 text-xs font-semibold text-[#1D4E89] hover:underline md:hidden"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>{tr('Rudi Nyuma', 'Back')}</span>
        </button>

        <nav
          aria-label={tr('Njia ya chapisho', 'Breadcrumb')}
          className="hidden md:flex flex-wrap items-center gap-1.5 text-xs text-slate-600"
        >
          <button
            type="button"
            onClick={onBack}
            className="font-medium text-[#1D4E89] hover:underline"
          >
            {tr('Mada Zote', 'All Topics')}
          </button>
          <ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          <button
            type="button"
            onClick={() => onSelectBoard(normalizedBoard)}
            className="font-medium text-[#1D4E89] hover:underline"
          >
            {getBoardLabel(normalizedBoard)}
          </button>
          <ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          <span className="max-w-md truncate text-slate-800">
            {topic.title.trim() || tr('Chapisho la Picha', 'Photo Post')}
          </span>
        </nav>
      </div>

      {topic.status === 'archived' && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-950">
          <div className="flex items-center gap-2 font-semibold">
            <EyeOff className="h-4 w-4 shrink-0 text-amber-800" aria-hidden="true" />
            <span>
              {isMakala
                ? tr(
                    'Makala hii imeondolewa kwa wengine na sasa inaonekana kwako pekee.',
                    'This article is hidden from others and is visible only to you.'
                  )
                : tr(
                    'Chapisho hili limefungwa kwa sababu ya maudhui mabaya na halionekani kwa watumiaji wengine.',
                    'This post is closed due to harmful content and is hidden from all other users.'
                  )}
            </span>
          </div>
          {(isAdmin || (isMakala && isTopicAuthor)) && onToggleArchive && (
            <button
              type="button"
              onClick={() => onToggleArchive(topic)}
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-[#0E2640] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#163A5F]"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr('Rejesha kwa Wote', 'Restore for Everyone')}</span>
            </button>
          )}
        </div>
      )}

      {isPrivateTopic && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-xs text-slate-900">
          <div className="flex items-center gap-2 font-semibold">
            <EyeOff className="h-4 w-4 shrink-0 text-slate-700" aria-hidden="true" />
            <span>
              {tr(
                'Chapisho hili limefungwa kwa faragha — linaonekana kwenye akaunti yako pekee.',
                'This post is locked to private — visible only in your account.'
              )}
            </span>
          </div>
          {isTopicAuthor && onTogglePrivate && (!isSuspended || isAdmin) && (
            <button
              type="button"
              onClick={() => onTogglePrivate(topic)}
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-[#0E2640] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#163A5F]"
            >
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr('Fungua kwa Wote', 'Make Public')}</span>
            </button>
          )}
        </div>
      )}

      {/* Main Content Presentation */}
      {isMakala ? (
        /* ── MAKALA: BBC News Swahili Reader & Latest News Sidebar ─────────────── */
        <div className="space-y-4 sm:space-y-6">
          {/* BBC Crimson Top Strip — single sleek row on mobile, full 7-block masthead on sm+ */}
          <div className="-mx-3.5 flex items-center justify-between gap-2 bg-[#B80000] px-3.5 py-2.5 text-white sm:mx-0 sm:px-6 sm:py-3">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <div className="flex shrink-0 items-center gap-0.5 sm:hidden" aria-hidden="true">
                {['M', 'L', 'S'].map((letter, idx) => (
                  <span
                    key={idx}
                    className="inline-flex h-5 w-4 items-center justify-center bg-white font-sans text-[11px] font-black text-[#B80000]"
                  >
                    {letter}
                  </span>
                ))}
              </div>
              <div className="hidden shrink-0 items-center gap-1 sm:flex" aria-hidden="true">
                {['M', 'A', 'L', 'O', 'S', 'H', 'A'].map((letter, idx) => (
                  <span
                    key={idx}
                    className="inline-flex h-6 w-5 items-center justify-center bg-white font-sans text-xs font-black text-[#B80000]"
                  >
                    {letter}
                  </span>
                ))}
              </div>
              <span className="min-w-0 truncate border-l border-white/30 pl-2 text-[11px] font-black tracking-wide uppercase sm:pl-3 sm:text-xs">
                {tr('Makala', 'Articles')} · {getMakalaSectionLabel(makalaSection)}
              </span>
            </div>

            <button
              type="button"
              onClick={() => onSelectBoard('Makala')}
              className="shrink-0 text-[11px] font-bold text-white/95 underline-offset-4 hover:underline whitespace-nowrap sm:text-xs"
            >
              <span className="sm:hidden">{tr('Habari Zote →', 'All News →')}</span>
              <span className="hidden sm:inline">{tr('Makala Zote Mpya →', 'All Latest Articles →')}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-start lg:gap-6">
            {/* Main Essay Column (8 cols) */}
            <div className="min-w-0 space-y-5 lg:col-span-8">
              <article className="-mx-3.5 overflow-hidden border-y border-slate-200 bg-white sm:mx-0 sm:border">
                <div className="min-w-0 px-4 py-4 sm:px-8 sm:py-8">
                  <div className="mb-1.5 flex items-center gap-2 text-[11px] font-black tracking-wide text-[#B80000] uppercase sm:mb-2 sm:text-xs">
                    <span>{getMakalaSectionLabel(makalaSection)}</span>
                  </div>

                  <h1 className="break-words font-display text-[22px] font-bold leading-[1.24] text-slate-950 sm:text-4xl sm:leading-tight [text-wrap:balance]">
                    {topic.title}
                  </h1>

                  <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2.5 border-y border-slate-200 py-2.5 text-xs text-slate-600 sm:mt-4 sm:gap-3 sm:py-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <button
                        type="button"
                        onClick={() =>
                          onAuthorClick?.({
                            uid: topic.authorId,
                            displayName: topic.authorName,
                            photoURL: topic.authorPhoto,
                          })
                        }
                        className="inline-flex min-w-0 items-center gap-1.5 font-bold text-slate-900 hover:text-[#1D4E89] hover:underline"
                      >
                        <Avatar
                          name={topic.authorName}
                          photoURL={topic.authorPhoto}
                          uid={topic.authorId}
                          showOnlineIndicator
                          size="sm"
                        />
                        <span className="truncate">
                          {tr('Na', 'By')}{' '}
                          <AuthorName uid={topic.authorId} fallback={topic.authorName} />
                        </span>
                        <AuthorVerificationBadge uid={topic.authorId} size="xs" />
                        <OnlineStatusPill uid={topic.authorId} />
                      </button>
                      <span aria-hidden="true">·</span>
                      <span>{formatTime(topic.createdAt)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                        <span>
                          {tr(
                            `Dakika ${readMinutes} za kusoma`,
                            `${readMinutes} min read`
                          )}
                        </span>
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <button
                        type="button"
                        onClick={() => onToggleTopicVote(topic)}
                        aria-pressed={hasVotedTopic}
                        className={`inline-flex min-h-[32px] items-center gap-1 border px-2.5 py-1 font-semibold transition-colors sm:min-h-[34px] ${
                          hasVotedTopic
                            ? 'border-rose-300 bg-rose-50 text-rose-700'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <Heart
                          className={`h-3.5 w-3.5 ${hasVotedTopic ? 'fill-rose-600 text-rose-600' : ''}`}
                          aria-hidden="true"
                        />
                        <span className="font-mono tabular-nums">{topic.upvotesCount}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          document
                            .getElementById('comments-thread')
                            ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }}
                        className="inline-flex min-h-[32px] items-center gap-1 border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 sm:min-h-[34px]"
                      >
                        <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="font-mono tabular-nums">{topic.repliesCount}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onShareTopic(topic)}
                        className="inline-flex min-h-[32px] items-center gap-1 border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 sm:min-h-[34px]"
                      >
                        <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{tr('Shiriki', 'Share')}</span>
                        <span className="font-mono tabular-nums">{topic.sharesCount ?? 0}</span>
                      </button>
                      {canManageTopic && (topic.status === 'open' || topic.status === 'private') && (!isSuspended || isAdmin) && (
                        <button
                          type="button"
                          onClick={() => onEditTopic(topic)}
                          className="inline-flex min-h-[32px] items-center gap-1 border border-slate-200 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 sm:min-h-[34px]"
                        >
                          <Edit3 className="h-3 w-3" aria-hidden="true" />
                          <span>{tr('Hariri', 'Edit')}</span>
                        </button>
                      )}
                      {isTopicAuthor && onTogglePrivate && topic.status !== 'archived' && (!isSuspended || isAdmin) && (
                        <button
                          type="button"
                          onClick={() => onTogglePrivate(topic)}
                          title={
                            isPrivateTopic
                              ? tr('Rejesha makala ionekane kwa wote', 'Restore article to public view')
                              : tr('Ondoa kwa wengine — ibaki inaonekana kwako pekee', 'Hide from others — keep visible only to you')
                          }
                          className={`inline-flex min-h-[32px] items-center gap-1 border px-2.5 py-1 font-semibold transition-colors sm:min-h-[34px] ${
                            isPrivateTopic
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                              : 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                          }`}
                        >
                          {isPrivateTopic ? (
                            <>
                              <Eye className="h-3 w-3" aria-hidden="true" />
                              <span>{tr('Rejesha kwa Wote', 'Restore Public')}</span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="h-3 w-3" aria-hidden="true" />
                              <span>{tr('Ondoa kwa Wengine', 'Hide from Others')}</span>
                            </>
                          )}
                        </button>
                      )}
                      {isAdmin && onToggleArchive && !isPrivateTopic && (!isTopicAuthor || topic.status === 'archived') && (
                        <button
                          type="button"
                          onClick={() => onToggleArchive(topic)}
                          className={`inline-flex min-h-[32px] items-center gap-1 border px-2.5 py-1 font-semibold sm:min-h-[34px] ${
                            topic.status === 'archived'
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                              : 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                          }`}
                        >
                          {topic.status === 'archived' ? (
                            <>
                              <RotateCcw className="h-3 w-3" aria-hidden="true" />
                              <span>{tr('Rejesha kwa Wote', 'Restore Public')}</span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="h-3 w-3" aria-hidden="true" />
                              <span>{tr('Ondoa kwa Wengine', 'Hide from Others')}</span>
                            </>
                          )}
                        </button>
                      )}
                      {canManageTopic && (!isSuspended || isAdmin) && (
                        <button
                          type="button"
                          onClick={() => onDeleteTopic(topic)}
                          className="inline-flex min-h-[32px] items-center gap-1 border border-red-200 px-2.5 py-1 font-medium text-red-700 hover:bg-red-50 sm:min-h-[34px]"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                          <span>{tr('Futa Kabisa', 'Delete')}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {topic.coverImage && !coverFailed && (
                    <figure className="-mx-4 my-4 overflow-hidden border-y border-slate-200 bg-slate-100 sm:mx-0 sm:my-6 sm:border">
                      <img
                        src={optimizeCloudinaryUrl(resolveMakalaCover(topic.coverImage), 1440, { quality: 'ultra' })}
                        alt={topic.title}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        onError={() => setCoverFailed(true)}
                        className="block h-auto w-full"
                      />
                      <figcaption className="break-words border-t border-slate-200 bg-[#F6F6F6] px-4 py-2 text-[11px] leading-snug text-slate-600 sm:text-xs">
                        {tr('Picha', 'Photo')}: Malosha Forums · {topic.title}
                      </figcaption>
                    </figure>
                  )}

                  <div className="min-w-0 py-1 sm:py-2">
                    <MakalaArticleRenderer body={topic.body} />
                  </div>

                  {topic.tags.length > 0 && (
                    <div className="mt-5 break-words border-t border-slate-100 pt-3 text-xs text-slate-500 sm:mt-6">
                      {tr('Mada husika:', 'Tags:')} {topic.tags.map((t) => `#${t}`).join(' ')}
                    </div>
                  )}

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onToggleTopicVote(topic)}
                        aria-pressed={hasVotedTopic}
                        className={`inline-flex min-h-[40px] items-center gap-1.5 border px-3.5 py-1.5 font-semibold transition-colors ${
                          hasVotedTopic
                            ? 'border-rose-300 bg-rose-50 text-rose-700'
                            : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                        }`}
                      >
                        <Heart
                          className={`h-4 w-4 ${hasVotedTopic ? 'fill-rose-600 text-rose-600' : ''}`}
                          aria-hidden="true"
                        />
                        <span>{tr('Penda', 'Like')}</span>
                        <span className="font-mono tabular-nums">{topic.upvotesCount}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          document
                            .getElementById('comments-thread')
                            ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }}
                        className="inline-flex min-h-[40px] items-center gap-1.5 border border-slate-300 bg-white px-3.5 py-1.5 font-semibold text-slate-800 hover:bg-slate-50"
                      >
                        <MessageCircle className="h-4 w-4" aria-hidden="true" />
                        <span>{tr('Maoni', 'Comments')}</span>
                        <span className="font-mono tabular-nums">{topic.repliesCount}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onShareTopic(topic)}
                        className="inline-flex min-h-[40px] items-center gap-1.5 border border-slate-300 bg-white px-3.5 py-1.5 font-semibold text-slate-800 hover:bg-slate-50"
                      >
                        <Share2 className="h-4 w-4" aria-hidden="true" />
                        <span>{tr('Shiriki Makala', 'Share Article')}</span>
                        <span className="font-mono tabular-nums">{topic.sharesCount ?? 0}</span>
                      </button>
                    </div>

                    {userUid && !isTopicAuthor && !isSuspended && (
                      <button
                        type="button"
                        onClick={() => onOpenReport('topic', topic.id)}
                        className="inline-flex min-h-[40px] items-center gap-1 text-slate-500 hover:text-red-700"
                      >
                        <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{tr('Ripoti', 'Report')}</span>
                      </button>
                    )}
                  </div>
                </div>
              </article>

              {/* Comments Section Inside Main Column for BBC Reader */}
              <section
                id="comments-thread"
                aria-label={tr('Maoni na majibu', 'Comments and replies')}
                className="scroll-mt-24 -mx-3.5 border-y border-slate-200 bg-white p-4 sm:mx-0 sm:border sm:p-6"
              >
                <h2 className="mb-3 font-sans text-sm font-black tracking-wide text-slate-900 uppercase">
                  {tr('Maoni ya Wasomaji', 'Reader Comments')} ({topic.repliesCount})
                </h2>

                <FacebookCommentsThread
                  topic={topic}
                  userUid={userUid}
                  userDisplayName={userDisplayName}
                  userPhoto={userPhoto}
                  isAdmin={isAdmin}
                  isSuspended={isSuspended}
                  allowAcceptAnswer={false}
                  onSignIn={onSignIn}
                  onOpenReport={onOpenReport}
                  onToast={onToast}
                  onRequestConfirm={onRequestConfirm}
                />
              </section>
            </div>

            {/* Right Sidebar (4 cols): Makala Mpya Zaidi */}
            <aside className="space-y-5 lg:col-span-4">
              {otherLatestMakala.length > 0 && (
                <div className="border border-slate-200 bg-white">
                  <div className="border-b-2 border-[#B80000] bg-[#141414] px-4 py-2.5 text-white">
                    <h2 className="text-xs font-black tracking-wider uppercase">
                      {tr('Makala Mpya Zaidi', 'Latest Articles')}
                    </h2>
                  </div>
                  <div className="divide-y divide-slate-200">
                    {otherLatestMakala.map((item, idx) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onOpenTopic?.(item.id)}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F6F6F6]"
                      >
                        <span className="font-display text-lg font-black leading-none text-[#B80000] tabular-nums shrink-0">
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-sm font-bold leading-snug text-slate-900 hover:text-[#B80000]">
                            {item.title}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            <span className="font-semibold text-[#B80000]">
                              {getMakalaSectionLabel(getMakalaSection(item.tags))}
                            </span>{' '}
                            · {formatTime(item.createdAt)}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </aside>
          </div>
        </div>
      ) : isKijiweni ? (
        /* ── KIJIWENI: Scholarly Editorial Standalone Post Card ───────────────── */
        <article className="-mx-3.5 overflow-hidden border-y border-slate-200 bg-white sm:mx-0 sm:rounded-lg sm:border">
          <div className="p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
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
                  className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4E89]"
                >
                  <Avatar
                    name={topic.authorName}
                    photoURL={topic.authorPhoto}
                    uid={topic.authorId}
                    showOnlineIndicator
                    size="md"
                  />
                </button>
                <div>
                  <div className="flex flex-wrap items-center gap-x-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        onAuthorClick?.({
                          uid: topic.authorId,
                          displayName: topic.authorName,
                          photoURL: topic.authorPhoto,
                        })
                      }
                      className="text-left text-[15px] font-bold text-slate-900 hover:text-[#1D4E89] hover:underline"
                    >
                      <AuthorName uid={topic.authorId} fallback={topic.authorName} />
                    </button>
                    <AuthorVerificationBadge uid={topic.authorId} size="sm" />
                    <OnlineStatusPill uid={topic.authorId} />
                    {topic.isPinned && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#B45309]">
                        · <Pin className="h-3 w-3" aria-hidden="true" /> {tr('Maalum', 'Pinned')}
                      </span>
                    )}
                    {topic.status === 'locked' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                        · <Lock className="h-3 w-3" aria-hidden="true" /> {tr('Imefungwa', 'Locked')}
                      </span>
                    )}
                    {isPrivateTopic && (
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">
                        <EyeOff className="h-3 w-3" aria-hidden="true" />
                        <span>{tr('Binafsi (Yangu Tu)', 'Only Me')}</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    {formatTime(topic.createdAt)} · {getBoardLabel('Kijiweni')}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                {canManageTopic && (topic.status === 'open' || topic.status === 'private') && (!isSuspended || isAdmin) && (
                  <button
                    type="button"
                    onClick={() => onEditTopic(topic)}
                    className="inline-flex min-h-[34px] items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Edit3 className="h-3 w-3" aria-hidden="true" />
                    <span>{tr('Hariri', 'Edit')}</span>
                  </button>
                )}
                {isTopicAuthor && onTogglePrivate && topic.status !== 'archived' && (!isSuspended || isAdmin) && (
                  <button
                    type="button"
                    onClick={() => onTogglePrivate(topic)}
                    className={`inline-flex min-h-[34px] items-center gap-1 rounded-md border px-2.5 py-1 font-semibold transition-colors ${
                      isPrivateTopic
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {isPrivateTopic ? (
                      <>
                        <Eye className="h-3 w-3" aria-hidden="true" />
                        <span>{tr('Fungua kwa Wote', 'Make Public')}</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-3 w-3" aria-hidden="true" />
                        <span>{tr('Funga (Yangu Tu)', 'Only Me')}</span>
                      </>
                    )}
                  </button>
                )}
                {canManageTopic && topic.status !== 'archived' && !isPrivateTopic && (!isSuspended || isAdmin) && (
                  <button
                    type="button"
                    onClick={() => onToggleLock(topic)}
                    className="inline-flex min-h-[34px] items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {topic.status === 'locked' ? (
                      <>
                        <Unlock className="h-3 w-3" aria-hidden="true" />
                        <span>{tr('Fungua', 'Unlock')}</span>
                      </>
                    ) : (
                      <>
                        <Lock className="h-3 w-3" aria-hidden="true" />
                        <span>{tr('Funga Maoni', 'Lock Comments')}</span>
                      </>
                    )}
                  </button>
                )}
                {isAdmin && !isPrivateTopic && (
                  <button
                    type="button"
                    onClick={() => onTogglePin(topic)}
                    className="inline-flex min-h-[34px] items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Pin className="h-3 w-3" aria-hidden="true" />
                    <span>{topic.isPinned ? tr('Ondoa Bandiko', 'Unpin') : tr('Bandika', 'Pin')}</span>
                  </button>
                )}
                {isAdmin && onToggleArchive && !isPrivateTopic && (
                  <button
                    type="button"
                    onClick={() => onToggleArchive(topic)}
                    className="inline-flex min-h-[34px] items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    {topic.status === 'archived' ? (
                      <>
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
                        <span>{tr('Rejesha Hewani', 'Restore')}</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-3 w-3" aria-hidden="true" />
                        <span>{tr('Funga Chapisho', 'Close Post')}</span>
                      </>
                    )}
                  </button>
                )}
                {canManageTopic && (!isSuspended || isAdmin) && (
                  <button
                    type="button"
                    onClick={() => onDeleteTopic(topic)}
                    className="inline-flex min-h-[34px] items-center gap-1 rounded-md border border-red-200 px-2.5 py-1 font-medium text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                    <span>{tr('Futa', 'Delete')}</span>
                  </button>
                )}
                {userUid && !isTopicAuthor && !isSuspended && (
                  <button
                    type="button"
                    onClick={() => onOpenReport('topic', topic.id)}
                    className="inline-flex min-h-[34px] items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-slate-500 hover:text-red-700"
                  >
                    <Flag className="h-3 w-3" aria-hidden="true" />
                    <span>{tr('Ripoti', 'Report')}</span>
                  </button>
                )}
              </div>
            </div>

            {topic.title.trim() && (
              <h1 className="mt-5 w-full font-display text-[22px] font-bold leading-[1.24] tracking-[-0.02em] text-[#0E2640] sm:text-[26px]">
                {topic.title}
              </h1>
            )}

            {topic.body.trim() && (
              <div className={topic.title.trim() ? 'mt-3.5' : 'mt-5'}>
                <RichText content={topic.body} fontStyle={topic.bodyFontStyle} scholarly />
              </div>
            )}

            {albumImages.length > 0 && (
              <div className="mt-5">
                <OrderedPhotoAlbum
                  images={albumImages}
                  altBase={topic.title.trim() || tr('Picha iliyochapishwa Kijiweni', 'Kijiweni photo post')}
                  enableDoubleTapLike
                  onDoubleTapLike={() => {
                    if (!hasVotedTopic) {
                      onToggleTopicVote(topic);
                    }
                  }}
                />
              </div>
            )}

            {topic.tags.length > 0 && (
              <p className="mt-4 text-xs tracking-wide text-slate-400">
                {topic.tags.map((t) => `#${t}`).join('  ·  ')}
              </p>
            )}
          </div>

          <div className="mt-3 grid grid-cols-3 border-t border-slate-100 px-3 py-1 text-xs">
            <button
              type="button"
              onClick={() => onToggleTopicVote(topic)}
              aria-pressed={hasVotedTopic}
              className={`inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors ${
                hasVotedTopic
                  ? 'text-rose-600 hover:bg-rose-50/70'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Heart
                className={`h-4 w-4 shrink-0 ${hasVotedTopic ? 'fill-rose-600 text-rose-600' : ''}`}
                aria-hidden="true"
              />
              <span>{tr('Penda', 'Like')}</span>
              <span className="font-mono text-[11px] font-bold tabular-nums opacity-90">
                {topic.upvotesCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                document
                  .getElementById('comments-thread')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }}
              className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg font-semibold text-[#1D4E89] hover:bg-sky-50"
            >
              <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{tr('Maoni', 'Comments')}</span>
              <span className="font-mono text-[11px] font-bold tabular-nums opacity-90">
                {topic.repliesCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onShareTopic(topic)}
              className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <Share2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{tr('Shiriki', 'Share')}</span>
              <span className="font-mono text-[11px] font-bold tabular-nums opacity-90">
                {topic.sharesCount ?? 0}
              </span>
            </button>
          </div>
        </article>
      ) : (
        /* ── FURSA (and general board) Presentation ────────────────────────────── */
        <>
          <div className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-4 sm:mb-5 sm:rounded-lg sm:px-6 sm:py-5">
            {(topic.isPinned || topic.status !== 'open' || topic.acceptedReplyId || isFursa) && (
              <div className="mb-2 flex flex-wrap items-center gap-3 text-xs font-semibold">
                {isFursa && (
                  <span className="inline-flex items-center gap-1 text-[#1D4E89]">
                    <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{tr('Tangazo la Fursa / Ajira', 'Opportunity / Job Listing')}</span>
                  </span>
                )}
                {topic.isPinned && (
                  <span className="inline-flex items-center gap-1 text-[#B45309]">
                    <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{tr('Chapisho Maalum', 'Featured Post')}</span>
                  </span>
                )}
                {topic.acceptedReplyId && (
                  <span className="inline-flex items-center gap-1 text-emerald-800">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{tr('Imewekewa Jibu Rasmi', 'Accepted Answer')}</span>
                  </span>
                )}
                {topic.status === 'locked' && (
                  <span className="inline-flex items-center gap-1 text-slate-700">
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{tr('Imefungwa', 'Locked')}</span>
                  </span>
                )}
              </div>
            )}

            <h1 className="font-display text-xl font-bold leading-snug text-slate-900 sm:text-3xl [text-wrap:balance]">
              {topic.title}
            </h1>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <button
                  type="button"
                  onClick={() =>
                    onAuthorClick?.({
                      uid: topic.authorId,
                      displayName: topic.authorName,
                      photoURL: topic.authorPhoto,
                    })
                  }
                  className="inline-flex items-center gap-1.5 hover:underline"
                >
                  <Avatar
                    name={topic.authorName}
                    photoURL={topic.authorPhoto}
                    uid={topic.authorId}
                    showOnlineIndicator
                    size="sm"
                  />
                  <span>
                    {tr('Mchapishaji:', 'Posted by:')}{' '}
                    <strong className="text-slate-800 hover:text-[#1D4E89]">
                      <AuthorName uid={topic.authorId} fallback={topic.authorName} />
                    </strong>
                  </span>
                  <AuthorVerificationBadge uid={topic.authorId} size="xs" />
                  <OnlineStatusPill uid={topic.authorId} />
                </button>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => onSelectBoard(normalizedBoard)}
                  className="font-medium text-[#1D4E89] hover:underline"
                >
                  {getBoardLabel(normalizedBoard)}
                </button>
                <span aria-hidden="true">·</span>
                <span>{formatTime(topic.createdAt)}</span>
                {topic.tags.length > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{topic.tags.map((t) => `#${t}`).join(' ')}</span>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canManageTopic && (topic.status === 'open' || topic.status === 'private') && (!isSuspended || isAdmin) && (
                  <button
                    type="button"
                    onClick={() => onEditTopic(topic)}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Edit3 className="h-3 w-3" aria-hidden="true" />
                    <span>{tr('Hariri', 'Edit')}</span>
                  </button>
                )}
                {isTopicAuthor && onTogglePrivate && topic.status !== 'archived' && (!isSuspended || isAdmin) && (
                  <button
                    type="button"
                    onClick={() => onTogglePrivate(topic)}
                    className={`inline-flex min-h-[36px] items-center gap-1 rounded-md border px-2.5 py-1 font-semibold transition-colors ${
                      isPrivateTopic
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {isPrivateTopic ? (
                      <>
                        <Eye className="h-3 w-3" aria-hidden="true" />
                        <span>{tr('Fungua kwa Wote', 'Make Public')}</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-3 w-3" aria-hidden="true" />
                        <span>{tr('Funga (Yangu Tu)', 'Only Me')}</span>
                      </>
                    )}
                  </button>
                )}
                {canManageTopic && topic.status !== 'archived' && !isPrivateTopic && (!isSuspended || isAdmin) && (
                  <button
                    type="button"
                    onClick={() => onToggleLock(topic)}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {topic.status === 'locked' ? (
                      <>
                        <Unlock className="h-3 w-3" aria-hidden="true" />
                        <span>{tr('Fungua', 'Unlock')}</span>
                      </>
                    ) : (
                      <>
                        <Lock className="h-3 w-3" aria-hidden="true" />
                        <span>{tr('Funga Maoni', 'Lock Comments')}</span>
                      </>
                    )}
                  </button>
                )}
                {isAdmin && !isPrivateTopic && (
                  <button
                    type="button"
                    onClick={() => onTogglePin(topic)}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Pin className="h-3 w-3" aria-hidden="true" />
                    <span>{topic.isPinned ? tr('Ondoa Bandiko', 'Unpin') : tr('Bandika', 'Pin')}</span>
                  </button>
                )}
                {isAdmin && onToggleArchive && !isPrivateTopic && (
                  <button
                    type="button"
                    onClick={() => onToggleArchive(topic)}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    {topic.status === 'archived' ? (
                      <>
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
                        <span>{tr('Rejesha Hewani', 'Restore')}</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-3 w-3" aria-hidden="true" />
                        <span>{tr('Funga Chapisho', 'Close Post')}</span>
                      </>
                    )}
                  </button>
                )}
                {canManageTopic && (!isSuspended || isAdmin) && (
                  <button
                    type="button"
                    onClick={() => onDeleteTopic(topic)}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-red-200 px-2.5 py-1 font-medium text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                    <span>{tr('Futa', 'Delete')}</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {isFursa && (topic.company || topic.location || topic.jobType || topic.deadline) && (
            <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 sm:mb-5 sm:rounded-lg sm:p-5">
              <h2 className="text-xs font-bold tracking-wide text-slate-500 uppercase">
                {tr('Maelezo ya Fursa', 'Opportunity Details')}
              </h2>
              <dl className="mt-3 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                {topic.company && (
                  <div>
                    <dt className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{tr('Shirika / Mwajiri', 'Company / Organization')}</span>
                    </dt>
                    <dd className="mt-1 font-semibold text-slate-900">{topic.company}</dd>
                  </div>
                )}
                {topic.location && (
                  <div>
                    <dt className="flex items-center gap-1.5 text-xs text-slate-500">
                      <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{tr('Mahali', 'Location')}</span>
                    </dt>
                    <dd className="mt-1 font-semibold text-slate-900">{topic.location}</dd>
                  </div>
                )}
                {topic.jobType && (
                  <div>
                    <dt className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{tr('Aina ya Fursa', 'Opportunity Type')}</span>
                    </dt>
                    <dd className="mt-1 font-semibold text-slate-900">
                      {getJobTypeLabel(topic.jobType)}
                    </dd>
                  </div>
                )}
                {topic.deadline && (
                  <div>
                    <dt className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{tr('Mwisho wa Maombi', 'Application Deadline')}</span>
                    </dt>
                    <dd className="mt-1 font-semibold text-amber-800">{topic.deadline}</dd>
                  </div>
                )}
              </dl>
              {topic.applyInfo && (() => {
                const applyUrl = extractFirstUrl(topic.applyInfo);
                return (
                  <div className="mt-4 flex flex-col justify-between gap-2.5 border-t border-slate-100 pt-3 text-xs text-slate-700 sm:flex-row sm:items-center">
                    <div className="min-w-0">
                      <strong className="text-slate-900">{tr('Namna ya Kuomba:', 'How to Apply:')} </strong>
                      <LinkedText text={topic.applyInfo} className="break-words" />
                    </div>
                    {applyUrl && (
                      <a
                        href={applyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg bg-[#1D4E89] px-3.5 py-1.5 font-semibold text-white transition-colors hover:bg-[#163A5F] whitespace-nowrap shrink-0"
                      >
                        <span>{tr('Omba Hapa', 'Apply Here')}</span>
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          <article className="-mx-3.5 overflow-hidden border-y border-slate-200 bg-white p-4 sm:mx-0 sm:rounded-lg sm:border sm:p-6">
            <RichText content={topic.body} />

            {topic.coverImage && !coverFailed && (
              <figure className="-mx-4 mt-4 overflow-hidden border-y border-slate-200 bg-slate-100 sm:mx-0 sm:rounded-lg sm:border">
                <img
                  src={optimizeCloudinaryUrl(topic.coverImage, 1440, { quality: 'ultra' })}
                  alt={topic.title}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onError={() => setCoverFailed(true)}
                  className="block h-auto w-full"
                />
              </figure>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onToggleTopicVote(topic)}
                  aria-pressed={hasVotedTopic}
                  className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3.5 py-1.5 font-medium transition-colors ${
                    hasVotedTopic
                      ? 'border-rose-300 bg-rose-50 text-rose-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Heart
                    className={`h-4 w-4 ${hasVotedTopic ? 'fill-rose-600 text-rose-600' : ''}`}
                    aria-hidden="true"
                  />
                  <span>{tr('Penda', 'Like')}</span>
                  <span className="font-mono tabular-nums">{topic.upvotesCount}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    document
                      .getElementById('comments-thread')
                      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  <span>{tr('Maoni', 'Comments')}</span>
                  <span className="font-mono tabular-nums">{topic.repliesCount}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onShareTopic(topic)}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{tr('Shiriki', 'Share')}</span>
                  <span className="font-mono tabular-nums">{topic.sharesCount ?? 0}</span>
                </button>
              </div>

              {userUid && !isTopicAuthor && !isSuspended && (
                <button
                  type="button"
                  onClick={() => onOpenReport('topic', topic.id)}
                  className="inline-flex min-h-[40px] items-center gap-1 px-2 text-slate-500 hover:text-red-700"
                >
                  <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{tr('Ripoti', 'Report')}</span>
                </button>
              )}
            </div>
          </article>
        </>
      )}

      {/* Facebook-Style Threadlike Comments Section (for Kijiweni & Fursa; Makala renders inside its 8-col essay) */}
      {!isMakala && (
        <section
          id="comments-thread"
          aria-label={tr('Maoni na majibu', 'Comments and replies')}
          className="scroll-mt-24 mt-4 rounded-xl border border-slate-200 bg-white p-4 sm:mt-5 sm:rounded-lg sm:p-5"
        >
          <h2 className="mb-3 font-sans text-sm font-bold text-slate-900">
            {tr('Maoni', 'Comments')} ({topic.repliesCount})
          </h2>

          <FacebookCommentsThread
            topic={topic}
            userUid={userUid}
            userDisplayName={userDisplayName}
            userPhoto={userPhoto}
            isAdmin={isAdmin}
            isSuspended={isSuspended}
            allowAcceptAnswer={!isKijiweni}
            onSignIn={onSignIn}
            onOpenReport={onOpenReport}
            onToast={onToast}
            onRequestConfirm={onRequestConfirm}
          />
        </section>
      )}
    </div>
  );
};
