import React, { useState } from 'react';
import {
  Edit3,
  ExternalLink,
  Flag,
  Heart,
  Lock,
  MessageCircle,
  Pin,
  Share2,
  Trash2,
} from 'lucide-react';
import { AuthPromptReason, Topic } from '../types';
import { optimizeCloudinaryUrl } from '../services/cloudinaryService';
import { useLanguage } from '../context/LanguageContext';
import { Avatar, OnlineStatusPill } from './Avatar';
import { RichText } from './RichText';
import { FacebookCommentsThread } from './FacebookCommentsThread';
import { AuthorVerificationBadge } from './VerificationBadge';

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
  onDeleteTopic,
  onOpenReport,
  onAuthorClick,
  onSignIn,
  onToast,
  onRequestConfirm,
}) => {
  const { tr, formatTime, getBoardLabel } = useLanguage();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [autoFocusComment, setAutoFocusComment] = useState(false);
  const [expandedText, setExpandedText] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const isLongPost = post.body.length > 420;
  const displayedBody =
    isLongPost && !expandedText ? `${post.body.slice(0, 420).trimEnd()}...` : post.body;

  const isAuthor = userUid !== null && post.authorId === userUid;
  const canManage = isAuthor || isAdmin;

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
      className={`overflow-hidden rounded-xl border border-slate-200 bg-white sm:rounded-lg ${
        post.isPinned ? 'bg-amber-50/25' : ''
      }`}
    >
      {/* Post Header */}
      <div className="px-4 pt-4 sm:px-5 sm:pt-4">
        <div className="flex items-start justify-between gap-3">
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
                  {post.authorName}
                </button>
                <AuthorVerificationBadge uid={post.authorId} size="sm" />
                <OnlineStatusPill uid={post.authorId} />
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
              <p className="text-xs text-slate-500">
                {formatTime(post.createdAt)} · {getBoardLabel('Kijiweni')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {canManage && post.status === 'open' && (!isSuspended || isAdmin) && (
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

        {/* Post Title & Full Readable Body */}
        <div className="mt-3">
          {post.title.trim() && (
            <button
              type="button"
              onClick={() => handleToggleComments(false)}
              className="block text-left font-sans text-base font-bold leading-snug text-slate-900 hover:text-[#1D4E89] sm:text-[17px]"
            >
              {post.title}
            </button>
          )}

          {post.body.trim() && (
            <div className={`${post.title.trim() ? 'mt-1.5' : ''} text-slate-800`}>
              <RichText content={displayedBody} className="text-[14.5px]" />
              {isLongPost && (
                <button
                  type="button"
                  onClick={() => setExpandedText((prev) => !prev)}
                  className="mt-1 text-xs font-semibold text-[#1D4E89] hover:underline"
                >
                  {expandedText
                    ? tr('Fupisha maandishi', 'Show less')
                    : tr('Soma zaidi', 'Read more')}
                </button>
              )}
            </div>
          )}

          {post.coverImage && !imageFailed && (
            <div
              className={`${
                post.title.trim() || post.body.trim() ? 'mt-3' : ''
              } -mx-4 overflow-hidden border-y border-slate-200 bg-slate-100 sm:mx-0 sm:rounded-lg sm:border`}
            >
              <img
                src={optimizeCloudinaryUrl(post.coverImage, 1080)}
                alt={post.title.trim() || tr('Picha iliyochapishwa Kijiweni', 'Kijiweni photo post')}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={() => setImageFailed(true)}
                className="block h-auto w-full"
              />
            </div>
          )}

          {post.tags.length > 0 && (
            <p className="mt-2.5 text-xs text-slate-400">
              {post.tags.map((t) => `#${t}`).join(' ')}
            </p>
          )}
        </div>

        {/* Facebook-style Engagement Summary Line */}
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 py-2 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <Heart
              className={`h-3.5 w-3.5 ${
                post.upvotesCount > 0 ? 'fill-rose-600 text-rose-600' : 'text-slate-400'
              }`}
              aria-hidden="true"
            />
            <span>
              {post.upvotesCount === 0
                ? tr('Kuwa wa kwanza kupenda', 'Be the first to like')
                : post.upvotesCount === 1
                  ? tr('Mtu 1 amependa', '1 person liked this')
                  : tr(
                      `Watu ${post.upvotesCount} wamependa`,
                      `${post.upvotesCount} people liked this`
                    )}
            </span>
          </span>

          <button
            type="button"
            onClick={() => handleToggleComments(false)}
            className="font-medium text-slate-600 hover:text-slate-900 hover:underline tabular-nums"
          >
            {post.repliesCount === 0
              ? tr('Hakuna maoni', 'No comments')
              : post.repliesCount === 1
                ? tr('Maoni 1', '1 comment')
                : tr(`Maoni ${post.repliesCount}`, `${post.repliesCount} comments`)}
          </button>
        </div>
      </div>

      {/* Facebook-style 3-Button Social Action Row */}
      <div className="grid grid-cols-3 border-t border-slate-100 px-2 py-1 text-xs sm:px-3">
        <button
          type="button"
          onClick={() => onToggleVote(post)}
          aria-pressed={hasVoted}
          className={`inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg font-semibold transition-colors ${
            hasVoted
              ? 'text-rose-600 hover:bg-rose-50/70'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Heart
            className={`h-4 w-4 ${hasVoted ? 'fill-rose-600 text-rose-600' : ''}`}
            aria-hidden="true"
          />
          <span>{tr('Penda', 'Like')}</span>
        </button>

        <button
          type="button"
          onClick={() => handleToggleComments(true)}
          aria-expanded={commentsOpen}
          className={`inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg font-semibold transition-colors ${
            commentsOpen
              ? 'bg-sky-50 text-[#1D4E89]'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          <span>{tr('Maoni', 'Comment')}</span>
        </button>

        <button
          type="button"
          onClick={() => onShareTopic(post)}
          className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <Share2 className="h-4 w-4" aria-hidden="true" />
          <span>{tr('Shiriki', 'Share')}</span>
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
