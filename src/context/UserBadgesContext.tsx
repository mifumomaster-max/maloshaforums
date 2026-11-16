import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  AccountStatus,
  VerificationBadgeType,
  normalizeAccountStatus,
  normalizeVerificationBadge,
} from '../types';

interface UserBadgesContextValue {
  badges: Record<string, VerificationBadgeType>;
  statuses: Record<string, AccountStatus>;
  subscribeUser: (uid: string) => void;
}

const UserBadgesContext = createContext<UserBadgesContextValue>({
  badges: {},
  statuses: {},
  subscribeUser: () => {},
});

const VALID_UID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

export const UserBadgesProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [badges, setBadges] = useState<Record<string, VerificationBadgeType>>({});
  const [statuses, setStatuses] = useState<Record<string, AccountStatus>>({});
  const fetchedRef = useRef<Set<string>>(new Set());

  const subscribeUser = useCallback((uid: string) => {
    if (!uid || !VALID_UID_PATTERN.test(uid)) return;
    if (fetchedRef.current.has(uid)) return;
    fetchedRef.current.add(uid);

    const path = `users/${uid}`;
    getDoc(doc(db, 'users', uid))
      .then((snap) => {
        const badge = snap.exists()
          ? normalizeVerificationBadge(snap.data().verificationBadge)
          : 'none';
        const status = snap.exists()
          ? normalizeAccountStatus(snap.data().accountStatus)
          : 'active';
        setBadges((prev) => {
          if (prev[uid] === badge) return prev;
          return { ...prev, [uid]: badge };
        });
        setStatuses((prev) => {
          if (prev[uid] === status) return prev;
          return { ...prev, [uid]: status };
        });
      })
      .catch((error) => {
        handleFirestoreError(error, OperationType.GET, path);
      });
  }, []);

  return (
    <UserBadgesContext.Provider value={{ badges, statuses, subscribeUser }}>
      {children}
    </UserBadgesContext.Provider>
  );
};

export function useAuthorBadge(uid?: string | null): VerificationBadgeType {
  const { badges, subscribeUser } = useContext(UserBadgesContext);

  useEffect(() => {
    if (uid) {
      subscribeUser(uid);
    }
  }, [uid, subscribeUser]);

  if (!uid) return 'none';
  return badges[uid] || 'none';
}

export function useAuthorAccountStatus(uid?: string | null): AccountStatus {
  const { statuses, subscribeUser } = useContext(UserBadgesContext);

  useEffect(() => {
    if (uid) {
      subscribeUser(uid);
    }
  }, [uid, subscribeUser]);

  if (!uid) return 'active';
  return statuses[uid] || 'active';
}
