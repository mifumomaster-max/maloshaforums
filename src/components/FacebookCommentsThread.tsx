import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronUp,
  CornerDownRight,
  Edit3,
  Flag,
  Heart,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  createReply,
  editReply,
  softDeleteReply,
  toggleAcceptReply,
  toggleReplyVote,
} from '../services/forumService';
import { AuthPromptReason, Reply, Topic } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { useUserPresence } from '../context/UserPresenceContext';
import { AuthorName, Avatar, OnlineStatusPill } from './Avatar';
import { renderLinkedInline } from './RichText';
import { AuthorVerificationBadge } from './VerificationBadge';

interface FacebookCommentsThreadProps {
  topic: Topic;
  userUid: string | null;
  userDisplayName: string;
  userPhoto?: string;
  isAdmin: boolean;
  isSuspended?: boolean;
  allowAcceptAnswer?: boolean;
  compact?: boolean;
  autoFocus?: boolean;
  onSignIn: (reason?: AuthPromptReason) => void;
  onOpenReport: (targetType: 'topic' | 'reply', targetId: string) => void;
  onToast: (message: string, kind?: 'success' | 'error') => void;
  onRequestConfirm: (opts: {
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

export const FacebookCommentsThread: React.FC<FacebookCommentsThreadProps> = ({
  topic,
  userUid,
  userDisplayName,
  userPhoto = '',
  isAdmin,
  isSuspended = false,
  allowAcceptAnswer = false,
  compact = false,
  autoFocus = false,
  onSignIn,
  onOpenReport,
  onToast,
  onRequestConfirm,
}) => {
  const { tr, formatTime } = useLanguage();
  const { setMchartTyping, getTopicCommentTypingUsers } = useUserPresence();
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(true);
  const [votedReplyIds, setVotedReplyIds] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<'newest' | 'top' | 'oldest'>('oldest');

  // Top-level comment composer
  const [newComment, setNewComment] = useState('');
  const [submittingMain, setSubmittingMain] = useState(false);
  const [mainError, setMainError] = useState('');
  const mainInputRef = useRef<HTMLTextAreaElement>(null);

  // Inline nested reply state (keyed by root parent comment id)
  const [activeReplyThreadId, setActiveReplyThreadId] = useState<string | null>(null);
  const [activeReplyTarget, setActiveReplyTarget] = useState<{
    targetAuthorId: string;
    targetAuthorName: string;
    rootAuthorId: string;
  } | null>(null);
  const [replyMentionPrefix, setReplyMentionPrefix] = useState('');
  const [nestedReplyText, setNestedReplyText] = useState('');
  const [submittingNested, setSubmittingNested] = useState(false);
  const nestedInputRef = useRef<HTMLTextAreaElement>(null);

  // Expanded child threads when > 2 replies
  const [expandedThreadIds, setExpandedThreadIds] = useState<Set<string>>(new Set());

  // Inline editing state
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [lastSubmitAt, setLastSubmitAt] = useState(0);
  const threadScrollRef = useRef<HTMLDivElement>(null);
  const [showScrollTopBtn, setShowScrollTopBtn] = useState(false);
  const didInitialScrollRef = useRef(false);
  const prevReplyCountRef = useRef(0);
  const typingIdleTimerRef = useRef<number | null>(null);

  const typingChatId = `topic:${topic.id}`;
  const typingUsers = getTopicCommentTypingUsers(topic.id);

  const clearTypingNow = () => {
    if (typingIdleTimerRef.current !== null) {
      window.clearTimeout(typingIdleTimerRef.current);
      typingIdleTimerRef.current = null;
    }
    setMchartTyping(false, '', typingChatId);
  };

  const pulseTyping = (hasText: boolean, replyingToName = '') => {
    if (!userUid || isSuspended || topic.status !== 'open') return;
    if (!hasText) {
      clearTypingNow();
      return;
    }
    setMchartTyping(true, replyingToName, typingChatId);
    if (typingIdleTimerRef.current !== null) {
      window.clearTimeout(typingIdleTimerRef.current);
    }
    typingIdleTimerRef.current = window.setTimeout(() => {
      typingIdleTimerRef.current = null;
      setMchartTyping(false, '', typingChatId);
    }, 3200);
  };

  useEffect(() => {
    return () => {
      if (typingIdleTimerRef.current !== null) {
        window.clearTimeout(typingIdleTimerRef.current);
        typingIdleTimerRef.current = null;
      }
      setMchartTyping(false, '', typingChatId);
    };
  }, [setMchartTyping, typingChatId]);

  const handleThreadScroll = () => {
    const el = threadScrollRef.current;
    if (!el) return;
    setShowScrollTopBtn(el.scrollTop > 180);
  };

  useEffect(() => {
    if (autoFocus && userUid && topic.status === 'open') {
      const timer = window.setTimeout(() => {
        mainInputRef.current?.focus({ preventScroll: true });
      }, 60);
      return () => window.clearTimeout(timer);
    }
  }, [autoFocus, userUid, topic.status]);

  useEffect(() => {
    if (activeReplyThreadId) {
      const timer = window.setTimeout(() => {
        nestedInputRef.current?.focus({ preventScroll: true });
      }, 40);
      return () => window.clearTimeout(timer);
    }
  }, [activeReplyThreadId]);

  useEffect(() => {
    didInitialScrollRef.current = false;
    prevReplyCountRef.current = 0;
  }, [topic.id]);

  // Listen to replies for this topic
  useEffect(() => {
    setLoadingReplies(true);
    const path = `topics/${topic.id}/replies`;
    const q = query(
      collection(db, 'topics', topic.id, 'replies'),
      where('isDeleted', '==', false)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Reply[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            topicId: data.topicId,
            authorId: data.authorId,
            authorName: data.authorName,
            authorPhoto: data.authorPhoto || '',
            body: data.body,
            parentReplyId: data.parentReplyId || '',
            isAcceptedAnswer: Boolean(data.isAcceptedAnswer),
            upvotesCount: Number(data.upvotesCount || 0),
            isDeleted: Boolean(data.isDeleted),
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
          };
        });
        setReplies(list);
        setLoadingReplies(false);
      },
      (error) => {
        setLoadingReplies(false);
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    return () => unsubscribe();
  }, [topic.id]);

  // Listen to current user's votes on visible replies
  useEffect(() => {
    if (!userUid || replies.length === 0) {
      setVotedReplyIds(new Set());
      return;
    }

    const unsubs = replies.map((r) => {
      const voteRef = doc(db, 'topics', topic.id, 'replies', r.id, 'votes', userUid);
      return onSnapshot(
        voteRef,
        (snap) => {
          setVotedReplyIds((prev) => {
            const next = new Set(prev);
            if (snap.exists()) {
              next.add(r.id);
            } else {
              next.delete(r.id);
            }
            return next;
          });
        },
        (error) => {
          handleFirestoreError(
            error,
            OperationType.GET,
            `topics/${topic.id}/replies/${r.id}/votes/${userUid}`
          );
        }
      );
    });

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [topic.id, userUid, replies]);

  // Build 2-level Facebook thread tree (root comments + chronologically ordered nested replies)
  const { rootComments, childrenByRoot } = useMemo(() => {
    const map = new Map<string, Reply>();
    for (const r of replies) {
      map.set(r.id, r);
    }

    const findRootId = (r: Reply): string => {
      let current = r;
      const visited = new Set<string>([r.id]);
      while (current.parentReplyId && map.has(current.parentReplyId)) {
        if (visited.has(current.parentReplyId)) break;
        visited.add(current.parentReplyId);
        current = map.get(current.parentReplyId)!;
      }
      return current.id;
    };

    const roots: Reply[] = [];
    const childMap = new Map<string, Reply[]>();

    for (const r of replies) {
      if (!r.parentReplyId || !map.has(r.parentReplyId)) {
        roots.push(r);
      } else {
        const rootId = findRootId(r);
        if (rootId === r.id) {
          roots.push(r);
        } else {
          const arr = childMap.get(rootId) || [];
          arr.push(r);
          childMap.set(rootId, arr);
        }
      }
    }

    const getMs = (ts: Reply['createdAt']) => (ts ? ts.toMillis() : Date.now());

    // Sort child replies chronologically (oldest first, natural conversation flow)
    childMap.forEach((arr, key) => {
      arr.sort((a, b) => getMs(a.createdAt) - getMs(b.createdAt));
      childMap.set(key, arr);
    });

    // Sort root comments
    roots.sort((a, b) => {
      if (a.isAcceptedAnswer !== b.isAcceptedAnswer) return a.isAcceptedAnswer ? -1 : 1;
      if (sortMode === 'top') {
        const scoreA = a.upvotesCount + (childMap.get(a.id)?.length || 0);
        const scoreB = b.upvotesCount + (childMap.get(b.id)?.length || 0);
        if (scoreB !== scoreA) return scoreB - scoreA;
        return getMs(b.createdAt) - getMs(a.createdAt);
      }
      if (sortMode === 'oldest') {
        return getMs(a.createdAt) - getMs(b.createdAt);
      }
      return getMs(b.createdAt) - getMs(a.createdAt);
    });

    return { rootComments: roots, childrenByRoot: childMap };
  }, [replies, sortMode]);

  // Keep latest message visible right above the bottom input in chronological mode
  useEffect(() => {
    if (loadingReplies) return;
    const el = threadScrollRef.current;
    if (!el) return;

    const countIncreased = replies.length > prevReplyCountRef.current;
    prevReplyCountRef.current = replies.length;

    if (sortMode === 'oldest' && (!didInitialScrollRef.current || countIncreased)) {
      didInitialScrollRef.current = true;
      window.requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    } else if (!didInitialScrollRef.current) {
      didInitialScrollRef.current = true;
    }
  }, [loadingReplies, replies.length, sortMode]);

  const handleSubmitMainComment = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!userUid) {
      onToast(
        tr(
          'Tafadhali tengeneza akaunti au ingia (Google au fomu ya kawaida) ili utoe maoni.',
          'Please create an account or sign in to comment.'
        ),
        'error'
      );
      onSignIn('comment');
      return;
    }
    if (isSuspended) {
      onToast(
        tr(
          'Akaunti yako imefungwa. Huwezi kutoa maoni kwa sasa.',
          'Your account is suspended. You cannot comment.'
        ),
        'error'
      );
      return;
    }
    setMainError('');
    const clean = newComment.trim();
    if (clean.length < 2) {
      setMainError(tr('Andika angalau herufi 2.', 'Please write at least 2 characters.'));
      return;
    }
    const now = Date.now();
    if (now - lastSubmitAt < 2000) {
      setMainError(
        tr('Subiri sekunde chache kabla ya kutuma tena.', 'Wait a few seconds before sending again.')
      );
      return;
    }

    setSubmittingMain(true);
    try {
      const { auth } = await import('../firebase');
      if (!auth.currentUser) {
        onSignIn('comment');
        return;
      }
      await createReply(auth.currentUser, userDisplayName, topic.id, clean, '', {
        topicTitle: topic.title,
        topicCategory: topic.category,
        topicAuthorId: topic.authorId,
        replyActorPhoto: userPhoto,
      });
      clearTypingNow();
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
      onToast(tr('Maoni yako yamechapishwa.', 'Your comment has been posted.'));
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
    if (!userUid || !activeReplyThreadId) {
      if (!userUid) onSignIn('comment');
      return;
    }
    if (isSuspended) {
      onToast(
        tr(
          'Akaunti yako imefungwa. Huwezi kutuma majibu kwa sasa.',
          'Your account is suspended. You cannot reply.'
        ),
        'error'
      );
      return;
    }
    const trimmed = nestedReplyText.trim();
    const combined =
      replyMentionPrefix && !trimmed.startsWith(replyMentionPrefix)
        ? `${replyMentionPrefix} ${trimmed}`.trim()
        : trimmed;

    if (combined.length < 2) {
      onToast(tr('Jibu lazima liwe na herufi angalau 2.', 'Reply must be at least 2 characters.'), 'error');
      return;
    }
    const now = Date.now();
    if (now - lastSubmitAt < 2000) {
      onToast(
        tr('Subiri sekunde chache kabla ya kutuma tena.', 'Wait a few seconds before sending again.'),
        'error'
      );
      return;
    }

    setSubmittingNested(true);
    try {
      const { auth } = await import('../firebase');
      if (!auth.currentUser) {
        onSignIn('comment');
        return;
      }
      await createReply(
        auth.currentUser,
        userDisplayName,
        topic.id,
        combined,
        activeReplyThreadId,
        {
          topicTitle: topic.title,
          topicCategory: topic.category,
          topicAuthorId: topic.authorId,
          targetReplyAuthorId: activeReplyTarget?.targetAuthorId,
          rootReplyAuthorId: activeReplyTarget?.rootAuthorId,
          replyActorPhoto: userPhoto,
        }
      );
      setExpandedThreadIds((prev) => {
        const next = new Set(prev);
        next.add(activeReplyThreadId);
        return next;
      });
      clearTypingNow();
      setNestedReplyText('');
      setReplyMentionPrefix('');
      setActiveReplyThreadId(null);
      setActiveReplyTarget(null);
      setLastSubmitAt(Date.now());
      onToast(tr('Jibu lako limechapishwa.', 'Your reply has been posted.'));
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : tr('Imeshindwa kutuma jibu.', 'Failed to post reply.'),
        'error'
      );
    } finally {
      setSubmittingNested(false);
    }
  };

  const openInlineReply = (rootId: string, targetReply: Reply, isChild: boolean) => {
    if (!userUid) {
      onToast(
        tr(
          'Tengeneza akaunti au ingia ili kujibu maoni.',
          'Create an account or sign in to reply.'
        ),
        'error'
      );
      onSignIn('comment');
      return;
    }
    if (isSuspended) {
      onToast(
        tr('Akaunti yako imefungwa. Huwezi kujibu maoni.', 'Your account is suspended.'),
        'error'
      );
      return;
    }
    if (topic.status !== 'open') return;
    const rootComment = replies.find((r) => r.id === rootId);
    setActiveReplyThreadId(rootId);
    setActiveReplyTarget({
      targetAuthorId: targetReply.authorId,
      targetAuthorName: targetReply.authorName,
      rootAuthorId: rootComment?.authorId || targetReply.authorId,
    });
    setReplyMentionPrefix(isChild ? `@${targetReply.authorName}` : '');
    setNestedReplyText('');
    setExpandedThreadIds((prev) => {
      const next = new Set(prev);
      next.add(rootId);
      return next;
    });
  };

  const handleToggleLike = async (reply: Reply) => {
    if (!userUid) {
      onToast(
        tr(
          'Tengeneza akaunti au ingia (kwa Google au Jisajili kawaida) ili kupenda maoni.',
          'Create an account or sign in (Google or Register) to like comments.'
        ),
        'error'
      );
      onSignIn('like');
      return;
    }
    if (isSuspended) {
      onToast(
        tr(
          'Akaunti yako imefungwa. Huwezi kupenda maoni.',
          'Your account is suspended. You cannot like comments.'
        ),
        'error'
      );
      return;
    }
    const hasVoted = votedReplyIds.has(reply.id);
    await toggleReplyVote(topic.id, reply.id, userUid, hasVoted);
  };

  const handleSaveEdit = async (replyId: string) => {
    if (isSuspended) return;
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
      await editReply(topic.id, replyId, clean);
      setEditingReplyId(null);
      setEditingBody('');
      onToast(tr('Maoni yamehaririwa.', 'Comment updated.'));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = (reply: Reply) => {
    if (isSuspended && !isAdmin) return;
    onRequestConfirm({
      title: tr('Futa Maoni Haya?', 'Delete this comment?'),
      message: tr(
        'Je, ungependa kuondoa maoni haya kwenye mjadala huu?',
        'Would you like to remove this comment from the discussion?'
      ),
      confirmLabel: tr('Ndiyo, Futa', 'Yes, Delete'),
      destructive: true,
      action: async () => {
        await softDeleteReply(topic.id, reply.id, topic.status);
        onToast(tr('Maoni yamefutwa.', 'Comment deleted.'));
      },
    });
  };

  const handleToggleAccept = async (reply: Reply) => {
    if (isSuspended) return;
    await toggleAcceptReply(
      topic.id,
      reply.id,
      reply.isAcceptedAnswer,
      topic.acceptedReplyId
    );
    onToast(
      reply.isAcceptedAnswer
        ? tr('Alama ya jibu sahihi imeondolewa.', 'Accepted answer mark removed.')
        : tr('Umeweka alama ya Jibu Sahihi!', 'Marked as Accepted Answer!')
    );
  };

  const renderCommentBody = (text: string) => {
    const mentionMatch = text.match(/^(@[^\s]+(?:\s+[^\s]+)?)\s+([\s\S]+)$/);
    if (mentionMatch && replyMentionLooksLikeName(mentionMatch[1], replies)) {
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

  const renderCommentBubbleAndActions = (
    reply: Reply,
    rootId: string,
    isChild: boolean
  ) => {
    const isAuthor = userUid !== null && reply.authorId === userUid;
    const isOp = reply.authorId === topic.authorId;
    const hasVoted = votedReplyIds.has(reply.id);
    const isEditing = editingReplyId === reply.id;

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
                onClick={() => setEditingReplyId(null)}
                className="min-h-[34px] rounded-lg px-3 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                {tr('Ghairi', 'Cancel')}
              </button>
              <button
                type="button"
                disabled={savingEdit}
                onClick={() => void handleSaveEdit(reply.id)}
                className="min-h-[34px] rounded-lg bg-[#1D4E89] px-3 text-xs font-semibold text-white hover:bg-[#163A5F] disabled:opacity-60"
              >
                {savingEdit ? tr('Inahifadhi...', 'Saving...') : tr('Hifadhi', 'Save')}
              </button>
            </div>
          </div>
        ) : (
          <>
            {(() => {
              const bubbleStyle = reply.isAcceptedAnswer
                ? 'border border-emerald-200 bg-emerald-50/80'
                : isOp
                  ? 'border border-[#B8D4F4] bg-[#E3EFFC]'
                  : isChild
                    ? 'border border-[#EED9AC] bg-[#FDF6E7]'
                    : 'border border-slate-200 bg-[#EFF3F8]';

              const nameColor = isOp
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
                      <AuthorName uid={reply.authorId} fallback={reply.authorName} />
                    </span>
                    <AuthorVerificationBadge uid={reply.authorId} size="xs" />
                    <OnlineStatusPill uid={reply.authorId} />
                    {isOp && (
                      <span className="text-[11px] font-semibold text-[#1D4E89]">
                        · {tr('Mwandishi', 'Author')}
                      </span>
                    )}
                    {!isOp && isChild && (
                      <span className="text-[11px] font-medium text-[#9A5B04]">
                        · {tr('Jibu', 'Reply')}
                      </span>
                    )}
                    {reply.isAcceptedAnswer && (
                      <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-emerald-700">
                        · <CheckCircle2 className="h-3 w-3" aria-hidden="true" />{' '}
                        {tr('Jibu Sahihi', 'Accepted Answer')}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5">{renderCommentBody(reply.body)}</div>
                </div>
              );
            })()}

            {/* Facebook-style compact micro-actions below the bubble */}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 px-2 text-xs text-slate-500">
              <span className="text-[11px]">{formatTime(reply.createdAt)}</span>

              <button
                type="button"
                onClick={() => void handleToggleLike(reply)}
                aria-pressed={hasVoted}
                className={`min-h-[28px] font-semibold transition-colors ${
                  hasVoted
                    ? 'text-rose-600'
                    : 'text-slate-600 hover:text-slate-900 hover:underline'
                }`}
              >
                {tr('Penda', 'Like')}
                {reply.upvotesCount > 0 ? ` (${reply.upvotesCount})` : ''}
              </button>

              {topic.status === 'open' && (
                <button
                  type="button"
                  onClick={() => openInlineReply(rootId, reply, isChild)}
                  className="min-h-[28px] font-semibold text-slate-600 hover:text-[#1D4E89] hover:underline"
                >
                  {tr('Jibu', 'Reply')}
                </button>
              )}

              {allowAcceptAnswer && userUid === topic.authorId && !isSuspended && (
                <button
                  type="button"
                  onClick={() => void handleToggleAccept(reply)}
                  className={`min-h-[28px] font-medium hover:underline ${
                    reply.isAcceptedAnswer ? 'text-emerald-700' : 'text-slate-600'
                  }`}
                >
                  {reply.isAcceptedAnswer
                    ? tr('Ondoa Kukubali', 'Unaccept')
                    : tr('Kubali Jibu', 'Accept Answer')}
                </button>
              )}

              {isAuthor && topic.status === 'open' && !isSuspended && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingReplyId(reply.id);
                    setEditingBody(reply.body);
                  }}
                  className="inline-flex min-h-[28px] items-center gap-1 font-medium text-slate-600 hover:text-slate-900 hover:underline"
                >
                  <Edit3 className="h-3 w-3" aria-hidden="true" />
                  <span>{tr('Hariri', 'Edit')}</span>
                </button>
              )}

              {((isAuthor && !isSuspended) || isAdmin) && (
                <button
                  type="button"
                  onClick={() => handleDelete(reply)}
                  className="inline-flex min-h-[28px] items-center gap-1 font-medium text-red-600 hover:text-red-800 hover:underline"
                >
                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                  <span>{tr('Futa', 'Delete')}</span>
                </button>
              )}

              {userUid && !isAuthor && !isSuspended && (
                <button
                  type="button"
                  onClick={() => onOpenReport('reply', reply.id)}
                  className="inline-flex min-h-[28px] items-center gap-1 text-slate-500 hover:text-red-700 hover:underline"
                >
                  <Flag className="h-3 w-3" aria-hidden="true" />
                  <span>{tr('Ripoti', 'Report')}</span>
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {/* Sort Bar when multiple root comments exist */}
      {rootComments.length > 1 && (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-slate-600 tabular-nums">
            {tr(`Maoni ${replies.length}`, `${replies.length} comments`)}
          </span>
          <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
            {(
              [
                { id: 'oldest', label: tr('Mpya Chini', 'Latest Below') },
                { id: 'newest', label: tr('Mpya Juu', 'Newest Top') },
                { id: 'top', label: tr('Pendwa Zaidi', 'Top') },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSortMode(opt.id)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                  sortMode === opt.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Self-Contained Mchart-Style Scrollable Thread Viewport (messages stay above the bottom input) */}
      <div className="relative">
        <div
          ref={threadScrollRef}
          onScroll={handleThreadScroll}
          className={`${
            compact
              ? 'max-h-[300px] sm:max-h-[350px]'
              : 'max-h-[390px] sm:max-h-[460px]'
          } touch-pan-y overflow-y-auto overscroll-contain rounded-xl border border-slate-200/85 bg-[#F8FAFC]/70 p-3 sm:p-3.5 [overflow-anchor:auto]`}
        >
          {loadingReplies ? (
            <div className="space-y-3 py-2">
              {[1, 2].map((idx) => (
                <div key={idx} className="flex gap-2.5 animate-pulse">
                  <div className="h-7 w-7 rounded-full bg-slate-200 shrink-0" />
                  <div className="h-14 w-3/4 rounded-2xl bg-slate-100" />
                </div>
              ))}
            </div>
          ) : rootComments.length === 0 ? (
            <p className="py-3 text-center text-xs text-slate-500">
              {tr(
                'Bado hakuna maoni. Kuwa wa kwanza kutoa maoni yako!',
                'No comments yet. Be the first to comment!'
              )}
            </p>
          ) : (
            <div className="space-y-3">
          {rootComments.map((root) => {
            const children = childrenByRoot.get(root.id) || [];
            const isExpanded = expandedThreadIds.has(root.id);
            const showInlineReply = activeReplyThreadId === root.id;
            const visibleChildren =
              children.length > 2 && !isExpanded ? children.slice(-2) : children;
            const hiddenCount = children.length - visibleChildren.length;
            const hasThreadLine = children.length > 0 || showInlineReply;

            return (
              <div key={root.id} className="relative">
                {/* Root Comment Row */}
                <div className="flex items-stretch gap-2.5">
                  {/* Left Avatar + Vertical Thread Spine */}
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

                  {/* Right Bubble & Micro-Actions */}
                  <div className="min-w-0 flex-1 pb-1">
                    {renderCommentBubbleAndActions(root, root.id, false)}
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
                          setExpandedThreadIds((prev) => {
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
                      {/* Left continuous spine column matching root avatar width (w-7) */}
                      <div className="flex w-7 shrink-0 justify-center">
                        {hasMoreBelow ? (
                          <div className="w-[1.5px] bg-slate-200" aria-hidden="true" />
                        ) : (
                          <div className="h-3 w-[1.5px] bg-slate-200" aria-hidden="true" />
                        )}
                      </div>

                      {/* Elbow + Child Avatar + Bubble */}
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
                          {renderCommentBubbleAndActions(child, root.id, true)}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Inline Nested Reply Box inside this thread */}
                {showInlineReply && (
                  <div className="flex items-stretch gap-2.5">
                    <div className="flex w-7 shrink-0 justify-center">
                      <div className="h-3 w-[1.5px] bg-slate-200" aria-hidden="true" />
                    </div>
                    <form
                      onSubmit={handleSubmitNestedReply}
                      className="flex min-w-0 flex-1 items-start gap-2 pt-1.5"
                    >
                      <div className="-ml-[25px] flex items-start pt-0.5 shrink-0">
                        <ThreadElbowConnector />
                      </div>
                      <div className="pt-0.5 shrink-0">
                        <span className="inline-flex h-6 w-6 overflow-hidden rounded-full">
                          <Avatar name={userDisplayName} photoURL={userPhoto} size="sm" />
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
                            onChange={(e) => {
                              const nextVal = e.target.value;
                              setNestedReplyText(nextVal);
                              pulseTyping(
                                nextVal.trim().length > 0,
                                activeReplyTarget?.targetAuthorName || root.authorName
                              );
                            }}
                            onBlur={() => clearTypingNow()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                void handleSubmitNestedReply();
                              } else if (e.key === 'Escape') {
                                clearTypingNow();
                                setActiveReplyThreadId(null);
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
                            onClick={() => {
                              clearTypingNow();
                              setActiveReplyThreadId(null);
                            }}
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

      {/* WhatsApp-Style Real-Time Comment Typing Indicator */}
      {typingUsers.length > 0 && (
        <div
          aria-live="polite"
          className="flex items-center gap-2 rounded-lg border border-emerald-200/80 bg-emerald-50/90 px-3 py-1.5 text-xs font-medium text-emerald-900"
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
              : typingUsers.length === 2
                ? tr(
                    `${typingUsers[0].displayName} na ${typingUsers[1].displayName} wanaandika...`,
                    `${typingUsers[0].displayName} and ${typingUsers[1].displayName} are typing...`
                  )
                : tr(
                    `${typingUsers[0].displayName} na wengine ${typingUsers.length - 1} wanaandika...`,
                    `${typingUsers[0].displayName} and ${typingUsers.length - 1} others are typing...`
                  )}
          </span>
        </div>
      )}

      {/* Bottom Comment Input (Latest message stays directly above typing bar) */}
      {topic.status !== 'open' ? (
        <p className="rounded-lg bg-slate-100 px-3.5 py-2.5 text-xs text-slate-600">
          {tr(
            'Mjadala huu umefungwa na haupokei maoni mapya.',
            'This discussion is locked and not accepting new comments.'
          )}
        </p>
      ) : isSuspended ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
          {tr(
            'Akaunti yako imefungwa na msimamizi — huwezi kuandika maoni, kujibu, au kupenda.',
            'Your account is suspended by the platform owner — you cannot comment, reply, or like.'
          )}
        </p>
      ) : !userUid ? (
        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-[#F8FAFC] px-3.5 py-2.5">
          <span className="text-xs text-slate-700">
            {tr(
              'Tengeneza akaunti (kwa Google au Jisajili kawaida) ili uandike maoni, ujibu, au kupenda.',
              'Create an account (with Google or standard registration) to comment, reply, or like.'
            )}
          </span>
          <button
            type="button"
            onClick={() => onSignIn('comment')}
            className="min-h-[38px] rounded-lg bg-[#1D4E89] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#163A5F] whitespace-nowrap"
          >
            {tr('Jisajili / Ingia', 'Register / Sign In')}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmitMainComment} className="flex items-start gap-2.5">
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
            <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-[#F0F2F5] px-3.5 py-2 focus-within:border-[#1D4E89] focus-within:bg-white">
              <textarea
                ref={mainInputRef}
                rows={1}
                maxLength={4000}
                value={newComment}
                onChange={(e) => {
                  const nextVal = e.target.value;
                  setNewComment(nextVal);
                  if (mainError) setMainError('');
                  pulseTyping(nextVal.trim().length > 0, '');
                }}
                onBlur={() => clearTypingNow()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSubmitMainComment();
                  }
                }}
                placeholder={tr('Andika maoni yako...', 'Write a comment...')}
                aria-label={tr('Andika maoni yako', 'Write a comment')}
                className="max-h-28 min-h-[24px] w-full resize-none bg-transparent text-sm leading-snug text-slate-900 placeholder:text-slate-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={submittingMain || newComment.trim().length < 2}
                aria-label={tr('Tuma maoni', 'Send comment')}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1D4E89] text-white transition-colors hover:bg-[#163A5F] disabled:bg-slate-300 disabled:text-slate-500"
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

function replyMentionLooksLikeName(mention: string, replies: Reply[]): boolean {
  const name = mention.slice(1).toLowerCase();
  return replies.some((r) => r.authorName.toLowerCase().startsWith(name));
}

export { Heart };
