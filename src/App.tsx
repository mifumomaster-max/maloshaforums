import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lock, Plus } from 'lucide-react';
import {
  User,
  onAuthStateChanged,
  signOut,
  updateProfile,
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
  ContentRetentionPeriod,
  ContentRetentionSettings,
  DirectChatThread,
  MchartNote,
  MchartStatus,
  MemberDirectoryCandidate,
  NavTab,
  NavUnreadCounts,
  Poll,
  PollBallot,
  PresenceArea,
  PrimaryBoard,
  Report,
  ReportReason,
  SharedMediaPayload,
  SortMode,
  StatusPrivacyMode,
  Topic,
  TopicCategory,
  UserNotification,
  UserNotificationType,
  UserProfile,
  VideoPost,
  findCommunityRule,
  normalizeAccountStatus,
  normalizeBoardCategory,
  normalizeVerificationBadge,
} from './types';
import {
  DEFAULT_CONTENT_RETENTION_SETTINGS,
  READ_NOTIFICATION_TTL_MS,
  checkUserVideoLikesBatch,
  cleanupExpiredReadNotifications,
  createTopic,
  deleteTopic,
  editTopic,
  ensureDirectChatThread,
  getPrivateUserInfo,
  markAllUserNotificationsRead,
  markUserNotificationRead,
  runKijiweniRetentionCleanup,
  runVideoRetentionCleanup,
  seedStarterTopics,
  submitReport,
  subscribeContentRetentionSettings,
  subscribeSiteNavSettings,
  syncUserProfile,
  toggleTopicPin,
  toggleTopicVote,
  updateContentRetentionSettings,
  updateHideVideoTabForUsers,
  updatePrivatePhoneNumber,
  updateReportStatus,
  updateTopicStatus,
  updateUserProfile,
  updateUserProfilePhoto,
  writeUserPresence,
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
import { UserPresenceProvider } from './context/UserPresenceContext';
import { AppLaunchLoader } from './components/AppLaunchLoader';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import { OfflineIndicator } from './components/OfflineIndicator';
import { FloatingScrollButton } from './components/FloatingScrollButton';
import { AuthView } from './components/AuthView';
import { ForumChatView, MchartSubTab } from './components/ForumChatView';
import { MemberProfileModal } from './components/MemberProfileModal';
import { VideosFeedView } from './components/VideosFeedView';
import { VotingPollsView } from './components/VotingPollsView';
import { usePWAInstall } from './hooks/usePWAInstall';
import {
  fetchUserBallotsForPolls,
  isPollEffectivelyOpen,
  subscribePolls,
} from './services/pollService';
import {
  dismissPhoneNotifications,
  sendPhoneNotification,
  updateAppBadgeCount,
} from './services/notificationService';

const CHAT_LAST_SEEN_KEY = 'malosha_chat_last_seen_ms_v1';
const NOTES_LAST_SEEN_KEY = 'malosha_notes_last_seen_ms_v1';
const READ_NOTE_IDS_KEY = 'malosha_read_note_ids_v1';
const BOARD_LAST_SEEN_KEY = 'malosha_board_last_seen_v1';
const READ_TOPIC_IDS_KEY = 'malosha_read_topic_ids_v1';
const VIDEO_LAST_SEEN_KEY = 'malosha_videos_last_seen_ms_v1';
const VOTES_LAST_SEEN_KEY = 'malosha_votes_last_seen_ms_v1';
const ADMIN_SIGNUP_LAST_SEEN_KEY = 'malosha_admin_signup_last_seen_v1';
const MPOLL_BG_THEME_KEY = 'malosha_mpoll_bg_theme_v1';

function getStartOfTodayBoundaryMs(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime() - 1;
}

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
  const [videos, setVideos] = useState<VideoPost[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [likedVideoIds, setLikedVideoIds] = useState<Set<string>>(new Set());
  const [videosLastSeenMs, setVideosLastSeenMs] = useState<number>(() => {
    const defaultCutoff = Date.now() - 14 * 86_400_000;
    if (typeof window === 'undefined') return defaultCutoff;
    try {
      const saved = Number(window.localStorage.getItem(VIDEO_LAST_SEEN_KEY) || 0);
      return Number.isFinite(saved) && saved > 0 ? saved : defaultCutoff;
    } catch {
      return defaultCutoff;
    }
  });
  const [votesLastSeenMs, setVotesLastSeenMs] = useState<number>(() => {
    const defaultCutoff = Date.now() - 14 * 86_400_000;
    if (typeof window === 'undefined') return defaultCutoff;
    try {
      const saved = Number(window.localStorage.getItem(VOTES_LAST_SEEN_KEY) || 0);
      return Number.isFinite(saved) && saved > 0 ? saved : defaultCutoff;
    } catch {
      return defaultCutoff;
    }
  });
  const [mpollBgTheme, setMpollBgTheme] = useState<'darkblue' | 'light'>(() => {
    if (typeof window === 'undefined') return 'darkblue';
    try {
      const saved = window.localStorage.getItem(MPOLL_BG_THEME_KEY);
      return saved === 'light' ? 'light' : 'darkblue';
    } catch {
      return 'darkblue';
    }
  });

  const handleToggleMpollBgTheme = useCallback(() => {
    setMpollBgTheme((prev) => {
      const next = prev === 'darkblue' ? 'light' : 'darkblue';
      try {
        window.localStorage.setItem(MPOLL_BG_THEME_KEY, next);
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);
  const [reports, setReports] = useState<Report[]>([]);
  const [userNotifications, setUserNotifications] = useState<UserNotification[]>([]);
  const [hideVideoTabForUsers, setHideVideoTabForUsers] = useState(false);
  const [retentionSettings, setRetentionSettings] = useState<ContentRetentionSettings>(() => ({
    ...DEFAULT_CONTENT_RETENTION_SETTINGS,
  }));
  const [retentionProgress, setRetentionProgress] = useState<{
    runningKijiweni: boolean;
    runningVideo: boolean;
    kijiweniDeleted: number;
    kijiweniTotal: number;
    videoDeleted: number;
    videoTotal: number;
    currentLabel: string;
  }>({
    runningKijiweni: false,
    runningVideo: false,
    kijiweniDeleted: 0,
    kijiweniTotal: 0,
    videoDeleted: 0,
    videoTotal: 0,
    currentLabel: '',
  });
  const [adminRecentSignups, setAdminRecentSignups] = useState<UserProfile[]>([]);
  const [adminSignupLastSeenMs, setAdminSignupLastSeenMs] = useState<number>(() => {
    const fallback = Date.now() - 86_400_000;
    if (typeof window === 'undefined') return fallback;
    try {
      const saved = Number(window.localStorage.getItem(ADMIN_SIGNUP_LAST_SEEN_KEY) || 0);
      return Number.isFinite(saved) && saved > 0 ? saved : fallback;
    } catch {
      return fallback;
    }
  });
  const [openAdminMembersSignal, setOpenAdminMembersSignal] = useState(0);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loadingChat, setLoadingChat] = useState(true);
  const [todayKey, setTodayKey] = useState<string>(() => getLocalDateKey());
  const [lastSeenChatMs, setLastSeenChatMs] = useState<number>(() => {
    if (typeof window === 'undefined') return getStartOfTodayBoundaryMs();
    try {
      const saved = Number(window.localStorage.getItem(CHAT_LAST_SEEN_KEY) || 0);
      return Number.isFinite(saved) && saved > 0 ? saved : getStartOfTodayBoundaryMs();
    } catch {
      return getStartOfTodayBoundaryMs();
    }
  });

  const [boardLastSeen, setBoardLastSeen] = useState<Record<PrimaryBoard, number>>(() => {
    const defaultCutoff = Date.now() - 14 * 86_400_000;
    const fallback: Record<PrimaryBoard, number> = {
      Kijiweni: defaultCutoff,
      Fursa: defaultCutoff,
      Makala: defaultCutoff,
    };
    if (typeof window === 'undefined') return fallback;
    try {
      const raw = window.localStorage.getItem(BOARD_LAST_SEEN_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Partial<Record<PrimaryBoard, unknown>>;
      return {
        Kijiweni:
          typeof parsed.Kijiweni === 'number' && Number.isFinite(parsed.Kijiweni)
            ? parsed.Kijiweni
            : defaultCutoff,
        Fursa:
          typeof parsed.Fursa === 'number' && Number.isFinite(parsed.Fursa)
            ? parsed.Fursa
            : defaultCutoff,
        Makala:
          typeof parsed.Makala === 'number' && Number.isFinite(parsed.Makala)
            ? parsed.Makala
            : defaultCutoff,
      };
    } catch {
      return fallback;
    }
  });

  const [readTopicIds, setReadTopicIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const raw = window.localStorage.getItem(READ_TOPIC_IDS_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? new Set(parsed.filter((x): x is string => typeof x === 'string'))
        : new Set();
    } catch {
      return new Set();
    }
  });

  const [mchartNotes, setMchartNotes] = useState<MchartNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [directChats, setDirectChats] = useState<DirectChatThread[]>([]);
  const [memberDirectoryList, setMemberDirectoryList] = useState<MemberDirectoryCandidate[]>([]);
  const [activeDirectChatId, setActiveDirectChatId] = useState<string | null>(null);
  const [mchartStatuses, setMchartStatuses] = useState<MchartStatus[]>([]);
  const [loadingStatuses, setLoadingStatuses] = useState(true);
  const [sharedKijiweniPayload, setSharedKijiweniPayload] =
    useState<SharedMediaPayload | null>(null);

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

  const [polls, setPolls] = useState<Poll[]>([]);
  const [loadingPolls, setLoadingPolls] = useState(true);
  const [userPollBallots, setUserPollBallots] = useState<Record<string, PollBallot>>({});
  const [selectedPollId, setSelectedPollId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const shortParam = params.get('p') || params.get('poll');
    if (shortParam && shortParam.trim()) return shortParam.trim();
    const pathMatch = window.location.pathname.match(/^\/p\/([a-zA-Z0-9_-]+)\/?$/);
    return pathMatch ? pathMatch[1] : null;
  });

  const [activeTab, setActiveTab] = useState<NavTab>(() => {
    if (typeof window === 'undefined') return 'kijiweni';
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    const isShortPath = /^\/p\/[a-zA-Z0-9_-]+\/?$/.test(window.location.pathname);
    if (tabParam === 'mchart' || tabParam === 'chat') return 'chat';
    if (tabParam === 'video' || tabParam === 'videos') return 'video';
    if (tabParam === 'fursa') return 'fursa';
    if (tabParam === 'makala') return 'makala';
    if (
      tabParam === 'mpoll' ||
      tabParam === 'kura' ||
      tabParam === 'votes' ||
      params.has('p') ||
      params.has('poll') ||
      isShortPath
    ) {
      return 'votes';
    }
    return 'kijiweni';
  });
  const [initialVideoId, setInitialVideoId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const raw = new URLSearchParams(window.location.search).get('v');
    return raw && raw.trim() ? raw.trim() : null;
  });
  const [mchartSubTab, setMchartSubTab] = useState<MchartSubTab>(() => {
    if (typeof window === 'undefined') return 'direct';
    const viewParam = new URLSearchParams(window.location.search).get('view');
    if (viewParam === 'notes') return 'notes';
    if (viewParam === 'messages' || viewParam === 'group') return 'messages';
    return 'direct';
  });
  const [authPromptReason, setAuthPromptReason] = useState<AuthPromptReason | null>(null);
  const returnDestinationRef = useRef<{ tab: NavTab; topicId: string | null; pollId: string | null }>({
    tab: 'kijiweni',
    topicId: null,
    pollId: null,
  });
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const raw = new URLSearchParams(window.location.search).get('mada');
    return raw && raw.trim() ? raw.trim() : null;
  });
  const [selectedCategory, setSelectedCategory] = useState<TopicCategory | 'all'>(() => {
    if (typeof window === 'undefined') return 'Kijiweni';
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    const isShortPath = /^\/p\/[a-zA-Z0-9_-]+\/?$/.test(window.location.pathname);
    if (tabParam === 'fursa') return 'Fursa';
    if (tabParam === 'makala') return 'Makala';
    if (
      tabParam === 'mchart' ||
      tabParam === 'chat' ||
      tabParam === 'video' ||
      tabParam === 'videos' ||
      tabParam === 'mpoll' ||
      tabParam === 'kura' ||
      tabParam === 'votes' ||
      params.has('p') ||
      params.has('poll') ||
      isShortPath
    ) {
      return 'all';
    }
    return 'Kijiweni';
  });
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
  const [profileModalTarget, setProfileModalTarget] = useState<{
    uid: string;
    displayName: string;
    photoURL?: string;
  } | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [installGuideOpen, setInstallGuideOpen] = useState(false);
  const [visibleTopicIds, setVisibleTopicIds] = useState<string[]>([]);
  const initialTopicsLoadedRef = useRef(false);
  const knownTopicIdsRef = useRef<Set<string>>(new Set());
  const initialVideosLoadedRef = useRef(false);
  const knownVideoIdsRef = useRef<Set<string>>(new Set());
  const initialChatLoadedRef = useRef(false);
  const knownChatIdsRef = useRef<Set<string>>(new Set());
  const initialNotesLoadedRef = useRef(false);
  const knownNoteIdsRef = useRef<Set<string>>(new Set());
  const initialDmLoadedRef = useRef(false);
  const lastDmUpdateByThreadRef = useRef<Record<string, number>>({});
  const initialUserNotifsLoadedRef = useRef(false);
  const knownUserNotifIdsRef = useRef<Set<string>>(new Set());
  const activeTabRef = useRef<NavTab>(activeTab);
  const mchartSubTabRef = useRef<MchartSubTab>(mchartSubTab);
  const activeDirectChatIdRef = useRef<string | null>(activeDirectChatId);
  const selectedTopicIdRef = useRef<string | null>(selectedTopicId);
  const checkedVoteKeysRef = useRef<Set<string>>(new Set());
  const feedScrollYRef = useRef<number>(0);
  const retentionSettingsRef = useRef<ContentRetentionSettings>(retentionSettings);
  const isAdminRef = useRef(false);
  const kijiweniCleanupActiveRef = useRef(false);
  const videoCleanupActiveRef = useRef(false);
  const cleaningNotifIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    mchartSubTabRef.current = mchartSubTab;
  }, [mchartSubTab]);

  useEffect(() => {
    activeDirectChatIdRef.current = activeDirectChatId;
  }, [activeDirectChatId]);

  useEffect(() => {
    selectedTopicIdRef.current = selectedTopicId;
  }, [selectedTopicId]);

  useEffect(() => {
    retentionSettingsRef.current = retentionSettings;
  }, [retentionSettings]);

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
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      if (currentUser) {
        void (async () => {
          try {
            const [, adminSnap, privInfo] = await Promise.all([
              syncUserProfile(currentUser).catch((err) => {
                console.warn('Background profile sync warning:', err);
              }),
              getDoc(doc(db, 'admins', currentUser.uid)).catch(() => null),
              getPrivateUserInfo(currentUser.uid).catch(() => null),
            ]);
            setIsAdminDoc(Boolean(adminSnap && adminSnap.exists()));
            if (privInfo?.phoneNumber) {
              setUserPhone(privInfo.phoneNumber);
            }
          } catch (err) {
            console.error(err);
          }
        })();
      } else {
        setUserProfile(null);
        setUserPhone('');
        setIsAdminDoc(false);
      }
    });
    return () => unsub();
  }, []);

  const isAdmin = useMemo(() => {
    if (!user) return false;
    return (user.email === ADMIN_EMAIL && user.emailVerified) || isAdminDoc;
  }, [user, isAdminDoc]);

  useEffect(() => {
    isAdminRef.current = isAdmin;
  }, [isAdmin]);

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
          suspendedRuleNumber: Number(d.suspendedRuleNumber || 0),
          topicsCount: Number(d.topicsCount || 0),
          repliesCount: Number(d.repliesCount || 0),
          followersCount: Number(d.followersCount || 0),
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

  // Real-time Malosha Reels short videos & photo-music feed listener (plus signed-in author's private posts)
  useEffect(() => {
    if (!authReady) return;
    setLoadingVideos(true);
    const path = 'videos';
    const mapVideoDoc = (d: { id: string; data: () => Record<string, unknown> }): VideoPost => {
      const data = d.data();
      const mediaType: VideoPost['mediaType'] = data.mediaType === 'photo' ? 'photo' : 'video';
      return {
        id: d.id,
        authorId: String(data.authorId || ''),
        authorName: String(data.authorName || 'Mwanachama'),
        authorPhoto: String(data.authorPhoto || ''),
        mediaType,
        videoUrl: String(data.videoUrl || ''),
        photoUrls: Array.isArray(data.photoUrls) ? data.photoUrls.map(String).filter(Boolean) : [],
        audioUrl: typeof data.audioUrl === 'string' ? data.audioUrl : '',
        cloudinaryPublicId: String(data.cloudinaryPublicId || ''),
        thumbnailUrl: String(data.thumbnailUrl || ''),
        caption: String(data.caption || ''),
        soundName: String(data.soundName || 'Sauti Halisi'),
        tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
        durationSec: Number(data.durationSec || 0),
        likesCount: Number(data.likesCount || 0),
        commentsCount: Number(data.commentsCount || 0),
        sharesCount: Number(data.sharesCount || 0),
        isArchived: Boolean(data.isArchived),
        allowComments: data.allowComments !== false,
        allowDownload: data.allowDownload !== false,
        allowLikes: data.allowLikes !== false,
        showLikeCount: data.showLikeCount !== false,
        autoReplyEnabled: Boolean(data.autoReplyEnabled),
        autoReplyMessage: typeof data.autoReplyMessage === 'string' ? data.autoReplyMessage : '',
        autoReplyTrigger: data.autoReplyTrigger === 'keyword' ? 'keyword' : 'all',
        autoReplyKeyword: typeof data.autoReplyKeyword === 'string' ? data.autoReplyKeyword : '',
        createdAt: (data.createdAt as Timestamp | null) || null,
        updatedAt: (data.updatedAt as Timestamp | null) || null,
      };
    };

    let publicList: VideoPost[] = [];
    let ownPrivateList: VideoPost[] = [];

    const mergeLists = () => {
      const byId = new Map<string, VideoPost>();
      for (const item of publicList) byId.set(item.id, item);
      for (const item of ownPrivateList) byId.set(item.id, item);
      const merged = Array.from(byId.values()).sort((a, b) => {
        const msA = a.createdAt ? a.createdAt.toMillis() : Date.now();
        const msB = b.createdAt ? b.createdAt.toMillis() : Date.now();
        return msB - msA;
      });
      setVideos(merged);
      setLoadingVideos(false);
    };

    const qPublic = query(
      collection(db, path),
      where('isArchived', '==', false),
      orderBy('createdAt', 'desc'),
      limit(60)
    );

    const unsubPublic = onSnapshot(
      qPublic,
      (snapshot) => {
        publicList = snapshot.docs.map((d) => mapVideoDoc(d));
        mergeLists();
      },
      (error) => {
        setLoadingVideos(false);
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    let unsubOwn: (() => void) | null = null;
    if (user?.uid) {
      const qOwn = query(
        collection(db, path),
        where('authorId', '==', user.uid),
        limit(40)
      );
      unsubOwn = onSnapshot(
        qOwn,
        (snapshot) => {
          ownPrivateList = snapshot.docs.map((d) => mapVideoDoc(d));
          mergeLists();
        },
        () => {
          // Non-fatal fallback
        }
      );
    }

    return () => {
      unsubPublic();
      if (unsubOwn) unsubOwn();
    };
  }, [authReady, user?.uid]);

  // Sync user's liked videos
  useEffect(() => {
    if (!authReady || !user || videos.length === 0) {
      setLikedVideoIds(new Set());
      return;
    }
    let cancelled = false;
    void checkUserVideoLikesBatch(
      videos.map((v) => v.id),
      user.uid
    ).then((res) => {
      if (cancelled) return;
      const next = new Set<string>();
      Object.entries(res).forEach(([vid, ok]) => {
        if (ok) next.add(vid);
      });
      setLikedVideoIds(next);
    });
    return () => {
      cancelled = true;
    };
  }, [authReady, user, videos]);

  // Real-time community polls listener (open & closed public polls + drafts for owner)
  useEffect(() => {
    if (!authReady) return;
    setLoadingPolls(true);
    const unsub = subscribePolls(
      isAdmin,
      (list) => {
        setPolls(list);
        setLoadingPolls(false);
      },
      () => {
        setLoadingPolls(false);
      }
    );
    return () => unsub();
  }, [authReady, isAdmin]);

  // Sync current user's ballots across loaded polls
  useEffect(() => {
    if (!authReady || !user || polls.length === 0) {
      setUserPollBallots({});
      return;
    }
    let cancelled = false;
    void fetchUserBallotsForPolls(
      polls.map((p) => p.id),
      user.uid
    ).then((res) => {
      if (!cancelled) {
        setUserPollBallots(res);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [authReady, user, polls]);

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

  // Real-time community group chat listener (signed-in members only, strictly TODAY's messages)
  useEffect(() => {
    if (!authReady || !user) {
      setChatMessages([]);
      setLoadingChat(false);
      return;
    }
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

  // Real-time Mchart Notes listener (signed-in members only)
  useEffect(() => {
    if (!authReady || !user) {
      setMchartNotes([]);
      setLoadingNotes(false);
      return;
    }
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

  const currentlyViewedBoard: PrimaryBoard | null = useMemo(() => {
    if (selectedTopicId) return null;
    if (activeTab === 'kijiweni') return 'Kijiweni';
    if (activeTab === 'fursa') return 'Fursa';
    if (activeTab === 'makala') return 'Makala';
    if (activeTab === 'all' && selectedCategory !== 'all') {
      return normalizeBoardCategory(selectedCategory);
    }
    return null;
  }, [activeTab, selectedCategory, selectedTopicId]);

  // Clear board unread badge immediately when user opens that section
  useEffect(() => {
    if (!currentlyViewedBoard) return;
    let latestBoardMs = Date.now();
    topics.forEach((t) => {
      if (normalizeBoardCategory(t.category) !== currentlyViewedBoard) return;
      const ms = t.createdAt ? t.createdAt.toMillis() : 0;
      if (ms > latestBoardMs) latestBoardMs = ms;
    });
    setBoardLastSeen((prev) => {
      if (prev[currentlyViewedBoard] >= latestBoardMs) return prev;
      const next = { ...prev, [currentlyViewedBoard]: latestBoardMs + 500 };
      try {
        window.localStorage.setItem(BOARD_LAST_SEEN_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, [currentlyViewedBoard, topics]);

  const markTopicRead = useCallback((topicId: string) => {
    if (!topicId) return;
    setReadTopicIds((prev) => {
      if (prev.has(topicId)) return prev;
      const next = new Set(prev);
      next.add(topicId);
      try {
        window.localStorage.setItem(
          READ_TOPIC_IDS_KEY,
          JSON.stringify(Array.from(next).slice(-300))
        );
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);

  // Real-time Private 1-on-1 Direct Chat threads listener (strictly participant-only)
  useEffect(() => {
    initialDmLoadedRef.current = false;
    lastDmUpdateByThreadRef.current = {};

    if (!authReady || !user) {
      setDirectChats([]);
      setActiveDirectChatId(null);
      return;
    }

    const path = 'direct_chats';
    const q = query(
      collection(db, path),
      where('participants', 'array-contains', user.uid),
      limit(80)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: DirectChatThread[] = snapshot.docs.map((d) => {
          const data = d.data();
          const pA = String(data.participantA || '');
          const pB = String(data.participantB || '');
          return {
            chatId: d.id,
            participantA: pA,
            participantB: pB,
            participants: [pA, pB],
            participantAName: String(data.participantAName || 'Mwanachama'),
            participantAPhoto: String(data.participantAPhoto || ''),
            participantBName: String(data.participantBName || 'Mwanachama'),
            participantBPhoto: String(data.participantBPhoto || ''),
            lastMessageText: String(data.lastMessageText || ''),
            lastSenderId: String(data.lastSenderId || ''),
            lastMessageAt: data.lastMessageAt || null,
            unreadCountA: Number(data.unreadCountA || 0),
            unreadCountB: Number(data.unreadCountB || 0),
            lastReadAtA: data.lastReadAtA || null,
            lastReadAtB: data.lastReadAtB || null,
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
          };
        });

        setDirectChats(list);

        if (!initialDmLoadedRef.current) {
          const map: Record<string, number> = {};
          list.forEach((t) => {
            map[t.chatId] = t.lastMessageAt ? t.lastMessageAt.toMillis() : 0;
          });
          lastDmUpdateByThreadRef.current = map;
          initialDmLoadedRef.current = true;
          return;
        }

        // Notify user if another participant sent a newer DM while not viewing that exact DM room
        for (const t of list) {
          const msgMs = t.lastMessageAt ? t.lastMessageAt.toMillis() : 0;
          const prevMs = lastDmUpdateByThreadRef.current[t.chatId] || 0;
          if (msgMs > prevMs) {
            lastDmUpdateByThreadRef.current[t.chatId] = msgMs;
            if (t.lastSenderId && t.lastSenderId !== user.uid && t.lastMessageText) {
              const isViewingThisDm =
                activeTabRef.current === 'chat' &&
                mchartSubTabRef.current === 'direct' &&
                activeDirectChatIdRef.current === t.chatId &&
                !selectedTopicIdRef.current &&
                typeof document !== 'undefined' &&
                !document.hidden;

              if (!isViewingThisDm) {
                const senderName =
                  t.lastSenderId === t.participantA ? t.participantAName : t.participantBName;
                const alertTitle = `${senderName} · ${tr('Ujumbe Binafsi', 'Private Message')}`;
                if (typeof document !== 'undefined' && !document.hidden) {
                  showToast(`${alertTitle}: ${t.lastMessageText.slice(0, 75)}`);
                }
                void sendPhoneNotification({
                  title: alertTitle,
                  body: t.lastMessageText.slice(0, 140),
                  url: '/?tab=mchart&view=direct',
                  tag: `malosha-dm-${t.chatId}`,
                });
              }
            }
          }
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    return () => unsub();
  }, [authReady, user, showToast, tr]);

  // Real-time 24h Mchart Photo Statuses (Members + Personal audience + Author's own statuses)
  useEffect(() => {
    if (!authReady || !user) {
      setMchartStatuses([]);
      setLoadingStatuses(false);
      return;
    }

    setLoadingStatuses(true);
    const path = 'mchart_statuses';
    let membersList: MchartStatus[] = [];
    let targetedList: MchartStatus[] = [];
    let ownList: MchartStatus[] = [];

    const mapDoc = (d: { id: string; data: () => Record<string, unknown> }): MchartStatus => {
      const data = d.data();
      const privacy: StatusPrivacyMode = data.privacy === 'selected' ? 'selected' : 'members';
      const mediaType: MchartStatus['mediaType'] =
        data.mediaType === 'video' ? 'video' : 'image';
      return {
        id: d.id,
        authorId: String(data.authorId || ''),
        authorName: String(data.authorName || 'Mwanachama'),
        authorPhoto: String(data.authorPhoto || ''),
        mediaType,
        imageUrl: String(data.imageUrl || ''),
        videoUrl: typeof data.videoUrl === 'string' ? data.videoUrl : '',
        durationSec: Number(data.durationSec || 0),
        caption: String(data.caption || ''),
        privacy,
        allowedViewerIds: Array.isArray(data.allowedViewerIds)
          ? data.allowedViewerIds.map(String)
          : [],
        audienceTokens: Array.isArray(data.audienceTokens)
          ? data.audienceTokens.map(String)
          : [],
        viewsCount: Number(data.viewsCount || 0),
        createdAt: (data.createdAt as Timestamp) || null,
        expiresAt: (data.expiresAt as Timestamp) || null,
      };
    };

    const mergeAndSet = () => {
      const byId = new Map<string, MchartStatus>();
      const now = Date.now();
      [...membersList, ...targetedList, ...ownList].forEach((s) => {
        if (!s.expiresAt || s.expiresAt.toMillis() > now) {
          byId.set(s.id, s);
        }
      });
      setMchartStatuses(Array.from(byId.values()));
      setLoadingStatuses(false);
    };

    const qMembers = query(
      collection(db, path),
      where('audienceTokens', 'array-contains', '__MEMBERS__'),
      limit(100)
    );
    const qTargeted = query(
      collection(db, path),
      where('audienceTokens', 'array-contains', user.uid),
      limit(100)
    );
    const qOwn = query(
      collection(db, path),
      where('authorId', '==', user.uid),
      limit(50)
    );

    const unsubMembers = onSnapshot(
      qMembers,
      (snap) => {
        membersList = snap.docs.map((docSnap) => mapDoc(docSnap));
        mergeAndSet();
      },
      (error) => {
        setLoadingStatuses(false);
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    const unsubTargeted = onSnapshot(
      qTargeted,
      (snap) => {
        targetedList = snap.docs.map((docSnap) => mapDoc(docSnap));
        mergeAndSet();
      },
      (error) => {
        setLoadingStatuses(false);
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    const unsubOwn = onSnapshot(
      qOwn,
      (snap) => {
        ownList = snap.docs.map((docSnap) => mapDoc(docSnap));
        mergeAndSet();
      },
      (error) => {
        setLoadingStatuses(false);
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    return () => {
      unsubMembers();
      unsubTargeted();
      unsubOwn();
    };
  }, [authReady, user]);

  // Read shared photo from OS Share Sheet (Service Worker Cache) on launch or focus
  useEffect(() => {
    if (typeof window === 'undefined' || !('caches' in window)) return;

    const consumeShareTargetCache = async () => {
      try {
        const url = new URL(window.location.href);
        const hasFlag = url.searchParams.get('share_target') === '1';
        const cache = await window.caches.open('malosha-share-target-v1');
        const imgRes = await cache.match('/_malosha_shared_image');
        const metaRes = await cache.match('/_malosha_shared_meta');

        if (!imgRes && !metaRes) {
          if (hasFlag) {
            url.searchParams.delete('share_target');
            window.history.replaceState({}, '', url.toString());
          }
          return;
        }

        let sharedFile: File | null = null;
        if (imgRes) {
          const blob = await imgRes.blob();
          if (blob.size > 0) {
            const rawName = imgRes.headers.get('X-Malosha-Filename');
            const fileName = rawName ? decodeURIComponent(rawName) : 'picha-ya-simu.jpg';
            const mimeType = imgRes.headers.get('Content-Type') || blob.type || 'image/jpeg';
            sharedFile = new File([blob], fileName, { type: mimeType });
          }
          await cache.delete('/_malosha_shared_image');
        }

        let sharedTitle = '';
        let sharedText = '';
        if (metaRes) {
          try {
            const meta = (await metaRes.json()) as {
              title?: string;
              text?: string;
              url?: string;
            };
            sharedTitle = typeof meta.title === 'string' ? meta.title : '';
            const textParts = [meta.text, meta.url].filter(
              (x): x is string => typeof x === 'string' && x.trim().length > 0
            );
            sharedText = textParts.join('\n').trim();
          } catch {
            // Ignore malformed meta
          }
          await cache.delete('/_malosha_shared_meta');
        }

        if (hasFlag) {
          url.searchParams.delete('share_target');
          window.history.replaceState({}, '', url.toString());
        }

        if (sharedFile || sharedTitle || sharedText) {
          setSelectedTopicId(null);
          setActiveTab('kijiweni');
          setSelectedCategory('Kijiweni');
          setSharedKijiweniPayload({
            id: Date.now(),
            file: sharedFile,
            title: sharedTitle,
            text: sharedText,
          });
        }
      } catch {
        // Ignore cache read failures
      }
    };

    void consumeShareTargetCache();

    const handleVisibleOrFocus = () => {
      if (document.visibilityState === 'visible') {
        void consumeShareTargetCache();
      }
    };
    window.addEventListener('focus', handleVisibleOrFocus);
    document.addEventListener('visibilitychange', handleVisibleOrFocus);
    return () => {
      window.removeEventListener('focus', handleVisibleOrFocus);
      document.removeEventListener('visibilitychange', handleVisibleOrFocus);
    };
  }, []);

  // Real-time Active Platform Member Directory listener (for Private Chat A-Z listing & search)
  useEffect(() => {
    if (!authReady || !user) {
      setMemberDirectoryList([]);
      return;
    }

    const path = 'member_directory';
    const q = query(
      collection(db, path),
      where('isActive', '==', true),
      limit(500)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: MemberDirectoryCandidate[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            uid: String(data.uid || d.id),
            displayName: String(data.displayName || 'Mwanachama'),
            photoURL: typeof data.photoURL === 'string' ? data.photoURL : '',
            verificationBadge: normalizeVerificationBadge(data.verificationBadge),
          };
        });
        setMemberDirectoryList(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    return () => unsub();
  }, [authReady, user]);

  // Clear video unread badge when user opens Video Reels
  useEffect(() => {
    if (activeTab !== 'video' || selectedTopicId) return;
    let latestMs = Date.now();
    videos.forEach((v) => {
      if (v.isArchived) return;
      const ms = v.createdAt ? v.createdAt.toMillis() : 0;
      if (ms > latestMs) latestMs = ms;
    });
    const nextMs = latestMs + 500;
    setVideosLastSeenMs((prev) => {
      if (prev >= nextMs) return prev;
      try {
        window.localStorage.setItem(VIDEO_LAST_SEEN_KEY, String(nextMs));
      } catch {
        // Ignore storage errors
      }
      return nextMs;
    });
  }, [activeTab, selectedTopicId, videos]);

  // Clear Mpoll notification badge permanently once user opens Mpoll until a newer poll arrives
  useEffect(() => {
    if (activeTab !== 'votes' || selectedTopicId) return;
    let latestMs = Date.now();
    polls.forEach((p) => {
      const ms = p.createdAt ? p.createdAt.toMillis() : 0;
      if (ms > latestMs) latestMs = ms;
    });
    const nextMs = latestMs + 500;
    setVotesLastSeenMs((prev) => {
      if (prev >= nextMs) return prev;
      try {
        window.localStorage.setItem(VOTES_LAST_SEEN_KEY, String(nextMs));
      } catch {
        // Ignore storage errors
      }
      return nextMs;
    });
  }, [activeTab, selectedTopicId, polls]);

  const memberDirectoryCandidates = useMemo<MemberDirectoryCandidate[]>(() => {
    const map = new Map<string, MemberDirectoryCandidate>();
    const addCandidate = (
      uid: string,
      name: string,
      photo: string,
      badge?: MemberDirectoryCandidate['verificationBadge']
    ) => {
      if (!uid || (user && uid === user.uid)) return;
      const existing = map.get(uid);
      if (!existing) {
        map.set(uid, {
          uid,
          displayName: name || 'Mwanachama',
          photoURL: photo || '',
          ...(badge && badge !== 'none' ? { verificationBadge: badge } : {}),
        });
      } else {
        if ((!existing.photoURL || existing.photoURL === '') && photo) {
          existing.photoURL = photo;
        }
        if (existing.displayName === 'Mwanachama' && name && name !== 'Mwanachama') {
          existing.displayName = name;
        }
        if ((!existing.verificationBadge || existing.verificationBadge === 'none') && badge && badge !== 'none') {
          existing.verificationBadge = badge;
        }
      }
    };

    memberDirectoryList.forEach((m) =>
      addCandidate(m.uid, m.displayName, m.photoURL, m.verificationBadge)
    );
    directChats.forEach((t) => {
      if (!user) return;
      const selfIsA = user.uid === t.participantA;
      addCandidate(
        selfIsA ? t.participantB : t.participantA,
        selfIsA ? t.participantBName : t.participantAName,
        selfIsA ? t.participantBPhoto : t.participantAPhoto
      );
    });
    chatMessages.forEach((m) => addCandidate(m.senderId, m.senderName, m.senderPhoto));
    topics.forEach((t) => addCandidate(t.authorId, t.authorName, t.authorPhoto));
    videos.forEach((v) => addCandidate(v.authorId, v.authorName, v.authorPhoto));

    return Array.from(map.values());
  }, [memberDirectoryList, directChats, chatMessages, topics, videos, user]);

  const unreadDirectCount = useMemo(() => {
    if (!user) return 0;
    return directChats.reduce((sum, t) => {
      if (
        activeTab === 'chat' &&
        mchartSubTab === 'direct' &&
        activeDirectChatId === t.chatId &&
        !selectedTopicId
      ) {
        return sum;
      }
      const count = user.uid === t.participantA ? t.unreadCountA : t.unreadCountB;
      return sum + (count > 0 ? count : 0);
    }, 0);
  }, [user, directChats, activeTab, mchartSubTab, activeDirectChatId, selectedTopicId]);

  const unreadCounts: NavUnreadCounts = useMemo(() => {
    const countBoard = (board: PrimaryBoard): number => {
      if (currentlyViewedBoard === board) return 0;
      const cutoff = boardLastSeen[board] || 0;
      return topics.filter((t) => {
        if (normalizeBoardCategory(t.category) !== board) return false;
        if (user?.uid && t.authorId === user.uid) return false;
        if (readTopicIds.has(t.id)) return false;
        const createdMs = t.createdAt ? t.createdAt.toMillis() : 0;
        return createdMs > cutoff;
      }).length;
    };

    const unreadVideoCount =
      activeTab === 'video' && !selectedTopicId
        ? 0
        : videos.filter((v) => {
            if (v.isArchived) return false;
            if (user?.uid && v.authorId === user.uid) return false;
            const ms = v.createdAt ? v.createdAt.toMillis() : 0;
            return ms > videosLastSeenMs;
          }).length;

    const unvotedOpenPollsCount =
      activeTab === 'votes' && !selectedTopicId
        ? 0
        : polls.filter((p) => {
            if (!isPollEffectivelyOpen(p)) return false;
            if (user?.uid && (userPollBallots[p.id] || p.createdBy === user.uid)) return false;
            const ms = p.createdAt ? p.createdAt.toMillis() : 0;
            return ms > votesLastSeenMs;
          }).length;

    return {
      kijiweni: countBoard('Kijiweni'),
      video: unreadVideoCount,
      fursa: countBoard('Fursa'),
      makala: countBoard('Makala'),
      chat: unreadChatCount + unreadNotesCount + unreadDirectCount,
      votes: unvotedOpenPollsCount,
    };
  }, [
    currentlyViewedBoard,
    boardLastSeen,
    topics,
    activeTab,
    selectedTopicId,
    videos,
    videosLastSeenMs,
    votesLastSeenMs,
    user?.uid,
    readTopicIds,
    unreadChatCount,
    unreadNotesCount,
    unreadDirectCount,
    polls,
    userPollBallots,
  ]);

  const unreadRepliesModCount = useMemo(
    () => userNotifications.filter((n) => !n.isRead).length,
    [userNotifications]
  );

  // Real-time owner-controlled navigation setting (hideVideoTabForUsers)
  useEffect(() => {
    if (!authReady) return;
    const unsub = subscribeSiteNavSettings((settings) => {
      setHideVideoTabForUsers(settings.hideVideoTabForUsers);
    });
    return () => unsub();
  }, [authReady]);

  // Owner-only real-time content auto-retention settings listener (Kijiweni & Video)
  useEffect(() => {
    if (!authReady || !user || !isAdmin) {
      setRetentionSettings({ ...DEFAULT_CONTENT_RETENTION_SETTINGS });
      return;
    }
    const unsub = subscribeContentRetentionSettings((settings) => {
      setRetentionSettings(settings);
    });
    return () => unsub();
  }, [authReady, user, isAdmin]);

  const runContentRetentionSweep = useCallback(
    async (
      target: 'kijiweni' | 'video' | 'both',
      overrideSettings?: ContentRetentionSettings,
      showSummaryToast = false
    ) => {
      if (!user || !isAdminRef.current) return;
      const cfg = overrideSettings || retentionSettingsRef.current;
      let totalDeletedKijiweni = 0;
      let totalDeletedVideo = 0;

      if ((target === 'kijiweni' || target === 'both') && cfg.kijiweniEnabled && !kijiweniCleanupActiveRef.current) {
        kijiweniCleanupActiveRef.current = true;
        setRetentionProgress((prev) => ({
          ...prev,
          runningKijiweni: true,
          kijiweniDeleted: 0,
          kijiweniTotal: 0,
          currentLabel: '',
        }));
        try {
          const res = await runKijiweniRetentionCleanup(cfg.kijiweniPeriod, {
            shouldContinue: () =>
              retentionSettingsRef.current.kijiweniEnabled && isAdminRef.current,
            onProgress: (deleted, total, currentLabel) => {
              setRetentionProgress((prev) => ({
                ...prev,
                runningKijiweni: true,
                kijiweniDeleted: deleted,
                kijiweniTotal: total,
                currentLabel,
              }));
            },
          });
          totalDeletedKijiweni = res.deletedCount;
        } catch (err) {
          console.error('Kijiweni retention sweep error:', err);
        } finally {
          kijiweniCleanupActiveRef.current = false;
          setRetentionProgress((prev) => ({
            ...prev,
            runningKijiweni: false,
            currentLabel: '',
          }));
        }
      }

      if ((target === 'video' || target === 'both') && cfg.videoEnabled && !videoCleanupActiveRef.current) {
        videoCleanupActiveRef.current = true;
        setRetentionProgress((prev) => ({
          ...prev,
          runningVideo: true,
          videoDeleted: 0,
          videoTotal: 0,
          currentLabel: '',
        }));
        try {
          const res = await runVideoRetentionCleanup(cfg.videoPeriod, {
            shouldContinue: () =>
              retentionSettingsRef.current.videoEnabled && isAdminRef.current,
            onProgress: (deleted, total, currentLabel) => {
              setRetentionProgress((prev) => ({
                ...prev,
                runningVideo: true,
                videoDeleted: deleted,
                videoTotal: total,
                currentLabel,
              }));
            },
          });
          totalDeletedVideo = res.deletedCount;
        } catch (err) {
          console.error('Video retention sweep error:', err);
        } finally {
          videoCleanupActiveRef.current = false;
          setRetentionProgress((prev) => ({
            ...prev,
            runningVideo: false,
            currentLabel: '',
          }));
        }
      }

      if (showSummaryToast) {
        const sum = totalDeletedKijiweni + totalDeletedVideo;
        if (sum > 0) {
          showToast(
            tr(
              `Usafishaji wa database umekamilika: machapisho ${sum} yamefutwa moja baada ya nyingine.`,
              `Database cleanup finished: deleted ${sum} expired post(s) sequentially.`
            )
          );
        } else {
          showToast(
            tr(
              'Hakuna chapisho lililopitiliza muda uliowekwa kwa sasa.',
              'No posts currently exceed the configured retention age.'
            )
          );
        }
      }
    },
    [user, showToast, tr]
  );

  // Automatic background retention runner while Owner is active
  useEffect(() => {
    if (!authReady || !user || !isAdmin) return;
    if (!retentionSettings.kijiweniEnabled && !retentionSettings.videoEnabled) return;

    void runContentRetentionSweep('both', retentionSettings, false);
    const intervalId = window.setInterval(() => {
      void runContentRetentionSweep('both', undefined, false);
    }, 5 * 60_000);

    return () => window.clearInterval(intervalId);
  }, [
    authReady,
    user,
    isAdmin,
    retentionSettings.kijiweniEnabled,
    retentionSettings.kijiweniPeriod,
    retentionSettings.videoEnabled,
    retentionSettings.videoPeriod,
    runContentRetentionSweep,
  ]);

  const handleUpdateRetentionSettings = useCallback(
    async (patch: {
      kijiweniEnabled?: boolean;
      kijiweniPeriod?: ContentRetentionPeriod;
      videoEnabled?: boolean;
      videoPeriod?: ContentRetentionPeriod;
    }) => {
      if (!user || !isAdmin) return;
      const next: ContentRetentionSettings = {
        ...retentionSettingsRef.current,
        kijiweniEnabled:
          typeof patch.kijiweniEnabled === 'boolean'
            ? patch.kijiweniEnabled
            : retentionSettingsRef.current.kijiweniEnabled,
        kijiweniPeriod: patch.kijiweniPeriod || retentionSettingsRef.current.kijiweniPeriod,
        videoEnabled:
          typeof patch.videoEnabled === 'boolean'
            ? patch.videoEnabled
            : retentionSettingsRef.current.videoEnabled,
        videoPeriod: patch.videoPeriod || retentionSettingsRef.current.videoPeriod,
        updatedBy: user.uid,
        updatedAt: retentionSettingsRef.current.updatedAt,
      };
      retentionSettingsRef.current = next;
      setRetentionSettings(next);
      try {
        await updateContentRetentionSettings(user.uid, {
          kijiweniEnabled: next.kijiweniEnabled,
          kijiweniPeriod: next.kijiweniPeriod,
          videoEnabled: next.videoEnabled,
          videoPeriod: next.videoPeriod,
        });
        showToast(
          tr(
            'Mpango wa kufuta machapisho ya zamani umehifadhiwa.',
            'Auto-delete retention schedule saved.'
          )
        );
      } catch (err) {
        showToast(
          err instanceof Error
            ? err.message
            : tr('Imeshindwa kuhifadhi mpango wa kufuta.', 'Failed to save retention schedule.'),
          'error'
        );
      }
    },
    [user, isAdmin, showToast, tr]
  );

  const hideVideoTabForCurrentUser = hideVideoTabForUsers && !isAdmin;

  // Redirect non-admin users away from Video tab immediately if owner hides Video
  useEffect(() => {
    if (hideVideoTabForCurrentUser && activeTab === 'video' && !selectedTopicId) {
      setActiveTab('kijiweni');
      setSelectedCategory('Kijiweni');
      setInitialVideoId(null);
    }
  }, [hideVideoTabForCurrentUser, activeTab, selectedTopicId]);

  const unreadSignupCount = useMemo(() => {
    if (!isAdmin) return 0;
    return adminRecentSignups.filter((u) => {
      if (user?.uid && u.uid === user.uid) return false;
      const ms = u.createdAt ? u.createdAt.toMillis() : 0;
      return ms > adminSignupLastSeenMs;
    }).length;
  }, [isAdmin, adminRecentSignups, adminSignupLastSeenMs, user?.uid]);

  const markAdminSignupsSeen = useCallback(() => {
    const now = Date.now();
    setAdminSignupLastSeenMs(now);
    try {
      window.localStorage.setItem(ADMIN_SIGNUP_LAST_SEEN_KEY, String(now));
    } catch {
      // Ignore storage error
    }
  }, []);

  const totalAppUnreadCount =
    unreadCounts.kijiweni +
    (hideVideoTabForCurrentUser ? 0 : unreadCounts.video || 0) +
    unreadCounts.fursa +
    unreadCounts.makala +
    unreadCounts.chat +
    (unreadCounts.votes || 0) +
    unreadRepliesModCount +
    unreadSignupCount;

  // Sync unread count onto mobile App Icon badge (setAppBadge / clearAppBadge) & document title
  useEffect(() => {
    void updateAppBadgeCount(totalAppUnreadCount);
    if (typeof document === 'undefined') return;
    const syncBadge = () => {
      void updateAppBadgeCount(totalAppUnreadCount);
    };
    document.addEventListener('visibilitychange', syncBadge);
    return () => {
      document.removeEventListener('visibilitychange', syncBadge);
    };
  }, [totalAppUnreadCount]);

  // Phone + toast notification when a new video is posted by another member
  useEffect(() => {
    if (loadingVideos) return;
    if (!initialVideosLoadedRef.current) {
      knownVideoIdsRef.current = new Set(videos.map((v) => v.id));
      initialVideosLoadedRef.current = true;
      return;
    }

    const newestVideo = videos.find(
      (v) =>
        !knownVideoIdsRef.current.has(v.id) &&
        !v.isArchived &&
        v.authorId !== user?.uid
    );
    knownVideoIdsRef.current = new Set(videos.map((v) => v.id));

    if (newestVideo && !hideVideoTabForCurrentUser) {
      const isViewingVideoFeed =
        activeTabRef.current === 'video' &&
        !selectedTopicIdRef.current &&
        typeof document !== 'undefined' &&
        !document.hidden;

      if (!isViewingVideoFeed) {
        const alertTitle = tr('Video Mpya · Malosha Reels', 'New Video · Malosha Reels');
        const alertBody =
          newestVideo.caption.trim() ||
          tr(
            `${newestVideo.authorName} amepakia video mpya`,
            `${newestVideo.authorName} posted a new video`
          );
        if (typeof document !== 'undefined' && !document.hidden) {
          showToast(`${alertTitle}: ${alertBody.slice(0, 75)}`);
        }
        void sendPhoneNotification({
          title: alertTitle,
          body: alertBody.slice(0, 140),
          url: `/?tab=video&v=${encodeURIComponent(newestVideo.id)}`,
          tag: `malosha-video-${newestVideo.id}`,
        });
      }
    }
  }, [loadingVideos, videos, user?.uid, hideVideoTabForCurrentUser, showToast, tr]);

  // Owner-Only Real-time Listener for Newly Registered Members
  const initialAdminSignupsLoadedRef = useRef(false);
  const knownAdminSignupIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    initialAdminSignupsLoadedRef.current = false;
    knownAdminSignupIdsRef.current.clear();

    if (!authReady || !user || !isAdmin) {
      setAdminRecentSignups([]);
      return;
    }

    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(40));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: UserProfile[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            uid: String(data.uid || d.id),
            displayName: String(data.displayName || 'Mwanachama'),
            photoURL: String(data.photoURL || ''),
            bio: String(data.bio || ''),
            role: data.role === 'moderator' ? 'moderator' : 'member',
            verificationBadge: normalizeVerificationBadge(data.verificationBadge),
            accountStatus: normalizeAccountStatus(data.accountStatus),
            suspendedReason: typeof data.suspendedReason === 'string' ? data.suspendedReason : '',
            suspendedRuleNumber: Number(data.suspendedRuleNumber || 0),
            topicsCount: Number(data.topicsCount || 0),
            repliesCount: Number(data.repliesCount || 0),
            followersCount: Number(data.followersCount || 0),
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
          };
        });

        setAdminRecentSignups(list);

        if (!initialAdminSignupsLoadedRef.current) {
          knownAdminSignupIdsRef.current = new Set(list.map((u) => u.uid));
          initialAdminSignupsLoadedRef.current = true;
          return;
        }

        const newlyRegistered = list.filter(
          (u) => !knownAdminSignupIdsRef.current.has(u.uid) && u.uid !== user.uid
        );
        list.forEach((u) => knownAdminSignupIdsRef.current.add(u.uid));

        if (newlyRegistered.length > 0) {
          const newest = newlyRegistered[0];
          const alertTitle = tr('Mwanachama Mpya Amejisajili', 'New Member Registered');
          const alertBody = tr(
            `${newest.displayName} amejiunga na Malosha Forums sasa hivi.`,
            `${newest.displayName} just registered on Malosha Forums.`
          );
          if (typeof document !== 'undefined' && !document.hidden) {
            showToast(`${alertTitle}: ${newest.displayName}`);
          }
          void sendPhoneNotification({
            title: alertTitle,
            body: alertBody,
            url: '/?tab=safety',
            tag: `malosha-signup-${newest.uid}`,
          });
        }
      },
      () => {
        // Non-fatal fallback
      }
    );

    return () => unsub();
  }, [authReady, user, isAdmin, showToast, tr]);

  // Real-time Facebook-style reply & comment notifications for the signed-in user
  useEffect(() => {
    initialUserNotifsLoadedRef.current = false;
    knownUserNotifIdsRef.current.clear();

    if (!authReady || !user) {
      setUserNotifications([]);
      return;
    }

    const path = `users/${user.uid}/notifications`;
    const q = query(collection(db, path), where('recipientId', '==', user.uid));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const nowMs = Date.now();
        const allList: UserNotification[] = snapshot.docs.map((d) => {
          const data = d.data();
          const rawType = String(data.type || 'comment_reply');
          const nType: UserNotificationType =
            rawType === 'post_comment' ||
            rawType === 'account_moderation' ||
            rawType === 'video_moderation' ||
            rawType === 'post_moderation'
              ? rawType
              : 'comment_reply';
          return {
            id: d.id,
            recipientId: String(data.recipientId || user.uid),
            actorId: String(data.actorId || ''),
            actorName: String(data.actorName || 'Mwanachama'),
            actorPhoto: String(data.actorPhoto || ''),
            type: nType,
            topicId: String(data.topicId || ''),
            topicTitle: String(data.topicTitle || ''),
            topicCategory: normalizeBoardCategory(String(data.topicCategory || 'Kijiweni')),
            replyId: String(data.replyId || ''),
            parentReplyId: String(data.parentReplyId || ''),
            replyPreview: String(data.replyPreview || ''),
            ruleNumber: Number(data.ruleNumber || 0),
            ruleTitle: String(data.ruleTitle || ''),
            isRead: Boolean(data.isRead),
            createdAt: data.createdAt || null,
            readAt: data.readAt || null,
          };
        });

        // Auto-delete READ notifications older than 24h from Firestore; keep UNREAD notifications until read
        const expiredRead = allList.filter((n) => {
          if (!n.isRead) return false;
          if (cleaningNotifIdsRef.current.has(n.id)) return false;
          const readMs = n.readAt
            ? n.readAt.toMillis()
            : n.createdAt
              ? n.createdAt.toMillis()
              : 0;
          return readMs > 0 && nowMs - readMs >= READ_NOTIFICATION_TTL_MS;
        });

        if (expiredRead.length > 0) {
          expiredRead.forEach((n) => cleaningNotifIdsRef.current.add(n.id));
          void cleanupExpiredReadNotifications(user.uid, expiredRead).finally(() => {
            expiredRead.forEach((n) => cleaningNotifIdsRef.current.delete(n.id));
          });
        }

        const activeList = allList.filter((n) => {
          if (!n.isRead) return true;
          const readMs = n.readAt
            ? n.readAt.toMillis()
            : n.createdAt
              ? n.createdAt.toMillis()
              : 0;
          return readMs === 0 || nowMs - readMs < READ_NOTIFICATION_TTL_MS;
        });

        activeList.sort((a, b) => {
          const am = a.createdAt ? a.createdAt.toMillis() : Date.now();
          const bm = b.createdAt ? b.createdAt.toMillis() : Date.now();
          return bm - am;
        });

        // Never drop unread notifications: keep all unread plus recent read up to 60 total
        const unreadItems = activeList.filter((n) => !n.isRead);
        const recentReadItems = activeList.filter((n) => n.isRead).slice(0, Math.max(0, 60 - unreadItems.length));
        const visibleList = [...unreadItems, ...recentReadItems].sort((a, b) => {
          const am = a.createdAt ? a.createdAt.toMillis() : Date.now();
          const bm = b.createdAt ? b.createdAt.toMillis() : Date.now();
          return bm - am;
        });
        setUserNotifications(visibleList);

        if (!initialUserNotifsLoadedRef.current) {
          knownUserNotifIdsRef.current = new Set(visibleList.map((n) => n.id));
          initialUserNotifsLoadedRef.current = true;
          return;
        }

        const newestUnread = visibleList.find(
          (n) => !n.isRead && !knownUserNotifIdsRef.current.has(n.id)
        );
        visibleList.forEach((n) => knownUserNotifIdsRef.current.add(n.id));

        if (newestUnread) {
          const isModerationAlert =
            newestUnread.type === 'account_moderation' ||
            newestUnread.type === 'video_moderation' ||
            newestUnread.type === 'post_moderation';
          const isViewingSameTopic =
            !isModerationAlert &&
            selectedTopicIdRef.current === newestUnread.topicId &&
            typeof document !== 'undefined' &&
            !document.hidden;

          if (isViewingSameTopic) {
            void markUserNotificationRead(user.uid, newestUnread.id);
          } else {
            const actionText = isModerationAlert
              ? newestUnread.topicTitle || tr('Taarifa ya Usalama', 'Safety Moderation Notice')
              : newestUnread.type === 'comment_reply'
                ? tr(
                    `${newestUnread.actorName} amejibu maoni yako`,
                    `${newestUnread.actorName} replied to your comment`
                  )
                : tr(
                    `${newestUnread.actorName} ametoa maoni kwenye chapisho lako`,
                    `${newestUnread.actorName} commented on your post`
                  );
            const topicLabel = isModerationAlert
              ? newestUnread.ruleNumber
                ? ` · Kanuni #${newestUnread.ruleNumber}`
                : ''
              : newestUnread.topicTitle
                ? ` · ${newestUnread.topicTitle.slice(0, 50)}`
                : '';
            if (typeof document !== 'undefined' && !document.hidden) {
              showToast(
                isModerationAlert
                  ? `${actionText}${topicLabel}: ${newestUnread.replyPreview.slice(0, 80)}`
                  : `${actionText}: "${newestUnread.replyPreview.slice(0, 75)}"`,
                isModerationAlert ? 'error' : 'success'
              );
            }
            void sendPhoneNotification({
              title: `${actionText}${topicLabel}`,
              body: newestUnread.replyPreview.slice(0, 140),
              topicId: isModerationAlert ? '' : newestUnread.topicId,
              tag: `malosha-reply-${newestUnread.id}`,
            });
          }
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    return () => unsub();
  }, [authReady, user, showToast, tr]);

  // Periodic 60s sweep so read notifications get deleted right when their 24h window expires
  useEffect(() => {
    if (!authReady || !user) return;
    const sweepExpiredRead = () => {
      const now = Date.now();
      const expired = userNotifications.filter((n) => {
        if (!n.isRead || cleaningNotifIdsRef.current.has(n.id)) return false;
        const readMs = n.readAt
          ? n.readAt.toMillis()
          : n.createdAt
            ? n.createdAt.toMillis()
            : 0;
        return readMs > 0 && now - readMs >= READ_NOTIFICATION_TTL_MS;
      });
      if (expired.length === 0) return;
      expired.forEach((n) => cleaningNotifIdsRef.current.add(n.id));
      void cleanupExpiredReadNotifications(user.uid, expired).finally(() => {
        expired.forEach((n) => cleaningNotifIdsRef.current.delete(n.id));
      });
    };

    const timer = window.setInterval(sweepExpiredRead, 60_000);
    return () => window.clearInterval(timer);
  }, [authReady, user, userNotifications]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    let changed = false;

    // Never keep stale ?mada= query parameter when returning to feed or switching tabs
    if (!selectedTopicId && url.searchParams.has('mada')) {
      url.searchParams.delete('mada');
      changed = true;
    }

    if (activeTab === 'chat' && !selectedTopicId) {
      if (url.searchParams.get('tab') !== 'mchart') {
        url.searchParams.set('tab', 'mchart');
        changed = true;
      }
      if (mchartSubTab === 'notes' || mchartSubTab === 'messages') {
        if (url.searchParams.get('view') !== mchartSubTab) {
          url.searchParams.set('view', mchartSubTab);
          changed = true;
        }
      } else if (url.searchParams.has('view')) {
        url.searchParams.delete('view');
        changed = true;
      }
      if (url.searchParams.has('v')) {
        url.searchParams.delete('v');
        changed = true;
      }
      if (url.searchParams.has('poll') || url.searchParams.has('p')) {
        url.searchParams.delete('poll');
        url.searchParams.delete('p');
        changed = true;
      }
    } else if (activeTab === 'video' && !selectedTopicId) {
      if (url.searchParams.get('tab') !== 'video') {
        url.searchParams.set('tab', 'video');
        changed = true;
      }
      if (url.searchParams.has('view')) {
        url.searchParams.delete('view');
        changed = true;
      }
      if (url.searchParams.has('poll') || url.searchParams.has('p')) {
        url.searchParams.delete('poll');
        url.searchParams.delete('p');
        changed = true;
      }
    } else if (activeTab === 'votes' && !selectedTopicId) {
      if (url.searchParams.has('poll')) {
        url.searchParams.delete('poll');
        changed = true;
      }
      if (selectedPollId) {
        if (url.searchParams.get('p') !== selectedPollId) {
          url.searchParams.set('p', selectedPollId);
          changed = true;
        }
        if (url.searchParams.has('tab')) {
          url.searchParams.delete('tab');
          changed = true;
        }
      } else {
        if (url.searchParams.has('p')) {
          url.searchParams.delete('p');
          changed = true;
        }
        if (url.searchParams.get('tab') !== 'mpoll') {
          url.searchParams.set('tab', 'mpoll');
          changed = true;
        }
      }
      if (url.searchParams.has('view')) {
        url.searchParams.delete('view');
        changed = true;
      }
      if (url.searchParams.has('v')) {
        url.searchParams.delete('v');
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
      if (url.searchParams.has('v')) {
        url.searchParams.delete('v');
        changed = true;
      }
      if (activeTab !== 'auth' && (url.searchParams.has('poll') || url.searchParams.has('p'))) {
        url.searchParams.delete('poll');
        url.searchParams.delete('p');
        changed = true;
      }
    }

    if (changed) {
      window.history.replaceState({}, '', url.toString());
    }
  }, [selectedTopicId, activeTab, mchartSubTab, selectedPollId]);

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
          setSelectedTopicId(null);
          setActiveTab('kijiweni');
          setSelectedCategory('Kijiweni');
          return;
        }
        const data = snap.data();
        if (!isAdmin && data.status !== 'open' && data.status !== 'locked') {
          setSharedTopicFallback(null);
          setSelectedTopicId(null);
          setActiveTab('kijiweni');
          setSelectedCategory('Kijiweni');
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
          setSelectedTopicId(null);
          setActiveTab('kijiweni');
          setSelectedCategory('Kijiweni');
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
        reason === 'comment' ||
        reason === 'like' ||
        reason === 'post' ||
        reason === 'chat' ||
        reason === 'vote'
          ? reason
          : null;
      if (activeTab !== 'auth') {
        returnDestinationRef.current = {
          tab: activeTab,
          topicId: selectedTopicId,
          pollId: selectedPollId,
        };
      }
      setAuthPromptReason(normalizedReason);
      setSelectedTopicId(null);
      setActiveTab('auth');
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [user, activeTab, selectedTopicId, selectedPollId]
  );

  useEffect(() => {
    if (user && activeTab === 'auth') {
      const dest = returnDestinationRef.current;
      setAuthPromptReason(null);
      if (dest.topicId) {
        const nextTab = dest.tab === 'auth' || dest.tab === 'all' ? 'kijiweni' : dest.tab;
        setActiveTab(nextTab);
        setSelectedCategory(
          nextTab === 'kijiweni'
            ? 'Kijiweni'
            : nextTab === 'fursa'
              ? 'Fursa'
              : nextTab === 'makala'
                ? 'Makala'
                : 'all'
        );
        setSelectedTopicId(dest.topicId);
      } else if (dest.tab === 'votes') {
        setActiveTab('votes');
        setSelectedCategory('all');
        setSelectedTopicId(null);
        setSelectedPollId(dest.pollId);
      } else if (dest.tab === 'chat') {
        setActiveTab('chat');
        setSelectedCategory('all');
        setSelectedTopicId(null);
      } else {
        setActiveTab('kijiweni');
        setSelectedCategory('Kijiweni');
        setSelectedTopicId(null);
      }
    }
  }, [user, activeTab]);

  const activePresenceArea: PresenceArea = useMemo(() => {
    if (activeTab === 'chat') return 'mchart';
    if (activeTab === 'kijiweni') return 'kijiweni';
    if (activeTab === 'video') return 'video';
    if (activeTab === 'fursa') return 'fursa';
    if (activeTab === 'makala') return 'makala';
    if (activeTab === 'votes') return 'votes';
    if (activeTab === 'safety') return 'profile';
    return 'forum';
  }, [activeTab]);

  const handleSignOut = async () => {
    if (user) {
      await writeUserPresence(user.uid, {
        displayName: userProfile?.displayName || user.displayName || 'Mwanachama',
        isOnline: false,
        isTypingInMchart: false,
        replyingToName: '',
        activeArea: activePresenceArea,
      }).catch(() => {});
    }
    await signOut(auth);
    setOnlyMine(false);
    setLang('sw');
    showToast('Umetoka kwenye akaunti yako.');
  };

  const handleToggleHideVideoTab = useCallback(async () => {
    if (!user || !isAdmin) return;
    const next = !hideVideoTabForUsers;
    try {
      await updateHideVideoTabForUsers(user.uid, next);
      showToast(
        next
          ? tr(
              'Kipengele cha Video kimefichwa kwa watumiaji wengine.',
              'Video tab is now hidden from other users.'
            )
          : tr(
              'Kipengele cha Video kimewekwa wazi kwa watumiaji wote.',
              'Video tab is now visible to everyone.'
            )
      );
    } catch (err) {
      showToast(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kubadilisha uonekano wa Video.', 'Failed to update Video visibility.'),
        'error'
      );
    }
  }, [user, isAdmin, hideVideoTabForUsers, showToast, tr]);

  const handleOpenAdminMembers = useCallback(() => {
    setAuthPromptReason(null);
    setSelectedTopicId(null);
    setActiveTab('safety');
    setSelectedCategory('all');
    setOpenAdminMembersSignal((s) => s + 1);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, []);

  const handleSelectTab = (tab: NavTab) => {
    if (tab === 'video' && hideVideoTabForCurrentUser) {
      return;
    }
    setAuthPromptReason(null);
    if (tab === 'chat' && activeTab !== 'chat') {
      setMchartSubTab('direct');
      setActiveDirectChatId(null);
    }
    if (tab !== 'video') {
      setInitialVideoId(null);
    }
    if (tab !== 'votes') {
      setSelectedPollId(null);
    }
    if (tab === 'votes') {
      let latestMs = Date.now();
      polls.forEach((p) => {
        const ms = p.createdAt ? p.createdAt.toMillis() : 0;
        if (ms > latestMs) latestMs = ms;
      });
      const nextMs = latestMs + 500;
      setVotesLastSeenMs((prev) => {
        const next = Math.max(prev, nextMs);
        try {
          window.localStorage.setItem(VOTES_LAST_SEEN_KEY, String(next));
        } catch {
          // Ignore storage errors
        }
        return next;
      });
    }
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

  const openTopicFromFeed = useCallback(
    (topicId: string) => {
      markTopicRead(topicId);
      if (typeof window !== 'undefined') {
        feedScrollYRef.current = window.scrollY || window.pageYOffset || 0;
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
      setSelectedTopicId(topicId);
    },
    [markTopicRead]
  );

  // When a topic detail is open (e.g. via deep link or notification), mark topic + its reply alerts read
  useEffect(() => {
    if (!selectedTopicId) return;
    markTopicRead(selectedTopicId);
    if (!user?.uid) return;
    const matchingUnreadIds = userNotifications
      .filter((n) => !n.isRead && n.topicId === selectedTopicId)
      .map((n) => n.id);
    if (matchingUnreadIds.length > 0) {
      void markAllUserNotificationsRead(user.uid, matchingUnreadIds);
      matchingUnreadIds.forEach((id) => {
        void dismissPhoneNotifications(`malosha-reply-${id}`);
      });
    }
  }, [selectedTopicId, user?.uid, userNotifications, markTopicRead]);

  const handleMarkNotificationRead = useCallback(
    async (notificationId: string) => {
      if (!user?.uid) return;
      await markUserNotificationRead(user.uid, notificationId);
      void dismissPhoneNotifications(`malosha-reply-${notificationId}`);
    },
    [user?.uid]
  );

  const handleMarkAllNotificationsRead = useCallback(
    async (notificationIds: string[]) => {
      if (!user?.uid || notificationIds.length === 0) return;
      await markAllUserNotificationsRead(user.uid, notificationIds);
    },
    [user?.uid]
  );

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

  const handleCreateKijiweniPost = async (
    data: {
      title: string;
      body: string;
      tags: string[];
      coverImage?: string;
    },
    options?: { silent?: boolean }
  ) => {
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
    if (!options?.silent) {
      showToast(tr('Chapisho lako limewekwa Kijiweni!', 'Your post is now live in Kijiweni!'));
    }
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

  const handleUpdateProfilePhoto = async (photoURL: string) => {
    if (!user || blockIfSuspended()) return;
    const cleanUrl = await updateUserProfilePhoto(
      user.uid,
      photoURL,
      userProfile?.displayName || user.displayName || 'Mwanachama'
    );
    await updateProfile(user, { photoURL: cleanUrl || null }).catch(() => {});
  };

  const composerDefaultCategory: TopicCategory | 'all' =
    activeTab === 'kijiweni'
      ? 'Kijiweni'
      : activeTab === 'fursa'
        ? 'Fursa'
        : activeTab === 'makala'
          ? 'Makala'
          : selectedCategory;

  const appReady = authReady;
  const isMchartView = activeTab === 'chat' && !selectedTopic && !selectedTopicId;
  const isVideoView = activeTab === 'video' && !selectedTopic && !selectedTopicId;
  const isMpollView = activeTab === 'votes' && !selectedTopic && !selectedTopicId;
  const isMpollDarkBlue = isMpollView && mpollBgTheme === 'darkblue';
  const isAuthView = activeTab === 'auth' && !user;
  const isFullStageView = isMchartView || isVideoView;
  const lockViewportToScreen = isFullStageView || isAuthView;
  const [mobileKeyboardOpen, setMobileKeyboardOpen] = useState(false);

  useEffect(() => {
    if (!lockViewportToScreen || typeof window === 'undefined') {
      setMobileKeyboardOpen(false);
      return;
    }

    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyOverscroll = body.style.overscrollBehavior;

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    window.scrollTo(0, 0);

    const checkKeyboard = () => {
      const vv = window.visualViewport;
      const isMobile = window.innerWidth < 768;
      const open = Boolean(vv && isMobile && vv.height < window.innerHeight - 130);
      setMobileKeyboardOpen(open);
    };

    checkKeyboard();
    window.addEventListener('resize', checkKeyboard);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', checkKeyboard);

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.overscrollBehavior = prevBodyOverscroll;
      window.removeEventListener('resize', checkKeyboard);
      vv?.removeEventListener('resize', checkKeyboard);
      setMobileKeyboardOpen(false);
    };
  }, [lockViewportToScreen]);

  return (
    <UserPresenceProvider
      authReady={authReady}
      userUid={user?.uid || null}
      displayName={userProfile?.displayName || user?.displayName || 'Mwanachama'}
      activeArea={activePresenceArea}
      isSuspended={isSuspended}
    >
    <div
      className={`min-h-screen flex flex-col text-slate-900 transition-colors duration-300 ${
        isMpollDarkBlue
          ? 'bg-gradient-to-b from-[#041024] via-[#081D3A] to-[#0D2B54]'
          : 'bg-[#F1F4F8]'
      }`}
    >
      <AppLaunchLoader ready={appReady} />
      <OfflineIndicator />

      {!isAuthView && (
        <div className={isVideoView ? 'hidden md:block' : ''}>
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
            onSignIn={handleSignIn}
            onSignOut={handleSignOut}
            authBusy={authBusy}
            onToast={showToast}
            unreadCounts={unreadCounts}
            userNotifications={userNotifications}
            onMarkNotificationRead={handleMarkNotificationRead}
            onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
            hideVideoTab={hideVideoTabForCurrentUser}
            recentSignups={adminRecentSignups}
            unreadSignupCount={unreadSignupCount}
            signupLastSeenMs={adminSignupLastSeenMs}
            onMarkSignupsSeen={markAdminSignupsSeen}
            onOpenAdminMembers={handleOpenAdminMembers}
          />
        </div>
      )}

      <main
        className={`flex-1 ${
          isAuthView
            ? 'h-[100dvh] overflow-hidden'
            : isVideoView
              ? 'pt-0 md:pt-[var(--malosha-header-h,118px)]'
              : `pt-[var(--malosha-header-h,118px)] ${isFullStageView ? '' : 'pb-16 md:pb-0'}`
        }`}
      >
        {isSuspended && !isFullStageView && !isAuthView && (
          <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-red-900">
            <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
              <div className="flex items-start gap-2.5 text-xs sm:text-sm">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
                <div>
                  <span className="font-bold">
                    {tr('Akaunti Yako Imefungwa:', 'Your Account Is Closed:')}
                  </span>{' '}
                  {Boolean(userProfile?.suspendedRuleNumber) && (() => {
                    const rule = findCommunityRule(userProfile?.suspendedRuleNumber);
                    return rule ? (
                      <span className="mr-1 font-bold text-red-950">
                        [{tr(`Kanuni #${rule.number}`, `Rule #${rule.number}`)}: {tr(rule.titleSw, rule.titleEn)}]
                      </span>
                    ) : null;
                  })()}
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
            onAuthorClick={(author) => setProfileModalTarget(author)}
            onSignIn={handleSignIn}
            onToast={showToast}
            onRequestConfirm={(opts) => setConfirmState(opts)}
          />
        ) : activeTab === 'auth' ? (
          !user ? (
            <AuthView
              promptReason={authPromptReason}
              onBack={() => {
                const dest = returnDestinationRef.current;
                setAuthPromptReason(null);
                const fallbackTab =
                  dest.tab === 'auth' || dest.tab === 'all' ? 'kijiweni' : dest.tab;
                setActiveTab(fallbackTab);
                setSelectedCategory(
                  fallbackTab === 'kijiweni'
                    ? 'Kijiweni'
                    : fallbackTab === 'fursa'
                      ? 'Fursa'
                      : fallbackTab === 'makala'
                        ? 'Makala'
                        : 'all'
                );
                if (dest.topicId) {
                  setSelectedTopicId(dest.topicId);
                }
                if (fallbackTab === 'votes' && dest.pollId) {
                  setSelectedPollId(dest.pollId);
                }
              }}
              onSuccess={(_signedInUser, isNewUser, phoneFromReg) => {
                if (phoneFromReg) {
                  setUserPhone(phoneFromReg);
                }
                const dest = returnDestinationRef.current;
                setAuthPromptReason(null);
                if (dest.tab === 'votes') {
                  setActiveTab('votes');
                  setSelectedCategory('all');
                  setSelectedTopicId(null);
                  setSelectedPollId(dest.pollId);
                } else if (dest.topicId && !isNewUser) {
                  const targetTab =
                    dest.tab === 'auth' || dest.tab === 'all' ? 'kijiweni' : dest.tab;
                  setActiveTab(targetTab);
                  setSelectedCategory(
                    targetTab === 'kijiweni'
                      ? 'Kijiweni'
                      : targetTab === 'fursa'
                        ? 'Fursa'
                        : targetTab === 'makala'
                          ? 'Makala'
                          : 'all'
                  );
                  setSelectedTopicId(dest.topicId);
                } else if (dest.tab === 'chat' && !isNewUser) {
                  setActiveTab('chat');
                  setSelectedCategory('all');
                  setSelectedTopicId(null);
                } else {
                  setActiveTab('kijiweni');
                  setSelectedCategory('Kijiweni');
                  setSelectedTopicId(null);
                }
                showToast(
                  isNewUser
                    ? tr(
                        'Akaunti yako imesajiliwa kikamilifu! Karibu Kijiweni.',
                        'Your account has been created! Welcome to Kijiweni.'
                      )
                    : tr(
                        'Karibu Kijiweni! Umeingia kikamilifu.',
                        'Welcome to Kijiweni! You are signed in.'
                      )
                );
              }}
            />
          ) : (
            <div className="mx-auto max-w-md px-4 py-16 text-center text-xs font-semibold text-slate-500">
              {tr('Inakupeleka kwenye jukwaa...', 'Opening forum...')}
            </div>
          )
        ) : activeTab === 'safety' ? (
          <SafetyGuidelinesView
            userUid={user?.uid || null}
            userEmail={user?.email || null}
            userEmailVerified={Boolean(user?.emailVerified)}
            userCreationTime={user?.metadata?.creationTime || ''}
            userLastSignInTime={user?.metadata?.lastSignInTime || ''}
            userProviders={user?.providerData?.map((p) => p.providerId) || []}
            userPhone={userPhone}
            userProfile={userProfile}
            isAdmin={isAdmin}
            isSuspended={isSuspended}
            myReports={reports}
            topics={topics}
            videos={videos}
            friendsCount={directChats.length}
            userNotifications={userNotifications}
            onSaveProfile={handleSaveProfile}
            onUpdateProfilePhoto={handleUpdateProfilePhoto}
            onPublishPosterTopic={async (data) => {
              if (!user) throw new Error('Ingia kwanza.');
              return await createTopic(
                user,
                userProfile?.displayName || user.displayName || 'Mwanachama',
                data
              );
            }}
            onSelectBoard={handleSelectBoard}
            onSignIn={() => handleSignIn()}
            onUpdateReportStatus={async (id, status) => {
              await updateReportStatus(id, status);
              showToast(tr('Hali ya ripoti imesasishwa.', 'Report status updated.'));
            }}
            onOpenTopic={(topicId) => {
              setSelectedTopicId(topicId);
            }}
            onOpenVideo={(videoId) => {
              setInitialVideoId(videoId);
              setSelectedTopicId(null);
              setActiveTab('video');
            }}
            onToast={showToast}
            hideVideoTabForUsers={hideVideoTabForUsers}
            onToggleHideVideoTab={isAdmin ? handleToggleHideVideoTab : undefined}
            retentionSettings={retentionSettings}
            retentionProgress={retentionProgress}
            onUpdateRetentionSettings={isAdmin ? handleUpdateRetentionSettings : undefined}
            onRunRetentionNow={
              isAdmin
                ? (target) => void runContentRetentionSweep(target, undefined, true)
                : undefined
            }
            openAdminMembersSignal={openAdminMembersSignal}
            signupLastSeenMs={adminSignupLastSeenMs}
          />
        ) : activeTab === 'chat' ? (
          <ForumChatView
            messages={chatMessages}
            loading={loadingChat}
            directChats={directChats}
            unreadDirectCount={unreadDirectCount}
            statuses={mchartStatuses}
            loadingStatuses={loadingStatuses}
            memberCandidates={memberDirectoryCandidates}
            notes={mchartNotes}
            loadingNotes={loadingNotes}
            unreadNotesCount={unreadNotesCount}
            readNoteIds={readNoteIds}
            onMarkNoteRead={markNoteRead}
            onClearedAllChats={() => setChatMessages([])}
            subTab={mchartSubTab}
            onChangeSubTab={setMchartSubTab}
            activeDirectChatId={activeDirectChatId}
            onChangeActiveDirectChatId={setActiveDirectChatId}
            user={user}
            userDisplayName={userProfile?.displayName || user?.displayName || 'Mwanachama'}
            userPhoto={userProfile?.photoURL || user?.photoURL || ''}
            isAdmin={isAdmin}
            isSuspended={isSuspended}
            keyboardOpen={isMchartView && mobileKeyboardOpen}
            onSignIn={handleSignIn}
            onToast={showToast}
            onRequestConfirm={(opts) => setConfirmState(opts)}
          />
        ) : activeTab === 'video' ? (
          <VideosFeedView
            videos={videos}
            loading={loadingVideos}
            likedVideoIds={likedVideoIds}
            user={user}
            userDisplayName={userProfile?.displayName || user?.displayName || 'Mwanachama'}
            userPhoto={userProfile?.photoURL || user?.photoURL || ''}
            isAdmin={isAdmin}
            isSuspended={isSuspended}
            initialVideoId={initialVideoId}
            onBack={() => handleSelectTab('kijiweni')}
            onAuthorClick={(author) => setProfileModalTarget(author)}
            onSignIn={() => handleSignIn()}
            onToast={showToast}
            onRequestConfirm={(opts) => setConfirmState(opts)}
          />
        ) : activeTab === 'votes' ? (
          <VotingPollsView
            polls={polls}
            loading={loadingPolls}
            userBallots={userPollBallots}
            onBallotSaved={(pollId, ballot) => {
              setUserPollBallots((prev) => ({ ...prev, [pollId]: ballot }));
            }}
            user={user}
            userDisplayName={userProfile?.displayName || user?.displayName || 'Mwanachama'}
            userPhoto={userProfile?.photoURL || user?.photoURL || ''}
            isAdmin={isAdmin}
            isSuspended={isSuspended}
            selectedPollId={selectedPollId}
            onClearSelectedPoll={() => setSelectedPollId(null)}
            mpollBgTheme={mpollBgTheme}
            onToggleMpollBgTheme={handleToggleMpollBgTheme}
            onBack={() => handleSelectTab('kijiweni')}
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
            sharedKijiweniPayload={sharedKijiweniPayload}
            onClearSharedKijiweniPayload={(id) =>
              setSharedKijiweniPayload((curr) => (curr && curr.id === id ? null : curr))
            }
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
            onAuthorClick={(author) => setProfileModalTarget(author)}
            onSignIn={handleSignIn}
            onToast={showToast}
            onRequestConfirm={(opts) => setConfirmState(opts)}
            onSeedStarterTopics={handleSeedStarterTopics}
            seeding={seeding}
            onVisibleTopicIdsChange={setVisibleTopicIds}
            unreadCounts={unreadCounts}
          />
        )}
      </main>

      {!isFullStageView && !isAuthView && (
        <footer
          className={`border-t py-6 pb-20 md:pb-6 transition-colors duration-300 ${
            isMpollDarkBlue
              ? 'border-[#1D4E89]/40 bg-[#041226] text-slate-300'
              : 'border-slate-200 bg-white text-slate-500'
          }`}
        >
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-xs sm:flex-row sm:px-6">
            <p>
              © {new Date().getFullYear()} Malosha Forums. Kijiweni
              {!hideVideoTabForCurrentUser && ' · Video'} · {tr('Fursa', 'Opportunities')} ·{' '}
              {tr('Makala', 'Articles')} · Mchart · Mpoll.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-5">
              <button
                type="button"
                onClick={() => handleSelectTab('kijiweni')}
                className={isMpollDarkBlue ? 'hover:text-white hover:underline' : 'hover:text-slate-900 hover:underline'}
              >
                Kijiweni
              </button>
              {!hideVideoTabForCurrentUser && (
                <button
                  type="button"
                  onClick={() => handleSelectTab('video')}
                  className={isMpollDarkBlue ? 'hover:text-white hover:underline' : 'hover:text-slate-900 hover:underline'}
                >
                  Video
                </button>
              )}
              <button
                type="button"
                onClick={() => handleSelectTab('fursa')}
                className={isMpollDarkBlue ? 'hover:text-white hover:underline' : 'hover:text-slate-900 hover:underline'}
              >
                {tr('Fursa', 'Opportunities')}
              </button>
              <button
                type="button"
                onClick={() => handleSelectTab('makala')}
                className={isMpollDarkBlue ? 'hover:text-white hover:underline' : 'hover:text-slate-900 hover:underline'}
              >
                {tr('Makala', 'Articles')}
              </button>
              <button
                type="button"
                onClick={() => handleSelectTab('chat')}
                className={isMpollDarkBlue ? 'hover:text-white hover:underline' : 'hover:text-slate-900 hover:underline'}
              >
                Mchart
              </button>
              <button
                type="button"
                onClick={() => handleSelectTab('votes')}
                className={isMpollDarkBlue ? 'hover:text-white hover:underline' : 'hover:text-slate-900 hover:underline'}
              >
                Mpoll
              </button>
              <button
                type="button"
                onClick={() => handleSelectTab('safety')}
                className={isMpollDarkBlue ? 'hover:text-white hover:underline' : 'hover:text-slate-900 hover:underline'}
              >
                {tr('Kanuni za Usalama', 'Safety Guidelines')}
              </button>
            </div>
          </div>
        </footer>
      )}

      {!isAuthView && (
        <MobileBottomNav
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          unreadCounts={unreadCounts}
          hidden={isMchartView && mobileKeyboardOpen}
          darkTheme={isVideoView}
          hideVideoTab={hideVideoTabForCurrentUser}
        />
      )}

      {!isFullStageView && !isAuthView && (
        <FloatingScrollButton resetKey={`${activeTab}:${selectedTopicId || ''}`} />
      )}

      {/* Floating Add Topic / Post Action Icon */}
      {!isFullStageView && !isAuthView && activeTab !== 'votes' && (
        <button
          type="button"
          onClick={handleOpenNewTopic}
          aria-label={
            isSuspended && !isAdmin
              ? tr('Akaunti Imefungwa', 'Account Closed')
              : tr('Ongeza Mada Mpya', 'Add New Post')
          }
          title={
            isSuspended && !isAdmin
              ? tr('Akaunti Imefungwa', 'Account Closed')
              : tr('Ongeza Mada', 'Add Post')
          }
          className={`fixed right-4 bottom-[calc(86px+env(safe-area-inset-bottom,0px))] z-[42] flex h-[54px] w-[54px] items-center justify-center rounded-full text-white shadow-[0_10px_26px_rgba(14,38,64,0.34)] ring-2 ring-white/85 transition-transform hover:scale-105 active:scale-95 md:right-6 md:bottom-6 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-400 ${
            isSuspended && !isAdmin
              ? 'bg-red-800 hover:bg-red-700'
              : 'bg-gradient-to-br from-[#F59E0B] via-[#D97706] to-[#B45309] hover:brightness-105'
          }`}
        >
          {isSuspended && !isAdmin ? (
            <Lock className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Plus className="h-6 w-6 stroke-[2.6]" aria-hidden="true" />
          )}
        </button>
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

      <MemberProfileModal
        memberUid={profileModalTarget?.uid || null}
        fallbackName={profileModalTarget?.displayName}
        fallbackPhoto={profileModalTarget?.photoURL}
        currentUser={user}
        currentUserDisplayName={userProfile?.displayName || user?.displayName || 'Mwanachama'}
        currentUserPhoto={userProfile?.photoURL || user?.photoURL || ''}
        topics={topics}
        videos={videos}
        isSuspended={isSuspended}
        onClose={() => setProfileModalTarget(null)}
        onSignIn={handleSignIn}
        onStartPrivateChat={async (target) => {
          if (!user) {
            handleSignIn('chat');
            return;
          }
          if (blockIfSuspended()) return;
          const thread = await ensureDirectChatThread(
            user,
            userProfile?.displayName || user.displayName || 'Mwanachama',
            userProfile?.photoURL || user.photoURL || '',
            target
          );
          setActiveTab('chat');
          setMchartSubTab('direct');
          setActiveDirectChatId(thread.chatId);
          setSelectedTopicId(null);
        }}
        onOpenTopic={openTopicFromFeed}
        onToast={showToast}
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
          className={`fixed right-20 bottom-[calc(86px+env(safe-area-inset-bottom,0px))] z-50 max-w-sm rounded-lg border px-4 py-3 text-sm font-medium shadow-lg md:right-24 md:bottom-6 ${
            toast.kind === 'error'
              ? 'border-red-200 bg-red-50 text-red-900'
              : 'border-slate-200 bg-[#163A5F] text-white'
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
    </UserPresenceProvider>
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
