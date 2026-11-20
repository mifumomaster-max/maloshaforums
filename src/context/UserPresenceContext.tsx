import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { writeUserPresence } from '../services/forumService';
import { PresenceArea, UserPresence } from '../types';

const ONLINE_TTL_MS = 95_000;
const TYPING_TTL_MS = 10_000;
const HEARTBEAT_INTERVAL_MS = 30_000;

interface UserPresenceContextValue {
  onlineUsers: UserPresence[];
  onlineCount: number;
  isUserOnline: (uid?: string | null) => boolean;
  typingUsersInMchart: UserPresence[];
  getDirectPartnerTyping: (partnerUid?: string | null, chatId?: string | null) => boolean;
  setMchartTyping: (isTyping: boolean, replyingToName?: string, typingChatId?: string) => void;
  markOfflineNow: () => Promise<void>;
}

const UserPresenceContext = createContext<UserPresenceContextValue>({
  onlineUsers: [],
  onlineCount: 0,
  isUserOnline: () => false,
  typingUsersInMchart: [],
  getDirectPartnerTyping: () => false,
  setMchartTyping: () => {},
  markOfflineNow: async () => {},
});

interface UserPresenceProviderProps {
  authReady: boolean;
  userUid: string | null;
  displayName: string;
  activeArea: PresenceArea;
  isSuspended?: boolean;
  children: React.ReactNode;
}

export const UserPresenceProvider: React.FC<UserPresenceProviderProps> = ({
  authReady,
  userUid,
  displayName,
  activeArea,
  isSuspended = false,
  children,
}) => {
  const [rawOnlineDocs, setRawOnlineDocs] = useState<UserPresence[]>([]);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const typingStateRef = useRef<{
    active: boolean;
    replyingToName: string;
    typingChatId: string;
    lastSentAt: number;
  }>({
    active: false,
    replyingToName: '',
    typingChatId: '',
    lastSentAt: 0,
  });
  const lastParamsRef = useRef({ userUid, displayName, activeArea, isSuspended });

  useEffect(() => {
    lastParamsRef.current = { userUid, displayName, activeArea, isSuspended };
  }, [userUid, displayName, activeArea, isSuspended]);

  // Periodic clock tick to expire stale online / typing markers cleanly
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 5_000);
    return () => window.clearInterval(timer);
  }, []);

  // Single real-time subscription to currently online members (rule-enforced: isOnline == true)
  useEffect(() => {
    if (!authReady) return;
    const path = 'user_presence';
    const q = query(collection(db, path), where('isOnline', '==', true));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: UserPresence[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            uid: String(data.uid || d.id),
            displayName: String(data.displayName || 'Mwanachama'),
            photoURL: typeof data.photoURL === 'string' ? data.photoURL : '',
            isOnline: Boolean(data.isOnline),
            isTypingInMchart: Boolean(data.isTypingInMchart),
            typingChatId: typeof data.typingChatId === 'string' ? data.typingChatId : '',
            replyingToName: typeof data.replyingToName === 'string' ? data.replyingToName : '',
            activeArea:
              data.activeArea === 'kijiweni' ||
              data.activeArea === 'video' ||
              data.activeArea === 'fursa' ||
              data.activeArea === 'makala' ||
              data.activeArea === 'mchart' ||
              data.activeArea === 'profile'
                ? data.activeArea
                : 'forum',
            lastSeenAt: data.lastSeenAt || null,
            typingUpdatedAt: data.typingUpdatedAt || null,
            updatedAt: data.updatedAt || null,
          };
        });
        setRawOnlineDocs(list);
        setNowMs(Date.now());
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    return () => unsub();
  }, [authReady]);

  // Heartbeat + visibility + page unload presence writer for signed-in active user
  useEffect(() => {
    if (!authReady || !userUid) return;

    const syncOnline = () => {
      const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      const shouldBeOnline = !isSuspended && !hidden && !offline;

      if (!shouldBeOnline) {
        typingStateRef.current.active = false;
        typingStateRef.current.replyingToName = '';
        typingStateRef.current.typingChatId = '';
      }

      void writeUserPresence(userUid, {
        displayName,
        isOnline: shouldBeOnline,
        isTypingInMchart: shouldBeOnline && typingStateRef.current.active && activeArea === 'mchart',
        typingChatId: shouldBeOnline ? typingStateRef.current.typingChatId : '',
        replyingToName: shouldBeOnline ? typingStateRef.current.replyingToName : '',
        activeArea,
      });
    };

    syncOnline();

    const heartbeat = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        syncOnline();
      }
    }, HEARTBEAT_INTERVAL_MS);

    const handleVisibility = () => syncOnline();
    const handleOnline = () => syncOnline();
    const handleOffline = () => {
      typingStateRef.current.active = false;
      typingStateRef.current.typingChatId = '';
      void writeUserPresence(userUid, {
        displayName,
        isOnline: false,
        isTypingInMchart: false,
        typingChatId: '',
        replyingToName: '',
        activeArea,
      });
    };
    const handlePageHide = () => {
      typingStateRef.current.active = false;
      typingStateRef.current.typingChatId = '';
      void writeUserPresence(userUid, {
        displayName,
        isOnline: false,
        isTypingInMchart: false,
        typingChatId: '',
        replyingToName: '',
        activeArea,
      });
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handlePageHide);

    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);
    };
  }, [authReady, userUid, displayName, activeArea, isSuspended]);

  // Immediate Mchart typing signal setter (throttled when staying true)
  const setMchartTyping = useCallback(
    (isTyping: boolean, replyingToName = '', typingChatId = 'group') => {
      const { userUid: uid, displayName: name, activeArea: area, isSuspended: susp } =
        lastParamsRef.current;
      if (!uid || susp) return;

      const now = Date.now();
      const cleanReply = isTyping ? replyingToName.trim() : '';
      const cleanChatId = isTyping ? (typingChatId || 'group').trim() : '';
      const changed =
        typingStateRef.current.active !== isTyping ||
        typingStateRef.current.replyingToName !== cleanReply ||
        typingStateRef.current.typingChatId !== cleanChatId;

      // Throttle repeated "still typing" refreshes to once per 2.2s
      if (!changed && isTyping && now - typingStateRef.current.lastSentAt < 2200) {
        return;
      }

      typingStateRef.current = {
        active: isTyping,
        replyingToName: cleanReply,
        typingChatId: cleanChatId,
        lastSentAt: now,
      };

      void writeUserPresence(uid, {
        displayName: name,
        isOnline: true,
        isTypingInMchart: isTyping,
        typingChatId: cleanChatId,
        replyingToName: cleanReply,
        activeArea: area,
      });
    },
    []
  );

  const markOfflineNow = useCallback(async () => {
    const { userUid: uid, displayName: name, activeArea: area } = lastParamsRef.current;
    typingStateRef.current = { active: false, replyingToName: '', typingChatId: '', lastSentAt: 0 };
    if (!uid) return;
    await writeUserPresence(uid, {
      displayName: name,
      isOnline: false,
      isTypingInMchart: false,
      typingChatId: '',
      replyingToName: '',
      activeArea: area,
    });
  }, []);

  const onlineUsers = useMemo(() => {
    return rawOnlineDocs.filter((p) => {
      if (!p.isOnline) return false;
      const seenMs = p.lastSeenAt ? p.lastSeenAt.toMillis() : nowMs;
      return nowMs - seenMs <= ONLINE_TTL_MS;
    });
  }, [rawOnlineDocs, nowMs]);

  const onlineUidSet = useMemo(() => {
    const set = new Set<string>();
    onlineUsers.forEach((u) => set.add(u.uid));
    if (
      userUid &&
      !isSuspended &&
      typeof navigator !== 'undefined' &&
      navigator.onLine !== false &&
      (typeof document === 'undefined' || document.visibilityState === 'visible')
    ) {
      set.add(userUid);
    }
    return set;
  }, [onlineUsers, userUid, isSuspended]);

  const isUserOnline = useCallback(
    (uid?: string | null) => {
      if (!uid) return false;
      return onlineUidSet.has(uid);
    },
    [onlineUidSet]
  );

  const typingUsersInMchart = useMemo(() => {
    return onlineUsers.filter((p) => {
      if (!p.isTypingInMchart) return false;
      if (userUid && p.uid === userUid) return false;
      if (p.typingChatId && p.typingChatId !== 'group') return false;
      const typedMs = p.typingUpdatedAt ? p.typingUpdatedAt.toMillis() : nowMs;
      return nowMs - typedMs <= TYPING_TTL_MS;
    });
  }, [onlineUsers, userUid, nowMs]);

  const getDirectPartnerTyping = useCallback(
    (partnerUid?: string | null, chatId?: string | null): boolean => {
      if (!partnerUid || !chatId) return false;
      const docMatch = onlineUsers.find((p) => p.uid === partnerUid);
      if (!docMatch || !docMatch.isTypingInMchart) return false;
      if (docMatch.typingChatId !== chatId) return false;
      const typedMs = docMatch.typingUpdatedAt ? docMatch.typingUpdatedAt.toMillis() : nowMs;
      return nowMs - typedMs <= TYPING_TTL_MS;
    },
    [onlineUsers, nowMs]
  );

  const value = useMemo<UserPresenceContextValue>(
    () => ({
      onlineUsers,
      onlineCount: onlineUidSet.size,
      isUserOnline,
      typingUsersInMchart,
      getDirectPartnerTyping,
      setMchartTyping,
      markOfflineNow,
    }),
    [
      onlineUsers,
      onlineUidSet.size,
      isUserOnline,
      typingUsersInMchart,
      getDirectPartnerTyping,
      setMchartTyping,
      markOfflineNow,
    ]
  );

  return <UserPresenceContext.Provider value={value}>{children}</UserPresenceContext.Provider>;
};

export function useUserPresence(): UserPresenceContextValue {
  return useContext(UserPresenceContext);
}

export function useUserOnline(uid?: string | null): boolean {
  const { isUserOnline } = useContext(UserPresenceContext);
  return isUserOnline(uid);
}
