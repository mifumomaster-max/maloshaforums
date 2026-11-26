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

export interface UserIdentitySnapshot {
  displayName: string;
  photoURL: string;
  loaded: boolean;
}

interface UserBadgesContextValue {
  badges: Record<string, VerificationBadgeType>;
  statuses: Record<string, AccountStatus>;
  profiles: Record<string, UserIdentitySnapshot>;
  subscribeUser: (uid: string) => void;
  refreshUser: (uid: string) => void;
  setLocalUserIdentity: (
    uid: string,
    patch: {
      displayName?: string;
      photoURL?: string;
      verificationBadge?: VerificationBadgeType;
      accountStatus?: AccountStatus;
    }
  ) => void;
}

const UserBadgesContext = createContext<UserBadgesContextValue>({
  badges: {},
  statuses: {},
  profiles: {},
  subscribeUser: () => {},
  refreshUser: () => {},
  setLocalUserIdentity: () => {},
});

const VALID_UID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

export const UserBadgesProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [badges, setBadges] = useState<Record<string, VerificationBadgeType>>({});
  const [statuses, setStatuses] = useState<Record<string, AccountStatus>>({});
  const [profiles, setProfiles] = useState<Record<string, UserIdentitySnapshot>>({});
  const fetchedRef = useRef<Set<string>>(new Set());

  const fetchUserRecord = useCallback((uid: string) => {
    if (!uid || !VALID_UID_PATTERN.test(uid)) return;
    const path = `users/${uid}`;
    getDoc(doc(db, 'users', uid))
      .then((snap) => {
        const data = snap.exists() ? snap.data() : null;
        const badge = data
          ? normalizeVerificationBadge(data.verificationBadge)
          : 'none';
        const status = data
          ? normalizeAccountStatus(data.accountStatus)
          : 'active';
        setBadges((prev) => {
          if (prev[uid] === badge) return prev;
          return { ...prev, [uid]: badge };
        });
        setStatuses((prev) => {
          if (prev[uid] === status) return prev;
          return { ...prev, [uid]: status };
        });
        if (data) {
          const nextName =
            typeof data.displayName === 'string' ? data.displayName.trim() : '';
          const nextPhoto =
            typeof data.photoURL === 'string' ? data.photoURL.trim() : '';
          setProfiles((prev) => {
            const existing = prev[uid];
            if (
              existing &&
              existing.loaded &&
              existing.displayName === nextName &&
              existing.photoURL === nextPhoto
            ) {
              return prev;
            }
            return {
              ...prev,
              [uid]: {
                displayName: nextName,
                photoURL: nextPhoto,
                loaded: true,
              },
            };
          });
        }
      })
      .catch((error) => {
        handleFirestoreError(error, OperationType.GET, path);
      });
  }, []);

  const subscribeUser = useCallback(
    (uid: string) => {
      if (!uid || !VALID_UID_PATTERN.test(uid)) return;
      if (fetchedRef.current.has(uid)) return;
      fetchedRef.current.add(uid);
      fetchUserRecord(uid);
    },
    [fetchUserRecord]
  );

  const refreshUser = useCallback(
    (uid: string) => {
      if (!uid || !VALID_UID_PATTERN.test(uid)) return;
      fetchedRef.current.add(uid);
      fetchUserRecord(uid);
    },
    [fetchUserRecord]
  );

  const setLocalUserIdentity = useCallback(
    (
      uid: string,
      patch: {
        displayName?: string;
        photoURL?: string;
        verificationBadge?: VerificationBadgeType;
        accountStatus?: AccountStatus;
      }
    ) => {
      if (!uid || !VALID_UID_PATTERN.test(uid)) return;
      fetchedRef.current.add(uid);

      if (patch.verificationBadge !== undefined) {
        const badge = normalizeVerificationBadge(patch.verificationBadge);
        setBadges((prev) => (prev[uid] === badge ? prev : { ...prev, [uid]: badge }));
      }
      if (patch.accountStatus !== undefined) {
        const status = normalizeAccountStatus(patch.accountStatus);
        setStatuses((prev) => (prev[uid] === status ? prev : { ...prev, [uid]: status }));
      }
      if (patch.displayName !== undefined || patch.photoURL !== undefined) {
        setProfiles((prev) => {
          const existing = prev[uid] || {
            displayName: '',
            photoURL: '',
            loaded: true,
          };
          const nextName =
            patch.displayName !== undefined
              ? patch.displayName.trim()
              : existing.displayName;
          const nextPhoto =
            patch.photoURL !== undefined ? patch.photoURL.trim() : existing.photoURL;
          if (
            existing.loaded &&
            existing.displayName === nextName &&
            existing.photoURL === nextPhoto
          ) {
            return prev;
          }
          return {
            ...prev,
            [uid]: {
              displayName: nextName,
              photoURL: nextPhoto,
              loaded: true,
            },
          };
        });
      }
    },
    []
  );

  return (
    <UserBadgesContext.Provider
      value={{
        badges,
        statuses,
        profiles,
        subscribeUser,
        refreshUser,
        setLocalUserIdentity,
      }}
    >
      {children}
    </UserBadgesContext.Provider>
  );
};

export function useUserBadges(): UserBadgesContextValue {
  return useContext(UserBadgesContext);
}

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

export function useAuthorIdentity(
  uid?: string | null,
  fallbackName = 'Mwanachama',
  fallbackPhoto = ''
): { displayName: string; photoURL: string } {
  const { profiles, subscribeUser } = useContext(UserBadgesContext);

  useEffect(() => {
    if (uid) {
      subscribeUser(uid);
    }
  }, [uid, subscribeUser]);

  if (!uid) {
    return {
      displayName: fallbackName || 'Mwanachama',
      photoURL: fallbackPhoto || '',
    };
  }

  const live = profiles[uid];
  if (!live || !live.loaded) {
    return {
      displayName: fallbackName || 'Mwanachama',
      photoURL: fallbackPhoto || '',
    };
  }

  return {
    displayName: live.displayName || fallbackName || 'Mwanachama',
    photoURL: live.photoURL,
  };
}
