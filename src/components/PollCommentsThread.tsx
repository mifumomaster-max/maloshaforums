import React, { useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  ChevronUp,
  CornerDownRight,
  Edit3,
  Heart,
  MessageCircle,
  Send,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useLanguage } from '../context/LanguageContext';
import {
  createPollComment,
  editPollComment,
  isPollEffectivelyOpen,
  softDeletePollComment,
  subscribePollComments,
  togglePollCommentLike,
} from '../services/pollService';
import { AuthPromptReason, Poll, PollComment } from '../types';
import { AuthorName, Avatar, OnlineStatusPill } from './Avatar';
import { renderLinkedInline } from './RichText';
import { AuthorVerificationBadge } from './VerificationBadge';
import { scrollCommentInputAboveKeyboard } from '../utils/mobileKeyboard';

interface PollCommentsThreadProps {
  poll: Poll;
  user: User | null;
  userDisplayName: string;
  userPhoto?: string;
  isAdmin: boolean;
  isSuspended?: boolean;
  onSignIn: (reason?: AuthPromptReason) => void;
  onToast: (message: string, kind?: 'success' | 'error') => void;
  onRequestConfirm?: (opts: {
    title: string;
    message: string;
    confirmLabel: string;
    destructive: boolean;
    action: () => Promise<void>;
  }) => void;
}

const ThreadElbowConnector: React.FC = () => (
  <svg
    width="18"
    height="22"
    viewBox="0 0 18 22"
    fill="none"
    aria-hidden="true"
    className="pointer-events-none shrink-0 text-slate-300"
  >
    <path
      d="M 1 0 L 1 11 Q 1 17 7 17 L 18 17"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

function mentionMatchesAuthor(mention: string, comments: PollComment[]): boolean {
  const name = mention.slice(1).toLowerCase();
  return comments.some((c) => c.authorName.toLowerCase().startsWith(name));
}

export const PollCommentsThread: React.FC<PollCommentsThreadProps> = ({
  poll,
  user,
  userDisplayName,
  userPhoto = '',
  isAdmin,
  isSuspended = false,
  onSignIn,
  onToast,
  onRequestConfirm,
}) => {
  const { tr, formatTime } = useLanguage();
  const userUid = user?.uid || null;
  const isOpen = isPollEffectivelyOpen(poll);

  const [comments, setComments] = useState<PollComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<'newest' | 'top' | 'oldest'>('oldest');

  // Top-level Facebook-style composer
  const [newComment, setNewComment] = useState('');
  const [submittingMain, setSubmittingMain] = useState(false);
  const [mainError, setMainError] = useState('');
  const mainInputRef = useRef<HTMLTextAreaElement>(null);

  // Inline nested reply state (2-level Facebook thread)
  const [activeReplyRootId, setActiveReplyRootId] = useState<string | null>(null);
  const [replyMentionPrefix, setReplyMentionPrefix] = useState('');
  const [nestedReplyText, setNestedReplyText] = useState('');
  const [submittingNested, setSubmittingNested] = useState(false);
  const nestedInputRef = useRef<HTMLTextAreaElement>(null);

  // Expanded child reply lists (>2 replies collapsed by default like Facebook)
  const [expandedRootIds, setExpandedRootIds] = useState<Set<string>>(new Set());

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Inline delete confirm fallback when parent didn't pass onRequestConfirm
  const [inlineDeleteId, setInlineDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [lastSubmitAt, setLastSubmitAt] = useState(0);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribePollComments(
      poll.id,
      (list) => {
        setComments(list);
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [poll.id]);

  useEffect(() => {
    if (!userUid || comments.length === 0) {
      setLikedIds(new Set());
      return;
    }

    const unsubs = comments.map((c) => {
      const likeRef = doc(db, 'polls', poll.id, 'comments', c.id, 'likes', userUid);
      return onSnapshot(
        likeRef,
        (snap) => {
          setLikedIds((prev) => {
            const next = new Set(prev);
            if (snap.exists()) {
              next.add(c.id);
            } else {
              next.delete(c.id);
            }
            return next;
          });
        },
        () => {
          // Non-fatal
        }
      );
    });

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [poll.id, comments, userUid]);

  const threadScrollRef = useRef<HTMLDivElement>(null);
  const [showScrollTopBtn, setShowScrollTopBtn] = useState(false);
  const didInitialScrollRef = useRef(false);
  const prevCommentCountRef = useRef(0);

  const handleThreadScroll = () => {
    const el = threadScrollRef.current;
    if (!el) return;
    setShowScrollTopBtn(el.scrollTop > 180);
  };

  useEffect(() => {
    didInitialScrollRef.current = false;
    prevCommentCountRef.current = 0;
  }, [poll.id]);

  useEffect(() => {
    if (loading) return;
    const el = threadScrollRef.current;
    if (!el) return;

    const countIncreased = comments.length > prevCommentCountRef.current;
    prevCommentCountRef.current = comments.length;

    if (sortMode === 'oldest' && (!didInitialScrollRef.current || countIncreased)) {
      didInitialScrollRef.current = true;
      window.requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    } else if (!didInitialScrollRef.current) {
      didInitialScrollRef.current = true;
    }
  }, [loading, comments.length, sortMode]);

  useEffect(() => {
    if (activeReplyRootId) {
      const t = window.setTimeout(() => {
        nestedInputRef.current?.focus({ preventScroll: true });
        scrollCommentInputAboveKeyboard(nestedInputRef.current);
      }, 40);
      return () => window.clearTimeout(t);
    }
  }, [activeReplyRootId]);

  const { rootComments, childrenByRoot } = useMemo(() => {
    const byId = new Map<string, PollComment>();
    for (const c of comments) byId.set(c.id, c);

    const resolveRootId = (c: PollComment): string => {
      let currentParent = c.parentCommentId;
      let depth = 0;
      let candidateRoot = '';
      while (currentParent && depth < 6) {
        const parentObj = byId.get(currentParent);
        if (!parentObj) break;
        candidateRoot = parentObj.id;
        currentParent = parentObj.parentCommentId;
        depth += 1;
      }
      return candidateRoot;
    };

    const roots: PollComment[] = [];
    const childMap = new Map<string, PollComment[]>();

    for (const c of comments) {
      if (!c.parentCommentId) {
        roots.push(c);
      } else {
        const rootId = resolveRootId(c) || c.parentCommentId;
        if (!byId.has(rootId) && !byId.has(c.parentCommentId)) {
          roots.push(c);
        } else {
          const list = childMap.get(rootId) || [];
          list.push(c);
          childMap.set(rootId, list);
        }
      }
    }

    const getMs = (ts: PollComment['createdAt']) => (ts ? ts.toMillis() : 0);

    childMap.forEach((list) => {
      list.sort((a, b) => getMs(a.createdAt) - getMs(b.createdAt));
    });

    roots.sort((a, b) => {
      if (sortMode === 'top') {
        const scoreA = a.likesCount + (childMap.get(a.id)?.length || 0);
        const scoreB = b.likesCount + (childMap.get(b.id)?.length || 0);
        if (scoreB !== scoreA) return scoreB - scoreA;
        return getMs(b.createdAt) - getMs(a.createdAt);
      }
      if (sortMode === 'oldest') {
        return getMs(a.createdAt) - getMs(b.createdAt);
      }
      return getMs(b.createdAt) - getMs(a.createdAt);
    });

    return { rootComments: roots, childrenByRoot: childMap };
  }, [comments, sortMode]);

  const handleSubmitMainComment = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user) {
      onToast(
        tr(
          'Tengeneza akaunti au endelea na Google ili utoe maoni yako.',
          'Create an account or continue with Google to share your opinion.'
        ),
        'error'
      );
      onSignIn('comment');
      return;
    }
    if (isSuspended) {
      onToast(
        tr('Akaunti yako imefungwa. Huwezi kutoa maoni kwa sasa.', 'Your account is suspended.'),
        'error'
      );
      return;
    }
    if (!isOpen) return;

    setMainError('');
    const clean = newComment.trim();
    if (clean.length < 2) {
      setMainError(tr('Andika angalau herufi 2.', 'Please write at least 2 characters.'));
      return;
    }
    if (Date.now() - lastSubmitAt < 2000) {
      setMainError(
        tr('Subiri sekunde chache kabla ya kutuma tena.', 'Wait a few seconds before sending again.')
      );
      return;
    }

    setSubmittingMain(true);
    try {
      await createPollComment(poll.id, user, userDisplayName, userPhoto, clean, '');
      setNewComment('');
      setLastSubmitAt(Date.now());
      window.requestAnimationFrame(() => {
        const el = threadScrollRef.current;
        if (!el) return;
        el.scrollTo({
          top: sortMode === 'oldest' ? el.scrollHeight : 0,
          behavior: 'smooth',
        });
      });
      onToast(tr('Maoni yako yamechapishwa!', 'Your comment has been posted!'), 'success');
    } catch (err) {
      setMainError(
        err instanceof Error ? err.message : tr('Imeshindwa kutuma maoni.', 'Failed to post comment.')
      );
    } finally {
      setSubmittingMain(false);
    }
  };

  const handleSubmitNestedReply = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user || !activeReplyRootId) {
      if (!user) onSignIn('comment');
      return;
    }
    if (isSuspended) {
      onToast(tr('Akaunti yako imefungwa.', 'Your account is suspended.'), 'error');
      return;
    }
    if (!isOpen) return;

    const trimmed = nestedReplyText.trim();
    const combined =
      replyMentionPrefix && !trimmed.startsWith(replyMentionPrefix)
        ? `${replyMentionPrefix} ${trimmed}`.trim()
        : trimmed;

    if (combined.length < 2) {
      onToast(tr('Jibu lazima liwe na herufi angalau 2.', 'Reply must be at least 2 characters.'), 'error');
      return;
    }
    if (Date.now() - lastSubmitAt < 2000) {
      onToast(
        tr('Subiri sekunde chache kabla ya kutuma tena.', 'Wait a few seconds before sending again.'),
        'error'
      );
      return;
    }

    setSubmittingNested(true);
    try {
      await createPollComment(
        poll.id,
        user,
        userDisplayName,
        userPhoto,
        combined,
        activeReplyRootId
      );
      setExpandedRootIds((prev) => {
        const next = new Set(prev);
        next.add(activeReplyRootId);
        return next;
      });
      setNestedReplyText('');
      setReplyMentionPrefix('');
      setActiveReplyRootId(null);
      setLastSubmitAt(Date.now());
      onToast(tr('Jibu lako limechapishwa!', 'Your reply has been posted!'), 'success');
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : tr('Imeshindwa kutuma jibu.', 'Failed to post reply.'),
        'error'
      );
    } finally {
      setSubmittingNested(false);
    }
  };

  const openInlineReply = (rootId: string, targetComment: PollComment, isChild: boolean) => {
    if (!user) {
      onToast(
        tr('Tengeneza akaunti au ingia ili kujibu maoni.', 'Sign in or register to reply.'),
        'error'
      );
      onSignIn('comment');
      return;
    }
    if (isSuspended) {
      onToast(tr('Akaunti yako imefungwa.', 'Your account is suspended.'), 'error');
      return;
    }
    if (!isOpen) return;

    setActiveReplyRootId(rootId);
    setReplyMentionPrefix(isChild ? `@${targetComment.authorName}` : '');
    setNestedReplyText('');
    setExpandedRootIds((prev) => {
      const next = new Set(prev);
      next.add(rootId);
      return next;
    });
  };

  const handleToggleLike = async (comment: PollComment) => {
    if (!userUid) {
      onToast(
        tr('Ingia au jisajili ili kupenda maoni.', 'Sign in or register to like comments.'),
        'error'
      );
      onSignIn('like');
      return;
    }
    if (isSuspended) {
      onToast(tr('Akaunti yako imefungwa.', 'Your account is suspended.'), 'error');
      return;
    }
    const hasLiked = likedIds.has(comment.id);
    try {
      await togglePollCommentLike(poll.id, comment.id, userUid, hasLiked);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Error', 'error');
    }
  };

  const handleSaveEdit = async (commentId: string) => {
    if (isSuspended || !isOpen) return;
    const clean = editingBody.trim();
    if (clean.length < 2) {
      onToast(
        tr('Maoni lazima yawe na herufi angalau 2.', 'Comment must be at least 2 characters.'),
        'error'
      );
      return;
    }
    setSavingEdit(true);
    try {
      await editPollComment(poll.id, commentId, clean);
      setEditingId(null);
      setEditingBody('');
      onToast(tr('Maoni yamehaririwa.', 'Comment updated.'), 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Error', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const executeSoftDelete = async (commentId: string) => {
    const canDecrement = (isAdmin || isOpen) && (poll.commentsCount || 0) > 0;
    setDeletingId(commentId);
    try {
      await softDeletePollComment(poll.id, commentId, canDecrement);
      setInlineDeleteId(null);
      onToast(tr('Maoni yamefutwa.', 'Comment deleted.'), 'success');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDelete = (comment: PollComment) => {
    if (isSuspended && !isAdmin) return;
    if (onRequestConfirm) {
      onRequestConfirm({
        title: tr('Futa Maoni Haya?', 'Delete this comment?'),
        message: tr(
          'Je, ungependa kuondoa maoni haya kwenye uwanja wa mjadala?',
          'Would you like to remove this comment from the discussion?'
        ),
        confirmLabel: tr('Ndiyo, Futa', 'Yes, Delete'),
        destructive: true,
        action: async () => {
          await executeSoftDelete(comment.id);
        },
      });
    } else {
      setInlineDeleteId((prev) => (prev === comment.id ? null : comment.id));
    }
  };

  const renderCommentBody = (text: string) => {
    const mentionMatch = text.match(/^(@[^\s]+(?:\s+[^\s]+)?)\s+([\s\S]+)$/);
    if (mentionMatch && mentionMatchesAuthor(mentionMatch[1], comments)) {
      return (
        <p className="text-[13.5px] leading-snug text-slate-800 whitespace-pre-wrap break-words sm:text-[14px]">
          <span className="font-semibold text-[#1D4E89]">{mentionMatch[1]}</span>{' '}
          <span>{renderLinkedInline(mentionMatch[2])}</span>
        </p>
      );
    }
    return (
      <p className="text-[13.5px] leading-snug text-slate-800 whitespace-pre-wrap break-words sm:text-[14px]">
        {renderLinkedInline(text)}
      </p>
    );
  };

  const renderBubbleAndActions = (
    comment: PollComment,
    rootId: string,
    isChild: boolean
  ) => {
    const isAuthor = userUid !== null && comment.authorId === userUid;
    const isPollCreator = comment.authorId === poll.createdBy;
    const hasLiked = likedIds.has(comment.id);
    const isEditing = editingId === comment.id;

    return (
      <div className="min-w-0 flex-1">
        {isEditing ? (
          <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-2.5">
            <textarea
              rows={2}
              maxLength={4000}
              value={editingBody}
              onChange={(e) => setEditingBody(e.target.value)}
              className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-[#1D4E89] focus:bg-white focus:outline-none"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="min-h-[32px] rounded-lg px-3 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                {tr('Ghairi', 'Cancel')}
              </button>
              <button
                type="button"
                disabled={savingEdit}
                onClick={() => void handleSaveEdit(comment.id)}
                className="min-h-[32px] rounded-lg bg-[#1D4E89] px-3 text-xs font-semibold text-white hover:bg-[#163A5F] disabled:opacity-60"
              >
                {savingEdit ? tr('Inahifadhi...', 'Saving...') : tr('Hifadhi', 'Save')}
              </button>
            </div>
          </div>
        ) : (
          <>
            {(() => {
              const bubbleStyle = isPollCreator
                ? 'border border-[#B8D4F4] bg-[#E3EFFC]'
                : isChild
                  ? 'border border-[#EED9AC] bg-[#FDF6E7]'
                  : 'border border-slate-200 bg-[#EFF3F8]';

              const nameColor = isPollCreator
                ? 'text-[#0F3560]'
                : isChild
                  ? 'text-[#7C4A03]'
                  : 'text-slate-900';

              return (
                <div
                  className={`inline-block max-w-full rounded-2xl px-3.5 py-2 text-left ${bubbleStyle}`}
                >
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span className={`text-[13px] font-bold ${nameColor}`}>
                      <AuthorName uid={comment.authorId} fallback={comment.authorName} />
                    </span>
                    <AuthorVerificationBadge uid={comment.authorId} size="xs" />
                    <OnlineStatusPill uid={comment.authorId} />
                    {isPollCreator && (
                      <span className="text-[11px] font-semibold text-[#1D4E89]">
                        · {tr('Mmiliki wa Swali', 'Author')}
                      </span>
                    )}
                    {!isPollCreator && isChild && (
                      <span className="text-[11px] font-medium text-[#9A5B04]">
                        · {tr('Jibu', 'Reply')}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5">{renderCommentBody(comment.body)}</div>
                </div>
              );
            })()}

            {/* Facebook-style compact micro-actions below the bubble */}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 px-2 text-xs text-slate-500">
              <span className="text-[11px]">
                {comment.createdAt ? formatTime(comment.createdAt) : tr('Sasa hivi', 'Just now')}
              </span>

              <button
                type="button"
                onClick={() => void handleToggleLike(comment)}
                aria-pressed={hasLiked}
                className={`inline-flex min-h-[26px] items-center gap-1 font-semibold transition-colors ${
                  hasLiked
                    ? 'text-rose-600'
                    : 'text-slate-600 hover:text-slate-900 hover:underline'
                }`}
              >
                <Heart
                  size={11}
                  className={hasLiked ? 'fill-rose-600 text-rose-600' : ''}
                  aria-hidden="true"
                />
                {tr('Penda', 'Like')}
                {comment.likesCount > 0 ? ` (${comment.likesCount})` : ''}
              </button>

              {isOpen && (
                <button
                  type="button"
                  onClick={() => openInlineReply(rootId, comment, isChild)}
                  className="min-h-[26px] font-semibold text-slate-600 hover:text-[#1D4E89] hover:underline"
                >
                  {tr('Jibu', 'Reply')}
                </button>
              )}

              {isAuthor && isOpen && !isSuspended && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(comment.id);
                    setEditingBody(comment.body);
                  }}
                  className="inline-flex min-h-[26px] items-center gap-1 font-medium text-slate-600 hover:text-slate-900 hover:underline"
                >
                  <Edit3 className="h-3 w-3" aria-hidden="true" />
                  <span>{tr('Hariri', 'Edit')}</span>
                </button>
              )}

              {((isAuthor && !isSuspended) || isAdmin) && (
                <button
                  type="button"
                  onClick={() => handleDelete(comment)}
                  className="inline-flex min-h-[26px] items-center gap-1 font-medium text-red-600 hover:text-red-800 hover:underline"
                >
                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                  <span>{tr('Futa', 'Delete')}</span>
                </button>
              )}
            </div>

            {inlineDeleteId === comment.id && (
              <div className="mt-1.5 inline-flex flex-wrap items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px]">
                <span className="font-bold text-rose-900">
                  {tr('Futa maoni haya?', 'Delete comment?')}
                </span>
                <button
                  type="button"
                  onClick={() => setInlineDeleteId(null)}
                  className="rounded px-2 py-0.5 font-semibold text-slate-600 hover:bg-white"
                >
                  {tr('Hapana', 'No')}
                </button>
                <button
                  type="button"
                  disabled={deletingId === comment.id}
                  onClick={() => void executeSoftDelete(comment.id)}
                  className="rounded bg-rose-600 px-2 py-0.5 font-bold text-white hover:bg-rose-700 disabled:opacity-60"
                >
                  {deletingId === comment.id ? '...' : tr('Futa', 'Delete')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const totalVisibleCount = comments.length;

  return (
    <div className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-3.5 sm:p-4 space-y-3.5">
      {/* Unified Discussion Arena Header + Sort Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/80">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-[#1D4E89]/10 text-[#1D4E89] flex items-center justify-center shrink-0">
            <MessageCircle size={15} />
          </span>
          <div>
            <h4 className="text-xs sm:text-sm font-extrabold text-[#0F172A] leading-tight">
              {tr('Uwanja wa Maoni & Majadiliano', 'Community Discussion Arena')}
            </h4>
            <p className="text-[11px] text-slate-500 tabular-nums">
              {tr(
                `${totalVisibleCount} maoni yameandikwa`,
                `${totalVisibleCount} comments shared`
              )}
            </p>
          </div>
        </div>

        {rootComments.length > 1 && (
          <div className="inline-flex items-center gap-1 rounded-lg bg-white border border-slate-200 p-0.5">
            {(
              [
                { id: 'oldest', label: tr('Mtiririko', 'Chronological') },
                { id: 'newest', label: tr('Mpya Zaidi', 'Newest') },
                { id: 'top', label: tr('Pendwa Zaidi', 'Top') },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSortMode(opt.id)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                  sortMode === opt.id
                    ? 'bg-[#1D4E89] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Self-Contained Mchart-Style Scrollable Thread Box */}
      <div className="relative">
        <div
          ref={threadScrollRef}
          onScroll={handleThreadScroll}
          className="max-h-[360px] sm:max-h-[430px] touch-pan-y overflow-y-auto overscroll-contain rounded-xl border border-slate-200/80 bg-white p-3 sm:p-4 [overflow-anchor:auto]"
        >
          {loading ? (
            <div className="space-y-3 py-2">
              {[1, 2].map((idx) => (
                <div key={idx} className="flex gap-2.5 animate-pulse">
                  <div className="h-7 w-7 rounded-full bg-slate-200 shrink-0" />
                  <div className="h-14 w-3/4 rounded-2xl bg-slate-100 border border-slate-200" />
                </div>
              ))}
            </div>
          ) : rootComments.length === 0 ? (
            <div className="py-5 px-4 text-center">
              <p className="text-xs font-medium text-slate-500">
                {tr(
                  'Bado hakuna maoni. Kuwa wa kwanza kuchangia mjadala huu!',
                  'No comments yet. Be the first to join this discussion!'
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
          {rootComments.map((root) => {
            const children = childrenByRoot.get(root.id) || [];
            const isExpanded = expandedRootIds.has(root.id);
            const showInlineReply = activeReplyRootId === root.id;
            const visibleChildren =
              children.length > 2 && !isExpanded ? children.slice(-2) : children;
            const hiddenCount = children.length - visibleChildren.length;
            const hasThreadLine = children.length > 0 || showInlineReply;

            return (
              <div key={root.id} className="relative">
                {/* Root Comment Row */}
                <div className="flex items-stretch gap-2.5">
                  <div className="flex w-7 shrink-0 flex-col items-center">
                    <Avatar
                      name={root.authorName}
                      photoURL={root.authorPhoto}
                      uid={root.authorId}
                      showOnlineIndicator
                      size="sm"
                    />
                    {hasThreadLine && (
                      <div className="mt-1 w-[1.5px] flex-1 bg-slate-200" aria-hidden="true" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 pb-1">
                    {renderBubbleAndActions(root, root.id, false)}
                  </div>
                </div>

                {/* Collapsed Older Replies Toggle */}
                {hiddenCount > 0 && (
                  <div className="flex items-stretch gap-2.5">
                    <div className="flex w-7 shrink-0 justify-center">
                      <div className="w-[1.5px] bg-slate-200" aria-hidden="true" />
                    </div>
                    <div className="flex items-center gap-2 py-1">
                      <div className="-ml-[25px] flex items-start shrink-0">
                        <ThreadElbowConnector />
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedRootIds((prev) => {
                            const next = new Set(prev);
                            next.add(root.id);
                            return next;
                          })
                        }
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1D4E89] hover:underline"
                      >
                        <CornerDownRight className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>
                          {tr(
                            `Tazama majibu mengine ${hiddenCount}`,
                            `View ${hiddenCount} more replies`
                          )}
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Nested Child Replies */}
                {visibleChildren.map((child, idx) => {
                  const hasMoreBelow = idx < visibleChildren.length - 1 || showInlineReply;
                  return (
                    <div key={child.id} className="flex items-stretch gap-2.5">
                      <div className="flex w-7 shrink-0 justify-center">
                        {hasMoreBelow ? (
                          <div className="w-[1.5px] bg-slate-200" aria-hidden="true" />
                        ) : (
                          <div className="h-3 w-[1.5px] bg-slate-200" aria-hidden="true" />
                        )}
                      </div>

                      <div className="flex min-w-0 flex-1 items-start gap-2 pt-1.5">
                        <div className="-ml-[25px] flex items-start pt-0.5 shrink-0">
                          <ThreadElbowConnector />
                        </div>
                        <div className="pt-0.5 shrink-0">
                          <span className="inline-flex h-6 w-6 rounded-full">
                            <Avatar
                              name={child.authorName}
                              photoURL={child.authorPhoto}
                              uid={child.authorId}
                              showOnlineIndicator
                              size="sm"
                            />
                          </span>
                        </div>
                        <div className="min-w-0 flex-1 pb-1">
                          {renderBubbleAndActions(child, root.id, true)}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Inline Nested Reply Composer */}
                {showInlineReply && (
                  <div className="flex items-stretch gap-2.5">
                    <div className="flex w-7 shrink-0 justify-center">
                      <div className="h-3 w-[1.5px] bg-slate-200" aria-hidden="true" />
                    </div>
                    <form
                      data-comment-composer="true"
                      onSubmit={handleSubmitNestedReply}
                      className="flex min-w-0 flex-1 items-start gap-2 pt-1.5"
                    >
                      <div className="-ml-[25px] flex items-start pt-0.5 shrink-0">
                        <ThreadElbowConnector />
                      </div>
                      <div className="pt-0.5 shrink-0">
                        <span className="inline-flex h-6 w-6 overflow-hidden rounded-full">
                          <Avatar name={userDisplayName} photoURL={userPhoto} uid={userUid} size="sm" />
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        {replyMentionPrefix && (
                          <div className="mb-1 flex items-center justify-between px-1 text-[11px] text-slate-500">
                            <span>
                              {tr('Unamjibu', 'Replying to')}{' '}
                              <strong className="text-[#1D4E89]">{replyMentionPrefix}</strong>
                            </span>
                            <button
                              type="button"
                              onClick={() => setReplyMentionPrefix('')}
                              className="text-slate-400 hover:text-slate-700"
                            >
                              {tr('Ondoa jina', 'Clear')}
                            </button>
                          </div>
                        )}
                        <div className="flex items-end gap-1.5 rounded-2xl border border-[#EED9AC] bg-[#FEFBF3] px-3 py-1.5 focus-within:border-[#B45309] focus-within:bg-white">
                          <textarea
                            ref={nestedInputRef}
                            rows={1}
                            maxLength={3900}
                            value={nestedReplyText}
                            onFocus={(e) => scrollCommentInputAboveKeyboard(e.currentTarget)}
                            onChange={(e) => setNestedReplyText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                void handleSubmitNestedReply();
                              } else if (e.key === 'Escape') {
                                setActiveReplyRootId(null);
                              }
                            }}
                            placeholder={tr(
                              `Jibu maoni ya ${root.authorName}...`,
                              `Reply to ${root.authorName}...`
                            )}
                            className="max-h-24 min-h-[22px] w-full resize-none bg-transparent text-xs sm:text-sm leading-snug text-slate-900 placeholder:text-slate-500 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setActiveReplyRootId(null)}
                            aria-label={tr('Funga sanduku la kujibu', 'Close reply box')}
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="submit"
                            disabled={submittingNested || nestedReplyText.trim().length < 1}
                            aria-label={tr('Tuma jibu', 'Send reply')}
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1D4E89] text-white hover:bg-[#163A5F] disabled:bg-slate-300 disabled:text-slate-500"
                          >
                            <Send className="h-3 w-3" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
        </div>

        {showScrollTopBtn && (
          <button
            type="button"
            onClick={() => threadScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label={tr('Rudi juu kwenye maoni', 'Scroll comments to top')}
            className="absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white/95 px-2.5 py-1 text-[11px] font-bold text-[#0E2640] shadow-md backdrop-blur-xs transition-colors hover:bg-slate-50"
          >
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{tr('Juu', 'Top')}</span>
          </button>
        )}
      </div>

      {/* Bottom Comment Input (Latest message stays directly above typing bar like Kijiweni) */}
      {!isOpen ? (
        <p className="rounded-lg bg-slate-100 border border-slate-200 px-3.5 py-2.5 text-xs text-slate-600">
          {tr(
            'Mjadala huu umefungwa na haupokei maoni mapya kwa sasa.',
            'This discussion has closed and is no longer accepting new comments.'
          )}
        </p>
      ) : isSuspended ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
          {tr(
            'Akaunti yako imefungwa — huwezi kuandika maoni, kujibu, au kupenda.',
            'Your account is suspended — you cannot comment, reply, or like.'
          )}
        </p>
      ) : !userUid ? (
        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-[#0F172A]">
              {tr(
                'Jisajili au Endelea na Google Kutoa Maoni',
                'Sign Up or Continue with Google to Join Discussion'
              )}
            </div>
            <p className="text-[11px] text-slate-600 mt-0.5">
              {tr(
                'Unaweza kusoma maoni yote bure. Ili uandike maoni yako au ujibu wengine, ingia na akaunti yako.',
                'Read all comments freely. Sign in with your account to post a comment, reply, or like.'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSignIn('comment')}
            className="inline-flex items-center gap-1.5 min-h-[36px] rounded-lg bg-[#1D4E89] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#163A5F] whitespace-nowrap shrink-0"
          >
            <UserCheck size={14} />
            {tr('Endelea na Google / Jisajili', 'Continue with Google / Sign Up')}
          </button>
        </div>
      ) : (
        <form
          data-comment-composer="true"
          onSubmit={handleSubmitMainComment}
          className="flex items-start gap-2.5"
        >
          <div className="pt-0.5 shrink-0">
            <Avatar
              name={userDisplayName}
              photoURL={userPhoto}
              uid={userUid}
              showOnlineIndicator
              size="sm"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2 focus-within:border-[#1D4E89] focus-within:ring-2 focus-within:ring-[#1D4E89]/15">
              <textarea
                ref={mainInputRef}
                rows={1}
                maxLength={4000}
                value={newComment}
                onFocus={(e) => scrollCommentInputAboveKeyboard(e.currentTarget)}
                onChange={(e) => {
                  setNewComment(e.target.value);
                  if (mainError) setMainError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSubmitMainComment();
                  }
                }}
                placeholder={tr(
                  'Toa maoni yako kuhusu swali hili...',
                  'Share your thoughts on this question...'
                )}
                aria-label={tr('Andika maoni yako', 'Write your comment')}
                className="max-h-28 min-h-[24px] w-full resize-none bg-transparent text-sm leading-snug text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={submittingMain || newComment.trim().length < 2}
                aria-label={tr('Tuma maoni', 'Send comment')}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1D4E89] text-white transition-colors hover:bg-[#163A5F] disabled:bg-slate-200 disabled:text-slate-400"
              >
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            {mainError && (
              <p role="alert" className="mt-1 px-2 text-xs text-red-600">
                {mainError}
              </p>
            )}
          </div>
        </form>
      )}
    </div>
  );
};
