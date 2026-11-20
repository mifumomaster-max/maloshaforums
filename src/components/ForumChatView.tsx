import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  Ban,
  BookOpen,
  Check,
  CheckCheck,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Loader2,
  Lock,
  Paperclip,
  Reply as ReplyIcon,
  Search,
  Send,
  Share2,
  Smile,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import {
  ChatAttachmentUploadResult,
  downloadChatAttachmentFile,
  optimizeCloudinaryUrl,
  uploadChatFileToCloudinary,
} from '../services/cloudinaryService';
import {
  clearAllChatMessages,
  ensureDirectChatThread,
  generateChatMessageId,
  sendChatMessage,
  sendDirectMessage,
  softDeleteChatMessage,
} from '../services/forumService';
import {
  AuthPromptReason,
  ChatMessage,
  DirectChatThread,
  MchartNote,
  MchartStatus,
  MemberDirectoryCandidate,
} from '../types';
import { useLanguage } from '../context/LanguageContext';
import { useUserPresence } from '../context/UserPresenceContext';
import { Avatar, OnlineStatusPill } from './Avatar';
import { ImageResizeModal } from './ImageResizeModal';
import { MchartDirectInbox, MchartDirectRoom } from './MchartDirectChatView';
import { MchartNotesView } from './MchartNotesView';
import { MobilePdfNoteReader } from './MobilePdfNoteReader';
import { LinkedText } from './RichText';
import { AuthorVerificationBadge } from './VerificationBadge';
import { User } from 'firebase/auth';

export type MchartSubTab = 'messages' | 'direct' | 'status' | 'notes';

type OptimisticChatMessage = ChatMessage & { __localMs: number };

interface ForumChatViewProps {
  messages: ChatMessage[];
  loading: boolean;
  directChats: DirectChatThread[];
  unreadDirectCount?: number;
  statuses: MchartStatus[];
  loadingStatuses: boolean;
  memberCandidates: MemberDirectoryCandidate[];
  notes: MchartNote[];
  loadingNotes: boolean;
  unreadNotesCount?: number;
  readNoteIds?: Set<string>;
  onMarkNoteRead?: (noteId: string) => void;
  onClearedAllChats?: () => void;
  subTab: MchartSubTab;
  onChangeSubTab: (tab: MchartSubTab) => void;
  activeDirectChatId: string | null;
  onChangeActiveDirectChatId: (chatId: string | null) => void;
  user: User | null;
  userDisplayName: string;
  userPhoto?: string;
  isAdmin: boolean;
  isSuspended?: boolean;
  keyboardOpen?: boolean;
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

const QUICK_EMOJIS = [
  '😀',
  '😂',
  '❤️',
  '👍',
  '🙏',
  '🔥',
  '👏',
  '🎉',
  '🤝',
  '💡',
  '📌',
  '✅',
  '📷',
  '📄',
  '🇹🇿',
  '🚀',
];

const SENDER_NAME_COLORS = [
  'text-[#0284C7]',
  'text-[#7C3AED]',
  'text-[#B45309]',
  'text-[#059669]',
  'text-[#BE123C]',
  'text-[#0F766E]',
  'text-[#4338CA]',
  'text-[#C2410C]',
];

function getSenderColorClass(senderId: string): string {
  let hash = 0;
  for (let i = 0; i < senderId.length; i++) {
    hash = (hash * 31 + senderId.charCodeAt(i)) >>> 0;
  }
  return SENDER_NAME_COLORS[hash % SENDER_NAME_COLORS.length];
}

function formatClockTime(ts: ChatMessage['createdAt']): string {
  if (!ts) return '';
  const date = ts.toDate();
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDateKey(ts: ChatMessage['createdAt']): string {
  const date = ts ? ts.toDate() : new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function getDocBadgeInfo(fileName: string, mime: string): {
  ext: string;
  bgClass: string;
} {
  const ext = (fileName.split('.').pop() || '').toUpperCase().slice(0, 4);
  if (ext === 'PDF' || mime.includes('pdf')) {
    return { ext: 'PDF', bgClass: 'bg-red-600 text-white' };
  }
  if (ext === 'XLS' || ext === 'XLSX' || ext === 'CSV' || mime.includes('sheet') || mime.includes('excel')) {
    return { ext: ext || 'XLS', bgClass: 'bg-emerald-600 text-white' };
  }
  if (ext === 'PPT' || ext === 'PPTX' || mime.includes('presentation')) {
    return { ext: ext || 'PPT', bgClass: 'bg-amber-600 text-white' };
  }
  if (ext === 'ZIP' || mime.includes('zip')) {
    return { ext: 'ZIP', bgClass: 'bg-purple-600 text-white' };
  }
  return { ext: ext || 'DOC', bgClass: 'bg-[#1D4E89] text-white' };
}

export const ForumChatView: React.FC<ForumChatViewProps> = ({
  messages,
  loading,
  directChats,
  unreadDirectCount = 0,
  statuses,
  loadingStatuses,
  memberCandidates,
  notes,
  loadingNotes,
  unreadNotesCount = 0,
  readNoteIds,
  onMarkNoteRead,
  onClearedAllChats,
  subTab,
  onChangeSubTab,
  activeDirectChatId,
  onChangeActiveDirectChatId,
  user,
  userDisplayName,
  userPhoto = '',
  isAdmin,
  isSuspended = false,
  keyboardOpen: keyboardOpenProp,
  onSignIn,
  onToast,
  onRequestConfirm,
}) => {
  const { lang, tr } = useLanguage();
  const { onlineUsers, onlineCount, typingUsersInMchart, setMchartTyping } = useUserPresence();
  const [optimisticThreads, setOptimisticThreads] = useState<Record<string, DirectChatThread>>({});
  const effectiveSubTab: 'direct' | 'messages' | 'notes' =
    subTab === 'messages' || subTab === 'notes' ? subTab : 'direct';

  const mergedMemberCandidates = useMemo(() => {
    const map = new Map<string, MemberDirectoryCandidate>();
    memberCandidates.forEach((m) => {
      if (m.uid) map.set(m.uid, m);
    });
    onlineUsers.forEach((ou) => {
      if (!ou.uid || ou.uid === user?.uid) return;
      const existing = map.get(ou.uid);
      if (existing) {
        map.set(ou.uid, {
          ...existing,
          displayName: existing.displayName || ou.displayName,
          photoURL: existing.photoURL || ou.photoURL || '',
          isOnline: true,
        });
      } else {
        map.set(ou.uid, {
          uid: ou.uid,
          displayName: ou.displayName || 'Mwanachama',
          photoURL: ou.photoURL || '',
          isOnline: true,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => {
      if (Boolean(a.isOnline) !== Boolean(b.isOnline)) {
        return a.isOnline ? -1 : 1;
      }
      return a.displayName.localeCompare(b.displayName);
    });
  }, [memberCandidates, onlineUsers, user?.uid]);

  const activeDirectThread = useMemo(() => {
    if (!activeDirectChatId) return null;
    return (
      directChats.find((t) => t.chatId === activeDirectChatId) ||
      optimisticThreads[activeDirectChatId] ||
      null
    );
  }, [activeDirectChatId, directChats, optimisticThreads]);

  const handleStartPrivateChatWith = useCallback(
    async (
      target: { uid: string; displayName: string; photoURL?: string },
      initialMessage?: string
    ) => {
      if (!user) {
        onSignIn('chat');
        return;
      }
      if (isSuspended) {
        onToast(
          tr('Akaunti yako imesimamishwa kuanzisha mazungumzo.', 'Your account is suspended.'),
          'error'
        );
        return;
      }
      if (target.uid === user.uid) {
        onToast(tr('Hiki ni kitambulisho chako mwenyewe.', 'That is your own account.'), 'error');
        return;
      }
      try {
        const thread = await ensureDirectChatThread(user, userDisplayName, userPhoto, target);
        setOptimisticThreads((prev) => ({ ...prev, [thread.chatId]: thread }));
        if (initialMessage && initialMessage.trim()) {
          await sendDirectMessage(user, userDisplayName, userPhoto, thread, {
            text: initialMessage.trim(),
          });
        }
        onChangeSubTab('direct');
        onChangeActiveDirectChatId(thread.chatId);
      } catch (err) {
        onToast(
          err instanceof Error
            ? err.message
            : tr('Imeshindwa kufungua mazungumzo binafsi.', 'Failed to open private chat.'),
          'error'
        );
      }
    },
    [user, isSuspended, userDisplayName, userPhoto, onSignIn, onToast, tr, onChangeSubTab, onChangeActiveDirectChatId]
  );
  const [draft, setDraft] = useState('');
  const [uploading, setUploading] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState<OptimisticChatMessage[]>([]);
  const [pendingAttachment, setPendingAttachment] =
    useState<ChatAttachmentUploadResult | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [lightboxImage, setLightboxImage] = useState<{ url: string; name: string } | null>(
    null
  );
  const [activePdfDoc, setActivePdfDoc] = useState<{ url: string; name: string } | null>(null);
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);
  const [pendingCropImage, setPendingCropImage] = useState<File | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [unseenWhileScrolled, setUnseenWhileScrolled] = useState(0);
  const [viewportMetrics, setViewportMetrics] = useState<{
    height: number;
    offsetTop: number;
    isMobile: boolean;
    keyboardOpen: boolean;
  }>(() => {
    if (typeof window === 'undefined') {
      return { height: 800, offsetTop: 0, isMobile: true, keyboardOpen: false };
    }
    const vv = window.visualViewport;
    const h = vv ? vv.height : window.innerHeight;
    return {
      height: h,
      offsetTop: vv ? vv.offsetTop : 0,
      isMobile: window.innerWidth < 768,
      keyboardOpen: Boolean(vv && vv.height < window.innerHeight - 130 && window.innerWidth < 768),
    };
  });

  const scrollBoxRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const prevNewestIdRef = useRef<string | null>(null);
  const initialScrolledRef = useRef(false);
  const wasNearBottomRef = useRef(true);
  const focusTimersRef = useRef<number[]>([]);
  const typingIdleTimerRef = useRef<number | null>(null);

  // Clean up typing signal on unmount or when not viewing Group chat
  useEffect(() => {
    if (effectiveSubTab !== 'messages' || !user) {
      if (typingIdleTimerRef.current !== null) {
        window.clearTimeout(typingIdleTimerRef.current);
        typingIdleTimerRef.current = null;
      }
      setMchartTyping(false);
    }
  }, [effectiveSubTab, user, setMchartTyping]);

  useEffect(() => {
    return () => {
      if (typingIdleTimerRef.current !== null) {
        window.clearTimeout(typingIdleTimerRef.current);
      }
      setMchartTyping(false);
    };
  }, [setMchartTyping]);

  const typingStatusLabel = useMemo(() => {
    if (typingUsersInMchart.length === 0) return '';
    if (typingUsersInMchart.length === 1) {
      const ty = typingUsersInMchart[0];
      if (ty.replyingToName && ty.replyingToName !== ty.displayName) {
        return tr(
          `${ty.displayName} anamjibu ${ty.replyingToName} · anaandika...`,
          `${ty.displayName} is replying to ${ty.replyingToName} · typing...`
        );
      }
      return tr(`${ty.displayName} anaandika...`, `${ty.displayName} is typing...`);
    }
    if (typingUsersInMchart.length === 2) {
      return tr(
        `${typingUsersInMchart[0].displayName} na ${typingUsersInMchart[1].displayName} wanaandika...`,
        `${typingUsersInMchart[0].displayName} and ${typingUsersInMchart[1].displayName} are typing...`
      );
    }
    return tr(
      `${typingUsersInMchart[0].displayName} na wengine ${typingUsersInMchart.length - 1} wanaandika...`,
      `${typingUsersInMchart[0].displayName} and ${typingUsersInMchart.length - 1} others are typing...`
    );
  }, [typingUsersInMchart, tr]);

  // Drop optimistic messages as soon as Firestore echoes the real doc with same ID
  useEffect(() => {
    if (optimisticMessages.length === 0) return;
    const serverIds = new Set(messages.map((m) => m.id));
    if (optimisticMessages.some((om) => serverIds.has(om.id))) {
      setOptimisticMessages((prev) => prev.filter((om) => !serverIds.has(om.id)));
    }
  }, [messages, optimisticMessages]);

  const pendingIdSet = useMemo(
    () => new Set(optimisticMessages.map((om) => om.id)),
    [optimisticMessages]
  );

  // Merge confirmed today's messages + instant optimistic sends, oldest -> newest
  const chronologicalMessages = useMemo(() => {
    const serverIds = new Set(messages.map((m) => m.id));
    const pending = optimisticMessages.filter((om) => !serverIds.has(om.id));
    const merged: (ChatMessage & { __localMs?: number })[] = [...messages, ...pending];

    const sorted = merged.sort((a, b) => {
      const am = a.createdAt ? a.createdAt.toMillis() : (a.__localMs ?? Date.now());
      const bm = b.createdAt ? b.createdAt.toMillis() : (b.__localMs ?? Date.now());
      return am - bm;
    });
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (m) =>
        m.text.toLowerCase().includes(q) ||
        m.senderName.toLowerCase().includes(q) ||
        m.attachmentName.toLowerCase().includes(q)
    );
  }, [messages, optimisticMessages, searchQuery]);

  const activeParticipantCount = useMemo(() => {
    const ids = new Set<string>();
    chronologicalMessages.forEach((m) => {
      if (m.senderId) ids.add(m.senderId);
    });
    return ids.size;
  }, [chronologicalMessages]);

  // Close popovers on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (attachMenuRef.current && !attachMenuRef.current.contains(target)) {
        setAttachMenuOpen(false);
      }
      if (emojiRef.current && !emojiRef.current.contains(target)) {
        setEmojiOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Track visualViewport cleanly so mobile keyboard never pushes header or hides latest message
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncViewport = () => {
      const vv = window.visualViewport;
      const h = vv ? vv.height : window.innerHeight;
      const offsetTop = vv ? vv.offsetTop : 0;
      const isMobile = window.innerWidth < 768;
      const kbOpen = Boolean(vv && vv.height < window.innerHeight - 130 && isMobile);
      setViewportMetrics({ height: h, offsetTop, isMobile, keyboardOpen: kbOpen });
      if (document.documentElement.scrollTop !== 0 || window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    };

    syncViewport();
    window.addEventListener('resize', syncViewport);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', syncViewport);
    vv?.addEventListener('scroll', syncViewport);

    return () => {
      window.removeEventListener('resize', syncViewport);
      vv?.removeEventListener('resize', syncViewport);
      vv?.removeEventListener('scroll', syncViewport);
      focusTimersRef.current.forEach((id) => window.clearTimeout(id));
      focusTimersRef.current = [];
    };
  }, []);

  const scrollToBottom = (smooth = true) => {
    const el = scrollBoxRef.current;
    if (!el) return;
    wasNearBottomRef.current = true;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
    setUnseenWhileScrolled(0);
    setShowScrollBottom(false);
  };

  // Scroll to bottom on initial load & when a new message arrives near bottom (or sent by self)
  useEffect(() => {
    if (loading || chronologicalMessages.length === 0) return;
    const newest = chronologicalMessages[chronologicalMessages.length - 1];
    const el = scrollBoxRef.current;
    if (!el) return;

    if (!initialScrolledRef.current) {
      initialScrolledRef.current = true;
      prevNewestIdRef.current = newest.id;
      wasNearBottomRef.current = true;
      window.requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
      return;
    }

    if (prevNewestIdRef.current !== newest.id) {
      prevNewestIdRef.current = newest.id;
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      const isNearBottom = distanceFromBottom < 180;
      if (isNearBottom || newest.senderId === user?.uid || document.activeElement === inputRef.current) {
        wasNearBottomRef.current = true;
        window.requestAnimationFrame(() => {
          el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        });
        setUnseenWhileScrolled(0);
      } else {
        setUnseenWhileScrolled((n) => n + 1);
      }
    }
  }, [loading, chronologicalMessages, user?.uid]);

  // Keep latest message pinned right above composer whenever timeline resizes (keyboard / multiline draft)
  useEffect(() => {
    if (effectiveSubTab !== 'messages') return;
    const el = scrollBoxRef.current;
    if (!el) return;

    wasNearBottomRef.current = true;
    window.requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });

    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (wasNearBottomRef.current || document.activeElement === inputRef.current) {
        el.scrollTop = el.scrollHeight;
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [effectiveSubTab]);

  // Keep latest sent message visible while composing draft or opening reply/attachment bars
  useEffect(() => {
    if (effectiveSubTab !== 'messages') return;
    const el = scrollBoxRef.current;
    if (!el) return;
    if (document.activeElement === inputRef.current || wasNearBottomRef.current) {
      window.requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [draft, replyTo, pendingAttachment, effectiveSubTab]);

  const handleComposerFocus = () => {
    wasNearBottomRef.current = true;
    scrollToBottom(false);
    focusTimersRef.current.forEach((id) => window.clearTimeout(id));
    focusTimersRef.current = [80, 220, 400].map((delay) =>
      window.setTimeout(() => {
        const el = scrollBoxRef.current;
        if (el) {
          el.scrollTop = el.scrollHeight;
          setShowScrollBottom(false);
          setUnseenWhileScrolled(0);
        }
      }, delay)
    );
  };

  const handleTimelineScroll = () => {
    const el = scrollBoxRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const awayFromBottom = distanceFromBottom > 140;
    wasNearBottomRef.current = !awayFromBottom;
    setShowScrollBottom(awayFromBottom);
    if (!awayFromBottom) {
      setUnseenWhileScrolled(0);
    }
  };

  const formatDateDivider = (ts: ChatMessage['createdAt']): string => {
    const date = ts ? ts.toDate() : new Date();
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const sameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();

    if (sameDay(date, today)) return tr('Leo', 'Today');
    if (sameDay(date, yesterday)) return tr('Jana', 'Yesterday');

    try {
      return new Intl.DateTimeFormat(lang === 'sw' ? 'sw-TZ' : 'en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(date);
    } catch {
      return date.toLocaleDateString();
    }
  };

  const uploadResolvedChatFile = async (file: File) => {
    setUploading(true);
    try {
      const uploaded = await uploadChatFileToCloudinary(file);
      setPendingAttachment(uploaded);
      inputRef.current?.focus();
    } catch (err) {
      onToast(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kupakia faili.', 'Failed to upload file.'),
        'error'
      );
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelected = async (file: File | undefined) => {
    setAttachMenuOpen(false);
    if (!file) return;
    if (!user) {
      onSignIn('chat');
      return;
    }
    if (isSuspended && !isAdmin) {
      onToast(
        tr(
          'Akaunti yako imefungwa. Huwezi kutuma picha au nyaraka.',
          'Your account is suspended.'
        ),
        'error'
      );
      return;
    }

    if (file.type.startsWith('image/')) {
      setPendingCropImage(file);
      return;
    }

    await uploadResolvedChatFile(file);
  };

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!user) {
      onSignIn('chat');
      return;
    }
    if (isSuspended && !isAdmin) {
      onToast(
        tr(
          'Akaunti yako imefungwa na mmiliki wa jukwaa.',
          'Your account has been closed by the platform owner.'
        ),
        'error'
      );
      return;
    }
    if (uploading) return;

    const cleanText = draft.trim();
    if (!cleanText && !pendingAttachment) return;

    // Capture payload & clear composer immediately so UI never stalls/loads
    const attachmentSnapshot = pendingAttachment;
    const replySnapshot = replyTo;
    const replyPreview = replySnapshot
      ? replySnapshot.text.trim() ||
        (replySnapshot.attachmentType === 'image'
          ? tr('📷 Picha', '📷 Photo')
          : `📄 ${replySnapshot.attachmentName || tr('Nyaraka', 'Document')}`)
      : '';

    const clientId = generateChatMessageId();
    const nowMs = Date.now();

    const optimisticMsg: OptimisticChatMessage = {
      id: clientId,
      senderId: user.uid,
      senderName: userDisplayName || user.displayName || 'Mwanachama',
      senderPhoto: userPhoto || user.photoURL || '',
      text: cleanText,
      attachmentType: attachmentSnapshot?.attachmentType || 'none',
      attachmentUrl: attachmentSnapshot?.url || '',
      attachmentName: attachmentSnapshot?.fileName || '',
      attachmentSize: attachmentSnapshot?.fileSize || 0,
      attachmentMime: attachmentSnapshot?.mimeType || '',
      replyToId: replySnapshot?.id || '',
      replyToSenderName: replySnapshot?.senderName || '',
      replyToPreview: replyPreview.slice(0, 160),
      isDeleted: false,
      createdAt: Timestamp.fromMillis(nowMs),
      updatedAt: Timestamp.fromMillis(nowMs),
      __localMs: nowMs,
    };

    setOptimisticMessages((prev) => [...prev, optimisticMsg]);
    setDraft('');
    setPendingAttachment(null);
    setReplyTo(null);
    setEmojiOpen(false);
    if (typingIdleTimerRef.current !== null) {
      window.clearTimeout(typingIdleTimerRef.current);
      typingIdleTimerRef.current = null;
    }
    setMchartTyping(false, '', 'group');
    window.requestAnimationFrame(() => scrollToBottom(true));
    inputRef.current?.focus();

    void sendChatMessage(user, userDisplayName, {
      customId: clientId,
      text: cleanText,
      attachmentType: attachmentSnapshot?.attachmentType || 'none',
      attachmentUrl: attachmentSnapshot?.url || '',
      attachmentName: attachmentSnapshot?.fileName || '',
      attachmentSize: attachmentSnapshot?.fileSize || 0,
      attachmentMime: attachmentSnapshot?.mimeType || '',
      replyToId: replySnapshot?.id || '',
      replyToSenderName: replySnapshot?.senderName || '',
      replyToPreview: replyPreview.slice(0, 160),
    }).catch((err) => {
      setOptimisticMessages((prev) => prev.filter((m) => m.id !== clientId));
      if (cleanText && !draft.trim()) setDraft(cleanText);
      onToast(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kutuma ujumbe.', 'Failed to send message.'),
        'error'
      );
    });
  };

  const handleConfirmClearAllChats = () => {
    if (!isAdmin) return;
    onRequestConfirm({
      title: tr('Safisha Uwanja (Futa Mazungumzo Yote)?', 'Clear All Mchart Messages?'),
      message: tr(
        'Hatua hii itafuta ujumbe wote uliopo kwenye Mchart (ya leo na ya zamani) ili kuanza upya kwenye uwanja safi. Haiwezi kubatilishwa.',
        'This will permanently delete all messages in Mchart to clear the room completely.'
      ),
      confirmLabel: tr('Ndiyo, Safisha Uwanja', 'Yes, Clear All'),
      destructive: true,
      action: async () => {
        const deletedCount = await clearAllChatMessages();
        setOptimisticMessages([]);
        onClearedAllChats?.();
        onToast(
          tr(
            `Uwanja umesafishwa! Ujumbe ${deletedCount} umefutwa.`,
            `Room cleared! ${deletedCount} messages removed.`
          )
        );
      },
    });
  };

  const handleConfirmDelete = (msg: ChatMessage) => {
    onRequestConfirm({
      title: tr('Futa Ujumbe Huu?', 'Delete This Message?'),
      message: tr(
        'Ujumbe huu utafutwa kwa wanachama wote kwenye kundi.',
        'This message will be removed for everyone in the community chat.'
      ),
      confirmLabel: tr('Futa Kwa Wote', 'Delete for Everyone'),
      destructive: true,
      action: async () => {
        await softDeleteChatMessage(msg.id);
        onToast(tr('Ujumbe umefutwa.', 'Message deleted.'));
      },
    });
  };

  const jumpToMessage = (targetId: string) => {
    const el = document.getElementById(`chat-msg-${targetId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedId(targetId);
    window.setTimeout(() => {
      setHighlightedId((curr) => (curr === targetId ? null : curr));
    }, 1800);
  };

  const handleShareMchartLink = async () => {
    const shareUrl =
      effectiveSubTab === 'notes'
        ? `${window.location.origin}/?tab=mchart&view=notes`
        : `${window.location.origin}/?tab=mchart`;
    const shareTitle =
      effectiveSubTab === 'notes'
        ? tr('Malosha Forums · Mchart Notes', 'Malosha Forums · Mchart Notes')
        : tr('Malosha Forums · Mchart', 'Malosha Forums · Mchart');
    const shareText =
      effectiveSubTab === 'notes'
        ? tr(
            'Soma notes na mafaili muhimu ya Malosha Forums moja kwa moja kwenye simu yako!',
            'Read official study notes and archive files on Malosha Forums!'
          )
        : tr(
            'Karibu tuwasiliane moja kwa moja kwenye Mchart ya Malosha Forums!',
            'Join us directly on Malosha Forums Mchart!'
          );

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      onToast(
        tr(
          'Kiungo cha Mchart kimenakiliwa! Tuma kwa marafiki wajiunge moja kwa moja.',
          'Mchart link copied! Share it so friends join Mchart directly.'
        )
      );
    } catch {
      onToast(shareUrl);
    }
  };

  const isKeyboardUp = keyboardOpenProp ?? viewportMetrics.keyboardOpen;

  const shellStyle: React.CSSProperties = viewportMetrics.isMobile
    ? {
        top: `calc(var(--malosha-header-h, 114px) + ${Math.max(0, viewportMetrics.offsetTop)}px)`,
        height: isKeyboardUp
          ? `calc(${Math.round(viewportMetrics.height)}px - var(--malosha-header-h, 114px))`
          : `calc(${Math.round(viewportMetrics.height)}px - var(--malosha-header-h, 114px) - 56px - env(safe-area-inset-bottom, 0px))`,
      }
    : {
        top: 'var(--malosha-header-h, 124px)',
        height: 'calc(100dvh - var(--malosha-header-h, 124px))',
      };

  return (
    <div
      style={shellStyle}
      className="fixed inset-x-0 z-30 mx-auto flex max-w-4xl flex-col overflow-hidden bg-[#EFEAE2] md:bg-transparent md:px-6 md:py-4"
    >
      <section
        aria-label={tr('Mchart ya Jamii ya Malosha', 'Malosha Community Mchart')}
        className="flex h-full min-h-0 flex-col overflow-hidden border-slate-200 bg-[#EFEAE2] shadow-sm md:rounded-2xl md:border"
      >
        {/* Stationary WhatsApp-Style Group Header */}
        <header className="shrink-0 transform-gpu touch-none bg-[#075E54] text-white will-change-transform">
          <div className="flex items-center justify-between gap-2 px-3 py-2 sm:px-5 sm:py-2.5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/25">
                <Users className="h-5 w-5 text-[#25D366]" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate font-display text-sm font-bold text-white sm:text-base">
                  Malosha Forums · Mchart
                </h1>
                <p className="truncate text-[11px] sm:text-xs">
                  {!user ? (
                    <span className="text-emerald-100/90">
                      {tr(
                        'Huduma ya Wanachama Waliosajiliwa Pekee',
                        'Registered Members Only'
                      )}
                    </span>
                  ) : effectiveSubTab === 'notes' ? (
                    <span className="text-emerald-100/90">
                      {tr(
                        `Notes ${notes.length} · Mafaili ya kusoma kwenye simu`,
                        `${notes.length} notes · Mobile reader & archive files`
                      )}
                    </span>
                  ) : effectiveSubTab === 'direct' ? (
                    <span className="text-emerald-100/90">
                      {tr(
                        'Mazungumzo Binafsi · Picha za 1x & Status',
                        'Private Chat · View-Once Photos & Status'
                      )}
                    </span>
                  ) : typingStatusLabel ? (
                    <span className="inline-flex items-center gap-1.5 font-bold text-[#25D366]">
                      <span className="inline-flex gap-0.5" aria-hidden="true">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#25D366] [animation-delay:-0.3s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#25D366] [animation-delay:-0.15s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#25D366]" />
                      </span>
                      <span className="truncate">{typingStatusLabel}</span>
                    </span>
                  ) : onlineCount > 0 || activeParticipantCount > 0 ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-100/95">
                      {onlineCount > 0 && (
                        <>
                          <span className="inline-block h-2 w-2 rounded-full bg-[#25D366]" aria-hidden="true" />
                          <span className="font-semibold text-emerald-100">
                            {onlineCount === 1
                              ? tr('Mtu 1 yupo online', '1 online')
                              : tr(`Watu ${onlineCount} wapo online`, `${onlineCount} online`)}
                          </span>
                          {activeParticipantCount > 0 && <span aria-hidden="true">·</span>}
                        </>
                      )}
                      {activeParticipantCount > 0 && (
                        <span>
                          {tr(
                            `Washiriki ${activeParticipantCount}`,
                            `${activeParticipantCount} active`
                          )}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-emerald-100/90">
                      {tr(
                        'Mchart ya Pamoja · Picha, Nyaraka & Mijadala ya Moja kwa Moja',
                        'Shared Mchart · Photos, Documents & Real-time Chat'
                      )}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {user && (
              <div className="flex shrink-0 items-center gap-1.5">
                {isAdmin && effectiveSubTab === 'messages' && (
                  <button
                    type="button"
                    onClick={handleConfirmClearAllChats}
                    title={tr('Safisha Uwanja (Futa zote)', 'Clear All Chats')}
                    aria-label={tr('Safisha uwanja kwa kufuta mazungumzo yote', 'Clear all chats')}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full bg-red-500/25 px-3 text-xs font-bold text-red-100 ring-1 ring-red-300/35 transition-colors hover:bg-red-500/40 hover:text-white"
                  >
                    <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="hidden sm:inline">{tr('Safisha Uwanja', 'Clear All')}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => void handleShareMchartLink()}
                  title={tr('Shiriki kiungo cha Mchart', 'Share direct Mchart link')}
                  aria-label={tr('Shiriki kiungo cha Mchart', 'Share direct Mchart link')}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white/15 px-3 text-xs font-bold text-white transition-colors hover:bg-white/25"
                >
                  <Share2 className="h-4 w-4 text-[#25D366]" aria-hidden="true" />
                  <span className="hidden sm:inline">{tr('Shiriki Link', 'Share Link')}</span>
                </button>

                {effectiveSubTab === 'messages' && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchOpen((prev) => !prev);
                      if (searchOpen) setSearchQuery('');
                    }}
                    aria-label={tr('Tafuta kwenye Mchart', 'Search Mchart')}
                    aria-expanded={searchOpen}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
                      searchOpen ? 'bg-white/20 text-white' : 'text-emerald-100 hover:bg-white/10'
                    }`}
                  >
                    {searchOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 3-Tab Sub-Navigation (Binafsi | Kundi | Notes) — Status lives inside Binafsi */}
          {user && (
            <nav
              aria-label={tr('Vipengele vya Mchart', 'Mchart sections')}
              className="grid grid-cols-3 border-t border-white/10 bg-[#064E46]/70"
            >
              <button
                type="button"
                onClick={() => {
                  onChangeSubTab('direct');
                  setSearchOpen(false);
                }}
                aria-current={effectiveSubTab === 'direct' ? 'page' : undefined}
                className={`relative flex min-h-[44px] items-center justify-center gap-1.5 border-b-[3px] px-2 py-2 text-xs font-bold transition-colors sm:px-3 sm:text-sm ${
                  effectiveSubTab === 'direct'
                    ? 'border-[#25D366] text-white'
                    : 'border-transparent text-emerald-100/75 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Lock className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
                <span className="truncate">{tr('Binafsi', 'Private')}</span>
                {unreadDirectCount > 0 && (
                  <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#25D366] px-1 text-[10px] font-extrabold text-[#064E46] tabular-nums">
                    {unreadDirectCount > 99 ? '99+' : unreadDirectCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => onChangeSubTab('messages')}
                aria-current={effectiveSubTab === 'messages' ? 'page' : undefined}
                className={`relative flex min-h-[44px] items-center justify-center gap-1.5 border-b-[3px] px-2 py-2 text-xs font-bold transition-colors sm:px-3 sm:text-sm ${
                  effectiveSubTab === 'messages'
                    ? 'border-[#25D366] text-white'
                    : 'border-transparent text-emerald-100/75 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Users className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
                <span className="truncate">{tr('Kundi', 'Group')}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onChangeSubTab('notes');
                  setSearchOpen(false);
                }}
                aria-current={effectiveSubTab === 'notes' ? 'page' : undefined}
                className={`relative flex min-h-[44px] items-center justify-center gap-1.5 border-b-[3px] px-2 py-2 text-xs font-bold transition-colors sm:px-3 sm:text-sm ${
                  effectiveSubTab === 'notes'
                    ? 'border-[#25D366] text-white'
                    : 'border-transparent text-emerald-100/75 hover:bg-white/5 hover:text-white'
                }`}
              >
                <BookOpen className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
                <span className="truncate">{tr('Notes', 'Notes')}</span>
                {unreadNotesCount > 0 ? (
                  <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#25D366] px-1 text-[10px] font-extrabold text-[#064E46] tabular-nums">
                    {unreadNotesCount > 99 ? '99+' : unreadNotesCount}
                  </span>
                ) : notes.length > 0 ? (
                  <span className="rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-100 tabular-nums">
                    {notes.length}
                  </span>
                ) : null}
              </button>
            </nav>
          )}

          {user && effectiveSubTab === 'messages' && searchOpen && (
            <div className="border-t border-white/10 bg-[#064E46] px-3.5 py-2 sm:px-5">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-emerald-200"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={tr(
                    'Tafuta ujumbe, jina au faili...',
                    'Search message, name or file...'
                  )}
                  className="min-h-[38px] w-full rounded-xl bg-white/15 py-1.5 pr-3 pl-9 text-xs text-white placeholder-emerald-100/70 outline-none focus:bg-white/20 sm:text-sm"
                />
              </div>
            </div>
          )}
        </header>

        {!user ? (
          <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto bg-[#EFEAE2] px-6 py-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#075E54]/12 text-[#075E54] ring-1 ring-[#075E54]/20">
              <Lock className="h-8 w-8" aria-hidden="true" />
            </div>
            <h2 className="mt-4 font-display text-lg font-bold text-slate-900 sm:text-xl">
              {tr('Mchart ni kwa Wanachama Wenye Akaunti Pekee', 'Mchart Is for Signed-In Members Only')}
            </h2>
            <p className="mt-2 max-w-md text-xs leading-relaxed text-slate-600 sm:text-sm">
              {tr(
                'Kwa usalama na faragha ya wanachama, huwezi kuona mazungumzo binafsi, kundi, status, wala notes bila kuingia au kufungua akaunti ya Malosha Forums.',
                'To protect community privacy, Private chats, Group chat, Status updates, and Notes cannot be viewed or accessed without a Malosha Forums account.'
              )}
            </p>
            <button
              type="button"
              onClick={() => onSignIn('chat')}
              className="mt-6 inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-[#075E54] px-6 py-2.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-[#064E46]"
            >
              <Lock className="h-4 w-4" aria-hidden="true" />
              <span>{tr('Ingia / Fungua Akaunti', 'Sign In / Create Account')}</span>
            </button>
          </div>
        ) : effectiveSubTab === 'notes' ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            <MchartNotesView
              notes={notes}
              loading={loadingNotes}
              user={user}
              userDisplayName={userDisplayName}
              isAdmin={isAdmin}
              readNoteIds={readNoteIds}
              onMarkNoteRead={onMarkNoteRead}
              onSignIn={() => onSignIn('chat')}
              onToast={onToast}
              onRequestConfirm={onRequestConfirm}
            />
          </div>
        ) : effectiveSubTab === 'direct' ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            {activeDirectThread ? (
              <MchartDirectRoom
                thread={activeDirectThread}
                user={user}
                userDisplayName={userDisplayName}
                userPhoto={userPhoto}
                isSuspended={isSuspended}
                onBackToInbox={() => onChangeActiveDirectChatId(null)}
                onToast={onToast}
                onRequestConfirm={onRequestConfirm}
              />
            ) : (
              <MchartDirectInbox
                user={user}
                userDisplayName={userDisplayName}
                userPhoto={userPhoto}
                isSuspended={isSuspended}
                threads={directChats}
                memberCandidates={mergedMemberCandidates}
                statuses={statuses}
                loadingStatuses={loadingStatuses}
                onSelectThread={(thread) => onChangeActiveDirectChatId(thread.chatId)}
                onStartPrivateChatWith={(target) => handleStartPrivateChatWith(target)}
                onSwitchToGroup={() => onChangeSubTab('messages')}
                onSignIn={onSignIn}
                onToast={onToast}
                onRequestConfirm={onRequestConfirm}
              />
            )}
          </div>
        ) : (
          <>
            {/* Scrollable WhatsApp Chat Canvas with subtle "malosha forums" watermark */}
            <div className="bg-mchart-watermark relative min-h-0 flex-1 overflow-hidden">
              <div
                ref={scrollBoxRef}
                onScroll={handleTimelineScroll}
                className="h-full touch-pan-y overflow-y-auto overscroll-contain px-2.5 py-2.5 sm:px-5 sm:py-4"
              >
            {/* Today-only Group Session Banner + Direct Invite Link */}
            <div className="mx-auto mb-3 max-w-md rounded-xl bg-[#FFF3C4]/95 px-3.5 py-2.5 text-center text-[11px] leading-relaxed text-slate-700 shadow-xs">
              <p>
                {tr(
                  'Uwanja wa Leo · Mchart inaonyesha mazungumzo ya leo pekee ili kuweka kasi na faragha (ujumbe wa siku za nyuma haufikiwi).',
                  'Today Only · Mchart shows today’s live messages for speed and privacy (past days are not shown).'
                )}
              </p>
              <button
                type="button"
                onClick={() => void handleShareMchartLink()}
                className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-[#075E54] px-2.5 py-1 text-[11px] font-bold text-white transition-colors hover:bg-[#064E46]"
              >
                <Share2 className="h-3 w-3 text-[#25D366]" aria-hidden="true" />
                <span>{tr('Shiriki Link ya Moja kwa Moja (Mchart)', 'Share Direct Mchart Link')}</span>
              </button>
            </div>

            {loading ? (
              <div className="space-y-3 py-6">
                <div className="h-14 w-3/4 rounded-2xl bg-white/70 animate-pulse" />
                <div className="ml-auto h-12 w-2/3 rounded-2xl bg-[#D9FDD3]/70 animate-pulse" />
                <div className="h-16 w-4/5 rounded-2xl bg-white/70 animate-pulse" />
              </div>
            ) : chronologicalMessages.length === 0 ? (
              <div className="mx-auto my-10 max-w-sm rounded-2xl bg-white/90 px-5 py-7 text-center shadow-xs">
                <Users className="mx-auto h-8 w-8 text-[#075E54]" aria-hidden="true" />
                <p className="mt-2.5 text-sm font-bold text-slate-900">
                  {searchQuery.trim()
                    ? tr('Hakuna ujumbe unaolingana na utafutaji.', 'No matching messages.')
                    : tr('Anzisha Mazungumzo ya Jamii!', 'Start the Community Chat!')}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {tr(
                    'Kuwa wa kwanza kusalimia wanachama wote au kutuma picha na nyaraka.',
                    'Be the first to greet members or share a photo or document.'
                  )}
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {chronologicalMessages.map((msg, idx) => {
                  const prev = idx > 0 ? chronologicalMessages[idx - 1] : null;
                  const showDateDivider =
                    !prev || formatDateKey(prev.createdAt) !== formatDateKey(msg.createdAt);
                  const isOwn = Boolean(user && msg.senderId === user.uid);
                  const isSameSenderAsPrev =
                    Boolean(prev) &&
                    !showDateDivider &&
                    prev?.senderId === msg.senderId &&
                    !prev?.isDeleted;
                  const canDelete = Boolean(user && !msg.isDeleted && (isOwn || isAdmin));
                  const docBadge =
                    msg.attachmentType === 'document'
                      ? getDocBadgeInfo(msg.attachmentName, msg.attachmentMime)
                      : null;

                  return (
                    <React.Fragment key={msg.id}>
                      {showDateDivider && (
                        <div className="my-3 flex justify-center">
                          <span className="rounded-lg bg-white/95 px-3 py-1 text-[11px] font-semibold text-slate-600 shadow-xs">
                            {formatDateDivider(msg.createdAt)}
                          </span>
                        </div>
                      )}

                      <div
                        id={`chat-msg-${msg.id}`}
                        className={`group flex items-end gap-2 ${
                          isOwn ? 'justify-end' : 'justify-start'
                        } ${isSameSenderAsPrev ? 'mt-0.5' : 'mt-2.5'}`}
                      >
                        {/* Sender Avatar for incoming messages */}
                        {!isOwn && (
                          <div className="w-8 shrink-0">
                            {!isSameSenderAsPrev ? (
                              <Avatar
                                name={msg.senderName}
                                photoURL={msg.senderPhoto}
                                uid={msg.senderId}
                                showOnlineIndicator
                                size="sm"
                              />
                            ) : null}
                          </div>
                        )}

                        <div
                          className={`relative max-w-[84%] rounded-2xl px-3 py-2 shadow-xs transition-all sm:max-w-[70%] ${
                            isOwn
                              ? `bg-[#D9FDD3] text-slate-900 ${
                                  isSameSenderAsPrev ? '' : 'rounded-tr-xs'
                                }`
                              : `bg-white text-slate-900 ${
                                  isSameSenderAsPrev ? '' : 'rounded-tl-xs'
                                }`
                          } ${
                            highlightedId === msg.id ? 'ring-2 ring-[#25D366] ring-offset-1' : ''
                          }`}
                        >
                          {/* Sender Name + Verification Badge + Online + Quick 1-on-1 DM */}
                          {!isOwn && !isSameSenderAsPrev && (
                            <div className="mb-1 flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  void handleStartPrivateChatWith({
                                    uid: msg.senderId,
                                    displayName: msg.senderName,
                                    photoURL: msg.senderPhoto,
                                  })
                                }
                                title={tr(
                                  `Chati binafsi na ${msg.senderName}`,
                                  `Message ${msg.senderName} privately`
                                )}
                                className={`truncate text-xs font-bold hover:underline ${getSenderColorClass(
                                  msg.senderId
                                )}`}
                              >
                                {msg.senderName}
                              </button>
                              <AuthorVerificationBadge uid={msg.senderId} size="xs" />
                              <OnlineStatusPill uid={msg.senderId} />
                            </div>
                          )}

                          {msg.isDeleted ? (
                            <div className="flex items-center gap-1.5 py-0.5 text-xs italic text-slate-500">
                              <Ban className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <span>{tr('Ujumbe huu umefutwa', 'This message was deleted')}</span>
                            </div>
                          ) : (
                            <>
                              {/* Quoted Reply Header */}
                              {msg.replyToId && (
                                <button
                                  type="button"
                                  onClick={() => jumpToMessage(msg.replyToId)}
                                  className={`mb-1.5 block w-full rounded-lg border-l-4 px-2.5 py-1.5 text-left transition-colors ${
                                    isOwn
                                      ? 'border-[#00A884] bg-[#CBEFC5] hover:bg-[#C2E9BC]'
                                      : 'border-[#075E54] bg-slate-100 hover:bg-slate-200/80'
                                  }`}
                                >
                                  <p className="truncate text-[11px] font-bold text-[#075E54]">
                                    {msg.replyToSenderName || tr('Mwanachama', 'Member')}
                                  </p>
                                  <p className="line-clamp-2 text-[11px] text-slate-700">
                                    {msg.replyToPreview || tr('Ujumbe', 'Message')}
                                  </p>
                                </button>
                              )}

                              {/* Image Attachment */}
                              {msg.attachmentType === 'image' && msg.attachmentUrl && (
                                <div className="mb-1.5 overflow-hidden rounded-xl border border-black/10 bg-slate-100">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setLightboxImage({
                                        url: msg.attachmentUrl,
                                        name: msg.attachmentName || 'Picha ya Gumzo',
                                      })
                                    }
                                    className="block w-full focus-visible:outline-2 focus-visible:outline-[#075E54]"
                                  >
                                    <img
                                      src={optimizeCloudinaryUrl(msg.attachmentUrl, 640)}
                                      alt={msg.attachmentName || tr('Picha iliyotumwa', 'Shared photo')}
                                      loading="lazy"
                                      decoding="async"
                                      referrerPolicy="no-referrer"
                                      className="block h-auto w-full"
                                    />
                                  </button>
                                </div>
                              )}

                              {/* Document Attachment Card */}
                              {msg.attachmentType === 'document' &&
                                msg.attachmentUrl &&
                                docBadge && (() => {
                                  const isPdfDoc = docBadge.ext === 'PDF';
                                  const isBusy = downloadingDocId === msg.id;
                                  const handleDocDownload = async () => {
                                    if (downloadingDocId) return;
                                    setDownloadingDocId(msg.id);
                                    try {
                                      await downloadChatAttachmentFile(
                                        msg.attachmentUrl,
                                        msg.attachmentName || (isPdfDoc ? 'nyaraka.pdf' : 'faili'),
                                        msg.attachmentMime
                                      );
                                      onToast(
                                        tr(
                                          'Faili limepakuliwa kwenye simu yako!',
                                          'File saved to your device!'
                                        )
                                      );
                                    } catch (err) {
                                      onToast(
                                        err instanceof Error
                                          ? err.message
                                          : tr('Imeshindwa kupakua faili.', 'Failed to download file.'),
                                        'error'
                                      );
                                    } finally {
                                      setDownloadingDocId(null);
                                    }
                                  };
                                  return (
                                    <div
                                      className={`mb-1.5 overflow-hidden rounded-xl border transition-colors ${
                                        isOwn
                                          ? 'border-[#B6E2AE] bg-[#CBEFC5]/75'
                                          : 'border-slate-200 bg-slate-50'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2.5 p-2.5">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (isPdfDoc) {
                                              setActivePdfDoc({
                                                url: msg.attachmentUrl,
                                                name: msg.attachmentName || 'nyaraka.pdf',
                                              });
                                            } else {
                                              void handleDocDownload();
                                            }
                                          }}
                                          className="flex min-w-0 flex-1 items-center gap-2.5 text-left focus:outline-none"
                                        >
                                          <div
                                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[10px] font-extrabold ${docBadge.bgClass}`}
                                          >
                                            {docBadge.ext}
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <p className="truncate text-xs font-semibold text-slate-900">
                                              {msg.attachmentName || tr('Nyaraka', 'Document')}
                                            </p>
                                            <p className="text-[11px] text-slate-600">
                                              {formatFileSize(msg.attachmentSize)}
                                              {isPdfDoc
                                                ? ` · ${tr('Gusa kufungua', 'Tap to open')}`
                                                : ` · ${tr('Gusa kupakua', 'Tap to download')}`}
                                            </p>
                                          </div>
                                        </button>
                                        <div className="flex shrink-0 items-center gap-1.5">
                                          {isPdfDoc && (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setActivePdfDoc({
                                                  url: msg.attachmentUrl,
                                                  name: msg.attachmentName || 'nyaraka.pdf',
                                                })
                                              }
                                              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-[#075E54] px-2.5 text-[11px] font-bold text-white hover:bg-[#064E46]"
                                            >
                                              <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                                              <span>{tr('Fungua', 'Open')}</span>
                                            </button>
                                          )}
                                          <button
                                            type="button"
                                            disabled={isBusy}
                                            onClick={() => void handleDocDownload()}
                                            aria-label={tr('Pakua faili kwenye simu', 'Download file')}
                                            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-[#075E54]/30 bg-white px-2.5 text-[11px] font-bold text-[#075E54] hover:bg-emerald-50 disabled:opacity-60"
                                          >
                                            {isBusy ? (
                                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                            ) : (
                                              <Download className="h-3.5 w-3.5" aria-hidden="true" />
                                            )}
                                            <span>{tr('Pakua', 'Save')}</span>
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })()}

                              {/* Message Text */}
                              {msg.text && (
                                <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-slate-900">
                                  <LinkedText text={msg.text} />
                                </p>
                              )}
                            </>
                          )}

                          {/* Bottom Row: Reply/Delete Actions + Timestamp & Ticks */}
                          <div className="mt-1 flex items-center justify-between gap-3">
                            {!msg.isDeleted ? (
                              <div className="flex items-center gap-1 opacity-90 sm:opacity-70 sm:group-hover:opacity-100">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const payloadText =
                                      msg.text.trim() ||
                                      msg.attachmentName ||
                                      msg.attachmentUrl;
                                    if (!payloadText) return;
                                    const doCopy = async () => {
                                      try {
                                        if (navigator.clipboard?.writeText) {
                                          await navigator.clipboard.writeText(payloadText);
                                          return true;
                                        }
                                      } catch {
                                        // fallback
                                      }
                                      try {
                                        const ta = document.createElement('textarea');
                                        ta.value = payloadText;
                                        ta.setAttribute('readonly', '');
                                        ta.style.position = 'fixed';
                                        ta.style.opacity = '0';
                                        document.body.appendChild(ta);
                                        ta.select();
                                        const ok = document.execCommand('copy');
                                        document.body.removeChild(ta);
                                        return ok;
                                      } catch {
                                        return false;
                                      }
                                    };
                                    void doCopy().then((ok) => {
                                      if (ok) {
                                        onToast(tr('Ujumbe umenakiliwa!', 'Message copied!'));
                                      }
                                    });
                                  }}
                                  title={tr('Nakili ujumbe huu', 'Copy this message')}
                                  aria-label={tr('Nakili ujumbe', 'Copy')}
                                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-black/5 hover:text-[#075E54]"
                                >
                                  <Copy className="h-3 w-3" aria-hidden="true" />
                                  <span>{tr('Nakili', 'Copy')}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!user) {
                                      onSignIn('chat');
                                      return;
                                    }
                                    setReplyTo(msg);
                                    inputRef.current?.focus();
                                  }}
                                  title={tr('Jibu ujumbe huu', 'Reply to this message')}
                                  aria-label={tr('Jibu ujumbe', 'Reply')}
                                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-black/5 hover:text-[#075E54]"
                                >
                                  <ReplyIcon className="h-3 w-3" aria-hidden="true" />
                                  <span>{tr('Jibu', 'Reply')}</span>
                                </button>
                                {canDelete && (
                                  <button
                                    type="button"
                                    onClick={() => handleConfirmDelete(msg)}
                                    title={tr('Futa ujumbe', 'Delete message')}
                                    aria-label={tr('Futa ujumbe', 'Delete')}
                                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold text-red-600 transition-colors hover:bg-red-50"
                                  >
                                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span />
                            )}

                            <div className="ml-auto flex shrink-0 items-center gap-1 text-[10px] text-slate-500 tabular-nums">
                              <span>{formatClockTime(msg.createdAt)}</span>
                              {isOwn && !msg.isDeleted && (
                                pendingIdSet.has(msg.id) ? (
                                  <Check
                                    className="h-3.5 w-3.5 text-slate-400"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <CheckCheck
                                    className="h-3.5 w-3.5 text-[#0284C7]"
                                    aria-hidden="true"
                                  />
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            )}

            {/* WhatsApp-Style Live Typing Indicator Bubble */}
            {typingStatusLabel && (
              <div
                role="status"
                aria-live="polite"
                className="mt-2.5 flex items-end gap-2 justify-start"
              >
                <div className="w-8 shrink-0" />
                <div className="inline-flex max-w-[86%] items-center gap-2 rounded-2xl rounded-tl-xs border border-emerald-200 bg-white px-3.5 py-2 shadow-xs">
                  <span className="inline-flex items-center gap-1" aria-hidden="true">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[#00A884] [animation-delay:-0.3s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[#00A884] [animation-delay:-0.15s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[#00A884]" />
                  </span>
                  <span className="truncate text-xs font-semibold text-[#075E54]">
                    {typingStatusLabel}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Floating Jump-to-Bottom Button inside Chat Canvas */}
          {showScrollBottom && (
            <button
              type="button"
              onClick={() => scrollToBottom(true)}
              aria-label={tr('Shuka chini kwenye ujumbe mpya', 'Jump to latest messages')}
              className="absolute right-4 bottom-4 flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-slate-700 shadow-lg transition-transform hover:scale-105 hover:text-[#075E54]"
            >
              {unseenWhileScrolled > 0 && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#25D366] px-1.5 text-[11px] font-bold text-white tabular-nums">
                  {unseenWhileScrolled > 99 ? '99+' : unseenWhileScrolled}
                </span>
              )}
              <ArrowDown className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* WhatsApp Composer Footer */}
        <footer className="shrink-0 border-t border-slate-200/80 bg-[#F0F2F5] px-2.5 py-2 sm:px-4 sm:py-2.5">
          {/* Active Reply Preview */}
          {replyTo && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border-l-4 border-[#00A884] bg-white px-3 py-2 shadow-xs">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-[#075E54]">
                  {tr('Unajibu:', 'Replying to')} {replyTo.senderName}
                </p>
                <p className="truncate text-xs text-slate-600">
                  {replyTo.text.trim() ||
                    replyTo.attachmentName ||
                    tr('Picha / Faili', 'Photo / File')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                aria-label={tr('Ghairi kujibu', 'Cancel reply')}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Pending Upload or Preview */}
          {(uploading || pendingAttachment) && (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-xs">
              {uploading ? (
                <div className="flex items-center gap-2.5 text-xs font-semibold text-[#075E54]">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>{tr('Inapakia faili...', 'Uploading attachment...')}</span>
                </div>
              ) : pendingAttachment ? (
                <>
                  <div className="flex min-w-0 items-center gap-2.5">
                    {pendingAttachment.attachmentType === 'image' ? (
                      <img
                        src={optimizeCloudinaryUrl(pendingAttachment.url, 160)}
                        alt={pendingAttachment.fileName}
                        className="h-12 w-12 shrink-0 rounded-lg border border-slate-200 object-cover"
                      />
                    ) : (
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#075E54]/10 text-[#075E54]">
                        <FileText className="h-5 w-5" aria-hidden="true" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-900">
                        {pendingAttachment.fileName}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {formatFileSize(pendingAttachment.fileSize)} ·{' '}
                        {tr('Tayari kutuma', 'Ready to send')}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPendingAttachment(null)}
                    aria-label={tr('Ondoa faili', 'Remove attachment')}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : null}
            </div>
          )}

          {!user ? (
            <div className="flex flex-col items-center justify-between gap-2 rounded-xl bg-white px-3.5 py-2.5 sm:flex-row">
              <p className="text-center text-xs font-medium text-slate-700 sm:text-left">
                {tr(
                  'Ingia au jisajili ili kutuma ujumbe, picha, na nyaraka kwenye Mchart.',
                  'Sign in or register to send messages, photos, and documents in Mchart.'
                )}
              </p>
              <button
                type="button"
                onClick={() => onSignIn('chat')}
                className="min-h-[42px] shrink-0 rounded-xl bg-[#075E54] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#064E46]"
              >
                {tr('Ingia / Jisajili', 'Sign In / Register')}
              </button>
            </div>
          ) : isSuspended && !isAdmin ? (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-800">
              <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {tr(
                  'Akaunti yako imefungwa na mmiliki wa jukwaa. Huwezi kutuma ujumbe.',
                  'Your account has been closed by the owner. Messaging is disabled.'
                )}
              </span>
            </div>
          ) : (
            <form onSubmit={(e) => void handleSend(e)} className="relative flex items-end gap-1.5 sm:gap-2">
              {/* Hidden File Inputs */}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  void handleFileSelected(file);
                }}
              />
              <input
                ref={docInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  void handleFileSelected(file);
                }}
              />

              {/* Emoji Button & Popover */}
              <div className="relative" ref={emojiRef}>
                <button
                  type="button"
                  onClick={() => {
                    setEmojiOpen((prev) => !prev);
                    setAttachMenuOpen(false);
                  }}
                  aria-label={tr('Chagua emoji', 'Pick emoji')}
                  className="flex h-11 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-200/70 hover:text-[#075E54]"
                >
                  <Smile className="h-5 w-5" aria-hidden="true" />
                </button>

                {emojiOpen && (
                  <div className="absolute bottom-13 left-0 z-30 grid w-56 grid-cols-4 gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                    {QUICK_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          setDraft((prev) => prev + emoji);
                          inputRef.current?.focus();
                        }}
                        className="flex h-10 items-center justify-center rounded-xl text-xl transition-colors hover:bg-slate-100"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Attach Button & WhatsApp-Style Attachment Popover */}
              <div className="relative" ref={attachMenuRef}>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => {
                    setAttachMenuOpen((prev) => !prev);
                    setEmojiOpen(false);
                  }}
                  aria-label={tr('Ambatanisha picha au nyaraka', 'Attach photo or document')}
                  className="flex h-11 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-200/70 hover:text-[#075E54] disabled:opacity-50"
                >
                  <Paperclip className="h-5 w-5" aria-hidden="true" />
                </button>

                {attachMenuOpen && (
                  <div className="absolute bottom-13 left-0 z-30 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-800 transition-colors hover:bg-emerald-50"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 text-purple-700">
                        <ImageIcon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div>
                        <p>{tr('Picha (Photo)', 'Photo / Image')}</p>
                        <p className="text-[10px] font-normal text-slate-500">JPG, PNG, WEBP</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => docInputRef.current?.click()}
                      className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-800 transition-colors hover:bg-emerald-50"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-[#1D4E89]">
                        <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div>
                        <p>{tr('Nyaraka (Document)', 'Document / File')}</p>
                        <p className="text-[10px] font-normal text-slate-500">
                          PDF, Word, Excel, ZIP
                        </p>
                      </div>
                    </button>
                  </div>
                )}
              </div>

              {/* Message Text Input */}
              <div className="flex-1 rounded-2xl bg-white px-3.5 py-2 shadow-xs ring-1 ring-slate-200/80 focus-within:ring-[#075E54]">
                <textarea
                  ref={inputRef}
                  rows={1}
                  maxLength={2000}
                  value={draft}
                  onFocus={handleComposerFocus}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setDraft(nextVal);
                    wasNearBottomRef.current = true;
                    if (typingIdleTimerRef.current !== null) {
                      window.clearTimeout(typingIdleTimerRef.current);
                      typingIdleTimerRef.current = null;
                    }
                    if (nextVal.trim().length > 0) {
                      setMchartTyping(true, replyTo?.senderName || '', 'group');
                      typingIdleTimerRef.current = window.setTimeout(() => {
                        setMchartTyping(false, '', 'group');
                        typingIdleTimerRef.current = null;
                      }, 4200);
                    } else {
                      setMchartTyping(false, '', 'group');
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && window.innerWidth >= 768) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder={tr('Andika ujumbe hapa...', 'Type a message...')}
                  className="max-h-24 w-full resize-none bg-transparent text-[15px] leading-snug text-slate-900 placeholder-slate-400 outline-none sm:text-sm"
                />
              </div>

              {/* Instant WhatsApp Green Send Button */}
              <button
                type="submit"
                disabled={uploading || (!draft.trim() && !pendingAttachment)}
                aria-label={tr('Tuma ujumbe', 'Send message')}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#00A884] text-white shadow-sm transition-colors hover:bg-[#008F6F] disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Send className="h-5 w-5 translate-x-[1px]" aria-hidden="true" />
              </button>
            </form>
          )}
        </footer>
          </>
        )}
      </section>

      {/* Lightbox Modal for Chat Images */}
      {lightboxImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lightboxImage.name}
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-4xl items-center justify-between pb-3 text-white"
          >
            <p className="truncate text-sm font-semibold">{lightboxImage.name}</p>
            <div className="flex items-center gap-2">
              <a
                href={lightboxImage.url}
                target="_blank"
                rel="noopener noreferrer"
                download={lightboxImage.name}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/25"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                <span>{tr('Pakua', 'Download')}</span>
              </a>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                aria-label={tr('Funga picha', 'Close image')}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <img
            src={lightboxImage.url}
            alt={lightboxImage.name}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[82vh] max-w-full rounded-xl object-contain"
          />
        </div>
      )}

      {/* In-App PDF Viewer + Download Modal */}
      {activePdfDoc && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={activePdfDoc.name}
          onClick={() => setActivePdfDoc(null)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-xs md:items-center md:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-[#F4F7FA] text-slate-900 shadow-2xl md:h-[86dvh] md:rounded-2xl"
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-[#075E54] px-4 py-3 text-white">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-600 text-[10px] font-extrabold text-white">
                  PDF
                </span>
                <p className="truncate text-xs font-bold sm:text-sm">{activePdfDoc.name}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void downloadChatAttachmentFile(
                      activePdfDoc.url,
                      activePdfDoc.name,
                      'application/pdf'
                    ).then(() =>
                      onToast(tr('PDF imepakuliwa kwenye simu yako!', 'PDF saved to your device!'))
                    );
                  }}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-[#25D366] px-3 text-xs font-extrabold text-[#064E46] hover:brightness-105"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  <span>{tr('Pakua Simu', 'Save PDF')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActivePdfDoc(null)}
                  aria-label={tr('Funga PDF', 'Close PDF')}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 sm:px-5">
              <MobilePdfNoteReader
                pdfUrl={activePdfDoc.url}
                fileName={activePdfDoc.name}
                onDownload={() => {
                  void downloadChatAttachmentFile(
                    activePdfDoc.url,
                    activePdfDoc.name,
                    'application/pdf'
                  ).then(() =>
                    onToast(tr('PDF imepakuliwa kwenye simu yako!', 'PDF saved to your device!'))
                  );
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Interactive Image Resize / Crop Modal */}
      <ImageResizeModal
        file={pendingCropImage}
        defaultPreset="free"
        onCancel={() => setPendingCropImage(null)}
        onConfirm={(resizedFile) => {
          setPendingCropImage(null);
          void uploadResolvedChatFile(resizedFile);
        }}
      />
    </div>
  );
};
