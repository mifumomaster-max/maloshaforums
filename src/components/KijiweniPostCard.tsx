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
import { AuthPromptReason, Topic, formatMemberCode } from '../types';
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
      className={`overflow-hidden rounded-xl border sm:rounded-lg ${
        isPrivate
          ? 'border-amber-300 bg-[#F4F2EC]'
          : post.isPinned
            ? 'border-[#D5DCE4] bg-[#F1F3F6]'
            : 'border-[#D5DCE4] bg-[#F3F5F8]'
      }`}
    >
      {/* Post Header — Crisp X-Style Horizontal Author Line */}
      <div className="px-4 pt-4 sm:px-6 sm:pt-5">
        <div className="flex items-start justify-between gap-2.5 border-b border-[#DFE5ED] pb-3">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
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
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-nowrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onAuthorClick?.({
                      uid: post.authorId,
                      displayName: post.authorName,
                      photoURL: post.authorPhoto,
                    })
                  }
                  className="min-w-0 truncate whitespace-nowrap text-left text-[14.5px] font-bold text-[#0F1419] hover:text-[#1D4E89] hover:underline"
                >
                  <AuthorName uid={post.authorId} fallback={post.authorName} />
                </button>
                <span className="inline-flex shrink-0 items-center">
                  <AuthorVerificationBadge uid={post.authorId} size="sm" />
                </span>
                <span className="hidden shrink-0 font-mono text-[11.5px] text-[#536471] sm:inline">
                  @{formatMemberCode(post.authorId).toLowerCase()}
                </span>
                <span className="shrink-0 text-xs text-[#536471]">· {formatTime(post.createdAt)}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-[#536471]">
                <OnlineStatusPill uid={post.authorId} />
                <span>{getBoardLabel('Kijiweni')}</span>
                {excerpt.visibleLength > 280 && (
                  <span>· {readingMinutes} {tr('dak. kusoma', 'min read')}</span>
                )}
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

        {/* Compact Attractive Title & Crisp Ink Description */}
        <div className="mt-3.5">
          {post.title.trim() && (
            <button
              type="button"
              onClick={() => handleToggleComments(false)}
              className="block w-full text-left font-sans text-[15.5px] font-bold leading-[1.35] tracking-[-0.01em] text-[#0F1419] hover:text-[#1D4E89] sm:text-[17px]"
            >
              {post.title}
            </button>
          )}

          {post.body.trim() && (
            <div className={`${post.title.trim() ? 'mt-2' : ''} text-[#0B0F14]`}>
              <RichText
                content={displayedBody}
                fontStyle="sans"
                scholarly={false}
              />
              {excerpt.isTruncated && (
                <div className="mt-2.5">
                  <button
                    type="button"
                    aria-expanded={expandedText}
                    onClick={() => setExpandedText((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[#C6D1DE] bg-[#E5EBF2] px-3 py-1.5 text-xs font-semibold text-[#0F1419] transition-colors hover:border-[#1D4E89] hover:bg-[#1D4E89] hover:text-white"
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
              enableDoubleTapLike={!(isSuspended && !isAdmin)}
              enableWatermarkedDownload
              onToast={onToast}
              onDoubleTapLike={() => {
                if (isSuspended && !isAdmin) return;
                if (!hasVoted) {
                  onToggleVote(post);
                }
              }}
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
      <div className="mt-3 grid grid-cols-3 border-t border-[#DFE5ED] px-2 py-1 text-xs sm:px-3">
        <button
          type="button"
          disabled={Boolean(isSuspended && !isAdmin)}
          onClick={() => {
            if (isSuspended && !isAdmin) return;
            onToggleVote(post);
          }}
          aria-pressed={hasVoted}
          aria-label={tr(`Penda (${post.upvotesCount})`, `Like (${post.upvotesCount})`)}
          className={`inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            hasVoted
              ? 'text-rose-600 hover:bg-rose-50/70'
              : 'text-[#3B4A59] hover:bg-[#E5EBF2] hover:text-[#0F1419]'
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
              ? 'bg-[#DCE6F2] text-[#1D4E89]'
              : 'text-[#3B4A59] hover:bg-[#E5EBF2] hover:text-[#0F1419]'
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
          disabled={Boolean(isSuspended && !isAdmin)}
          onClick={() => {
            if (isSuspended && !isAdmin) return;
            onShareTopic(post);
          }}
          aria-label={tr(
            `Shiriki (${post.sharesCount ?? 0})`,
            `Share (${post.sharesCount ?? 0})`
          )}
          className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg font-semibold text-[#3B4A59] transition-colors hover:bg-[#E5EBF2] hover:text-[#0F1419] disabled:cursor-not-allowed disabled:opacity-50"
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
        <div className="border-t border-[#D5DCE4] bg-[#EAEFF4] px-4 pt-3.5 pb-4 sm:px-5">
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
