import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lock, LogOut, Plus, ShieldAlert, Unlock } from 'lucide-react';
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
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
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
  KijiweniFontStyle,
  MchartGroupReadCursor,
  MchartGroupSettings,
  MchartNote,
  MchartStatus,
  MemberDirectoryCandidate,
  NavTab,
  NavUnreadCounts,
  NotificationSoundSettings,
  PlatformLockSettings,
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
  normalizeKijiweniFontStyle,
  normalizeVerificationBadge,
} from './types';
import {
  DEFAULT_CONTENT_RETENTION_SETTINGS,
  DEFAULT_MCHART_GROUP_SETTINGS,
  DEFAULT_NOTIFICATION_SOUND_SETTINGS,
  DEFAULT_PLATFORM_LOCK_SETTINGS,
  READ_NOTIFICATION_TTL_MS,
  checkUserVideoLikesBatch,
  cleanupExpiredReadNotifications,
  createTopic,
  deleteTopic,
  editTopic,
  ensureDirectChatThread,
  fetchPlatformUsersCount,
  getPrivateUserInfo,
  incrementTopicShareCount,
  lockEntirePlatform,
  markAllUserNotificationsRead,
  markUserNotificationRead,
  propagateUserIdentityAcrossAccount,
  runKijiweniRetentionCleanup,
  runVideoRetentionCleanup,
  seedStarterTopics,
  submitReport,
  subscribeContentRetentionSettings,
  subscribeMchartGroupReadCursors,
  subscribeMchartGroupSettings,
  subscribeNotificationSoundSettings,
  subscribePlatformLockSettings,
  subscribeSiteNavSettings,
  syncUserProfile,
  toggleTopicPin,
  toggleTopicVote,
  unlockEntirePlatform,
  updateContentRetentionSettings,
  updateHideVideoTabForUsers,
  updateNotificationSoundSettings,
  updatePrivatePhoneNumber,
  updateReportStatus,
  updateSiteNavSettings,
  updateTopicStatus,
  updateUserProfile,
  updateUserProfileDetailsVisibility,
  updateUserProfilePhoto,
  writeUserPresence,
} from './services/forumService';
import { shareTopic } from './utils/formatters';
import { buildMakalaSocialPayload } from './utils/makalaSocialShare';
import { MakalaSocialShareModal } from './components/MakalaSocialShareModal';
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
import { UserBadgesProvider, useUserBadges } from './context/UserBadgesContext';
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
  isMobileDeviceContext,
  isStandalonePWA,
  sendPhoneNotification,
  syncBackgroundSummaryNotification,
  updateAppBadgeCount,
} from './services/notificationService';
import {
  initChatAudioUnlock,
  playIncomingMessageSound,
  setConfiguredNotificationSound,
} from './utils/chatSound';
import { useMobileKeyboardState } from './utils/mobileKeyboard';

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

function mapTopicSnapshotDoc(d: { id: string; data: () => Record<string, unknown> }): Topic {
  const data = d.data();
  return {
    id: d.id,
    title: String(data.title || ''),
    body: String(data.body || ''),
    category: data.category as Topic['category'],
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    authorId: String(data.authorId || ''),
    authorName: String(data.authorName || 'Mwanachama'),
    authorPhoto: String(data.authorPhoto || ''),
    status: (data.status as Topic['status']) || 'open',
    isPinned: Boolean(data.isPinned),
    repliesCount: Number(data.repliesCount || 0),
    upvotesCount: Number(data.upvotesCount || 0),
    sharesCount: Number(data.sharesCount || 0),
    acceptedReplyId: String(data.acceptedReplyId || ''),
    company: String(data.company || ''),
    location: String(data.location || ''),
    jobType: String(data.jobType || ''),
    deadline: String(data.deadline || ''),
    applyInfo: String(data.applyInfo || ''),
    coverImage: String(data.coverImage || ''),
    images: Array.isArray(data.images) ? data.images.map(String).filter(Boolean) : [],
    bodyFontStyle: normalizeKijiweniFontStyle(data.bodyFontStyle),
    createdAt: (data.createdAt as Topic['createdAt']) || null,
    updatedAt: (data.updatedAt as Topic['updatedAt']) || null,
    lastActivityAt: ((data.lastActivityAt || data.createdAt) as Topic['lastActivityAt']) || null,
  };
}

function ForumShell() {
  const { lang, setLang, tr } = useLanguage();
  const { setLocalUserIdentity } = useUserBadges();
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userPhone, setUserPhone] = useState('');
  const [isAdminDoc, setIsAdminDoc] = useState(false);
  const [authBusy] = useState(false);

  const [baseTopics, setBaseTopics] = useState<Topic[]>([]);
  const [olderArchiveTopics, setOlderArchiveTopics] = useState<Topic[]>([]);
  const [topicsFetchLimit, setTopicsFetchLimit] = useState(120);
  const [hasMoreCloudTopics, setHasMoreCloudTopics] = useState(false);
  const [loadingMoreCloudTopics, setLoadingMoreCloudTopics] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState(true);
  const hasLoadedInitialTopicsRef = useRef(false);
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

  useEffect(() => {
    initChatAudioUnlock();
  }, []);
  const [reports, setReports] = useState<Report[]>([]);
  const [userNotifications, setUserNotifications] = useState<UserNotification[]>([]);
  const [hideVideoTabForUsers, setHideVideoTabForUsers] = useState(false);
  const [hideMpollTabForUsers, setHideMpollTabForUsers] = useState(false);
  const [notificationSoundSettings, setNotificationSoundSettings] =
    useState<NotificationSoundSettings>(() => ({
      ...DEFAULT_NOTIFICATION_SOUND_SETTINGS,
    }));
  const suppressNextTopicsAlertRef = useRef(false);
  const [platformLock, setPlatformLock] = useState<PlatformLockSettings>(() => ({
    ...DEFAULT_PLATFORM_LOCK_SETTINGS,
  }));
  const [platformLockLoaded, setPlatformLockLoaded] = useState(false);
  const [pendingPlatformUnlockToken, setPendingPlatformUnlockToken] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    const raw = new URLSearchParams(window.location.search).get('unlock_platform');
    return raw && raw.trim() ? raw.trim() : '';
  });
  const [unlockingPlatformBusy, setUnlockingPlatformBusy] = useState(false);
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
  const [totalUsersCount, setTotalUsersCount] = useState<number | null>(null);
  const [loadingUsersCount, setLoadingUsersCount] = useState(false);

  const [rawChatMessages, setRawChatMessages] = useState<ChatMessage[]>([]);
  const [loadingChat, setLoadingChat] = useState(true);
  const [nowTickMs, setNowTickMs] = useState<number>(() => Date.now());
  const [mchartGroupSettings, setMchartGroupSettings] = useState<MchartGroupSettings>(() => ({
    ...DEFAULT_MCHART_GROUP_SETTINGS,
  }));
  const [groupReadCursors, setGroupReadCursors] = useState<MchartGroupReadCursor[]>([]);
  const [pendingGroupInvite, setPendingGroupInvite] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return (
      /^\/g\/[^/]+\/?$/.test(window.location.pathname) ||
      params.has('g') ||
      params.get('join') === 'group'
    );
  });
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
    const isShortPollPath = /^\/p\/[a-zA-Z0-9_-]+\/?$/.test(window.location.pathname);
    const isShortMakalaPath = /^\/m\/[a-zA-Z0-9_-]+\/?$/.test(window.location.pathname);
    const isGroupInvite =
      /^\/g\/[^/]+\/?$/.test(window.location.pathname) ||
      params.has('g') ||
      params.get('join') === 'group';
    if (tabParam === 'mchart' || tabParam === 'chat' || isGroupInvite) return 'chat';
    if (tabParam === 'video' || tabParam === 'videos') return 'video';
    if (tabParam === 'fursa') return 'fursa';
    if (tabParam === 'makala' || isShortMakalaPath || params.has('m')) return 'makala';
    if (
      tabParam === 'mpoll' ||
      tabParam === 'kura' ||
      tabParam === 'votes' ||
      params.has('p') ||
      params.has('poll') ||
      isShortPollPath
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
  const [isAppVisible, setIsAppVisible] = useState<boolean>(() =>
    typeof document === 'undefined' ? true : document.visibilityState === 'visible'
  );
  const isAppVisibleRef = useRef<boolean>(isAppVisible);
  const totalAppUnreadCountRef = useRef<number>(0);
  const acknowledgedUnreadTotalRef = useRef<number | null>(null);
  const lastBgBadgeSentRef = useRef<number>(0);
  const latestBgAlertSummaryRef = useRef<string>('');
  const [authPromptReason, setAuthPromptReason] = useState<AuthPromptReason | null>(null);
  const returnDestinationRef = useRef<{ tab: NavTab; topicId: string | null; pollId: string | null }>({
    tab: 'kijiweni',
    topicId: null,
    pollId: null,
  });
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('mada') || params.get('m');
    if (raw && raw.trim()) return raw.trim();
    const makalaMatch = window.location.pathname.match(/^\/m\/([a-zA-Z0-9_-]+)\/?$/);
    return makalaMatch ? makalaMatch[1] : null;
  });
  const [selectedCategory, setSelectedCategory] = useState<TopicCategory | 'all'>(() => {
    if (typeof window === 'undefined') return 'Kijiweni';
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    const isShortPollPath = /^\/p\/[a-zA-Z0-9_-]+\/?$/.test(window.location.pathname);
    const isShortMakalaPath = /^\/m\/[a-zA-Z0-9_-]+\/?$/.test(window.location.pathname);
    const isGroupInvite =
      /^\/g\/[^/]+\/?$/.test(window.location.pathname) ||
      params.has('g') ||
      params.get('join') === 'group';
    if (tabParam === 'fursa') return 'Fursa';
    if (tabParam === 'makala' || isShortMakalaPath || params.has('m')) return 'Makala';
    if (
      tabParam === 'mchart' ||
      tabParam === 'chat' ||
      isGroupInvite ||
      tabParam === 'video' ||
      tabParam === 'videos' ||
      tabParam === 'mpoll' ||
      tabParam === 'kura' ||
      tabParam === 'votes' ||
      params.has('p') ||
      params.has('poll') ||
      isShortPollPath
    ) {
      return 'all';
    }
    return 'Kijiweni';
  });
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [kijiweniEntryToken, setKijiweniEntryToken] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);

  const [composerOpen, setComposerOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [inlineExpandRequest, setInlineExpandRequest] = useState(0);
  const [sharedTopicFallback, setSharedTopicFallback] = useState<Topic | null>(null);
  const [loadingSharedTopic, setLoadingSharedTopic] = useState(false);
  const [shareModalTopic, setShareModalTopic] = useState<Topic | null>(null);

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
    return (user.email || '').toLowerCase() === ADMIN_EMAIL || isAdminDoc;
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
        const badge = normalizeVerificationBadge(d.verificationBadge);
        const status = normalizeAccountStatus(d.accountStatus);
        const resolvedName = String(d.displayName || '');
        const resolvedPhoto = String(d.photoURL || '');
        setUserProfile({
          uid: d.uid,
          displayName: resolvedName,
          photoURL: resolvedPhoto,
          bio: d.bio || '',
          role: d.role || 'member',
          verificationBadge: badge,
          accountStatus: status,
          suspendedReason: typeof d.suspendedReason === 'string' ? d.suspendedReason : '',
          suspendedRuleNumber: Number(d.suspendedRuleNumber || 0),
          topicsCount: Number(d.topicsCount || 0),
          repliesCount: Number(d.repliesCount || 0),
          followersCount: Number(d.followersCount || 0),
          profileDetailsPublic: Boolean(d.profileDetailsPublic),
          createdAt: d.createdAt || null,
          updatedAt: d.updatedAt || null,
        });
        setLocalUserIdentity(d.uid || user.uid, {
          displayName: resolvedName,
          photoURL: resolvedPhoto,
          verificationBadge: badge,
          accountStatus: status,
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, path);
      }
    );

    return () => unsub();
  }, [authReady, user, setLocalUserIdentity]);

  const topics = useMemo(() => {
    const rawList =
      (sortMode !== 'oldest' && sortMode !== 'mixed') || olderArchiveTopics.length === 0
        ? baseTopics
        : (() => {
            const byId = new Map<string, Topic>();
            for (const item of baseTopics) {
              byId.set(item.id, item);
            }
            for (const item of olderArchiveTopics) {
              if (item.status === 'archived') continue;
              if (!byId.has(item.id)) {
                byId.set(item.id, item);
              }
            }
            return Array.from(byId.values()).sort((a, b) => {
              const msA = a.createdAt ? a.createdAt.toMillis() : Date.now();
              const msB = b.createdAt ? b.createdAt.toMillis() : Date.now();
              return msB - msA;
            });
          })();

    if (isSuspended) {
      return rawList.filter((item) => normalizeBoardCategory(item.category) === 'Kijiweni');
    }
    return rawList;
  }, [baseTopics, olderArchiveTopics, sortMode, isSuspended]);

  useEffect(() => {
    if (!authReady) return;
    if (!hasLoadedInitialTopicsRef.current) {
      setLoadingTopics(true);
    }
    const path = 'topics';

    let publicTopics: Topic[] = [];
    let ownTopics: Topic[] = [];
    let adminArchivedMakala: Topic[] = [];

    const mergeTopicLists = () => {
      const byId = new Map<string, Topic>();
      for (const item of publicTopics) {
        if (item.status !== 'archived') byId.set(item.id, item);
      }
      for (const item of ownTopics) {
        if (item.status !== 'archived' || normalizeBoardCategory(item.category) === 'Makala') {
          byId.set(item.id, item);
        }
      }
      for (const item of adminArchivedMakala) {
        if (normalizeBoardCategory(item.category) === 'Makala') {
          byId.set(item.id, item);
        }
      }
      const merged = Array.from(byId.values()).sort((a, b) => {
        const msA = a.createdAt ? a.createdAt.toMillis() : Date.now();
        const msB = b.createdAt ? b.createdAt.toMillis() : Date.now();
        return msB - msA;
      });
      hasLoadedInitialTopicsRef.current = true;
      setBaseTopics(merged);
      setLoadingTopics(false);
      setLoadingMoreCloudTopics(false);
    };

    const qPublicOrdered = query(
      collection(db, path),
      where('status', 'in', ['open', 'locked']),
      orderBy('createdAt', 'desc'),
      limit(topicsFetchLimit)
    );
    let unsubPublicFallback: (() => void) | null = null;
    const unsubPublic = onSnapshot(
      qPublicOrdered,
      (snapshot) => {
        publicTopics = snapshot.docs.map((d) => mapTopicSnapshotDoc(d));
        setHasMoreCloudTopics(snapshot.docs.length >= topicsFetchLimit);
        mergeTopicLists();
      },
      (error) => {
        if ((error as { code?: string })?.code === 'failed-precondition') {
          const qPublicUnordered = query(
            collection(db, path),
            where('status', 'in', ['open', 'locked'])
          );
          unsubPublicFallback = onSnapshot(
            qPublicUnordered,
            (snapshot) => {
              publicTopics = snapshot.docs.map((d) => mapTopicSnapshotDoc(d));
              setHasMoreCloudTopics(false);
              mergeTopicLists();
            },
            (fallbackErr) => {
              setLoadingTopics(false);
              setLoadingMoreCloudTopics(false);
              handleFirestoreError(fallbackErr, OperationType.LIST, path);
            }
          );
          return;
        }
        setLoadingTopics(false);
        setLoadingMoreCloudTopics(false);
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    let unsubOwn: (() => void) | null = null;
    if (user?.uid) {
      const qOwn = query(collection(db, path), where('authorId', '==', user.uid));
      unsubOwn = onSnapshot(
        qOwn,
        (snapshot) => {
          ownTopics = snapshot.docs.map((d) => mapTopicSnapshotDoc(d));
          mergeTopicLists();
        },
        () => {
          // Non-fatal fallback if own topics listener encounters temporary error
        }
      );
    }

    let unsubAdminArchived: (() => void) | null = null;
    if (isAdmin) {
      const qAdminArchived = query(collection(db, path), where('status', '==', 'archived'));
      unsubAdminArchived = onSnapshot(
        qAdminArchived,
        (snapshot) => {
          adminArchivedMakala = snapshot.docs
            .map((d) => mapTopicSnapshotDoc(d))
            .filter((item) => normalizeBoardCategory(item.category) === 'Makala');
          mergeTopicLists();
        },
        () => {
          // Non-fatal fallback
        }
      );
    }

    return () => {
      unsubPublic();
      if (unsubPublicFallback) unsubPublicFallback();
      if (unsubOwn) unsubOwn();
      if (unsubAdminArchived) unsubAdminArchived();
    };
  }, [authReady, user?.uid, isAdmin, topicsFetchLimit]);

  useEffect(() => {
    if (!authReady) return;
    if (sortMode !== 'oldest' && sortMode !== 'mixed') return;
    if (olderArchiveTopics.length > 0) return;

    let cancelled = false;
    void (async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'topics'),
            where('status', 'in', ['open', 'locked']),
            orderBy('createdAt', 'asc'),
            limit(100)
          )
        );
        if (cancelled) return;
        setOlderArchiveTopics(snap.docs.map((d) => mapTopicSnapshotDoc(d)));
      } catch {
        // Optional composite index; already-loaded cloud topics still sort properly
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authReady, sortMode, olderArchiveTopics.length]);

  const handleLoadMoreCloudTopics = useCallback(() => {
    if (loadingMoreCloudTopics || !hasMoreCloudTopics) return;
    suppressNextTopicsAlertRef.current = true;
    setLoadingMoreCloudTopics(true);
    setTopicsFetchLimit((prev) => prev + 100);
  }, [loadingMoreCloudTopics, hasMoreCloudTopics]);

  // Real-time Malosha Reels short videos & photo-music feed listener (plus signed-in author's private posts)
  useEffect(() => {
    if (!authReady || isSuspended) {
      setVideos([]);
      setLoadingVideos(false);
      return;
    }
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
  }, [authReady, user?.uid, isSuspended]);

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

  // Real-time community polls listener (open & closed public polls + own drafts)
  useEffect(() => {
    if (!authReady || isSuspended) {
      setPolls([]);
      setLoadingPolls(false);
      return;
    }
    setLoadingPolls(true);
    const unsub = subscribePolls(
      isAdmin,
      user?.uid || null,
      (list) => {
        setPolls(list);
        setLoadingPolls(false);
      },
      () => {
        setLoadingPolls(false);
      }
    );
    return () => unsub();
  }, [authReady, isAdmin, user?.uid, isSuspended]);

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

  // Tick every 30s to smoothly expire disappearing group messages client-side
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTickMs(Date.now());
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Subscribe Mchart Group Settings (public metadata for group photo, lock, disappearing timer, invite preview)
  useEffect(() => {
    if (!authReady) return;
    const unsub = subscribeMchartGroupSettings((settings) => {
      setMchartGroupSettings(settings);
    });
    return () => unsub();
  }, [authReady]);

  // Subscribe Mchart Group Read Cursors (true gray vs blue ticks across group members)
  useEffect(() => {
    if (!authReady || !user) {
      setGroupReadCursors([]);
      return;
    }
    const unsub = subscribeMchartGroupReadCursors((cursors) => {
      setGroupReadCursors(cursors);
    });
    return () => unsub();
  }, [authReady, user]);

  // Real-time community group chat listener (signed-in permitted members only; filtered live by disappearing timer)
  useEffect(() => {
    if (!authReady || !user || isSuspended) {
      setRawChatMessages([]);
      setLoadingChat(false);
      return;
    }
    const path = 'forum_chat_messages';
    const q = query(
      collection(db, path),
      orderBy('createdAt', 'desc'),
      limit(80)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: ChatMessage[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            senderId: String(data.senderId || ''),
            senderName: String(data.senderName || 'Mwanachama'),
            senderPhoto: String(data.senderPhoto || ''),
            text: String(data.text || ''),
            attachmentType: (
              data.attachmentType === 'image' ||
              data.attachmentType === 'document' ||
              data.attachmentType === 'audio'
                ? data.attachmentType
                : 'none'
            ) as ChatMessage['attachmentType'],
            attachmentUrl: String(data.attachmentUrl || ''),
            attachmentName: String(data.attachmentName || ''),
            attachmentSize: Number(data.attachmentSize || 0),
            attachmentMime: String(data.attachmentMime || ''),
            audioDurationSec: Number(data.audioDurationSec || 0),
            reactions:
              data.reactions && typeof data.reactions === 'object'
                ? (data.reactions as Record<string, string[]>)
                : undefined,
            isEdited: Boolean(data.isEdited),
            forwardedFromName:
              typeof data.forwardedFromName === 'string' ? data.forwardedFromName : '',
            replyToId: String(data.replyToId || ''),
            replyToSenderName: String(data.replyToSenderName || ''),
            replyToPreview: String(data.replyToPreview || ''),
            isDeleted: Boolean(data.isDeleted),
            deletedForUids: Array.isArray(data.deletedForUids)
              ? data.deletedForUids.filter((u): u is string => typeof u === 'string')
              : [],
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
          };
        });

        setRawChatMessages(list);
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
            !(m.deletedForUids && user?.uid && m.deletedForUids.includes(user.uid)) &&
            m.senderId !== user?.uid
        );
        list.forEach((m) => knownChatIdsRef.current.add(m.id));

        if (newestIncoming) {
          playIncomingMessageSound();
          const isViewingChat =
            activeTabRef.current === 'chat' &&
            mchartSubTabRef.current === 'messages' &&
            !selectedTopicIdRef.current &&
            typeof document !== 'undefined' &&
            !document.hidden;

          if (!isViewingChat) {
            const preview =
              newestIncoming.text.trim() ||
              (newestIncoming.attachmentType === 'audio'
                ? tr('Alituma ujumbe wa sauti', 'Sent a voice note')
                : newestIncoming.attachmentType === 'image'
                  ? tr('Alituma picha mpya', 'Sent a new photo')
                  : `📄 ${newestIncoming.attachmentName || tr('Alituma nyaraka', 'Sent a document')}`);
            const alertTitle = `${newestIncoming.senderName} · Mchart (Malosha)`;

            if (typeof document !== 'undefined' && !document.hidden) {
              showToast(`${alertTitle}: ${preview.slice(0, 80)}`);
            } else {
              latestBgAlertSummaryRef.current = `${alertTitle}: ${preview.slice(0, 95)}`;
            }
            void sendPhoneNotification({
              title: alertTitle,
              body: preview.slice(0, 140),
              url: '/?tab=mchart&view=messages',
              tag: 'malosha-chat-msg',
              badgeCount: !isAppVisibleRef.current
                ? Math.max(1, totalAppUnreadCountRef.current + 1 - (acknowledgedUnreadTotalRef.current ?? 0))
                : undefined,
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
  }, [authReady, user?.uid, isSuspended, showToast, tr]);

  // Apply dynamic disappearing-messages filter in real time
  const chatMessages = useMemo(() => {
    const ttlSec = mchartGroupSettings.disappearAfterSeconds || 0;
    if (ttlSec <= 0) return rawChatMessages;
    const cutoffMs = nowTickMs - ttlSec * 1000;
    return rawChatMessages.filter((m) => !m.createdAt || m.createdAt.toMillis() >= cutoffMs);
  }, [rawChatMessages, mchartGroupSettings.disappearAfterSeconds, nowTickMs]);

  // Real-time Mchart Notes listener (signed-in members: public notes + own private notes; owner sees all)
  const backfilledNoteVisibilityRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!authReady || !user || isSuspended) {
      setMchartNotes([]);
      setLoadingNotes(false);
      return;
    }
    const path = 'mchart_notes';

    const mapNoteDoc = (d: {
      id: string;
      data: () => Record<string, unknown>;
    }): MchartNote => {
      const data = d.data();
      const noteType =
        data.noteType === 'pdf' || data.noteType === 'mixed' || data.noteType === 'text'
          ? data.noteType
          : typeof data.pdfUrl === 'string' && data.pdfUrl
            ? 'mixed'
            : 'text';
      const visibility: 'public' | 'private' =
        data.visibility === 'private' ? 'private' : 'public';
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
        visibility,
        createdAt: (data.createdAt as MchartNote['createdAt']) || null,
        updatedAt: (data.updatedAt as MchartNote['updatedAt']) || null,
      };
    };

    const handleNotesListUpdate = (list: MchartNote[]) => {
      setMchartNotes(list);
      setLoadingNotes(false);

      if (!initialNotesLoadedRef.current) {
        knownNoteIdsRef.current = new Set(list.map((n) => n.id));
        initialNotesLoadedRef.current = true;
        return;
      }

      const newestNote = list.find(
        (n) =>
          !knownNoteIdsRef.current.has(n.id) &&
          !n.isArchived &&
          n.visibility !== 'private' &&
          n.authorId !== user?.uid
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
          playIncomingMessageSound();
          const alertTitle = tr('Slide Mpya · Mchart (Malosha)', 'New Slide · Malosha Mchart');
          if (typeof document !== 'undefined' && !document.hidden) {
            showToast(`${alertTitle}: ${newestNote.title}`);
          } else {
            latestBgAlertSummaryRef.current = `${alertTitle}: ${newestNote.title}`;
          }
          void sendPhoneNotification({
            title: alertTitle,
            body: newestNote.title,
            url: '/?tab=mchart&view=notes',
            tag: 'malosha-mchart-note',
            badgeCount: !isAppVisibleRef.current
              ? Math.max(1, totalAppUnreadCountRef.current + 1 - (acknowledgedUnreadTotalRef.current ?? 0))
              : undefined,
          });
        }
      }
    };

    if (isAdmin) {
      const qAdmin = query(
        collection(db, path),
        orderBy('createdAt', 'desc'),
        limit(120)
      );
      const unsub = onSnapshot(
        qAdmin,
        (snapshot) => {
          snapshot.docs.forEach((d) => {
            const rawVis = d.data().visibility;
            if (
              rawVis !== 'public' &&
              rawVis !== 'private' &&
              !backfilledNoteVisibilityRef.current.has(d.id)
            ) {
              backfilledNoteVisibilityRef.current.add(d.id);
              void updateDoc(doc(db, path, d.id), { visibility: 'public' }).catch(() => {});
            }
          });
          const list = snapshot.docs.map((d) => mapNoteDoc(d));
          handleNotesListUpdate(list);
        },
        (error) => {
          setLoadingNotes(false);
          handleFirestoreError(error, OperationType.LIST, path);
        }
      );
      return () => unsub();
    }

    let publicNotes: MchartNote[] = [];
    let ownNotes: MchartNote[] = [];
    let publicReady = false;
    let ownReady = false;

    const mergeAndPublish = () => {
      if (!publicReady && !ownReady) return;
      const byId = new Map<string, MchartNote>();
      publicNotes.forEach((n) => byId.set(n.id, n));
      ownNotes.forEach((n) => byId.set(n.id, n));
      const merged = Array.from(byId.values()).sort((a, b) => {
        const msA = a.createdAt ? a.createdAt.toMillis() : Number.MAX_SAFE_INTEGER;
        const msB = b.createdAt ? b.createdAt.toMillis() : Number.MAX_SAFE_INTEGER;
        return msB - msA;
      });
      handleNotesListUpdate(merged);
    };

    const qPublicOrdered = query(
      collection(db, path),
      where('visibility', '==', 'public'),
      orderBy('createdAt', 'desc'),
      limit(80)
    );
    let unsubPublicFallback: (() => void) | null = null;
    const unsubPublic = onSnapshot(
      qPublicOrdered,
      (snapshot) => {
        publicNotes = snapshot.docs.map((d) => mapNoteDoc(d));
        publicReady = true;
        mergeAndPublish();
      },
      (error) => {
        if ((error as { code?: string })?.code === 'failed-precondition') {
          const qPublicUnordered = query(
            collection(db, path),
            where('visibility', '==', 'public')
          );
          unsubPublicFallback = onSnapshot(
            qPublicUnordered,
            (snapshot) => {
              publicNotes = snapshot.docs.map((d) => mapNoteDoc(d));
              publicReady = true;
              mergeAndPublish();
            },
            (fallbackErr) => {
              setLoadingNotes(false);
              handleFirestoreError(fallbackErr, OperationType.LIST, path);
            }
          );
          return;
        }
        setLoadingNotes(false);
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    const qOwn = query(
      collection(db, path),
      where('authorId', '==', user.uid)
    );
    const unsubOwn = onSnapshot(
      qOwn,
      (snapshot) => {
        ownNotes = snapshot.docs.map((d) => mapNoteDoc(d));
        ownReady = true;
        mergeAndPublish();
      },
      () => {
        ownReady = true;
        mergeAndPublish();
      }
    );

    return () => {
      unsubPublic();
      unsubPublicFallback?.();
      unsubOwn();
    };
  }, [authReady, user?.uid, isAdmin, isSuspended, showToast, tr]);

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
    if (!isAppVisible || activeTab !== 'chat' || mchartSubTab !== 'messages' || selectedTopicId) return;
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
  }, [isAppVisible, activeTab, mchartSubTab, selectedTopicId, chatMessages]);

  // Mark Mchart notes as seen & dismiss phone note notification when viewing Notes
  useEffect(() => {
    if (!isAppVisible || activeTab !== 'chat' || mchartSubTab !== 'notes' || selectedTopicId) return;
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
  }, [isAppVisible, activeTab, mchartSubTab, selectedTopicId, mchartNotes]);

  const unreadChatCount = useMemo(() => {
    if (isAppVisible && activeTab === 'chat' && mchartSubTab === 'messages' && !selectedTopicId) return 0;
    return chatMessages.filter((m) => {
      if (m.isDeleted || m.senderId === user?.uid) return false;
      const ms = m.createdAt ? m.createdAt.toMillis() : 0;
      return ms > lastSeenChatMs;
    }).length;
  }, [isAppVisible, activeTab, mchartSubTab, selectedTopicId, chatMessages, user?.uid, lastSeenChatMs]);

  const unreadNotesCount = useMemo(() => {
    if (isAppVisible && activeTab === 'chat' && mchartSubTab === 'notes' && !selectedTopicId) return 0;
    return mchartNotes.filter((n) => {
      if (n.isArchived || n.authorId === user?.uid) return false;
      if (readNoteIds.has(n.id)) return false;
      const ms = n.createdAt ? n.createdAt.toMillis() : 0;
      return ms > lastSeenNotesMs;
    }).length;
  }, [isAppVisible, activeTab, mchartSubTab, selectedTopicId, mchartNotes, user?.uid, lastSeenNotesMs, readNoteIds]);

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
    if (!isAppVisible || !currentlyViewedBoard) return;
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
  }, [isAppVisible, currentlyViewedBoard, topics]);

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

    if (!authReady || !user || isSuspended) {
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
            blockedByUids: Array.isArray(data.blockedByUids)
              ? data.blockedByUids.map((u) => String(u))
              : [],
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
              playIncomingMessageSound();
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
                } else {
                  latestBgAlertSummaryRef.current = `${alertTitle}: ${t.lastMessageText.slice(0, 95)}`;
                }
                void sendPhoneNotification({
                  title: alertTitle,
                  body: t.lastMessageText.slice(0, 140),
                  url: '/?tab=mchart&view=direct',
                  tag: `malosha-dm-${t.chatId}`,
                  badgeCount: !isAppVisibleRef.current
                    ? Math.max(1, totalAppUnreadCountRef.current + 1 - (acknowledgedUnreadTotalRef.current ?? 0))
                    : undefined,
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
  }, [authReady, user, isSuspended, showToast, tr]);

  // Real-time 24h Mchart Photo Statuses (Members + Personal audience + Author's own statuses)
  useEffect(() => {
    if (!authReady || !user || isSuspended) {
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
  }, [authReady, user, isSuspended]);

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

  // Clear video unread badge when user opens Video Reels while app is visible
  useEffect(() => {
    if (!isAppVisible || activeTab !== 'video' || selectedTopicId) return;
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
  }, [isAppVisible, activeTab, selectedTopicId, videos]);

  // Clear Mpoll notification badge permanently once user opens Mpoll while app is visible
  useEffect(() => {
    if (!isAppVisible || activeTab !== 'votes' || selectedTopicId) return;
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
  }, [isAppVisible, activeTab, selectedTopicId, polls]);

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
        isAppVisible &&
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
  }, [isAppVisible, user, directChats, activeTab, mchartSubTab, activeDirectChatId, selectedTopicId]);

  const unreadCounts: NavUnreadCounts = useMemo(() => {
    const countBoard = (board: PrimaryBoard): number => {
      if (isAppVisible && currentlyViewedBoard === board) return 0;
      const cutoff = boardLastSeen[board] || 0;
      return topics.filter((t) => {
        if (t.status === 'private' || t.status === 'archived') return false;
        if (normalizeBoardCategory(t.category) !== board) return false;
        if (user?.uid && t.authorId === user.uid) return false;
        if (readTopicIds.has(t.id)) return false;
        const createdMs = t.createdAt ? t.createdAt.toMillis() : 0;
        return createdMs > cutoff;
      }).length;
    };

    const unreadVideoCount =
      isAppVisible && activeTab === 'video' && !selectedTopicId
        ? 0
        : videos.filter((v) => {
            if (v.isArchived) return false;
            if (user?.uid && v.authorId === user.uid) return false;
            const ms = v.createdAt ? v.createdAt.toMillis() : 0;
            return ms > videosLastSeenMs;
          }).length;

    const unvotedOpenPollsCount =
      isAppVisible && activeTab === 'votes' && !selectedTopicId
        ? 0
        : polls.filter((p) => {
            if (!isPollEffectivelyOpen(p)) return false;
            if (user?.uid && (userPollBallots[p.id] || p.createdBy === user.uid)) return false;
            const ms = p.createdAt ? p.createdAt.toMillis() : 0;
            return ms > votesLastSeenMs;
          }).length;

    return {
      kijiweni: countBoard('Kijiweni'),
      video: isSuspended ? 0 : unreadVideoCount,
      fursa: isSuspended ? 0 : countBoard('Fursa'),
      makala: isSuspended ? 0 : countBoard('Makala'),
      chat: isSuspended ? 0 : unreadChatCount + unreadNotesCount + unreadDirectCount,
      votes: isSuspended ? 0 : unvotedOpenPollsCount,
    };
  }, [
    isSuspended,
    isAppVisible,
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

  // Real-time owner-controlled navigation setting (hideVideoTabForUsers & hideMpollTabForUsers)
  useEffect(() => {
    if (!authReady) return;
    const unsub = subscribeSiteNavSettings((settings) => {
      setHideVideoTabForUsers(settings.hideVideoTabForUsers);
      setHideMpollTabForUsers(Boolean(settings.hideMpollTabForUsers));
    });
    return () => unsub();
  }, [authReady]);

  // Real-time global platform lock listener
  useEffect(() => {
    const unsub = subscribePlatformLockSettings((settings) => {
      setPlatformLock(settings);
      setPlatformLockLoaded(true);
    });
    return () => unsub();
  }, []);

  // Real-time global custom notification sound stored in Firestore (used in Mchart & Notification Bell)
  useEffect(() => {
    const unsub = subscribeNotificationSoundSettings((settings) => {
      setNotificationSoundSettings(settings);
      setConfiguredNotificationSound({
        soundUrl: settings.soundUrl,
        soundName: settings.soundName,
      });
    });
    return () => unsub();
  }, []);

  const handleUpdateNotificationSound = useCallback(
    async (payload: { soundUrl: string; soundName: string; durationSec?: number }) => {
      if (!user?.uid || !isAdmin) return;
      await updateNotificationSoundSettings(user.uid, payload);
      showToast(
        payload.soundUrl
          ? tr(
              'Sauti mpya ya arifa imehifadhiwa kwenye database na inatumika pote!',
              'Custom notification sound saved to database and active everywhere!'
            )
          : tr(
              'Sauti ya kawaida ya Malosha imerejeshwa kwenye database.',
              'Default Malosha notification sound restored.'
            )
      );
    },
    [user?.uid, isAdmin, showToast, tr]
  );

  // Auto-unlock entire platform when verified owner opens the email unlock link (?unlock_platform=...)
  useEffect(() => {
    if (!pendingPlatformUnlockToken || !authReady || !platformLockLoaded) return;
    if (!user || !isAdmin) return;
    let cancelled = false;
    setUnlockingPlatformBusy(true);
    void unlockEntirePlatform(user, pendingPlatformUnlockToken)
      .then(() => {
        if (cancelled) return;
        setPendingPlatformUnlockToken('');
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href);
          url.searchParams.delete('unlock_platform');
          window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
        }
        showToast(
          tr(
            'Jukwaa lote limefunguliwa kikamilifu kupitia kiungo cha email!',
            'Entire platform unlocked successfully via your email link!'
          )
        );
      })
      .catch((err) => {
        if (!cancelled) {
          showToast(
            err instanceof Error
              ? err.message
              : tr('Imeshindwa kufungua jukwaa.', 'Failed to unlock platform.'),
            'error'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setUnlockingPlatformBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pendingPlatformUnlockToken, authReady, platformLockLoaded, user, isAdmin, showToast, tr]);

  const refreshPlatformUsersCount = useCallback(async () => {
    setLoadingUsersCount(true);
    try {
      const count = await fetchPlatformUsersCount(isAdminRef.current);
      setTotalUsersCount(count);
    } catch {
      // Keep previous count if fetch fails
    } finally {
      setLoadingUsersCount(false);
    }
  }, []);

  useEffect(() => {
    if (!authReady) return;
    void refreshPlatformUsersCount();
  }, [authReady, isAdmin, user?.uid, adminRecentSignups.length, refreshPlatformUsersCount]);

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
  const hideCreateMpollForCurrentUser = hideMpollTabForUsers && !isAdmin;

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

  totalAppUnreadCountRef.current = totalAppUnreadCount;
  isAppVisibleRef.current = isAppVisible;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const handleVisibility = () => {
      const visible = document.visibilityState === 'visible';
      setIsAppVisible(visible);
      isAppVisibleRef.current = visible;
      if (visible) {
        acknowledgedUnreadTotalRef.current = totalAppUnreadCountRef.current;
        lastBgBadgeSentRef.current = 0;
        latestBgAlertSummaryRef.current = '';
        void dismissPhoneNotifications();
        if (isMobileDeviceContext() || isStandalonePWA()) {
          void updateAppBadgeCount(0);
        }
      }
    };
    const handleFocusOrShow = () => {
      setIsAppVisible(true);
      isAppVisibleRef.current = true;
      acknowledgedUnreadTotalRef.current = totalAppUnreadCountRef.current;
      lastBgBadgeSentRef.current = 0;
      latestBgAlertSummaryRef.current = '';
      void dismissPhoneNotifications();
      if (isMobileDeviceContext() || isStandalonePWA()) {
        void updateAppBadgeCount(0);
      }
    };
    const handleHide = () => {
      setIsAppVisible(false);
      isAppVisibleRef.current = false;
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocusOrShow);
    window.addEventListener('pageshow', handleFocusOrShow);
    window.addEventListener('pagehide', handleHide);

    // Clear any stale OS tray alerts & mobile icon badge right on opening the app
    if (document.visibilityState === 'visible') {
      void dismissPhoneNotifications();
      if (isMobileDeviceContext() || isStandalonePWA()) {
        void updateAppBadgeCount(0);
      }
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocusOrShow);
      window.removeEventListener('pageshow', handleFocusOrShow);
      window.removeEventListener('pagehide', handleHide);
    };
  }, []);

  // Sync unread count onto PC & Mobile App Icon badge (clear automatically when opened on mobile; increment & show tray summary while backgrounded)
  useEffect(() => {
    const isMobileOrInstalled = isMobileDeviceContext() || isStandalonePWA();
    if (acknowledgedUnreadTotalRef.current === null) {
      acknowledgedUnreadTotalRef.current = isAppVisible ? totalAppUnreadCount : 0;
    } else if (totalAppUnreadCount < acknowledgedUnreadTotalRef.current) {
      acknowledgedUnreadTotalRef.current = totalAppUnreadCount;
    }

    if (isAppVisible) {
      acknowledgedUnreadTotalRef.current = totalAppUnreadCount;
      lastBgBadgeSentRef.current = 0;
      void dismissPhoneNotifications();
      if (isMobileOrInstalled) {
        void updateAppBadgeCount(0);
      } else {
        void updateAppBadgeCount(totalAppUnreadCount);
      }
      return;
    }

    const backgroundUnread = Math.max(
      0,
      totalAppUnreadCount - (acknowledgedUnreadTotalRef.current ?? 0)
    );
    const badgeValue = isMobileOrInstalled ? backgroundUnread : Math.max(backgroundUnread, totalAppUnreadCount);
    const hasIncreased = badgeValue > lastBgBadgeSentRef.current;
    lastBgBadgeSentRef.current = badgeValue;

    void updateAppBadgeCount(badgeValue);
    if (isMobileOrInstalled && badgeValue > 0) {
      const summary =
        latestBgAlertSummaryRef.current ||
        tr(
          `Una taarifa ${badgeValue} mpya zinazosubiri Malosha Forums.`,
          `You have ${badgeValue} new updates on Malosha Forums.`
        );
      void syncBackgroundSummaryNotification(badgeValue, summary, { renotify: hasIncreased });
    }
  }, [totalAppUnreadCount, isAppVisible, tr]);

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
        playIncomingMessageSound();
        const alertTitle = tr('Video Mpya · Malosha Reels', 'New Video · Malosha Reels');
        const alertBody =
          newestVideo.caption.trim() ||
          tr(
            `${newestVideo.authorName} amepakia video mpya`,
            `${newestVideo.authorName} posted a new video`
          );
        if (typeof document !== 'undefined' && !document.hidden) {
          showToast(`${alertTitle}: ${alertBody.slice(0, 75)}`);
        } else {
          latestBgAlertSummaryRef.current = `${alertTitle}: ${alertBody.slice(0, 95)}`;
        }
        void sendPhoneNotification({
          title: alertTitle,
          body: alertBody.slice(0, 140),
          url: `/?tab=video&v=${encodeURIComponent(newestVideo.id)}`,
          tag: `malosha-video-${newestVideo.id}`,
          badgeCount: !isAppVisibleRef.current
            ? Math.max(1, totalAppUnreadCountRef.current + 1 - (acknowledgedUnreadTotalRef.current ?? 0))
            : undefined,
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

        // Keep new member registration notifications exclusively in the Header Notification Bell (play bell sound on new signup)
        const hasNewSignup = list.some((u) => !knownAdminSignupIdsRef.current.has(u.uid));
        list.forEach((u) => knownAdminSignupIdsRef.current.add(u.uid));
        if (hasNewSignup) {
          playIncomingMessageSound();
        }
      },
      () => {
        // Non-fatal fallback
      }
    );

    return () => unsub();
  }, [authReady, user, isAdmin]);

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
            playIncomingMessageSound();
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
            } else {
              latestBgAlertSummaryRef.current = `${actionText}${topicLabel}`;
            }
            void sendPhoneNotification({
              title: `${actionText}${topicLabel}`,
              body: newestUnread.replyPreview.slice(0, 140),
              topicId: isModerationAlert ? '' : newestUnread.topicId,
              tag: `malosha-reply-${newestUnread.id}`,
              badgeCount: !isAppVisibleRef.current
                ? Math.max(1, totalAppUnreadCountRef.current + 1 - (acknowledgedUnreadTotalRef.current ?? 0))
                : undefined,
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

    // Never keep stale ?mada= or ?m= query parameter, and restore root path when closing short links
    if (!selectedTopicId && (url.searchParams.has('mada') || url.searchParams.has('m'))) {
      url.searchParams.delete('mada');
      url.searchParams.delete('m');
      changed = true;
    }
    if (!selectedTopicId && /^\/m\/[^/]+\/?$/.test(url.pathname)) {
      url.pathname = '/';
      changed = true;
    }
    if (!pendingGroupInvite && (url.searchParams.has('g') || url.searchParams.get('join') === 'group' || /^\/g\/[^/]+\/?$/.test(url.pathname))) {
      url.searchParams.delete('g');
      if (url.searchParams.get('join') === 'group') url.searchParams.delete('join');
      if (/^\/g\/[^/]+\/?$/.test(url.pathname)) url.pathname = '/';
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
  }, [selectedTopicId, activeTab, mchartSubTab, selectedPollId, pendingGroupInvite]);

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
        if (isSuspended && normalizeBoardCategory(String(data.category || '')) !== 'Kijiweni') {
          setSharedTopicFallback(null);
          setSelectedTopicId(null);
          setActiveTab('kijiweni');
          setSelectedCategory('Kijiweni');
          return;
        }
        const isAuthorViewingOwnPrivate =
          Boolean(user?.uid) && data.authorId === user?.uid && data.status === 'private';
        const isPublicStatus = data.status === 'open' || data.status === 'locked';
        const isAdminNonPrivate = isAdmin && data.status !== 'private';
        if (!isPublicStatus && !isAuthorViewingOwnPrivate && !isAdminNonPrivate) {
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
          sharesCount: Number(data.sharesCount || 0),
          acceptedReplyId: data.acceptedReplyId || '',
          company: data.company || '',
          location: data.location || '',
          jobType: data.jobType || '',
          deadline: data.deadline || '',
          applyInfo: data.applyInfo || '',
          coverImage: data.coverImage || '',
          images: Array.isArray(data.images) ? data.images.map(String).filter(Boolean) : [],
          bodyFontStyle: normalizeKijiweniFontStyle(data.bodyFontStyle),
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
  }, [authReady, selectedTopicId, topics, isAdmin, user?.uid, isSuspended]);

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

  const handleShareTopicAction = useCallback(
    (t: Topic) => {
      if (normalizeBoardCategory(t.category) === 'Makala') {
        setShareModalTopic(t);
        return;
      }
      void shareTopic(t, (msg) => showToast(msg), lang).then((sharedOk) => {
        if (sharedOk) {
          void incrementTopicShareCount(t.id);
        }
      });
    },
    [lang, showToast]
  );

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    const origin = window.location.origin;

    const upsertMeta = (attr: 'name' | 'property', key: string, content: string) => {
      let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    const upsertCanonical = (href: string) => {
      let el = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!el) {
        el = document.createElement('link');
        el.setAttribute('rel', 'canonical');
        document.head.appendChild(el);
      }
      el.setAttribute('href', href);
    };

    if (selectedTopic) {
      const payload = buildMakalaSocialPayload(selectedTopic, origin, lang);
      const pageTitle = `${payload.title} | Malosha Forums`;
      const desc =
        payload.excerpt ||
        `Soma makala kamili na ${payload.authorName} kwenye Malosha Forums.`;

      document.title = pageTitle;
      upsertCanonical(payload.shareUrl);
      upsertMeta('name', 'description', desc);
      upsertMeta('property', 'og:type', 'article');
      upsertMeta('property', 'og:url', payload.shareUrl);
      upsertMeta('property', 'og:title', pageTitle);
      upsertMeta('property', 'og:description', desc);
      upsertMeta('property', 'og:image', payload.imageUrl);
      upsertMeta('property', 'og:image:secure_url', payload.imageUrl);
      upsertMeta('property', 'og:image:alt', payload.title);
      upsertMeta('name', 'twitter:card', 'summary_large_image');
      upsertMeta('name', 'twitter:title', pageTitle);
      upsertMeta('name', 'twitter:description', desc);
      upsertMeta('name', 'twitter:image', payload.imageUrl);
    } else {
      const fallbackUrl = `${origin}${window.location.pathname || '/'}`;
      const defaultTitle =
        lang === 'en'
          ? 'Malosha Forums — Community Discussion Platform'
          : 'Malosha Forums — Jukwaa la Mijadala';
      const defaultDesc =
        'Mfumo wa kisasa wa mijadala, makala, fursa, video fupi, na Mchart kwa usalama na ufanisi.';
      const defaultImage = `${origin}/pwa-512x512.png`;

      document.title = defaultTitle;
      upsertCanonical(fallbackUrl);
      upsertMeta('name', 'description', defaultDesc);
      upsertMeta('property', 'og:type', 'website');
      upsertMeta('property', 'og:url', fallbackUrl);
      upsertMeta('property', 'og:title', defaultTitle);
      upsertMeta('property', 'og:description', defaultDesc);
      upsertMeta('property', 'og:image', defaultImage);
      upsertMeta('property', 'og:image:secure_url', defaultImage);
      upsertMeta('name', 'twitter:title', defaultTitle);
      upsertMeta('name', 'twitter:description', defaultDesc);
      upsertMeta('name', 'twitter:image', defaultImage);
    }
  }, [selectedTopic, lang]);

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

  const handleToggleHideMpollTab = useCallback(async () => {
    if (!user || !isAdmin) return;
    const next = !hideMpollTabForUsers;
    try {
      await updateSiteNavSettings(user.uid, {
        hideVideoTabForUsers,
        hideMpollTabForUsers: next,
      });
      showToast(
        next
          ? tr(
              'Kitufe cha "Tengeneza Mpoll Mpya" kimefichwa kwa watumiaji wengine (wanaweza kupiga kura tu).',
              '"Create New Mpoll" button is now hidden from other users (voting remains open).'
            )
          : tr(
              'Kitufe cha "Tengeneza Mpoll Mpya" kimewekwa wazi kwa watumiaji wote.',
              '"Create New Mpoll" button is now visible to everyone.'
            )
      );
    } catch (err) {
      showToast(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kubadilisha uonekano wa kitufe cha Mpoll.', 'Failed to update Mpoll button visibility.'),
        'error'
      );
    }
  }, [user, isAdmin, hideMpollTabForUsers, hideVideoTabForUsers, showToast, tr]);

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

  const handleLockPlatform = useCallback(
    async (reason: string) => {
      if (!user || !isAdmin) {
        throw new Error(tr('Mmiliki pekee ndiye anayeweza kufunga jukwaa.', 'Owner only.'));
      }
      const res = await lockEntirePlatform(user, reason);
      if (res.sent) {
        showToast(
          tr(
            `Jukwaa lote limefungwa na email ya kufungua imetumwa kwenda ${res.recipient}.`,
            `Entire platform locked and unlock email sent to ${res.recipient}.`
          )
        );
      } else {
        showToast(
          tr(
            'Jukwaa lote limefungwa! Tumia kitufe cha Email kilichoonyeshwa kutuma kiungo cha kufungua.',
            'Entire platform locked! Use the email button shown to send your unlock link.'
          )
        );
      }
      return res;
    },
    [user, isAdmin, showToast, tr]
  );

  const handleUnlockPlatform = useCallback(async () => {
    if (!user || !isAdmin) {
      throw new Error(tr('Mmiliki pekee ndiye anayeweza kufungua jukwaa.', 'Owner only.'));
    }
    await unlockEntirePlatform(user);
    showToast(
      tr(
        'Jukwaa limefunguliwa kikamilifu! Watumiaji wote sasa wanaweza kulitumia.',
        'Platform unlocked! Everyone can use the platform again.'
      )
    );
  }, [user, isAdmin, showToast, tr]);

  const handleSelectTab = (tab: NavTab) => {
    if (isSuspended && tab !== 'kijiweni' && tab !== 'safety' && tab !== 'auth') {
      showToast(
        tr(
          'Akaunti yako imefungwa. Unaweza kusoma Kijiweni pekee (bila kuandika chochote).',
          'Your account is closed. You can only read Kijiweni (read-only).'
        ),
        'error'
      );
      setActiveTab('kijiweni');
      setSelectedCategory('Kijiweni');
      setSelectedTopicId(null);
      return;
    }
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
      setKijiweniEntryToken((n) => n + 1);
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
    if (isSuspended && normalized !== 'Kijiweni') {
      showToast(
        tr(
          'Akaunti yako imefungwa. Unaweza kusoma Kijiweni pekee.',
          'Your account is closed. You can only read Kijiweni.'
        ),
        'error'
      );
      setSelectedCategory('Kijiweni');
      setSelectedTopicId(null);
      setActiveTab('kijiweni');
      return;
    }
    setSelectedCategory(normalized);
    setSelectedTopicId(null);
    if (normalized === 'Kijiweni') {
      setActiveTab('kijiweni');
      setKijiweniEntryToken((n) => n + 1);
    } else if (normalized === 'Fursa') {
      setActiveTab('fursa');
    } else {
      setActiveTab('makala');
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  };

  const latestMakala = useMemo(() => {
    if (isSuspended) return [];
    return topics
      .filter(
        (t) =>
          normalizeBoardCategory(t.category) === 'Makala' &&
          t.status !== 'private' &&
          t.status !== 'archived'
      )
      .sort((a, b) => {
        const am = a.createdAt ? a.createdAt.toMillis() : Date.now();
        const bm = b.createdAt ? b.createdAt.toMillis() : Date.now();
        return bm - am;
      });
  }, [topics, isSuspended]);

  const openTopicFromFeed = useCallback(
    (topicId: string) => {
      if (isSuspended) {
        const match = topics.find((t) => t.id === topicId);
        if (match && normalizeBoardCategory(match.category) !== 'Kijiweni') {
          showToast(
            tr(
              'Akaunti yako imefungwa. Unaweza kusoma Kijiweni pekee.',
              'Your account is closed. Only Kijiweni reading is allowed.'
            ),
            'error'
          );
          return;
        }
      }
      markTopicRead(topicId);
      if (typeof window !== 'undefined') {
        feedScrollYRef.current = window.scrollY || window.pageYOffset || 0;
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
      setSelectedTopicId(topicId);
    },
    [markTopicRead, isSuspended, topics, showToast, tr]
  );

  // Clamp active section & open topics strictly to Kijiweni (or safety profile) when suspended
  useEffect(() => {
    if (!isSuspended) return;
    if (activeTab !== 'kijiweni' && activeTab !== 'safety' && activeTab !== 'auth') {
      setActiveTab('kijiweni');
      setSelectedCategory('Kijiweni');
      setSelectedTopicId(null);
    }
    if (selectedTopic && normalizeBoardCategory(selectedTopic.category) !== 'Kijiweni') {
      setSelectedTopicId(null);
      setSharedTopicFallback(null);
    }
  }, [isSuspended, activeTab, selectedTopic]);

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

    if (suppressNextTopicsAlertRef.current) {
      knownTopicIdsRef.current = new Set(topics.map((t) => t.id));
      suppressNextTopicsAlertRef.current = false;
      return;
    }

    const nowMs = Date.now();
    const newlyPublished = topics.find((t) => {
      if (knownTopicIdsRef.current.has(t.id) || t.status === 'private') return false;
      const ageMs = t.createdAt ? nowMs - t.createdAt.toMillis() : 0;
      return ageMs <= 10 * 60 * 1000;
    });
    knownTopicIdsRef.current = new Set(topics.map((t) => t.id));

    if (newlyPublished && newlyPublished.authorId !== user?.uid && newlyPublished.status !== 'private') {
      const board = normalizeBoardCategory(newlyPublished.category);
      if (isSuspended && board !== 'Kijiweni') {
        return;
      }
      playIncomingMessageSound();
      const alertTitle =
        board === 'Makala'
          ? tr('Habari Mpya · Malosha', 'Breaking News · Malosha')
          : board === 'Fursa'
            ? tr('Fursa Mpya · Malosha', 'New Opportunity · Malosha')
            : tr('Chapisho Jipya · Kijiweni', 'New Post · Kijiweni');
      const alertBody = newlyPublished.title.trim() || newlyPublished.body.slice(0, 100);

      if (typeof document !== 'undefined' && !document.hidden) {
        showToast(`${alertTitle}: ${alertBody}`);
      } else {
        latestBgAlertSummaryRef.current = `${alertTitle}: ${alertBody.slice(0, 95)}`;
      }
      void sendPhoneNotification({
        title: alertTitle,
        body: alertBody,
        topicId: newlyPublished.id,
        badgeCount: !isAppVisibleRef.current
          ? Math.max(1, totalAppUnreadCountRef.current + 1 - (acknowledgedUnreadTotalRef.current ?? 0))
          : undefined,
      });
    }
  }, [loadingTopics, topics, user?.uid, isSuspended, showToast, tr]);

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

  const handleSaveTopic = async (
    data: {
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
      images?: string[];
      bodyFontStyle?: KijiweniFontStyle;
    },
    options?: { silent?: boolean; stayOnFeed?: boolean }
  ) => {
    if (!user || blockIfSuspended()) return;
    if (editingTopic) {
      await editTopic(editingTopic.id, data);
      if (!options?.silent) {
        showToast(tr('Mabadiliko yamehifadhiwa.', 'Changes saved.'));
      }
    } else {
      const newId = await createTopic(
        user,
        userProfile?.displayName || user.displayName || 'Mwanachama',
        data
      );
      if (!options?.silent) {
        if (!options?.stayOnFeed) {
          setSelectedTopicId(newId);
        }
        showToast(tr('Chapisho lako jipya limewekwa hewani!', 'Your new post is now live!'));
      }
    }
  };

  const handleCreateKijiweniPost = async (
    data: {
      title: string;
      body: string;
      tags: string[];
      coverImage?: string;
      images?: string[];
      bodyFontStyle?: KijiweniFontStyle;
      status?: 'open' | 'private';
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
        ...(data.images && data.images.length > 0 ? { images: data.images } : {}),
        ...(data.bodyFontStyle ? { bodyFontStyle: data.bodyFontStyle } : {}),
        ...(data.status === 'private' ? { status: 'private' } : {}),
      }
    );
    if (!options?.silent) {
      showToast(
        data.status === 'private'
          ? tr(
              'Chapisho lako limehifadhiwa kwa faragha (linaonekana kwenye akaunti yako tu).',
              'Your post was saved privately (visible only in your account).'
            )
          : tr('Chapisho lako limewekwa Kijiweni!', 'Your post is now live in Kijiweni!')
      );
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

  const handleTogglePrivateTopic = async (topic: Topic) => {
    if (!user || topic.authorId !== user.uid || blockIfSuspended()) return;
    if (topic.status === 'archived') return;
    const nextStatus = topic.status === 'private' ? 'open' : 'private';
    await updateTopicStatus(topic.id, nextStatus);
    const isMakala = normalizeBoardCategory(topic.category) === 'Makala';
    showToast(
      nextStatus === 'private'
        ? isMakala
          ? tr(
              'Makala imeondolewa kwa wengine — bado inaonekana kwako tu.',
              'Article hidden from others — still visible to you only.'
            )
          : tr(
              'Chapisho limefungwa na sasa linaonekana kwenye akaunti yako tu.',
              'Post locked to private and visible only in your account.'
            )
        : isMakala
          ? tr(
              'Makala imerejeshwa na sasa inaonekana kwa wote.',
              'Article restored and now visible to everyone.'
            )
          : tr(
              'Chapisho limefunguliwa tena na sasa linaonekana kwa wote.',
              'Post unlocked and now visible to everyone.'
            )
    );
  };

  const handleToggleArchive = async (topic: Topic) => {
    if (!isAdmin) return;
    const nextStatus = topic.status === 'archived' ? 'open' : 'archived';
    await updateTopicStatus(topic.id, nextStatus);
    const isMakala = normalizeBoardCategory(topic.category) === 'Makala';
    if (nextStatus === 'archived') {
      if (!isMakala) {
        setSelectedTopicId(null);
      }
      showToast(
        isMakala
          ? tr(
              'Makala imeondolewa kwa wengine — bado inaonekana kwako tu.',
              'Article hidden from others — still visible to you only.'
            )
          : tr(
              'Chapisho limefungwa na kuondolewa kwa watumiaji wengine.',
              'Post closed and removed from public view.'
            )
      );
    } else {
      showToast(
        isMakala
          ? tr('Makala imerejeshwa kwa watumiaji wote.', 'Article restored for everyone.')
          : tr('Chapisho limerejeshwa hewani.', 'Post restored to public view.')
      );
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
    const cleanName = await updateUserProfile(user.uid, displayName, bio);
    setUserProfile((prev) =>
      prev ? { ...prev, displayName: cleanName, bio: bio.trim() } : prev
    );
    setLocalUserIdentity(user.uid, { displayName: cleanName });
    await updateProfile(user, { displayName: cleanName }).catch(() => {});
    if (phoneNumber !== undefined) {
      await updatePrivatePhoneNumber(user.uid, phoneNumber);
      setUserPhone(phoneNumber.trim());
    }
    await propagateUserIdentityAcrossAccount(user.uid, { displayName: cleanName }).catch(() => {});
  };

  const handleUpdateProfilePhoto = async (photoURL: string) => {
    if (!user || blockIfSuspended()) return;
    const cleanUrl = await updateUserProfilePhoto(
      user.uid,
      photoURL,
      userProfile?.displayName || user.displayName || 'Mwanachama'
    );
    setUserProfile((prev) => (prev ? { ...prev, photoURL: cleanUrl } : prev));
    setLocalUserIdentity(user.uid, { photoURL: cleanUrl });
    await updateProfile(user, { photoURL: cleanUrl || null }).catch(() => {});
    await propagateUserIdentityAcrossAccount(user.uid, { photoURL: cleanUrl }).catch(() => {});
  };

  const handleToggleProfileDetailsPublic = async (isPublic: boolean) => {
    if (!user || blockIfSuspended()) return;
    const saved = await updateUserProfileDetailsVisibility(user.uid, isPublic);
    setUserProfile((prev) => (prev ? { ...prev, profileDetailsPublic: saved } : prev));
    showToast(
      saved
        ? tr(
            'Taarifa za wasifu sasa zinaonekana kwa wanachama wengine.',
            'Profile details are now visible to other members.'
          )
        : tr(
            'Taarifa za wasifu zimefichwa kwa wengine. Picha ya profile bado inaonekana.',
            'Profile details are now hidden from others. Profile photo stays visible.'
          )
    );
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
  const isAuthView = activeTab === 'auth' && authReady && !user;
  const isFullStageView = isMchartView || isVideoView;
  const isKijiweniView =
    !isFullStageView &&
    !isAuthView &&
    (selectedTopic
      ? normalizeBoardCategory(selectedTopic.category) === 'Kijiweni'
      : activeTab === 'kijiweni' ||
        (activeTab === 'all' && selectedCategory === 'Kijiweni'));
  const lockViewportToScreen = isFullStageView || isAuthView;
  const { isKeyboardOpen: mobileKeyboardOpen, keyboardHeight } = useMobileKeyboardState();

  useEffect(() => {
    if (!lockViewportToScreen || typeof window === 'undefined') {
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

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.overscrollBehavior = prevBodyOverscroll;
    };
  }, [lockViewportToScreen]);

  if (platformLock.isLocked && !isAdmin) {
    if (activeTab === 'auth' && authReady && !user) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col">
          <div className="border-b border-red-800/50 bg-red-950/90 px-4 py-2.5 text-center text-xs font-semibold text-red-100">
            {pendingPlatformUnlockToken
              ? tr(
                  `Ingia kama Mmiliki (${ADMIN_EMAIL}) kuthibitisha kiungo cha kufungua jukwaa.`,
                  `Sign in as Owner (${ADMIN_EMAIL}) to verify the platform unlock link.`
                )
              : tr(
                  `Jukwaa limefungwa kwa muda — Ingia kama Mmiliki (${ADMIN_EMAIL}) pekee.`,
                  `Platform is locked — Owner sign-in (${ADMIN_EMAIL}) only.`
                )}
          </div>
          <div className="flex-1 overflow-hidden">
            <AuthView
              promptReason={null}
              onBack={() => setActiveTab('kijiweni')}
              onSuccess={() => {
                setActiveTab('kijiweni');
              }}
            />
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-[#061322] via-[#0E2640] to-[#163A5F] px-4 py-10 flex items-center justify-center text-slate-900">
        <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-white p-6 sm:p-8 shadow-2xl">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-700 ring-1 ring-red-200">
              <ShieldAlert className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[11px] font-extrabold tracking-widest text-red-700 uppercase">
                Malosha Forums
              </p>
              <h1 className="font-display text-xl font-bold text-slate-900 sm:text-2xl">
                {tr('Jukwaa Limefungwa Kwa Muda', 'Platform Temporarily Locked')}
              </h1>
            </div>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-slate-600">
            {tr(
              'Mmiliki wa mfumo amefunga jukwaa lote kwa muda. Hakuna mtumiaji anayeweza kusoma au kutumia kipengele chochote hadi lifunguliwe tena.',
              'The platform owner has temporarily locked the entire platform. All sections are unavailable until the owner reopens it.'
            )}
          </p>

          <div className="mt-4 rounded-xl border border-red-200 bg-red-50/70 p-4">
            <p className="text-[11px] font-extrabold tracking-wide text-red-800 uppercase">
              {tr('Sababu kutoka kwa Mmiliki', 'Reason from Platform Owner')}
            </p>
            <p className="mt-1.5 text-sm font-semibold whitespace-pre-wrap text-slate-900">
              {platformLock.reason || tr('Matengenezo ya mfumo.', 'System maintenance.')}
            </p>
          </div>

          {pendingPlatformUnlockToken && (
            <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3.5 text-xs text-sky-950">
              <p className="font-bold">
                {tr(
                  'Kiungo cha kufungua jukwaa kutoka email kimetambuliwa!',
                  'Platform unlock link from email detected!'
                )}
              </p>
              <p className="mt-0.5 text-[11px] text-sky-800">
                {tr(
                  `Bofya kitufe hapa chini uingie na akaunti ya mmiliki (${ADMIN_EMAIL}) ili kulifungua jukwaa papo hapo.`,
                  `Sign in with the owner account (${ADMIN_EMAIL}) below to immediately unlock the platform.`
                )}
              </p>
            </div>
          )}

          {user && !isAdmin && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700">
              <span className="truncate">
                {tr('Umeingia kama:', 'Signed in as:')}{' '}
                <strong className="text-slate-900">{user.email || user.displayName}</strong>
              </span>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{tr('Toka', 'Sign Out')}</span>
              </button>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <span className="text-xs text-slate-500">
              {unlockingPlatformBusy
                ? tr('Inafungua jukwaa...', 'Unlocking platform...')
                : tr('Mmiliki pekee anaweza kufungua.', 'Only the owner can unlock.')}
            </span>
            {!user && (
              <button
                type="button"
                onClick={() => setActiveTab('auth')}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-[#0E2640] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#163A5F]"
              >
                <Lock className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
                <span>
                  {pendingPlatformUnlockToken
                    ? tr('Ingia kama Mmiliki & Fungua', 'Owner Sign-In & Unlock')
                    : tr('Mmiliki? Ingia Kufungua', 'Owner? Sign In to Unlock')}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

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
          : isKijiweniView
            ? 'bg-[#E5E9EF]'
            : 'bg-[#F1F4F8]'
      }`}
    >
      <AppLaunchLoader ready={appReady} />
      <OfflineIndicator />

      {!isAuthView && (
        <div className={isMchartView ? 'hidden' : isVideoView ? 'hidden md:block' : ''}>
          <Header
            activeTab={activeTab}
            onSelectTab={handleSelectTab}
            onOpenTopic={openTopicFromFeed}
            topics={topics}
            userUid={user?.uid || null}
            userProfile={userProfile}
            userDisplayName={userProfile?.displayName || user?.displayName || 'Mwanachama'}
            userPhoto={userProfile ? userProfile.photoURL : user?.photoURL || ''}
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
            hideMpollTab={false}
            recentSignups={adminRecentSignups}
            unreadSignupCount={unreadSignupCount}
            signupLastSeenMs={adminSignupLastSeenMs}
            onMarkSignupsSeen={markAdminSignupsSeen}
            onOpenAdminMembers={handleOpenAdminMembers}
            totalUsersCount={totalUsersCount}
            loadingUsersCount={loadingUsersCount}
            onRefreshTotalUsersCount={() => void refreshPlatformUsersCount()}
          />
        </div>
      )}

      <main
        style={
          mobileKeyboardOpen && keyboardHeight > 0 && !isFullStageView && !isAuthView
            ? { paddingBottom: `${keyboardHeight + 24}px` }
            : undefined
        }
        className={`flex-1 ${
          isAuthView
            ? 'h-[100dvh] overflow-hidden'
            : isMchartView
              ? 'pt-0'
              : isVideoView
                ? 'pt-0 md:pt-[var(--malosha-header-h,118px)]'
                : `pt-[var(--malosha-header-h,118px)] ${isFullStageView ? '' : 'pb-16 md:pb-0'}`
        }`}
      >
        {platformLock.isLocked && isAdmin && !isFullStageView && !isAuthView && (
          <div className="border-b border-red-300 bg-red-700 px-4 py-2.5 text-white">
            <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
              <div className="flex items-start gap-2 text-xs sm:text-sm">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                <div>
                  <span className="font-extrabold">
                    {tr(
                      'JUKWAA LOTE LIMEFUNGWA KWA WATUMIAJI WOTE:',
                      'ENTIRE PLATFORM LOCKED FOR ALL USERS:'
                    )}
                  </span>{' '}
                  <span className="text-red-100">{platformLock.reason}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleUnlockPlatform()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-extrabold text-red-800 shadow-sm hover:bg-red-50"
              >
                <Unlock className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{tr('Fungua Jukwaa Sasa', 'Unlock Platform Now')}</span>
              </button>
            </div>
          </div>
        )}

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
                      'Makala, Fursa, Mchart na Mpoll zimefichwa. Unaweza kusoma Kijiweni pekee bila kuandika chochote.',
                      'Articles, Opportunities, Mchart, and Mpoll are hidden. You can only read Kijiweni in read-only mode.'
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

        {selectedTopic && (!isSuspended || normalizeBoardCategory(selectedTopic.category) === 'Kijiweni') ? (
          <TopicDetail
            topic={selectedTopic}
            latestMakala={isSuspended ? [] : latestMakala}
            onOpenTopic={openTopicFromFeed}
            userUid={user?.uid || null}
            userDisplayName={userProfile?.displayName || user?.displayName || 'Mwanachama'}
            userPhoto={userProfile ? userProfile.photoURL : user?.photoURL || ''}
            isAdmin={isAdmin}
            isSuspended={isSuspended}
            hasVotedTopic={votedTopicIds.has(selectedTopic.id)}
            onBack={returnToFeed}
            onSelectBoard={handleSelectBoard}
            onToggleTopicVote={handleToggleTopicVote}
            onShareTopic={handleShareTopicAction}
            onEditTopic={(t) => {
              if (blockIfSuspended()) return;
              setEditingTopic(t);
              setComposerOpen(true);
            }}
            onToggleLock={handleToggleLock}
            onTogglePin={handleTogglePin}
            onToggleArchive={handleToggleArchive}
            onTogglePrivate={handleTogglePrivateTopic}
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
          authReady && !user ? (
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
            onToggleProfileDetailsPublic={handleToggleProfileDetailsPublic}
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
            hideMpollTabForUsers={hideMpollTabForUsers}
            onToggleHideMpollTab={isAdmin ? handleToggleHideMpollTab : undefined}
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
            platformLock={platformLock}
            onLockPlatform={isAdmin ? handleLockPlatform : undefined}
            onUnlockPlatform={isAdmin ? handleUnlockPlatform : undefined}
            notificationSoundSettings={notificationSoundSettings}
            onUpdateNotificationSound={isAdmin ? handleUpdateNotificationSound : undefined}
          />
        ) : activeTab === 'chat' && !isSuspended ? (
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
            onClearedAllChats={() => setRawChatMessages([])}
            subTab={mchartSubTab}
            onChangeSubTab={setMchartSubTab}
            activeDirectChatId={activeDirectChatId}
            onChangeActiveDirectChatId={setActiveDirectChatId}
            user={user}
            userDisplayName={userProfile?.displayName || user?.displayName || 'Mwanachama'}
            userPhoto={userProfile ? userProfile.photoURL : user?.photoURL || ''}
            isAdmin={isAdmin}
            isSuspended={isSuspended}
            keyboardOpen={isMchartView && mobileKeyboardOpen}
            groupSettings={mchartGroupSettings}
            groupReadCursors={groupReadCursors}
            groupUnreadCount={unreadChatCount}
            onBackToForum={() => handleSelectTab('kijiweni')}
            pendingGroupInvite={pendingGroupInvite}
            onDismissGroupInvite={() => setPendingGroupInvite(false)}
            onSignIn={handleSignIn}
            onToast={showToast}
            onRequestConfirm={(opts) => setConfirmState(opts)}
          />
        ) : activeTab === 'video' && !isSuspended ? (
          <VideosFeedView
            videos={videos}
            loading={loadingVideos}
            likedVideoIds={likedVideoIds}
            user={user}
            userDisplayName={userProfile?.displayName || user?.displayName || 'Mwanachama'}
            userPhoto={userProfile ? userProfile.photoURL : user?.photoURL || ''}
            isAdmin={isAdmin}
            isSuspended={isSuspended}
            initialVideoId={initialVideoId}
            onBack={() => handleSelectTab('kijiweni')}
            onAuthorClick={(author) => setProfileModalTarget(author)}
            onSignIn={() => handleSignIn()}
            onToast={showToast}
            onRequestConfirm={(opts) => setConfirmState(opts)}
          />
        ) : activeTab === 'votes' && !isSuspended ? (
          <VotingPollsView
            polls={polls}
            loading={loadingPolls}
            userBallots={userPollBallots}
            onBallotSaved={(pollId, ballot) => {
              setUserPollBallots((prev) => ({ ...prev, [pollId]: ballot }));
            }}
            user={user}
            userDisplayName={userProfile?.displayName || user?.displayName || 'Mwanachama'}
            userPhoto={userProfile ? userProfile.photoURL : user?.photoURL || ''}
            isAdmin={isAdmin}
            isSuspended={isSuspended}
            hideCreateForUsers={hideCreateMpollForCurrentUser}
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
            userPhoto={userProfile ? userProfile.photoURL : user?.photoURL || ''}
            isAdmin={isAdmin}
            isSuspended={isSuspended}
            votedTopicIds={votedTopicIds}
            onToggleVote={handleToggleTopicVote}
            onShareTopic={handleShareTopicAction}
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
            onTogglePrivate={handleTogglePrivateTopic}
            onToggleArchive={handleToggleArchive}
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
            hideMpollTab={false}
            hasMoreCloudTopics={hasMoreCloudTopics}
            loadingMoreCloudTopics={loadingMoreCloudTopics}
            onLoadMoreCloudTopics={handleLoadMoreCloudTopics}
            kijiweniEntryToken={kijiweniEntryToken}
          />
        )}
      </main>

      {!isFullStageView && !isAuthView && !mobileKeyboardOpen && (
        <footer
          className={`border-t py-6 pb-20 md:pb-6 transition-colors duration-300 ${
            isMpollDarkBlue
              ? 'border-[#1D4E89]/40 bg-[#041226] text-slate-300'
              : isKijiweniView
                ? 'border-[#D0D8E2] bg-[#EAEEF3] text-slate-600'
                : 'border-slate-200 bg-white text-slate-500'
          }`}
        >
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-xs sm:flex-row sm:px-6">
            <p>
              © {new Date().getFullYear()} Malosha Forums. Kijiweni
              {!isSuspended && (
                <>
                  {!hideVideoTabForCurrentUser && ' · Video'} · {tr('Fursa', 'Opportunities')} ·{' '}
                  {tr('Makala', 'Articles')} · Mchart · Mpoll
                </>
              )}
              .
            </p>
            <div className="flex flex-wrap items-center justify-center gap-5">
              <button
                type="button"
                onClick={() => handleSelectTab('kijiweni')}
                className={isMpollDarkBlue ? 'hover:text-white hover:underline' : 'hover:text-slate-900 hover:underline'}
              >
                Kijiweni
              </button>
              {!isSuspended && (
                <>
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
                </>
              )}
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
          hidden={mobileKeyboardOpen}
          darkTheme={isVideoView}
          hideVideoTab={hideVideoTabForCurrentUser}
          hideMpollTab={false}
          isSuspended={isSuspended}
          isAdmin={isAdmin}
        />
      )}

      {!isFullStageView && !isAuthView && (
        <FloatingScrollButton
          resetKey={`${activeTab}:${selectedTopicId || ''}`}
          hasBottomRightFab={
            !isFullStageView &&
            !isAuthView &&
            !isKijiweniView &&
            !isSuspended &&
            activeTab !== 'votes' &&
            !mobileKeyboardOpen
          }
        />
      )}

      {/* Floating Add Topic / Post Action Icon (hidden on Kijiweni and for suspended accounts) */}
      {!isFullStageView && !isAuthView && !isKijiweniView && !isSuspended && activeTab !== 'votes' && !mobileKeyboardOpen && (
        <button
          type="button"
          onClick={handleOpenNewTopic}
          aria-label={tr('Ongeza Mada Mpya', 'Add New Post')}
          title={tr('Ongeza Mada', 'Add Post')}
          className="fixed right-4 bottom-[calc(86px+env(safe-area-inset-bottom,0px))] z-[42] flex h-[54px] w-[54px] items-center justify-center rounded-full bg-gradient-to-br from-[#F59E0B] via-[#D97706] to-[#B45309] text-white shadow-[0_10px_26px_rgba(14,38,64,0.34)] ring-2 ring-white/85 transition-transform hover:scale-105 hover:brightness-105 active:scale-95 md:right-6 md:bottom-6 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-400"
        >
          <Plus className="h-6 w-6 stroke-[2.6]" aria-hidden="true" />
        </button>
      )}

      {/* Modals */}
      <MakalaSocialShareModal
        topic={shareModalTopic}
        onClose={() => setShareModalTopic(null)}
        onToast={(msg, kind) => showToast(msg, kind)}
        onShared={(t) => void incrementTopicShareCount(t.id)}
      />

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
        currentUserPhoto={userProfile ? userProfile.photoURL : user?.photoURL || ''}
        topics={topics}
        videos={videos}
        isAdmin={isAdmin}
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
        onFilterOnlyMyPosts={() => {
          setSelectedTopicId(null);
          setSelectedCategory('all');
          setActiveTab('kijiweni');
          setOnlyMine(true);
        }}
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
