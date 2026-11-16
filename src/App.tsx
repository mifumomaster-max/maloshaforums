import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import {
  User,
  getRedirectResult,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import {
  ADMIN_EMAIL,
  OperationType,
  auth,
  db,
  handleFirestoreError,
} from './firebase';
import {
  AuthPromptReason,
  ChatMessage,
  MchartNote,
  NavTab,
  Report,
  ReportReason,
  SortMode,
  Topic,
  TopicCategory,
  UserProfile,
  normalizeAccountStatus,
  normalizeBoardCategory,
  normalizeVerificationBadge,
} from './types';
import {
  createTopic,
  deleteTopic,
  editTopic,
  getPrivateUserInfo,
  seedStarterTopics,
  submitReport,
  syncUserProfile,
  toggleTopicPin,
  toggleTopicVote,
  updatePrivatePhoneNumber,
  updateReportStatus,
  updateTopicStatus,
  updateUserProfile,
} from './services/forumService';
import { shareTopic } from './utils/formatters';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Header } from './components/Header';
import { MobileBottomNav } from './components/MobileBottomNav';
import { TopicList } from './components/TopicList';
import { TopicDetail } from './components/TopicDetail';
import { TopicComposerModal } from './components/TopicComposerModal';
import { ReportModal } from './components/ReportModal';
import { SafetyGuidelinesView } from './components/SafetyGuidelinesView';
import { ConfirmDialog } from './components/ConfirmDialog';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { UserBadgesProvider } from './context/UserBadgesContext';
import { AppLaunchLoader } from './components/AppLaunchLoader';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import { OfflineIndicator } from './components/OfflineIndicator';
import { FloatingScrollButton } from './components/FloatingScrollButton';
import { AuthView } from './components/AuthView';
import { ForumChatView } from './components/ForumChatView';
import { usePWAInstall } from './hooks/usePWAInstall';
import {
  dismissPhoneNotifications,
  sendPhoneNotification,
} from './services/notificationService';

const CHAT_LAST_SEEN_KEY = 'malosha_chat_last_seen_ms_v1';
const NOTES_LAST_SEEN_KEY = 'malosha_notes_last_seen_ms_v1';
const READ_NOTE_IDS_KEY = 'malosha_read_note_ids_v1';

function getLocalDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function ForumShell() {
  const { lang, setLang, tr } = useLanguage();
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userPhone, setUserPhone] = useState('');
  const [isAdminDoc, setIsAdminDoc] = useState(false);
  const [authBusy] = useState(false);

  const [topics, setTopics] = useState<Topic[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(true);
  const [votedTopicIds, setVotedTopicIds] = useState<Set<string>>(new Set());
  const [reports, setReports] = useState<Report[]>([]);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loadingChat, setLoadingChat] = useState(true);
  const [todayKey, setTodayKey] = useState<string>(() => getLocalDateKey());
  const [lastSeenChatMs, setLastSeenChatMs] = useState<number>(() => {
    if (typeof window === 'undefined') return Date.now();
    try {
      const saved = Number(window.localStorage.getItem(CHAT_LAST_SEEN_KEY) || 0);
      return Number.isFinite(saved) && saved > 0 ? saved : Date.now();
    } catch {
      return Date.now();
    }
  });

  const [mchartNotes, setMchartNotes] = useState<MchartNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [lastSeenNotesMs, setLastSeenNotesMs] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    try {
      const saved = Number(window.localStorage.getItem(NOTES_LAST_SEEN_KEY) || 0);
      return Number.isFinite(saved) && saved > 0 ? saved : 0;
    } catch {
      return 0;
    }
  });
  const [readNoteIds, setReadNoteIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const raw = window.localStorage.getItem(READ_NOTE_IDS_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? new Set(parsed.filter((x): x is string => typeof x === 'string'))
        : new Set();
    } catch {
      return new Set();
    }
  });

  const [activeTab, setActiveTab] = useState<NavTab>(() => {
    if (typeof window === 'undefined') return 'all';
    const tabParam = new URLSearchParams(window.location.search).get('tab');
    return tabParam === 'mchart' || tabParam === 'chat' ? 'chat' : 'all';
  });
  const [mchartSubTab, setMchartSubTab] = useState<'messages' | 'notes'>(() => {
    if (typeof window === 'undefined') return 'messages';
    const viewParam = new URLSearchParams(window.location.search).get('view');
    return viewParam === 'notes' ? 'notes' : 'messages';
  });
  const [authPromptReason, setAuthPromptReason] = useState<AuthPromptReason | null>(null);
  const returnDestinationRef = useRef<{ tab: NavTab; topicId: string | null }>({
    tab: 'all',
    topicId: null,
  });
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('mada');
  });
  const [selectedCategory, setSelectedCategory] = useState<TopicCategory | 'all'>('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);

  const [composerOpen, setComposerOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [inlineExpandRequest, setInlineExpandRequest] = useState(0);
  const [sharedTopicFallback, setSharedTopicFallback] = useState<Topic | null>(null);
  const [loadingSharedTopic, setLoadingSharedTopic] = useState(false);

  const [reportTarget, setReportTarget] = useState<{
    targetType: 'topic' | 'reply';
    targetId: string;
    topicId: string;
  } | null>(null);

  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    destructive: boolean;
    action: () => Promise<void>;
  } | null>(null);

  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [installGuideOpen, setInstallGuideOpen] = useState(false);
  const [visibleTopicIds, setVisibleTopicIds] = useState<string[]>([]);
  const initialTopicsLoadedRef = useRef(false);
  const knownTopicIdsRef = useRef<Set<string>>(new Set());
  const initialChatLoadedRef = useRef(false);
  const knownChatIdsRef = useRef<Set<string>>(new Set());
  const initialNotesLoadedRef = useRef(false);
  const knownNoteIdsRef = useRef<Set<string>>(new Set());
  const activeTabRef = useRef<NavTab>(activeTab);
  const mchartSubTabRef = useRef<'messages' | 'notes'>(mchartSubTab);
  const selectedTopicIdRef = useRef<string | null>(selectedTopicId);
  const checkedVoteKeysRef = useRef<Set<string>>(new Set());
  const feedScrollYRef = useRef<number>(0);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    mchartSubTabRef.current = mchartSubTab;
  }, [mchartSubTab]);

  useEffect(() => {
    selectedTopicIdRef.current = selectedTopicId;
  }, [selectedTopicId]);

  const pwa = usePWAInstall();

  const showToast = useCallback((text: string, kind: 'success' | 'error' = 'success') => {
    setToast({ text, kind });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    void getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          showToast(
            tr(
              'Karibu Malosha Forums! Umeingia kikamilifu.',
              'Welcome to Malosha Forums! You are signed in.'
            )
          );
        }
      })
      .catch((err) => {
        console.error('Redirect auth result error:', err);
      });

    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      if (currentUser) {
        try {
          await syncUserProfile(currentUser);
          const [adminSnap, privInfo] = await Promise.all([
            getDoc(doc(db, 'admins', currentUser.uid)),
            getPrivateUserInfo(currentUser.uid),
          ]);
          setIsAdminDoc(adminSnap.exists());
          setUserPhone(privInfo?.phoneNumber || '');
        } catch (err) {
          console.error(err);
        }
      } else {
        setUserProfile(null);
        setUserPhone('');
        setIsAdminDoc(false);
      }
    });
    return () => unsub();
  }, [showToast, tr]);

  const isAdmin = useMemo(() => {
    if (!user) return false;
    return (user.email === ADMIN_EMAIL && user.emailVerified) || isAdminDoc;
  }, [user, isAdminDoc]);

  const isSuspended = useMemo(() => {
    if (!user || isAdmin) return false;
    return userProfile?.accountStatus === 'suspended';
  }, [user, isAdmin, userProfile]);

  useEffect(() => {
    if (!authReady || !user) {
      setUserProfile(null);
      return;
    }

    const path = `users/${user.uid}`;
    const unsub = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        setUserProfile({
          uid: d.uid,
          displayName: d.displayName,
          photoURL: d.photoURL || '',
          bio: d.bio || '',
          role: d.role || 'member',
          verificationBadge: normalizeVerificationBadge(d.verificationBadge),
          accountStatus: normalizeAccountStatus(d.accountStatus),
          suspendedReason: typeof d.suspendedReason === 'string' ? d.suspendedReason : '',
          topicsCount: Number(d.topicsCount || 0),
          repliesCount: Number(d.repliesCount || 0),
          createdAt: d.createdAt || null,
          updatedAt: d.updatedAt || null,
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, path);
      }
    );

    return () => unsub();
  }, [authReady, user]);

  useEffect(() => {
    if (!authReady) return;
    setLoadingTopics(true);
    const path = 'topics';
    const q = query(collection(db, 'topics'), where('status', 'in', ['open', 'locked']));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: Topic[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: data.title,
            body: data.body,
            category: data.category,
            tags: Array.isArray(data.tags) ? data.tags : [],
            authorId: data.authorId,
            authorName: data.authorName,
            authorPhoto: data.authorPhoto || '',
            status: data.status,
            isPinned: Boolean(data.isPinned),
            repliesCount: Number(data.repliesCount || 0),
            upvotesCount: Number(data.upvotesCount || 0),
            acceptedReplyId: data.acceptedReplyId || '',
            company: data.company || '',
            location: data.location || '',
            jobType: data.jobType || '',
            deadline: data.deadline || '',
            applyInfo: data.applyInfo || '',
            coverImage: data.coverImage || '',
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
            lastActivityAt: data.lastActivityAt || data.createdAt || null,
          };
        });
        setTopics(list);
        setLoadingTopics(false);
      },
      (error) => {
        setLoadingTopics(false);
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    return () => unsub();
  }, [authReady]);

  // Reset cached vote checks when user changes
  useEffect(() => {
    checkedVoteKeysRef.current.clear();
    if (!user) {
      setVotedTopicIds(new Set());
    }
  }, [user]);

  // Lightweight visible-only vote lookup (no N+1 listeners across all topics)
  useEffect(() => {
    if (!authReady || !user) return;
    const uid = user.uid;
    const idsToCheck = Array.from(
      new Set([...visibleTopicIds, ...(selectedTopicId ? [selectedTopicId] : [])])
    ).filter((id) => !checkedVoteKeysRef.current.has(`${uid}:${id}`));

    if (idsToCheck.length === 0) return;
    let cancelled = false;

    Promise.all(
      idsToCheck.map(async (topicId) => {
        checkedVoteKeysRef.current.add(`${uid}:${topicId}`);
        try {
          const snap = await getDoc(doc(db, 'topics', topicId, 'votes', uid));
          return { topicId, voted: snap.exists() };
        } catch {
          checkedVoteKeysRef.current.delete(`${uid}:${topicId}`);
          return null;
        }
      })
    ).then((results) => {
      if (cancelled) return;
      setVotedTopicIds((prev) => {
        let changed = false;
        const next = new Set(prev);
        for (const r of results) {
          if (!r) continue;
          if (r.voted && !next.has(r.topicId)) {
            next.add(r.topicId);
            changed = true;
          } else if (!r.voted && next.has(r.topicId)) {
            next.delete(r.topicId);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [authReady, user, visibleTopicIds, selectedTopicId]);

  // Real-time vote sync ONLY for the actively opened topic detail
  useEffect(() => {
    if (!authReady || !user || !selectedTopicId) return;
    const voteRef = doc(db, 'topics', selectedTopicId, 'votes', user.uid);
    const unsub = onSnapshot(
      voteRef,
      (snap) => {
        setVotedTopicIds((prev) => {
          const next = new Set(prev);
          if (snap.exists()) next.add(selectedTopicId);
          else next.delete(selectedTopicId);
          return next;
        });
      },
      (error) => {
        handleFirestoreError(
          error,
          OperationType.GET,
          `topics/${selectedTopicId}/votes/${user.uid}`
        );
      }
    );
    return () => unsub();
  }, [authReady, user, selectedTopicId]);

  // Keep today's date boundary accurate if app stays open across midnight
  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = getLocalDateKey();
      setTodayKey((curr) => (curr === next ? curr : next));
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Real-time community group chat listener (strictly TODAY's messages only)
  useEffect(() => {
    if (!authReady) return;
    const path = 'forum_chat_messages';
    const [yr, mo, dy] = todayKey.split('-').map(Number);
    const startOfToday = new Date(yr, mo - 1, dy, 0, 0, 0, 0);
    const startOfTodayMs = startOfToday.getTime();

    const q = query(
      collection(db, path),
      where('createdAt', '>=', Timestamp.fromDate(startOfToday)),
      orderBy('createdAt', 'desc'),
      limit(200)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: ChatMessage[] = snapshot.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              senderId: String(data.senderId || ''),
              senderName: String(data.senderName || 'Mwanachama'),
              senderPhoto: String(data.senderPhoto || ''),
              text: String(data.text || ''),
              attachmentType: (
                data.attachmentType === 'image' || data.attachmentType === 'document'
                  ? data.attachmentType
                  : 'none'
              ) as ChatMessage['attachmentType'],
              attachmentUrl: String(data.attachmentUrl || ''),
              attachmentName: String(data.attachmentName || ''),
              attachmentSize: Number(data.attachmentSize || 0),
              attachmentMime: String(data.attachmentMime || ''),
              replyToId: String(data.replyToId || ''),
              replyToSenderName: String(data.replyToSenderName || ''),
              replyToPreview: String(data.replyToPreview || ''),
              isDeleted: Boolean(data.isDeleted),
              createdAt: data.createdAt || null,
              updatedAt: data.updatedAt || null,
            };
          })
          .filter((m) => !m.createdAt || m.createdAt.toMillis() >= startOfTodayMs);

        setChatMessages(list);
        setLoadingChat(false);

        if (!initialChatLoadedRef.current) {
          knownChatIdsRef.current = new Set(list.map((m) => m.id));
          initialChatLoadedRef.current = true;
          return;
        }

        const newestIncoming = list.find(
          (m) =>
            !knownChatIdsRef.current.has(m.id) &&
            !m.isDeleted &&
            m.senderId !== user?.uid
        );
        list.forEach((m) => knownChatIdsRef.current.add(m.id));

        if (newestIncoming) {
          const isViewingChat =
            activeTabRef.current === 'chat' &&
            mchartSubTabRef.current === 'messages' &&
            !selectedTopicIdRef.current &&
            typeof document !== 'undefined' &&
            !document.hidden;

          if (!isViewingChat) {
            const preview =
              newestIncoming.text.trim() ||
              (newestIncoming.attachmentType === 'image'
                ? tr('Alituma picha mpya', 'Sent a new photo')
                : `📄 ${newestIncoming.attachmentName || tr('Alituma nyaraka', 'Sent a document')}`);
            const alertTitle = `${newestIncoming.senderName} · Mchart (Malosha)`;

            if (typeof document !== 'undefined' && !document.hidden) {
              showToast(`${alertTitle}: ${preview.slice(0, 80)}`);
            }
            void sendPhoneNotification({
              title: alertTitle,
              body: preview.slice(0, 140),
              url: '/?tab=mchart',
              tag: 'malosha-chat-msg',
            });
          }
        }
      },
      (error) => {
        setLoadingChat(false);
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    return () => unsub();
  }, [authReady, todayKey, user?.uid, showToast, tr]);

  // Real-time Mchart Notes listener (owner structured notes, PDFs & archive files)
  useEffect(() => {
    if (!authReady) return;
    const path = 'mchart_notes';
    const q = query(
      collection(db, path),
      where('createdAt', '>=', Timestamp.fromMillis(0)),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: MchartNote[] = snapshot.docs.map((d) => {
          const data = d.data();
          const noteType =
            data.noteType === 'pdf' || data.noteType === 'mixed' || data.noteType === 'text'
              ? data.noteType
              : typeof data.pdfUrl === 'string' && data.pdfUrl
                ? 'mixed'
                : 'text';
          return {
            id: d.id,
            title: String(data.title || 'Note'),
            subtitle: typeof data.subtitle === 'string' ? data.subtitle : '',
            body: String(data.body || ''),
            summary: String(data.summary || ''),
            fileName: String(data.fileName || 'malosha-note.pdf'),
            wordCount: Number(data.wordCount || 0),
            authorId: String(data.authorId || ''),
            authorName: String(data.authorName || 'Mmiliki'),
            isPinned: Boolean(data.isPinned),
            isArchived: Boolean(data.isArchived),
            pdfUrl: typeof data.pdfUrl === 'string' ? data.pdfUrl : '',
            pdfFileName: typeof data.pdfFileName === 'string' ? data.pdfFileName : '',
            pdfSize: Number(data.pdfSize || 0),
            noteType,
            isLocked: Boolean(data.isLocked),
            lockedTargetMode: data.lockedTargetMode === 'selected' ? 'selected' : 'all',
            lockPrice: Number(data.lockPrice || 0),
            lockCurrency: typeof data.lockCurrency === 'string' ? data.lockCurrency : 'TZS',
            paymentInstructions:
              typeof data.paymentInstructions === 'string' ? data.paymentInstructions : '',
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
          };
        });

        setMchartNotes(list);
        setLoadingNotes(false);

        if (!initialNotesLoadedRef.current) {
          knownNoteIdsRef.current = new Set(list.map((n) => n.id));
          initialNotesLoadedRef.current = true;
          return;
        }

        const newestNote = list.find(
          (n) => !knownNoteIdsRef.current.has(n.id) && !n.isArchived && n.authorId !== user?.uid
        );
        list.forEach((n) => knownNoteIdsRef.current.add(n.id));

        if (newestNote) {
          const isViewingNotes =
            activeTabRef.current === 'chat' &&
            mchartSubTabRef.current === 'notes' &&
            !selectedTopicIdRef.current &&
            typeof document !== 'undefined' &&
            !document.hidden;

          if (!isViewingNotes) {
            const alertTitle = tr('Note Mpya · Mchart (Malosha)', 'New Note · Malosha Mchart');
            if (typeof document !== 'undefined' && !document.hidden) {
              showToast(`${alertTitle}: ${newestNote.title}`);
            }
            void sendPhoneNotification({
              title: alertTitle,
              body: newestNote.title,
              url: '/?tab=mchart&view=notes',
              tag: 'malosha-mchart-note',
            });
          }
        }
      },
      (error) => {
        setLoadingNotes(false);
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    return () => unsub();
  }, [authReady, user?.uid, showToast, tr]);

  const markNoteRead = useCallback((noteId: string) => {
    setReadNoteIds((prev) => {
      if (prev.has(noteId)) return prev;
      const next = new Set(prev);
      next.add(noteId);
      try {
        window.localStorage.setItem(
          READ_NOTE_IDS_KEY,
          JSON.stringify(Array.from(next).slice(-200))
        );
      } catch {
        // Ignore storage failures
      }
      return next;
    });
    const nowPlus = Date.now() + 1000;
    setLastSeenNotesMs((prev) => {
      const next = Math.max(prev, nowPlus);
      try {
        window.localStorage.setItem(NOTES_LAST_SEEN_KEY, String(next));
      } catch {
        // Ignore storage failures
      }
      return next;
    });
    void dismissPhoneNotifications('malosha-mchart-note');
  }, []);

  // Mark community chat messages as seen & clear phone chat alerts when viewing Chat messages
  useEffect(() => {
    if (activeTab !== 'chat' || mchartSubTab !== 'messages' || selectedTopicId) return;
    let latestMs = Date.now();
    chatMessages.forEach((m) => {
      const ms = m.createdAt ? m.createdAt.toMillis() : 0;
      if (ms > latestMs) latestMs = ms;
    });
    setLastSeenChatMs(latestMs);
    try {
      window.localStorage.setItem(CHAT_LAST_SEEN_KEY, String(latestMs));
    } catch {
      // Ignore storage error
    }
    void dismissPhoneNotifications('malosha-chat-msg');
  }, [activeTab, mchartSubTab, selectedTopicId, chatMessages]);

  // Mark Mchart notes as seen & dismiss phone note notification when viewing Notes
  useEffect(() => {
    if (activeTab !== 'chat' || mchartSubTab !== 'notes' || selectedTopicId) return;
    let latestMs = Date.now() + 1000;
    mchartNotes.forEach((n) => {
      const ms = n.createdAt ? n.createdAt.toMillis() + 1000 : 0;
      if (ms > latestMs) latestMs = ms;
    });
    setLastSeenNotesMs(latestMs);
    try {
      window.localStorage.setItem(NOTES_LAST_SEEN_KEY, String(latestMs));
    } catch {
      // Ignore storage error
    }
    void dismissPhoneNotifications('malosha-mchart-note');
    setToast((curr) => (curr && curr.text.includes('Note Mpya') ? null : curr));
  }, [activeTab, mchartSubTab, selectedTopicId, mchartNotes]);

  const unreadChatCount = useMemo(() => {
    if (activeTab === 'chat' && mchartSubTab === 'messages' && !selectedTopicId) return 0;
    return chatMessages.filter((m) => {
      if (m.isDeleted || m.senderId === user?.uid) return false;
      const ms = m.createdAt ? m.createdAt.toMillis() : 0;
      return ms > lastSeenChatMs;
    }).length;
  }, [activeTab, mchartSubTab, selectedTopicId, chatMessages, user?.uid, lastSeenChatMs]);

  const unreadNotesCount = useMemo(() => {
    if (activeTab === 'chat' && mchartSubTab === 'notes' && !selectedTopicId) return 0;
    return mchartNotes.filter((n) => {
      if (n.isArchived || n.authorId === user?.uid) return false;
      if (readNoteIds.has(n.id)) return false;
      const ms = n.createdAt ? n.createdAt.toMillis() : 0;
      return ms > lastSeenNotesMs;
    }).length;
  }, [activeTab, mchartSubTab, selectedTopicId, mchartNotes, user?.uid, lastSeenNotesMs, readNoteIds]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    let changed = false;
    if (selectedTopicId) {
      if (url.searchParams.get('mada') !== selectedTopicId) {
        url.searchParams.set('mada', selectedTopicId);
        changed = true;
      }
    } else if (url.searchParams.has('mada')) {
      url.searchParams.delete('mada');
      changed = true;
    }

    if (activeTab === 'chat' && !selectedTopicId) {
      if (url.searchParams.get('tab') !== 'mchart') {
        url.searchParams.set('tab', 'mchart');
        changed = true;
      }
      if (mchartSubTab === 'notes') {
        if (url.searchParams.get('view') !== 'notes') {
          url.searchParams.set('view', 'notes');
          changed = true;
        }
      } else if (url.searchParams.has('view')) {
        url.searchParams.delete('view');
        changed = true;
      }
    } else {
      if (url.searchParams.has('tab')) {
        url.searchParams.delete('tab');
        changed = true;
      }
      if (url.searchParams.has('view')) {
        url.searchParams.delete('view');
        changed = true;
      }
    }

    if (changed) {
      window.history.replaceState({}, '', url.toString());
    }
  }, [selectedTopicId, activeTab, mchartSubTab]);

  useEffect(() => {
    if (!authReady || !selectedTopicId) {
      setSharedTopicFallback(null);
      setLoadingSharedTopic(false);
      return;
    }

    if (topics.some((t) => t.id === selectedTopicId)) {
      setSharedTopicFallback(null);
      setLoadingSharedTopic(false);
      return;
    }

    let cancelled = false;
    setLoadingSharedTopic(true);

    getDoc(doc(db, 'topics', selectedTopicId))
      .then((snap) => {
        if (cancelled) return;
        if (!snap.exists()) {
          setSharedTopicFallback(null);
          return;
        }
        const data = snap.data();
        if (!isAdmin && data.status !== 'open' && data.status !== 'locked') {
          setSharedTopicFallback(null);
          return;
        }
        setSharedTopicFallback({
          id: snap.id,
          title: data.title,
          body: data.body,
          category: data.category,
          tags: Array.isArray(data.tags) ? data.tags : [],
          authorId: data.authorId,
          authorName: data.authorName,
          authorPhoto: data.authorPhoto || '',
          status: data.status,
          isPinned: Boolean(data.isPinned),
          repliesCount: Number(data.repliesCount || 0),
          upvotesCount: Number(data.upvotesCount || 0),
          acceptedReplyId: data.acceptedReplyId || '',
          company: data.company || '',
          location: data.location || '',
          jobType: data.jobType || '',
          deadline: data.deadline || '',
          applyInfo: data.applyInfo || '',
          coverImage: data.coverImage || '',
          createdAt: data.createdAt || null,
          updatedAt: data.updatedAt || null,
          lastActivityAt: data.lastActivityAt || data.createdAt || null,
        });
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(err);
          setSharedTopicFallback(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSharedTopic(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, selectedTopicId, topics, isAdmin]);

  useEffect(() => {
    if (!authReady || !user) {
      setReports([]);
      return;
    }

    const path = 'reports';
    const q = isAdmin
      ? query(collection(db, 'reports'))
      : query(collection(db, 'reports'), where('reporterId', '==', user.uid));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: Report[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            reporterId: data.reporterId,
            targetType: data.targetType,
            targetId: data.targetId,
            topicId: data.topicId,
            reason: data.reason,
            details: data.details || '',
            status: data.status,
            createdAt: data.createdAt || null,
          };
        });
        list.sort((a, b) => {
          const am = a.createdAt ? a.createdAt.toMillis() : Date.now();
          const bm = b.createdAt ? b.createdAt.toMillis() : Date.now();
          return bm - am;
        });
        setReports(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    return () => unsub();
  }, [authReady, user, isAdmin]);

  const selectedTopic = useMemo(
    () =>
      topics.find((t) => t.id === selectedTopicId) ||
      (sharedTopicFallback?.id === selectedTopicId ? sharedTopicFallback : null),
    [topics, selectedTopicId, sharedTopicFallback]
  );

  const handleSignIn = useCallback(
    (reason?: AuthPromptReason | unknown) => {
      if (user) return;
      const normalizedReason: AuthPromptReason | null =
        reason === 'comment' || reason === 'like' || reason === 'post' || reason === 'chat'
          ? reason
          : null;
      if (activeTab !== 'auth') {
        returnDestinationRef.current = {
          tab: activeTab,
          topicId: selectedTopicId,
        };
      }
      setAuthPromptReason(normalizedReason);
      setSelectedTopicId(null);
      setActiveTab('auth');
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [user, activeTab, selectedTopicId]
  );

  useEffect(() => {
    if (user && activeTab === 'auth') {
      const dest = returnDestinationRef.current;
      setAuthPromptReason(null);
      setActiveTab(dest.tab === 'auth' ? 'all' : dest.tab);
      if (dest.topicId) {
        setSelectedTopicId(dest.topicId);
      }
    }
  }, [user, activeTab]);

  const handleSignOut = async () => {
    await signOut(auth);
    setOnlyMine(false);
    setLang('sw');
    showToast('Umetoka kwenye akaunti yako.');
  };

  const handleSelectTab = (tab: NavTab) => {
    setAuthPromptReason(null);
    setActiveTab(tab);
    setSelectedTopicId(null);
    if (tab === 'kijiweni') {
      setSelectedCategory('Kijiweni');
    } else if (tab === 'fursa') {
      setSelectedCategory('Fursa');
    } else if (tab === 'makala') {
      setSelectedCategory('Makala');
    } else {
      setSelectedCategory('all');
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  };

  const handleSelectBoard = (board: TopicCategory) => {
    const normalized = normalizeBoardCategory(board);
    setSelectedCategory(normalized);
    setSelectedTopicId(null);
    if (normalized === 'Kijiweni') setActiveTab('kijiweni');
    else if (normalized === 'Fursa') setActiveTab('fursa');
    else setActiveTab('makala');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  };

  const latestMakala = useMemo(() => {
    return topics
      .filter((t) => normalizeBoardCategory(t.category) === 'Makala')
      .sort((a, b) => {
        const am = a.createdAt ? a.createdAt.toMillis() : Date.now();
        const bm = b.createdAt ? b.createdAt.toMillis() : Date.now();
        return bm - am;
      });
  }, [topics]);

  const openTopicFromFeed = useCallback((topicId: string) => {
    if (typeof window !== 'undefined') {
      feedScrollYRef.current = window.scrollY || window.pageYOffset || 0;
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
    setSelectedTopicId(topicId);
  }, []);

  const returnToFeed = useCallback(() => {
    setSelectedTopicId(null);
    if (typeof window !== 'undefined') {
      const restoreY = feedScrollYRef.current;
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: restoreY, behavior: 'auto' });
      });
    }
  }, []);

  useEffect(() => {
    if (loadingTopics) return;
    if (!initialTopicsLoadedRef.current) {
      knownTopicIdsRef.current = new Set(topics.map((t) => t.id));
      initialTopicsLoadedRef.current = true;
      return;
    }

    const newlyPublished = topics.find((t) => !knownTopicIdsRef.current.has(t.id));
    knownTopicIdsRef.current = new Set(topics.map((t) => t.id));

    if (newlyPublished && newlyPublished.authorId !== user?.uid) {
      const board = normalizeBoardCategory(newlyPublished.category);
      const alertTitle =
        board === 'Makala'
          ? tr('Habari Mpya · Malosha', 'Breaking News · Malosha')
          : board === 'Fursa'
            ? tr('Fursa Mpya · Malosha', 'New Opportunity · Malosha')
            : tr('Chapisho Jipya · Kijiweni', 'New Post · Kijiweni');
      const alertBody = newlyPublished.title.trim() || newlyPublished.body.slice(0, 100);

      showToast(`${alertTitle}: ${alertBody}`);
      void sendPhoneNotification({
        title: alertTitle,
        body: alertBody,
        topicId: newlyPublished.id,
      });
    }
  }, [loadingTopics, topics, user?.uid, showToast, tr]);

  const blockIfSuspended = useCallback(() => {
    if (!isSuspended) return false;
    showToast(
      tr(
        'Akaunti yako imefungwa na mmiliki wa jukwaa. Huwezi kufanya hatua hii.',
        'Your account has been closed by the platform owner. This action is blocked.'
      ),
      'error'
    );
    return true;
  }, [isSuspended, showToast, tr]);

  const handleOpenNewTopic = () => {
    if (!user) {
      showToast(
        tr(
          'Tengeneza akaunti au ingia (kwa Google au Jisajili kawaida) ili kuchapisha mada.',
          'Create an account or sign in (Google or Register) to create a post.'
        ),
        'error'
      );
      handleSignIn('post');
      return;
    }
    if (blockIfSuspended()) return;
    const viewingInlineBoard =
      !selectedTopicId &&
      (activeTab === 'kijiweni' ||
        activeTab === 'fursa' ||
        activeTab === 'makala' ||
        (activeTab === 'all' &&
          (selectedCategory === 'Kijiweni' ||
            selectedCategory === 'Fursa' ||
            selectedCategory === 'Makala')));

    if (viewingInlineBoard) {
      setInlineExpandRequest((n) => n + 1);
      return;
    }
    setEditingTopic(null);
    setComposerOpen(true);
  };

  const handleSaveTopic = async (data: {
    title: string;
    body: string;
    category: TopicCategory;
    tags: string[];
    company?: string;
    location?: string;
    jobType?: string;
    deadline?: string;
    applyInfo?: string;
    coverImage?: string;
  }) => {
    if (!user || blockIfSuspended()) return;
    if (editingTopic) {
      await editTopic(editingTopic.id, data);
      showToast(tr('Mabadiliko yamehifadhiwa.', 'Changes saved.'));
    } else {
      const newId = await createTopic(
        user,
        userProfile?.displayName || user.displayName || 'Mwanachama',
        data
      );
      setSelectedTopicId(newId);
      showToast(tr('Chapisho lako jipya limewekwa hewani!', 'Your new post is now live!'));
    }
  };

  const handleCreateKijiweniPost = async (data: {
    title: string;
    body: string;
    tags: string[];
    coverImage?: string;
  }) => {
    if (!user) {
      showToast(
        tr(
          'Tengeneza akaunti au ingia (kwa Google au Jisajili kawaida) ili kuchapisha.',
          'Create an account or sign in (Google or Register) to post.'
        ),
        'error'
      );
      handleSignIn('post');
      return;
    }
    if (blockIfSuspended()) return;
    await createTopic(
      user,
      userProfile?.displayName || user.displayName || 'Mwanachama',
      {
        title: data.title,
        body: data.body,
        category: 'Kijiweni',
        tags: data.tags,
        ...(data.coverImage ? { coverImage: data.coverImage } : {}),
      }
    );
    showToast(tr('Chapisho lako limewekwa Kijiweni!', 'Your post is now live in Kijiweni!'));
  };

  const handleCreateFursaPost = async (data: {
    title: string;
    body: string;
    tags: string[];
    company?: string;
    location?: string;
    jobType?: string;
    deadline?: string;
    applyInfo?: string;
    coverImage?: string;
  }) => {
    if (!user) {
      showToast(
        tr(
          'Tengeneza akaunti au ingia (kwa Google au Jisajili kawaida) ili kuchapisha fursa.',
          'Create an account or sign in (Google or Register) to post an opportunity.'
        ),
        'error'
      );
      handleSignIn('post');
      return;
    }
    if (blockIfSuspended()) return;
    await createTopic(
      user,
      userProfile?.displayName || user.displayName || 'Mwanachama',
      {
        title: data.title,
        body: data.body,
        category: 'Fursa',
        tags: data.tags,
        company: data.company,
        location: data.location,
        jobType: data.jobType,
        deadline: data.deadline,
        applyInfo: data.applyInfo,
        ...(data.coverImage ? { coverImage: data.coverImage } : {}),
      }
    );
    showToast(tr('Tangazo lako la fursa limewekwa hewani!', 'Your opportunity listing is live!'));
  };

  const handleCreateMakalaPost = async (data: {
    title: string;
    body: string;
    tags: string[];
    coverImage?: string;
  }) => {
    if (!user) {
      showToast(
        tr(
          'Tengeneza akaunti au ingia (kwa Google au Jisajili kawaida) ili kuchapisha makala.',
          'Create an account or sign in (Google or Register) to publish an article.'
        ),
        'error'
      );
      handleSignIn('post');
      return;
    }
    if (blockIfSuspended()) return;
    await createTopic(
      user,
      userProfile?.displayName || user.displayName || 'Mwanachama',
      {
        title: data.title,
        body: data.body,
        category: 'Makala',
        tags: data.tags,
        ...(data.coverImage ? { coverImage: data.coverImage } : {}),
      }
    );
    showToast(
      tr(
        'Makala yako imechapishwa kwenye chumba cha habari!',
        'Your article has been published to the newsroom!'
      )
    );
  };

  const handleToggleTopicVote = async (topic: Topic) => {
    if (!user) {
      showToast(
        tr(
          'Tengeneza akaunti au ingia (kwa Google au Jisajili kawaida) ili kupenda chapisho.',
          'Create an account or sign in (Google or Register) to like this post.'
        ),
        'error'
      );
      handleSignIn('like');
      return;
    }
    if (blockIfSuspended()) return;
    const hasVoted = votedTopicIds.has(topic.id);
    setVotedTopicIds((prev) => {
      const next = new Set(prev);
      if (hasVoted) next.delete(topic.id);
      else next.add(topic.id);
      return next;
    });
    try {
      await toggleTopicVote(topic.id, user.uid, hasVoted);
    } catch (err) {
      // Revert optimistic vote update on failure
      setVotedTopicIds((prev) => {
        const next = new Set(prev);
        if (hasVoted) next.add(topic.id);
        else next.delete(topic.id);
        return next;
      });
      throw err;
    }
  };

  const handleToggleLock = async (topic: Topic) => {
    if (blockIfSuspended()) return;
    const nextStatus = topic.status === 'locked' ? 'open' : 'locked';
    await updateTopicStatus(topic.id, nextStatus);
    showToast(
      nextStatus === 'locked'
        ? tr(
            'Mjadala umefungwa. Majibu mapya yamesitishwa.',
            'Discussion locked. New replies are disabled.'
          )
        : tr('Mjadala umefunguliwa tena.', 'Discussion reopened.')
    );
  };

  const handleToggleArchive = async (topic: Topic) => {
    if (!isAdmin) return;
    const nextStatus = topic.status === 'archived' ? 'open' : 'archived';
    await updateTopicStatus(topic.id, nextStatus);
    if (nextStatus === 'archived') {
      setSelectedTopicId(null);
      showToast(
        tr(
          'Chapisho limefungwa na kuondolewa kwa watumiaji wengine.',
          'Post closed and removed from public view.'
        )
      );
    } else {
      showToast(tr('Chapisho limerejeshwa hewani.', 'Post restored to public view.'));
    }
  };

  const handleTogglePin = async (topic: Topic) => {
    if (blockIfSuspended()) return;
    await toggleTopicPin(topic.id, !topic.isPinned);
    showToast(
      !topic.isPinned
        ? tr('Mada imebandikwa juu.', 'Post pinned to top.')
        : tr('Bandiko limeondolewa.', 'Post unpinned.')
    );
  };

  const handleDeleteTopic = (topic: Topic) => {
    if (blockIfSuspended()) return;
    setConfirmState({
      title: tr('Futa Mada Hii?', 'Delete This Post?'),
      message: tr(
        'Je, una uhakika unataka kufuta mada hii kabisa? Hatua hii haiwezi kubatilishwa.',
        'Are you sure you want to permanently delete this post? This action cannot be undone.'
      ),
      confirmLabel: tr('Ndiyo, Futa Mada', 'Yes, Delete Post'),
      destructive: true,
      action: async () => {
        await deleteTopic(topic.id);
        setSelectedTopicId(null);
        showToast(tr('Mada imefutwa.', 'Post deleted.'));
      },
    });
  };

  const handleSubmitReport = async (reason: ReportReason, details: string) => {
    if (!user || !reportTarget || blockIfSuspended()) return;
    await submitReport(
      user.uid,
      reportTarget.targetType,
      reportTarget.targetId,
      reportTarget.topicId,
      reason,
      details
    );
    showToast(
      tr(
        'Ripoti yako imepokelewa na itakaguliwa kwa usalama wa jukwaa.',
        'Your report was received and will be reviewed for community safety.'
      )
    );
  };

  const handleSeedStarterTopics = async () => {
    if (!user || blockIfSuspended()) return;
    setSeeding(true);
    try {
      await seedStarterTopics(
        user,
        userProfile?.displayName || user.displayName || 'Mwanachama'
      );
      showToast(
        tr(
          'Maudhui ya mfano ya Kijiweni, Fursa, na Makala yamepakiwa.',
          'Starter posts for Kijiweni, Opportunities, and Articles loaded.'
        )
      );
    } finally {
      setSeeding(false);
    }
  };

  const handleSaveProfile = async (
    displayName: string,
    bio: string,
    phoneNumber?: string
  ) => {
    if (!user || blockIfSuspended()) return;
    await updateUserProfile(user.uid, displayName, bio);
    if (phoneNumber !== undefined) {
      await updatePrivatePhoneNumber(user.uid, phoneNumber);
      setUserPhone(phoneNumber.trim());
    }
  };

  const composerDefaultCategory: TopicCategory | 'all' =
    activeTab === 'kijiweni'
      ? 'Kijiweni'
      : activeTab === 'fursa'
        ? 'Fursa'
        : activeTab === 'makala'
          ? 'Makala'
          : selectedCategory;

  const handleTriggerInstallApp = useCallback(async () => {
    if (pwa.isInstallable) {
      const outcome = await pwa.install();
      if (outcome === 'accepted') {
        showToast(
          tr(
            'Malosha Forums imesakinishwa kwenye kifaa chako!',
            'Malosha Forums has been installed on your device!'
          )
        );
        return;
      }
      if (outcome === 'dismissed') return;
    }
    setInstallGuideOpen(true);
  }, [pwa, showToast, tr]);

  const appReady = authReady;

  return (
    <div className="min-h-screen flex flex-col bg-[#F1F4F8] text-slate-900">
      <AppLaunchLoader ready={appReady} />
      <OfflineIndicator />

      <Header
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        onOpenTopic={openTopicFromFeed}
        topics={topics}
        userUid={user?.uid || null}
        userProfile={userProfile}
        userDisplayName={user?.displayName || 'Mwanachama'}
        userPhoto={user?.photoURL || ''}
        isAdmin={isAdmin}
        isSuspended={isSuspended}
        onOpenComposer={handleOpenNewTopic}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        authBusy={authBusy}
        canInstallApp={!pwa.isInstalled}
        onTriggerInstallApp={() => {
          void handleTriggerInstallApp();
        }}
        onToast={showToast}
        unreadChatCount={unreadChatCount + unreadNotesCount}
      />

      <main className="flex-1">
        {isSuspended && (
          <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-red-900">
            <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
              <div className="flex items-start gap-2.5 text-xs sm:text-sm">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
                <div>
                  <span className="font-bold">
                    {tr('Akaunti Yako Imefungwa:', 'Your Account Is Closed:')}
                  </span>{' '}
                  <span>
                    {tr(
                      'Huwezi kupost, ku-comment, wala kupenda.',
                      'You cannot post, comment, or like.'
                    )}
                  </span>
                  {userProfile?.suspendedReason && (
                    <span className="font-medium"> ({userProfile.suspendedReason})</span>
                  )}
                </div>
              </div>
              {activeTab !== 'safety' && (
                <button
                  type="button"
                  onClick={() => handleSelectTab('safety')}
                  className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100"
                >
                  {tr('Tazama Wasifu', 'View Profile')}
                </button>
              )}
            </div>
          </div>
        )}

        {selectedTopic ? (
          <TopicDetail
            topic={selectedTopic}
            latestMakala={latestMakala}
            onOpenTopic={openTopicFromFeed}
            userUid={user?.uid || null}
            userDisplayName={userProfile?.displayName || user?.displayName || 'Mwanachama'}
            userPhoto={userProfile?.photoURL || user?.photoURL || ''}
            isAdmin={isAdmin}
            isSuspended={isSuspended}
            hasVotedTopic={votedTopicIds.has(selectedTopic.id)}
            onBack={returnToFeed}
            onSelectBoard={handleSelectBoard}
            onToggleTopicVote={handleToggleTopicVote}
            onShareTopic={(t) => {
              void shareTopic(t, (msg) => showToast(msg), lang);
            }}
            onEditTopic={(t) => {
              if (blockIfSuspended()) return;
              setEditingTopic(t);
              setComposerOpen(true);
            }}
            onToggleLock={handleToggleLock}
            onTogglePin={handleTogglePin}
            onToggleArchive={handleToggleArchive}
            onDeleteTopic={handleDeleteTopic}
            onOpenReport={(targetType, targetId) => {
              if (blockIfSuspended()) return;
              setReportTarget({
                targetType,
                targetId,
                topicId: selectedTopic.id,
              });
            }}
            onSignIn={handleSignIn}
            onToast={showToast}
            onRequestConfirm={(opts) => setConfirmState(opts)}
          />
        ) : selectedTopicId && (loadingTopics || loadingSharedTopic) ? (
          <div className="mx-auto max-w-4xl px-3.5 py-6 sm:px-6 sm:py-8">
            <div className="rounded-xl border border-slate-200 bg-white p-6 animate-pulse sm:rounded-lg">
              <p className="text-xs font-semibold text-[#1D4E89]">
                {tr('Inafungua tangazo...', 'Loading post...')}
              </p>
              <div className="mt-3 h-6 w-3/4 rounded bg-slate-100" />
              <div className="mt-2 h-4 w-1/2 rounded bg-slate-100" />
              <div className="mt-5 space-y-2.5">
                <div className="h-4 w-full rounded bg-slate-100" />
                <div className="h-4 w-5/6 rounded bg-slate-100" />
                <div className="h-4 w-2/3 rounded bg-slate-100" />
              </div>
            </div>
          </div>
        ) : selectedTopicId ? (
          <div className="mx-auto max-w-2xl px-3.5 py-10 sm:px-6">
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center sm:rounded-lg">
              <h1 className="font-display text-xl font-bold text-slate-900">
                {tr('Tangazo hili halikupatikana', 'This post could not be found')}
              </h1>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
                {tr(
                  'Huenda tangazo au mada hii imeondolewa na mwandishi au kiungo si sahihi.',
                  'This post or listing may have been removed by the author, or the link is invalid.'
                )}
              </p>
              <button
                type="button"
                onClick={() => setSelectedTopicId(null)}
                className="mt-5 inline-flex min-h-[42px] items-center rounded-lg bg-[#1D4E89] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#163A5F]"
              >
                {tr('Rudi Kwenye Jukwaa', 'Back to Forum')}
              </button>
            </div>
          </div>
        ) : activeTab === 'auth' && !user ? (
          <AuthView
            promptReason={authPromptReason}
            onBack={() => {
              const dest = returnDestinationRef.current;
              setAuthPromptReason(null);
              setActiveTab(dest.tab === 'auth' ? 'all' : dest.tab);
              if (dest.topicId) {
                setSelectedTopicId(dest.topicId);
              }
            }}
            onSuccess={async (signedInUser, isNewUser) => {
              const privInfo = await getPrivateUserInfo(signedInUser.uid).catch(() => null);
              if (privInfo?.phoneNumber) {
                setUserPhone(privInfo.phoneNumber);
              }
              const dest = returnDestinationRef.current;
              setAuthPromptReason(null);
              setActiveTab(dest.tab === 'auth' ? 'all' : dest.tab);
              if (dest.topicId) {
                setSelectedTopicId(dest.topicId);
              }
              showToast(
                isNewUser
                  ? tr(
                      'Akaunti yako imesajiliwa kikamilifu! Karibu Malosha Forums.',
                      'Your account has been created! Welcome to Malosha Forums.'
                    )
                  : tr(
                      'Karibu Malosha Forums! Umeingia kikamilifu.',
                      'Welcome to Malosha Forums! You are signed in.'
                    )
              );
            }}
          />
        ) : activeTab === 'safety' ? (
          <SafetyGuidelinesView
            userUid={user?.uid || null}
            userEmail={user?.email || null}
            userPhone={userPhone}
            userProfile={userProfile}
            isAdmin={isAdmin}
            isSuspended={isSuspended}
            myReports={reports}
            onSaveProfile={handleSaveProfile}
            onSignIn={() => handleSignIn()}
            onUpdateReportStatus={async (id, status) => {
              await updateReportStatus(id, status);
              showToast(tr('Hali ya ripoti imesasishwa.', 'Report status updated.'));
            }}
            onOpenTopic={(topicId) => {
              setSelectedTopicId(topicId);
            }}
            onToast={showToast}
          />
        ) : activeTab === 'chat' ? (
          <ForumChatView
            messages={chatMessages}
            loading={loadingChat}
            notes={mchartNotes}
            loadingNotes={loadingNotes}
            unreadNotesCount={unreadNotesCount}
            readNoteIds={readNoteIds}
            onMarkNoteRead={markNoteRead}
            onClearedAllChats={() => setChatMessages([])}
            subTab={mchartSubTab}
            onChangeSubTab={setMchartSubTab}
            user={user}
            userDisplayName={userProfile?.displayName || user?.displayName || 'Mwanachama'}
            userPhoto={userProfile?.photoURL || user?.photoURL || ''}
            isAdmin={isAdmin}
            isSuspended={isSuspended}
            onSignIn={handleSignIn}
            onToast={showToast}
            onRequestConfirm={(opts) => setConfirmState(opts)}
          />
        ) : (
          <TopicList
            topics={topics}
            loading={loadingTopics}
            activeTab={activeTab}
            onSelectTab={handleSelectTab}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            sortMode={sortMode}
            onChangeSort={setSortMode}
            searchQuery={searchQuery}
            onChangeSearch={setSearchQuery}
            onlyMine={onlyMine}
            onToggleOnlyMine={() => setOnlyMine((prev) => !prev)}
            userUid={user?.uid || null}
            userDisplayName={userProfile?.displayName || user?.displayName || 'Mwanachama'}
            userPhoto={userProfile?.photoURL || user?.photoURL || ''}
            isAdmin={isAdmin}
            isSuspended={isSuspended}
            votedTopicIds={votedTopicIds}
            onToggleVote={handleToggleTopicVote}
            onShareTopic={(t) => {
              void shareTopic(t, (msg) => showToast(msg), lang);
            }}
            onOpenTopic={openTopicFromFeed}
            onOpenComposer={handleOpenNewTopic}
            onCreateKijiweniPost={handleCreateKijiweniPost}
            onCreateFursaPost={handleCreateFursaPost}
            onCreateMakalaPost={handleCreateMakalaPost}
            inlineExpandRequest={inlineExpandRequest}
            onEditTopic={(t) => {
              if (blockIfSuspended()) return;
              setEditingTopic(t);
              setComposerOpen(true);
            }}
            onDeleteTopic={handleDeleteTopic}
            onOpenReport={(targetType, targetId, topicId) => {
              if (blockIfSuspended()) return;
              setReportTarget({
                targetType,
                targetId,
                topicId,
              });
            }}
            onSignIn={handleSignIn}
            onToast={showToast}
            onRequestConfirm={(opts) => setConfirmState(opts)}
            onSeedStarterTopics={handleSeedStarterTopics}
            seeding={seeding}
            onVisibleTopicIdsChange={setVisibleTopicIds}
          />
        )}
      </main>

      {activeTab !== 'chat' && (
        <footer className="border-t border-slate-200 bg-white py-6 pb-20 md:pb-6">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-xs text-slate-500 sm:flex-row sm:px-6">
            <p>
              © {new Date().getFullYear()} Malosha Forums. Kijiweni ·{' '}
              {tr('Fursa', 'Opportunities')} · {tr('Makala', 'Articles')} · Mchart ·{' '}
              {tr('Zilizovuma', 'Trending')}.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-5">
              <button
                type="button"
                onClick={() => handleSelectTab('kijiweni')}
                className="hover:text-slate-900 hover:underline"
              >
                Kijiweni
              </button>
              <button
                type="button"
                onClick={() => handleSelectTab('fursa')}
                className="hover:text-slate-900 hover:underline"
              >
                {tr('Fursa', 'Opportunities')}
              </button>
              <button
                type="button"
                onClick={() => handleSelectTab('makala')}
                className="hover:text-slate-900 hover:underline"
              >
                {tr('Makala', 'Articles')}
              </button>
              <button
                type="button"
                onClick={() => handleSelectTab('chat')}
                className="hover:text-slate-900 hover:underline"
              >
                Mchart
              </button>
              <button
                type="button"
                onClick={() => handleSelectTab('safety')}
                className="hover:text-slate-900 hover:underline"
              >
                {tr('Kanuni za Usalama', 'Safety Guidelines')}
              </button>
            </div>
          </div>
        </footer>
      )}

      <MobileBottomNav
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        unreadChatCount={unreadChatCount + unreadNotesCount}
      />

      {activeTab !== 'chat' && (
        <FloatingScrollButton resetKey={`${activeTab}:${selectedTopicId || ''}`} />
      )}

      {/* Modals */}
      <TopicComposerModal
        isOpen={composerOpen}
        editingTopic={editingTopic}
        defaultCategory={composerDefaultCategory}
        onClose={() => setComposerOpen(false)}
        onSubmit={handleSaveTopic}
      />

      <ReportModal
        isOpen={reportTarget !== null}
        targetType={reportTarget?.targetType || 'topic'}
        onClose={() => setReportTarget(null)}
        onSubmit={handleSubmitReport}
      />

      <ConfirmDialog
        isOpen={confirmState !== null}
        title={confirmState?.title || ''}
        message={confirmState?.message || ''}
        confirmLabel={confirmState?.confirmLabel || 'Thibitisha'}
        destructive={confirmState?.destructive}
        onCancel={() => setConfirmState(null)}
        onConfirm={async () => {
          if (confirmState) {
            const fn = confirmState.action;
            setConfirmState(null);
            await fn();
          }
        }}
      />

      <PWAInstallBanner
        isInstalled={pwa.isInstalled}
        isInstallable={pwa.isInstallable}
        isIOS={pwa.isIOS}
        isMobile={pwa.isMobile}
        isDismissed={pwa.isDismissed}
        installing={pwa.installing}
        splashReady={appReady}
        externalGuideOpen={installGuideOpen}
        onCloseExternalGuide={() => setInstallGuideOpen(false)}
        onInstall={pwa.install}
        onDismiss={pwa.dismissPrompt}
        onToast={showToast}
      />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed right-4 bottom-20 z-50 max-w-sm rounded-lg border px-4 py-3 text-sm font-medium shadow-lg md:bottom-4 ${
            toast.kind === 'error'
              ? 'border-red-200 bg-red-50 text-red-900'
              : 'border-slate-200 bg-[#163A5F] text-white'
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <ErrorBoundary>
        <UserBadgesProvider>
          <ForumShell />
        </UserBadgesProvider>
      </ErrorBoundary>
    </LanguageProvider>
  );
}
