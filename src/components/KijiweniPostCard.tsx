import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  Flag,
  Heart,
  Lock,
  MessageCircle,
  Pin,
  Share2,
  Trash2,
} from 'lucide-react';
import { AuthPromptReason, Topic, getKijiweniFontMeta, normalizeKijiweniFontStyle } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { useUserPresence } from '../context/UserPresenceContext';
import { buildKijiweniExcerpt } from '../utils/editorialFormatter';
import { AuthorName, Avatar, OnlineStatusPill } from './Avatar';
import { RichText } from './RichText';
import { FacebookCommentsThread } from './FacebookCommentsThread';
import { AuthorVerificationBadge } from './VerificationBadge';
import { OrderedPhotoAlbum } from './OrderedPhotoAlbum';

interface KijiweniPostCardProps {
  post: Topic;
  userUid: string | null;
  userDisplayName: string;
  userPhoto: string;
  isAdmin: boolean;
  isSuspended?: boolean;
  hasVoted: boolean;
  onToggleVote: (topic: Topic) => void;
  onShareTopic: (topic: Topic) => void;
  onOpenFullTopic: (topicId: string) => void;
  onEditTopic: (topic: Topic) => void;
  onTogglePrivate?: (topic: Topic) => void;
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
}

export const KijiweniPostCard: React.FC<KijiweniPostCardProps> = ({
  post,
  userUid,
  userDisplayName,
  userPhoto,
  isAdmin,
  isSuspended = false,
  hasVoted,
  onToggleVote,
  onShareTopic,
  onOpenFullTopic,
  onEditTopic,
  onTogglePrivate,
  onDeleteTopic,
  onOpenReport,
  onAuthorClick,
  onSignIn,
  onToast,
  onRequestConfirm,
}) => {
  const { tr, formatTime, getBoardLabel } = useLanguage();
  const { getTopicCommentTypingUsers } = useUserPresence();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [autoFocusComment, setAutoFocusComment] = useState(false);
  const [expandedText, setExpandedText] = useState(false);
  const typingUsers = getTopicCommentTypingUsers(post.id);

  const bodyFontStyle = normalizeKijiweniFontStyle(post.bodyFontStyle);
  const bodyFontMeta = getKijiweniFontMeta(bodyFontStyle);
  const excerpt = useMemo(() => buildKijiweniExcerpt(post.body, 145, 2), [post.body]);
  const displayedBody =
    excerpt.isTruncated && !expandedText ? excerpt.previewText : post.body;
  const readingMinutes = Math.max(1, Math.ceil(excerpt.visibleLength / 900));

  const isAuthor = userUid !== null && post.authorId === userUid;
  const canManage = isAuthor || isAdmin;
  const isPrivate = post.status === 'private';

  const albumImages = useMemo(() => {
    if (Array.isArray(post.images) && post.images.length > 0) {
      return post.images;
    }
    return post.coverImage ? [post.coverImage] : [];
  }, [post.images, post.coverImage]);

  const handleToggleComments = (focusInput: boolean) => {
    if (commentsOpen && focusInput) {
      setCommentsOpen(false);
      setAutoFocusComment(false);
      return;
    }
    setAutoFocusComment(focusInput);
    setCommentsOpen((prev) => !prev);
  };

  return (
    <article
      className={`overflow-hidden rounded-xl border bg-white sm:rounded-lg ${
        isPrivate
          ? 'border-amber-300 bg-amber-50/15'
          : post.isPinned
            ? 'border-slate-200 bg-amber-50/25'
            : 'border-slate-200'
      }`}
    >
      {/* Post Header — Scholarly Editorial Masthead */}
      <div className="px-5 pt-5 sm:px-7 sm:pt-6">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() =>
                onAuthorClick?.({
                  uid: post.authorId,
                  displayName: post.authorName,
                  photoURL: post.authorPhoto,
                })
              }
              aria-label={tr(`Tazama wasifu wa ${post.authorName}`, `View ${post.authorName}'s profile`)}
              className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4E89]"
            >
              <Avatar
                name={post.authorName}
                photoURL={post.authorPhoto}
                uid={post.authorId}
                showOnlineIndicator
                size="md"
              />
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <button
                  type="button"
                  onClick={() =>
                    onAuthorClick?.({
                      uid: post.authorId,
                      displayName: post.authorName,
                      photoURL: post.authorPhoto,
                    })
                  }
                  className="truncate text-left text-[15px] font-bold text-slate-900 hover:text-[#1D4E89] hover:underline"
                >
                  <AuthorName uid={post.authorId} fallback={post.authorName} />
                </button>
                <AuthorVerificationBadge uid={post.authorId} size="sm" />
                <OnlineStatusPill uid={post.authorId} />
                {isPrivate && (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-bold text-amber-900">
                    <EyeOff className="h-3 w-3" aria-hidden="true" />
                    <span>{tr('Akaunti Yako Tu', 'Private (Only You)')}</span>
                  </span>
                )}
                {post.isPinned && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#B45309]">
                    · <Pin className="h-3 w-3" aria-hidden="true" /> {tr('Maalum', 'Pinned')}
                  </span>
                )}
                {post.status === 'locked' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                    · <Lock className="h-3 w-3" aria-hidden="true" /> {tr('Imefungwa', 'Locked')}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                {formatTime(post.createdAt)} · {getBoardLabel('Kijiweni')}
                {excerpt.visibleLength > 280 && ` · ${readingMinutes} ${tr('dak. kusoma', 'min read')}`}
                {bodyFontStyle !== 'sans' && ` · ${tr(bodyFontMeta.labelSw, bodyFontMeta.labelEn)}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {isAuthor && onTogglePrivate && post.status !== 'archived' && (!isSuspended || isAdmin) && (
              <button
                type="button"
                onClick={() => onTogglePrivate(post)}
                aria-label={
                  isPrivate
                    ? tr('Fungua chapisho kwa wote', 'Make post public')
                    : tr('Funga chapisho (lionekane kwenye akaunti yako tu)', 'Lock post private (only me)')
                }
                title={
                  isPrivate
                    ? tr('Fungua kwa Wote', 'Make Public')
                    : tr('Funga (Yangu Tu)', 'Lock Private')
                }
                className={`inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[11px] font-bold transition-colors ${
                  isPrivate
                    ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100'
                    : 'text-slate-600 hover:bg-amber-50 hover:text-amber-900'
                }`}
              >
                {isPrivate ? (
                  <>
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">{tr('Fungua', 'Unhide')}</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">{tr('Funga', 'Private')}</span>
                  </>
                )}
              </button>
            )}
            {canManage && (post.status === 'open' || post.status === 'private') && (!isSuspended || isAdmin) && (
              <button
                type="button"
                onClick={() => onEditTopic(post)}
                aria-label={tr('Hariri chapisho', 'Edit post')}
                title={tr('Hariri', 'Edit')}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
            {canManage && (!isSuspended || isAdmin) && (
              <button
                type="button"
                onClick={() => onDeleteTopic(post)}
                aria-label={tr('Futa chapisho', 'Delete post')}
                title={tr('Futa', 'Delete')}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
            {userUid && !isAuthor && !isSuspended && (
              <button
                type="button"
                onClick={() => onOpenReport('topic', post.id, post.id)}
                aria-label={tr('Ripoti chapisho', 'Report post')}
                title={tr('Ripoti', 'Report')}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-700"
              >
                <Flag className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenFullTopic(post.id)}
              aria-label={tr('Fungua chapisho kamili', 'Open full post')}
              title={tr('Fungua ukurasa kamili', 'Open full page')}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-[#1D4E89]"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Scholarly Title & Short Excerpt / Full Formatted Body */}
        <div className="mt-4">
          {post.title.trim() && (
            <button
              type="button"
              onClick={() => handleToggleComments(false)}
              className="block text-left font-display text-[19px] font-bold leading-[1.28] tracking-[-0.015em] text-[#0E2640] hover:text-[#1D4E89] sm:text-[21px] [text-wrap:balance]"
            >
              {post.title}
            </button>
          )}

          {post.body.trim() && (
            <div className={`${post.title.trim() ? 'mt-2.5' : ''} text-slate-800`}>
              <RichText
                content={displayedBody}
                fontStyle={bodyFontStyle}
                scholarly={expandedText || !excerpt.isTruncated}
              />
              {excerpt.isTruncated && (
                <div className="mt-2.5">
                  <button
                    type="button"
                    aria-expanded={expandedText}
                    onClick={() => setExpandedText((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[#1D4E89]/25 bg-[#F4F8FC] px-3 py-1.5 text-xs font-bold text-[#0E2640] transition-colors hover:border-[#1D4E89] hover:bg-[#1D4E89] hover:text-white"
                  >
                    {expandedText ? (
                      <>
                        <span>{tr('Fupisha maelezo', 'Show less')}</span>
                        <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                      </>
                    ) : (
                      <>
                        <span>{tr('Soma zaidi', 'Read more')}</span>
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {albumImages.length > 0 && (
            <OrderedPhotoAlbum
              images={albumImages}
              altBase={post.title.trim() || tr('Picha iliyochapishwa Kijiweni', 'Kijiweni photo post')}
              initialPreviewLimit={6}
              className={post.title.trim() || post.body.trim() ? 'mt-4' : ''}
            />
          )}

          {post.tags.length > 0 && (
            <p className="mt-3 text-xs tracking-wide text-slate-400">
              {post.tags.map((t) => `#${t}`).join('  ·  ')}
            </p>
          )}
        </div>

        {/* Live Typing Preview When Comments Thread is Collapsed */}
        {typingUsers.length > 0 && !commentsOpen && (
          <button
            type="button"
            onClick={() => handleToggleComments(false)}
            className="mt-2.5 flex w-full items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/90 px-3 py-1.5 text-left text-xs font-medium text-emerald-900 transition-colors hover:bg-emerald-100/80"
          >
            <span className="inline-flex items-center gap-0.5 shrink-0" aria-hidden="true">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-600 [animation-delay:-0.25s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-600 [animation-delay:-0.12s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-600" />
            </span>
            <span className="truncate">
              {typingUsers.length === 1
                ? typingUsers[0].replyingToName
                  ? tr(
                      `${typingUsers[0].displayName} anamjibu ${typingUsers[0].replyingToName}...`,
                      `${typingUsers[0].displayName} is replying to ${typingUsers[0].replyingToName}...`
                    )
                  : tr(
                      `${typingUsers[0].displayName} anaandika maoni...`,
                      `${typingUsers[0].displayName} is typing a comment...`
                    )
                : tr(
                    `${typingUsers[0].displayName} na wengine ${typingUsers.length - 1} wanaandika...`,
                    `${typingUsers[0].displayName} and ${typingUsers.length - 1} others are typing...`
                  )}
            </span>
          </button>
        )}
      </div>

      {/* Facebook-style 3-Button Social Action Row with Counts Directly on Icons */}
      <div className="mt-3 grid grid-cols-3 border-t border-slate-100 px-2 py-1 text-xs sm:px-3">
        <button
          type="button"
          onClick={() => onToggleVote(post)}
          aria-pressed={hasVoted}
          aria-label={tr(`Penda (${post.upvotesCount})`, `Like (${post.upvotesCount})`)}
          className={`inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors ${
            hasVoted
              ? 'text-rose-600 hover:bg-rose-50/70'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Heart
            className={`h-4 w-4 shrink-0 ${hasVoted ? 'fill-rose-600 text-rose-600' : ''}`}
            aria-hidden="true"
          />
          <span>{tr('Penda', 'Like')}</span>
          <span className="font-mono text-[11px] font-bold tabular-nums opacity-90">
            {post.upvotesCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleToggleComments(true)}
          aria-expanded={commentsOpen}
          aria-label={tr(`Maoni (${post.repliesCount})`, `Comments (${post.repliesCount})`)}
          className={`inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors ${
            commentsOpen
              ? 'bg-sky-50 text-[#1D4E89]'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{tr('Maoni', 'Comment')}</span>
          <span className="font-mono text-[11px] font-bold tabular-nums opacity-90">
            {post.repliesCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onShareTopic(post)}
          aria-label={tr(
            `Shiriki (${post.sharesCount ?? 0})`,
            `Share (${post.sharesCount ?? 0})`
          )}
          className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <Share2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{tr('Shiriki', 'Share')}</span>
          <span className="font-mono text-[11px] font-bold tabular-nums opacity-90">
            {post.sharesCount ?? 0}
          </span>
        </button>
      </div>

      {/* Inline Facebook-Style Threadlike Comments Drawer */}
      {commentsOpen && (
        <div className="border-t border-slate-200 bg-white px-4 pt-3.5 pb-4 sm:px-5">
          <FacebookCommentsThread
            topic={post}
            userUid={userUid}
            userDisplayName={userDisplayName}
            userPhoto={userPhoto}
            isAdmin={isAdmin}
            isSuspended={isSuspended}
            compact
            autoFocus={autoFocusComment}
            onSignIn={onSignIn}
            onOpenReport={(targetType, targetId) =>
              onOpenReport(targetType, targetId, post.id)
            }
            onToast={onToast}
            onRequestConfirm={onRequestConfirm}
          />
        </div>
      )}
    </article>
  );
};
