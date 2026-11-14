import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { VerificationBadgeType, normalizeVerificationBadge } from '../types';

interface UserBadgesContextValue {
  badges: Record<string, VerificationBadgeType>;
  subscribeUser: (uid: string) => void;
}

const UserBadgesContext = createContext<UserBadgesContextValue>({
  badges: {},
  subscribeUser: () => {},
});

const VALID_UID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

export const UserBadgesProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [badges, setBadges] = useState<Record<string, VerificationBadgeType>>({});
  const unsubsRef = useRef<Map<string, () => void>>(new Map());

  const subscribeUser = useCallback((uid: string) => {
    if (!uid || !VALID_UID_PATTERN.test(uid)) return;
    if (unsubsRef.current.has(uid)) return;

    const path = `users/${uid}`;
    const unsub = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        const badge = snap.exists()
          ? normalizeVerificationBadge(snap.data().verificationBadge)
          : 'none';
        setBadges((prev) => {
          if (prev[uid] === badge) return prev;
          return { ...prev, [uid]: badge };
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, path);
      }
    );

    unsubsRef.current.set(uid, unsub);
  }, []);

  useEffect(() => {
    const map = unsubsRef.current;
    return () => {
      map.forEach((unsub) => unsub());
      map.clear();
    };
  }, []);

  return (
    <UserBadgesContext.Provider value={{ badges, subscribeUser }}>
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
