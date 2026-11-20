import { User } from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { ADMIN_EMAIL, auth, db, handleFirestoreError, OperationType } from '../firebase';
import {
  AccountStatus,
  ChatAttachmentType,
  DirectChatThread,
  MAKALA_COVERS,
  MchartNote,
  MchartNoteAccess,
  MchartNoteContent,
  MchartStatus,
  MemberDirectoryCandidate,
  MemberIdRecord,
  MemberIdVerificationResult,
  OwnerCustomIdCardData,
  PresenceArea,
  ReportReason,
  StatusPrivacyMode,
  TopicCategory,
  TopicStatus,
  TrainingCertificateData,
  UserNotificationType,
  UserProfile,
  VerificationBadgeType,
  computeMemberControlSerial,
  findCommunityRule,
  formatMemberCode,
  normalizeAccountStatus,
  normalizeBoardCategory,
  normalizeVerificationBadge,
} from '../types';
import { sanitizeTextInput } from '../utils/formatters';

const syncQueueByUid = new Map<string, Promise<void>>();
const pendingRegMetaByEmail = new Map<string, { displayName?: string; phoneNumber?: string }>();

export function setPendingRegistrationMeta(
  email: string,
  meta: { displayName?: string; phoneNumber?: string }
): void {
  const key = email.trim().toLowerCase();
  if (!key) return;
  pendingRegMetaByEmail.set(key, meta);
}

export function clearPendingRegistrationMeta(email: string): void {
  const key = email.trim().toLowerCase();
  if (!key) return;
  pendingRegMetaByEmail.delete(key);
}

async function upsertMemberDirectoryEntry(
  uid: string,
  data: {
    displayName: string;
    photoURL?: string;
    verificationBadge?: VerificationBadgeType;
    isActive?: boolean;
  }
): Promise<void> {
  if (!uid || !/^[a-zA-Z0-9_-]{1,128}$/.test(uid)) return;
  const cleanName = sanitizeTextInput(data.displayName || 'Mwanachama', 80) || 'Mwanachama';
  const cleanPhoto = sanitizeTextInput(data.photoURL || '', 500);
  const badge = normalizeVerificationBadge(data.verificationBadge);
  const isActive = data.isActive !== false;
  try {
    await setDoc(doc(db, 'member_directory', uid), {
      uid,
      displayName: cleanName,
      photoURL: cleanPhoto,
      verificationBadge: badge,
      isActive,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal mirror sync
  }
}

async function runSyncUserProfile(
  user: User,
  extra?: { displayName?: string; phoneNumber?: string }
): Promise<void> {
  const userPath = `users/${user.uid}`;
  const privatePath = `users/${user.uid}/private/info`;
  const userRef = doc(db, 'users', user.uid);
  const privateRef = doc(db, 'users', user.uid, 'private', 'info');

  const emailKey = (user.email || '').trim().toLowerCase();
  const pendingMeta = emailKey ? pendingRegMetaByEmail.get(emailKey) : undefined;
  const effectiveDisplayName = extra?.displayName || pendingMeta?.displayName || user.displayName;
  const effectivePhone = extra?.phoneNumber || pendingMeta?.phoneNumber;

  const safeName =
    sanitizeTextInput(effectiveDisplayName || 'Mwanachama', 80) || 'Mwanachama';
  const safePhoto = sanitizeTextInput(user.photoURL || '', 500);
  const safeEmail = sanitizeTextInput(user.email || 'unknown@example.com', 200);
  const safePhone = effectivePhone ? sanitizeTextInput(effectivePhone, 30) : '';
  const isPlatformOwner = user.email === ADMIN_EMAIL && user.emailVerified;

  let dirDisplayName = safeName;
  let dirPhoto = safePhoto;
  let dirBadge: VerificationBadgeType = isPlatformOwner ? 'owner' : 'none';
  let dirIsActive = true;

  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        displayName: safeName,
        photoURL: safePhoto,
        bio: '',
        role: isPlatformOwner ? 'moderator' : 'member',
        verificationBadge: isPlatformOwner ? 'owner' : 'none',
        accountStatus: 'active',
        topicsCount: 0,
        repliesCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const existingData = snap.data();
      const updates: Record<string, unknown> = {};
      if (
        isPlatformOwner &&
        (!existingData.verificationBadge || existingData.verificationBadge === 'none')
      ) {
        updates.verificationBadge = 'owner';
      }
      if (effectiveDisplayName && existingData.displayName !== safeName) {
        updates.displayName = safeName;
      }
      if (Object.keys(updates).length > 0) {
        updates.updatedAt = serverTimestamp();
        await updateDoc(userRef, updates);
      }
      dirDisplayName =
        (typeof updates.displayName === 'string' && updates.displayName) ||
        (typeof existingData.displayName === 'string' && existingData.displayName) ||
        safeName;
      dirPhoto =
        (typeof existingData.photoURL === 'string' ? existingData.photoURL : '') || safePhoto;
      dirBadge = normalizeVerificationBadge(
        (updates.verificationBadge as string) || (existingData.verificationBadge as string)
      );
      dirIsActive = existingData.accountStatus !== 'suspended';
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }

  if (dirIsActive) {
    await upsertMemberDirectoryEntry(user.uid, {
      displayName: dirDisplayName,
      photoURL: dirPhoto,
      verificationBadge: dirBadge,
      isActive: true,
    });
  }

  try {
    const privSnap = await getDoc(privateRef);
    if (!privSnap.exists()) {
      await setDoc(privateRef, {
        uid: user.uid,
        email: safeEmail,
        ...(safePhone ? { phoneNumber: safePhone } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const privUpdates: Record<string, unknown> = {};
      if (privSnap.data().email !== safeEmail) {
        privUpdates.email = safeEmail;
      }
      if (safePhone && privSnap.data().phoneNumber !== safePhone) {
        privUpdates.phoneNumber = safePhone;
      }
      if (Object.keys(privUpdates).length > 0) {
        privUpdates.updatedAt = serverTimestamp();
        await updateDoc(privateRef, privUpdates);
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, privatePath);
  }

  if (emailKey && pendingMeta) {
    pendingRegMetaByEmail.delete(emailKey);
  }
}

export async function syncUserProfile(
  user: User,
  extra?: { displayName?: string; phoneNumber?: string }
): Promise<void> {
  const prev = syncQueueByUid.get(user.uid) || Promise.resolve();
  const next = prev.catch(() => undefined).then(() => runSyncUserProfile(user, extra));
  syncQueueByUid.set(user.uid, next);
  try {
    await next;
  } finally {
    if (syncQueueByUid.get(user.uid) === next) {
      syncQueueByUid.delete(user.uid);
    }
  }
}

export async function getPrivateUserInfo(
  uid: string
): Promise<{ email: string; phoneNumber: string } | null> {
  const privatePath = `users/${uid}/private/info`;
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'private', 'info'));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      email: typeof data.email === 'string' ? data.email : '',
      phoneNumber: typeof data.phoneNumber === 'string' ? data.phoneNumber : '',
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, privatePath);
  }
}

export async function updatePrivatePhoneNumber(
  uid: string,
  phoneNumber: string
): Promise<void> {
  const privatePath = `users/${uid}/private/info`;
  const cleanPhone = sanitizeTextInput(phoneNumber, 30);
  try {
    await updateDoc(doc(db, 'users', uid, 'private', 'info'), {
      phoneNumber: cleanPhone,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, privatePath);
  }
}

export async function updateUserProfile(
  uid: string,
  displayName: string,
  bio: string
): Promise<void> {
  const path = `users/${uid}`;
  const cleanName = sanitizeTextInput(displayName, 80);
  const cleanBio = sanitizeTextInput(bio, 300);

  if (cleanName.length < 1) {
    throw new Error('Jina haliwezi kuwa tupu.');
  }

  try {
    await updateDoc(doc(db, 'users', uid), {
      displayName: cleanName,
      bio: cleanBio,
      updatedAt: serverTimestamp(),
    });
    const dirRef = doc(db, 'member_directory', uid);
    const dirSnap = await getDoc(dirRef).catch(() => null);
    if (dirSnap && dirSnap.exists()) {
      await updateDoc(dirRef, {
        displayName: cleanName,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateUserProfilePhoto(
  uid: string,
  photoURL: string,
  displayName?: string
): Promise<string> {
  const path = `users/${uid}`;
  const cleanPhoto = sanitizeTextInput(photoURL, 500);
  if (cleanPhoto && !cleanPhoto.startsWith('https://')) {
    throw new Error('Kiungo cha picha si sahihi.');
  }

  try {
    await updateDoc(doc(db, 'users', uid), {
      photoURL: cleanPhoto,
      updatedAt: serverTimestamp(),
    });

    const cardId = formatMemberCode(uid);
    const idSnap = await getDoc(doc(db, 'member_ids', cardId)).catch(() => null);
    if (idSnap && idSnap.exists()) {
      const updates: Record<string, unknown> = {
        photoURL: cleanPhoto,
        updatedAt: serverTimestamp(),
      };
      if (displayName && sanitizeTextInput(displayName, 80)) {
        updates.displayName = sanitizeTextInput(displayName, 80);
      }
      await updateDoc(doc(db, 'member_ids', cardId), updates).catch(() => {});
    }

    const dirRef = doc(db, 'member_directory', uid);
    const dirSnap = await getDoc(dirRef).catch(() => null);
    if (dirSnap && dirSnap.exists()) {
      const dirUpdates: Record<string, unknown> = {
        photoURL: cleanPhoto,
        updatedAt: serverTimestamp(),
      };
      if (displayName && sanitizeTextInput(displayName, 80)) {
        dirUpdates.displayName = sanitizeTextInput(displayName, 80);
      }
      await updateDoc(dirRef, dirUpdates).catch(() => {});
    }

    return cleanPhoto;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateUserVerificationBadge(
  targetUid: string,
  badge: VerificationBadgeType
): Promise<void> {
  const path = `users/${targetUid}`;
  try {
    await updateDoc(doc(db, 'users', targetUid), {
      verificationBadge: badge,
      updatedAt: serverTimestamp(),
    });
    const cardId = formatMemberCode(targetUid);
    const idSnap = await getDoc(doc(db, 'member_ids', cardId)).catch(() => null);
    if (idSnap && idSnap.exists()) {
      await updateDoc(doc(db, 'member_ids', cardId), {
        verificationBadge: badge,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
    const dirRef = doc(db, 'member_directory', targetUid);
    const dirSnap = await getDoc(dirRef).catch(() => null);
    if (dirSnap && dirSnap.exists()) {
      await updateDoc(dirRef, {
        verificationBadge: badge,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateUserAccountStatus(
  targetUid: string,
  status: AccountStatus,
  reason = '',
  ruleNumber?: number
): Promise<void> {
  const path = `users/${targetUid}`;
  const cleanRuleNum =
    status === 'suspended' && ruleNumber && Number.isFinite(ruleNumber)
      ? Math.max(0, Math.min(13, Math.round(ruleNumber)))
      : 0;
  const matchedRule = cleanRuleNum > 0 ? findCommunityRule(cleanRuleNum) : null;
  const cleanReason =
    status === 'suspended'
      ? sanitizeTextInput(
          reason || (matchedRule ? `${matchedRule.titleSw}: ${matchedRule.summarySw}` : ''),
          300
        )
      : '';
  try {
    await updateDoc(doc(db, 'users', targetUid), {
      accountStatus: status,
      suspendedReason: cleanReason,
      suspendedRuleNumber: cleanRuleNum,
      updatedAt: serverTimestamp(),
    });
    const cardId = formatMemberCode(targetUid);
    const idSnap = await getDoc(doc(db, 'member_ids', cardId)).catch(() => null);
    if (idSnap && idSnap.exists()) {
      await updateDoc(doc(db, 'member_ids', cardId), {
        accountStatus: status,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
    const dirRef = doc(db, 'member_directory', targetUid);
    const dirSnap = await getDoc(dirRef).catch(() => null);
    if (dirSnap && dirSnap.exists()) {
      await updateDoc(dirRef, {
        isActive: status !== 'suspended',
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }

    const adminUser = auth.currentUser;
    if (adminUser && adminUser.uid !== targetUid && /^[a-zA-Z0-9_-]{1,128}$/.test(targetUid)) {
      const notifRef = doc(collection(db, 'users', targetUid, 'notifications'));
      const ruleTitleText = matchedRule
        ? `Kanuni #${matchedRule.number}: ${matchedRule.titleSw}`
        : status === 'suspended'
          ? 'Ukiukaji wa Sheria za Jukwaa'
          : 'Akaunti Imefunguliwa';
      const preview =
        status === 'suspended'
          ? sanitizeTextInput(
              matchedRule
                ? `Akaunti yako imefungwa kwa kukiuka Kanuni #${matchedRule.number} (${matchedRule.titleSw}). ${cleanReason}`
                : `Akaunti yako imefungwa. Sababu: ${cleanReason || 'Ukiukaji wa kanuni.'}`,
              200
            )
          : 'Hongera! Akaunti yako imefunguliwa tena na sasa unaweza kushiriki kama kawaida.';

      await setDoc(notifRef, {
        recipientId: targetUid,
        actorId: adminUser.uid,
        actorName: sanitizeTextInput(adminUser.displayName || 'Msimamizi Malosha', 80) || 'Msimamizi Malosha',
        actorPhoto: sanitizeTextInput(adminUser.photoURL || '', 500),
        type: 'account_moderation',
        topicId: targetUid,
        topicTitle: sanitizeTextInput(
          status === 'suspended' ? 'Akaunti Imefungwa' : 'Akaunti Imefunguliwa',
          140
        ),
        topicCategory: 'Kijiweni',
        replyId: 'account',
        parentReplyId: '',
        replyPreview: preview,
        ...(cleanRuleNum > 0 ? { ruleNumber: cleanRuleNum, ruleTitle: sanitizeTextInput(ruleTitleText, 140) } : {}),
        isRead: false,
        createdAt: serverTimestamp(),
      }).catch(() => {});
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function getAdminUserPrivateDetails(
  uids: string[]
): Promise<Record<string, { email: string; phoneNumber: string }>> {
  const result: Record<string, { email: string; phoneNumber: string }> = {};
  const batchSize = 20;
  for (let i = 0; i < uids.length; i += batchSize) {
    const chunk = uids.slice(i, i + batchSize);
    await Promise.all(
      chunk.map(async (uid) => {
        try {
          const snap = await getDoc(doc(db, 'users', uid, 'private', 'info'));
          if (snap.exists()) {
            const data = snap.data();
            result[uid] = {
              email: typeof data.email === 'string' ? data.email : '',
              phoneNumber: typeof data.phoneNumber === 'string' ? data.phoneNumber : '',
            };
          } else {
            result[uid] = { email: '', phoneNumber: '' };
          }
        } catch {
          result[uid] = { email: '', phoneNumber: '' };
        }
      })
    );
  }
  return result;
}

export interface CreateTopicInput {
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
}

export async function createTopic(
  user: User,
  displayName: string,
  input: CreateTopicInput
): Promise<string> {
  const title = sanitizeTextInput(input.title, 140);
  const body = sanitizeTextInput(input.body, 8000);
  const coverImage = input.coverImage ? sanitizeTextInput(input.coverImage, 500) : '';
  const isImageOnlyKijiweni = input.category === 'Kijiweni' && coverImage.length >= 10;
  const tags = input.tags.map((t) => sanitizeTextInput(t, 30)).filter(Boolean).slice(0, 5);

  if (!isImageOnlyKijiweni && title.length < 5) {
    throw new Error('Kichwa cha mada lazima kiwe na herufi angalau 5.');
  }
  if (!isImageOnlyKijiweni && body.length < 10) {
    throw new Error('Maelezo ya mada lazima yawe na herufi angalau 10.');
  }

  const topicRef = doc(collection(db, 'topics'));
  const userRef = doc(db, 'users', user.uid);
  const path = `topics/${topicRef.id}`;

  const payload: Record<string, unknown> = {
    title,
    body,
    category: input.category,
    tags,
    authorId: user.uid,
    authorName: sanitizeTextInput(displayName || user.displayName || 'Mwanachama', 80),
    authorPhoto: sanitizeTextInput(user.photoURL || '', 500),
    status: 'open',
    isPinned: false,
    repliesCount: 0,
    upvotesCount: 0,
    acceptedReplyId: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastActivityAt: serverTimestamp(),
  };

  if (input.company) payload.company = sanitizeTextInput(input.company, 100);
  if (input.location) payload.location = sanitizeTextInput(input.location, 100);
  if (input.jobType) payload.jobType = sanitizeTextInput(input.jobType, 40);
  if (input.deadline) payload.deadline = sanitizeTextInput(input.deadline, 60);
  if (input.applyInfo) payload.applyInfo = sanitizeTextInput(input.applyInfo, 300);
  if (input.coverImage) payload.coverImage = sanitizeTextInput(input.coverImage, 500);

  try {
    const batch = writeBatch(db);
    batch.set(topicRef, payload);

    batch.update(userRef, {
      topicsCount: increment(1),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return topicRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function editTopic(
  topicId: string,
  input: CreateTopicInput
): Promise<void> {
  const title = sanitizeTextInput(input.title, 140);
  const body = sanitizeTextInput(input.body, 8000);
  const coverImage = input.coverImage ? sanitizeTextInput(input.coverImage, 500) : '';
  const isImageOnlyKijiweni = input.category === 'Kijiweni' && coverImage.length >= 10;
  const tags = input.tags.map((t) => sanitizeTextInput(t, 30)).filter(Boolean).slice(0, 5);

  if (!isImageOnlyKijiweni && title.length < 5) {
    throw new Error('Kichwa cha mada lazima kiwe na herufi angalau 5.');
  }
  if (!isImageOnlyKijiweni && body.length < 10) {
    throw new Error('Maelezo ya mada lazima yawe na herufi angalau 10.');
  }

  const updatePayload: Record<string, unknown> = {
    title,
    body,
    category: input.category,
    tags,
    updatedAt: serverTimestamp(),
  };

  if (input.company !== undefined) updatePayload.company = sanitizeTextInput(input.company, 100);
  if (input.location !== undefined) updatePayload.location = sanitizeTextInput(input.location, 100);
  if (input.jobType !== undefined) updatePayload.jobType = sanitizeTextInput(input.jobType, 40);
  if (input.deadline !== undefined) updatePayload.deadline = sanitizeTextInput(input.deadline, 60);
  if (input.applyInfo !== undefined) updatePayload.applyInfo = sanitizeTextInput(input.applyInfo, 300);
  if (input.coverImage !== undefined) updatePayload.coverImage = sanitizeTextInput(input.coverImage, 500);

  const path = `topics/${topicId}`;
  try {
    await updateDoc(doc(db, 'topics', topicId), updatePayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateTopicStatus(
  topicId: string,
  status: TopicStatus
): Promise<void> {
  const path = `topics/${topicId}`;
  try {
    await updateDoc(doc(db, 'topics', topicId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function toggleTopicPin(
  topicId: string,
  isPinned: boolean
): Promise<void> {
  const path = `topics/${topicId}`;
  try {
    await updateDoc(doc(db, 'topics', topicId), {
      isPinned,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteTopic(topicId: string): Promise<void> {
  const path = `topics/${topicId}`;
  try {
    await deleteDoc(doc(db, 'topics', topicId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export interface ReplyNotificationContext {
  topicTitle: string;
  topicCategory: string;
  topicAuthorId: string;
  targetReplyAuthorId?: string;
  rootReplyAuthorId?: string;
  replyActorPhoto?: string;
}

export async function createReply(
  user: User,
  displayName: string,
  topicId: string,
  bodyRaw: string,
  parentReplyId = '',
  notifyContext?: ReplyNotificationContext
): Promise<string> {
  const body = sanitizeTextInput(bodyRaw, 4000);
  if (body.length < 2) {
    throw new Error('Jibu lazima liwe na herufi angalau 2.');
  }

  const replyRef = doc(collection(db, 'topics', topicId, 'replies'));
  const topicRef = doc(db, 'topics', topicId);
  const userRef = doc(db, 'users', user.uid);
  const path = `topics/${topicId}/replies/${replyRef.id}`;
  const safeAuthorName =
    sanitizeTextInput(displayName || user.displayName || 'Mwanachama', 80) || 'Mwanachama';
  const safeActorPhoto = sanitizeTextInput(notifyContext?.replyActorPhoto || user.photoURL || '', 500);
  const cleanParentReplyId = sanitizeTextInput(parentReplyId, 128);

  try {
    const batch = writeBatch(db);
    batch.set(replyRef, {
      topicId,
      authorId: user.uid,
      authorName: safeAuthorName,
      authorPhoto: safeActorPhoto,
      body,
      parentReplyId: cleanParentReplyId,
      isAcceptedAnswer: false,
      upvotesCount: 0,
      isDeleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.update(topicRef, {
      repliesCount: increment(1),
      lastActivityAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.update(userRef, {
      repliesCount: increment(1),
      updatedAt: serverTimestamp(),
    });

    if (notifyContext) {
      const recipients = new Map<string, UserNotificationType>();
      const validId = (id?: string): id is string =>
        Boolean(id && /^[a-zA-Z0-9_\-]{1,128}$/.test(id) && id !== user.uid);

      if (validId(notifyContext.targetReplyAuthorId)) {
        recipients.set(notifyContext.targetReplyAuthorId, 'comment_reply');
      }
      if (validId(notifyContext.rootReplyAuthorId) && !recipients.has(notifyContext.rootReplyAuthorId)) {
        recipients.set(notifyContext.rootReplyAuthorId, 'comment_reply');
      }
      if (validId(notifyContext.topicAuthorId) && !recipients.has(notifyContext.topicAuthorId)) {
        recipients.set(notifyContext.topicAuthorId, 'post_comment');
      }

      const safeTitle = sanitizeTextInput(notifyContext.topicTitle || '', 140);
      const safeBoard = normalizeBoardCategory(notifyContext.topicCategory);
      const safePreview = sanitizeTextInput(body, 200) || 'Maoni mapya';

      recipients.forEach((notifType, recipientId) => {
        const notifRef = doc(collection(db, 'users', recipientId, 'notifications'));
        batch.set(notifRef, {
          recipientId,
          actorId: user.uid,
          actorName: safeAuthorName,
          actorPhoto: safeActorPhoto,
          type: notifType,
          topicId,
          topicTitle: safeTitle,
          topicCategory: safeBoard,
          replyId: replyRef.id,
          parentReplyId: cleanParentReplyId,
          replyPreview: safePreview,
          isRead: false,
          createdAt: serverTimestamp(),
        });
      });
    }

    await batch.commit();
    return replyRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function markUserNotificationRead(
  uid: string,
  notificationId: string
): Promise<void> {
  if (!uid || !notificationId) return;
  try {
    await updateDoc(doc(db, 'users', uid, 'notifications', notificationId), {
      isRead: true,
    });
  } catch {
    // Non-fatal if already deleted or offline
  }
}

export async function markAllUserNotificationsRead(
  uid: string,
  notificationIds: string[]
): Promise<void> {
  if (!uid || notificationIds.length === 0) return;
  try {
    for (let i = 0; i < notificationIds.length; i += 450) {
      const chunk = notificationIds.slice(i, i + 450);
      const batch = writeBatch(db);
      chunk.forEach((nid) => {
        batch.update(doc(db, 'users', uid, 'notifications', nid), { isRead: true });
      });
      await batch.commit();
    }
  } catch {
    // Non-fatal
  }
}

export async function editReply(
  topicId: string,
  replyId: string,
  bodyRaw: string
): Promise<void> {
  const body = sanitizeTextInput(bodyRaw, 4000);
  if (body.length < 2) {
    throw new Error('Jibu lazima liwe na herufi angalau 2.');
  }

  const path = `topics/${topicId}/replies/${replyId}`;
  try {
    await updateDoc(doc(db, 'topics', topicId, 'replies', replyId), {
      body,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function softDeleteReply(
  topicId: string,
  replyId: string,
  topicStatus: TopicStatus
): Promise<void> {
  const replyRef = doc(db, 'topics', topicId, 'replies', replyId);
  const topicRef = doc(db, 'topics', topicId);
  const path = `topics/${topicId}/replies/${replyId}`;

  try {
    const batch = writeBatch(db);
    batch.update(replyRef, {
      isDeleted: true,
      body: '[Jibu hili limefutwa na mwandishi]',
      updatedAt: serverTimestamp(),
    });

    if (topicStatus === 'open') {
      batch.update(topicRef, {
        repliesCount: increment(-1),
        lastActivityAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function toggleAcceptReply(
  topicId: string,
  replyId: string,
  currentlyAccepted: boolean,
  previousAcceptedReplyId: string
): Promise<void> {
  const topicRef = doc(db, 'topics', topicId);
  const targetReplyRef = doc(db, 'topics', topicId, 'replies', replyId);
  const path = `topics/${topicId}`;

  try {
    const batch = writeBatch(db);
    if (currentlyAccepted) {
      batch.update(topicRef, {
        acceptedReplyId: '',
        updatedAt: serverTimestamp(),
      });
      batch.update(targetReplyRef, {
        isAcceptedAnswer: false,
        updatedAt: serverTimestamp(),
      });
    } else {
      if (previousAcceptedReplyId && previousAcceptedReplyId !== replyId) {
        const prevRef = doc(db, 'topics', topicId, 'replies', previousAcceptedReplyId);
        batch.update(prevRef, {
          isAcceptedAnswer: false,
          updatedAt: serverTimestamp(),
        });
      }
      batch.update(topicRef, {
        acceptedReplyId: replyId,
        updatedAt: serverTimestamp(),
      });
      batch.update(targetReplyRef, {
        isAcceptedAnswer: true,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function toggleTopicVote(
  topicId: string,
  userId: string,
  hasVoted: boolean
): Promise<void> {
  const voteRef = doc(db, 'topics', topicId, 'votes', userId);
  const topicRef = doc(db, 'topics', topicId);
  const path = `topics/${topicId}/votes/${userId}`;

  try {
    const batch = writeBatch(db);
    if (hasVoted) {
      batch.delete(voteRef);
      batch.update(topicRef, {
        upvotesCount: increment(-1),
      });
    } else {
      batch.set(voteRef, {
        userId,
        createdAt: serverTimestamp(),
      });
      batch.update(topicRef, {
        upvotesCount: increment(1),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function toggleReplyVote(
  topicId: string,
  replyId: string,
  userId: string,
  hasVoted: boolean
): Promise<void> {
  const voteRef = doc(db, 'topics', topicId, 'replies', replyId, 'votes', userId);
  const replyRef = doc(db, 'topics', topicId, 'replies', replyId);
  const path = `topics/${topicId}/replies/${replyId}/votes/${userId}`;

  try {
    const batch = writeBatch(db);
    if (hasVoted) {
      batch.delete(voteRef);
      batch.update(replyRef, {
        upvotesCount: increment(-1),
      });
    } else {
      batch.set(voteRef, {
        userId,
        createdAt: serverTimestamp(),
      });
      batch.update(replyRef, {
        upvotesCount: increment(1),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function submitReport(
  reporterId: string,
  targetType: 'topic' | 'reply' | 'video',
  targetId: string,
  topicId: string,
  reason: ReportReason,
  detailsRaw: string,
  ruleNumber?: number
): Promise<void> {
  const reportRef = doc(collection(db, 'reports'));
  const path = `reports/${reportRef.id}`;
  const cleanRuleNum =
    ruleNumber && Number.isFinite(ruleNumber)
      ? Math.max(0, Math.min(13, Math.round(ruleNumber)))
      : 0;
  try {
    await setDoc(reportRef, {
      reporterId,
      targetType,
      targetId,
      topicId,
      reason,
      ...(cleanRuleNum > 0 ? { ruleNumber: cleanRuleNum } : {}),
      details: sanitizeTextInput(detailsRaw, 500),
      status: 'pending',
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateReportStatus(
  reportId: string,
  status: 'reviewed' | 'dismissed'
): Promise<void> {
  const path = `reports/${reportId}`;
  try {
    await updateDoc(doc(db, 'reports', reportId), { status });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function seedStarterTopics(user: User, displayName: string): Promise<void> {
  const starters: CreateTopicInput[] = [
    // Kijiweni social posts
    {
      title: 'Kijiweni Leo: Siri gani ndogo ya maisha imekusaidia sana mwaka huu?',
      body: `Wakati mwingine mambo makubwa maishani yanaanza na maamuzi madogo ya kila siku.\n\nBinafsi nimejifunza kupanga ratiba ya asubuhi mapema na kuepuka mitandao saa ya kwanza baada ya kuamka. Wewe ni jambo gani jema limebadilisha siku zako?\n\nPenda chapisho, toa maoni, na ushiriki na marafiki!`,
      category: 'Kijiweni',
      tags: ['kijiweni', 'maisha', 'gumzo'],
    },
    {
      title: 'Mechi ya wikendi hii: Nani atashinda vita ya kiungo katikati ya uwanja?',
      body: `Mashabiki wa soka wamegawanyika kuhusu mbinu za makocha kuelekea mchezo mkubwa wa wikendi.\n\nTuachie utabiri wako hapa chini na utuelezee mchezaji mmoja unayemwamini kuamua matokeo.`,
      category: 'Kijiweni',
      tags: ['kijiweni', 'soka', 'michezo'],
    },
    // Fursa — Matangazo ya Ajira za Vijana
    {
      title: 'Afisa Masoko wa Kidijitali (Vijana) — Dar es Salaam',
      body: `Tunatafuta kijana mbunifu na mwenye uzoefu wa kuendesha kampeni za mitandao ya kijamii, uandishi wa maudhui ya Kiswahili na Kiingereza, pamoja na uchambuzi wa takwimu za wateja.\n\n**Majukumu Makuu:**\n- Kuandaa ratiba ya maudhui ya kila wiki\n- Kusimamia matangazo ya kidijitali na majibu kwa wateja\n- Kushirikiana na timu ya mauzo kuongeza wateja wapya\n\n**Sifa Zinazohitajika:**\n- Shahada au Stashahada ya Masoko, Mawasiliano, au fani inayofanana\n- Uzoefu wa angalau mwaka 1 au sampuli za kazi zilizokamilika`,
      category: 'Fursa',
      tags: ['ajira', 'masoko', 'vijana'],
      company: 'Swahili Digital Hub Ltd',
      location: 'Dar es Salaam (Mseto / Hybrid)',
      jobType: 'Ajira Kamili',
      deadline: '30 Novemba 2026',
      applyInfo: 'Tuma CV na barua ya maombi kupitia ajira@swahilidigital.example au tovuti ya kampuni.',
    },
    {
      title: 'Mafunzo kwa Vitendo (Internship): Mhandisi wa Programu (Frontend & Mobile)',
      body: `Programu ya miezi 6 kwa wahitimu vijana wanaopenda teknolojia ya React, TypeScript, na ujenzi wa mifumo ya simu.\n\nWashiriki watapata posho ya kila mwezi, ushauri wa karibu kutoka kwa wahandisi wazoefu, na nafasi ya ajira ya kudumu baada ya kuhitimu mafunzo.`,
      category: 'Fursa',
      tags: ['internship', 'teknolojia', 'vijana'],
      company: 'Kilimanjaro Tech Labs',
      location: 'Arusha / Kazi Mtandaoni',
      jobType: 'Mafunzo (Internship)',
      deadline: '15 Desemba 2026',
      applyInfo: 'Wasilisha kiungo cha GitHub na maelezo mafupi ya miradi yako kupitia careers@ktech.example.',
    },
    {
      title: 'Ruzuku ya Mtaji kwa Vijana Wajasiriamali wa Kilimo-Biashara',
      body: `Mfuko wa kukuza ubunifu wa vijana unakaribisha maombi ya miradi ya kilimo cha kisasa, uhifadhi wa mazao, na usindikaji.\n\nVikundi vya vijana wenye umri wa miaka 18–35 vinaweza kuomba ufadhili wa vifaa na mafunzo ya usimamizi wa biashara.`,
      category: 'Fursa',
      tags: ['fursa', 'kilimo', 'ruzuku'],
      company: 'Mpango wa Vijana AgriFund',
      location: 'Mikoa Yote (Tanzania & Kenya)',
      jobType: 'Ufadhili & Ruzuku',
      deadline: '20 Desemba 2026',
      applyInfo: 'Pakua fomu ya maombi na uambatanishe mpango mfupi wa biashara wa kurasa 3.',
    },
    // Makala — BBC Swahili style
    {
      title: 'Kwa nini uchumi wa kidijitali Afrika Mashariki unavutia kizazi kipya cha wabunifu',
      body: `Katika mitaa yenye pilikapilika ya Dar es Salaam, Nairobi, na Kampala, kizazi kipya cha wahandisi vijana kinabadilisha namna huduma za kifedha, biashara ndogo, na elimu zinavyofanya kazi.\n\nTofauti na muongo uliopita ambapo kampuni nyingi zilitegemea teknolojia kutoka nje, sasa wabunifu wa ndani wanaunda mifumo inayojibu changamoto halisi za jamii zao — kuanzia malipo ya papo hapo kwa simu hadi majukwaa ya kuunganisha wakulima na masoko.\n\n> Tunajenga suluhu tukielewa mazingira ya mtumiaji wa kawaida anayetumia simu yenye bando dogo.\n\nWachambuzi wa uchumi wanasema ukuaji huu unahitaji uwekezaji thabiti katika nishati ya uhakika, sera zinazolinda faragha ya data, na mafunzo ya vitendo vyuoni ili kuendeleza kasi iliyopo.`,
      category: 'Makala',
      tags: ['makala', 'teknolojia', 'uchumi'],
      coverImage: MAKALA_COVERS[0].path,
    },
    {
      title: 'Kilimo cha vitalu (greenhouse) na umwagiliaji wa matone vyabadilisha maisha ya wakulima vijana',
      body: `Mabadiliko ya tabianchi yamewafanya wakulima wengi kutafuta mbinu mbadala za kulinda mavuno yao dhidi ya ukame.\n\nKupitia teknolojia ya umwagiliaji wa matone na vitalu vya kisasa, wakulima vijana wanazalisha mbogamboga na matunda mwaka mzima kwa kutumia maji kidogo zaidi kuliko kilimo cha kawaida.\n\nWataalamu wa kilimo wanashauri kuanza na kipande kidogo cha ardhi chenye mpango wa soko kabla ya kupanua mradi.`,
      category: 'Makala',
      tags: ['makala', 'kilimo', 'tabianchi'],
      coverImage: MAKALA_COVERS[1].path,
    },
    {
      title: 'Nishati ya jua vijijini: Mwanga mpya kwa zahanati, shule, na biashara ndogo',
      body: `Upatikanaji wa umeme wa jua kupitia mifumo midogo ya jamii (mini-grids) umeleta mabadiliko makubwa katika maeneo yaliyo mbali na gridi kuu ya taifa.\n\nZahanati zinahifadhi chanjo kwa usalama, wanafunzi wanasoma saa za jioni, na mafundi wa ndani wanapata ajira za kutunza mitambo hiyo.`,
      category: 'Makala',
      tags: ['makala', 'nishati', 'maendeleo'],
      coverImage: MAKALA_COVERS[2].path,
    },
    {
      title: 'Jinsi maktaba za kidijitali zinavyofungua milango ya tafiti kwa wanafunzi wa vyuo vikuu',
      body: `Upatikanaji wa vitabu vya kisasa na majarida ya kitaaluma mtandaoni unapunguza pengo la maarifa kati ya vyuo vya mijini na mikoani.\n\nWahadhiri wanasisitiza umuhimu wa kufundisha wanafunzi mbinu bora za utafiti na uhakiki wa vyanzo vya habari ili kuepuka taarifa potofu.`,
      category: 'Makala',
      tags: ['makala', 'elimu', 'utafiti'],
      coverImage: MAKALA_COVERS[3].path,
    },
  ];

  for (const item of starters) {
    await createTopic(user, displayName, item);
  }
}

export interface SendChatMessageInput {
  customId?: string;
  text?: string;
  attachmentType?: ChatAttachmentType;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentSize?: number;
  attachmentMime?: string;
  replyToId?: string;
  replyToSenderName?: string;
  replyToPreview?: string;
  viewOnce?: boolean;
}

export function generateChatMessageId(): string {
  return doc(collection(db, 'forum_chat_messages')).id;
}

export async function sendChatMessage(
  user: User,
  displayName: string,
  input: SendChatMessageInput
): Promise<string> {
  const text = sanitizeTextInput(input.text || '', 2000);
  const attachmentType: ChatAttachmentType =
    input.attachmentType === 'image' || input.attachmentType === 'document'
      ? input.attachmentType
      : 'none';
  const attachmentUrl =
    attachmentType === 'none' ? '' : sanitizeTextInput(input.attachmentUrl || '', 500);
  const attachmentName =
    attachmentType === 'none' ? '' : sanitizeTextInput(input.attachmentName || '', 140);
  const attachmentSize =
    attachmentType === 'none'
      ? 0
      : Math.max(0, Math.min(Math.floor(Number(input.attachmentSize || 0)), 15_728_640));
  const attachmentMime =
    attachmentType === 'none' ? '' : sanitizeTextInput(input.attachmentMime || '', 120);

  if (text.length === 0 && (attachmentType === 'none' || !attachmentUrl.startsWith('https://'))) {
    throw new Error('Andika ujumbe au ambatanisha picha/nyaraka kabla ya kutuma.');
  }

  const msgRef =
    input.customId && /^[a-zA-Z0-9_\-]+$/.test(input.customId)
      ? doc(db, 'forum_chat_messages', input.customId)
      : doc(collection(db, 'forum_chat_messages'));
  const path = `forum_chat_messages/${msgRef.id}`;

  try {
    await setDoc(msgRef, {
      senderId: user.uid,
      senderName: sanitizeTextInput(displayName || user.displayName || 'Mwanachama', 80) || 'Mwanachama',
      senderPhoto: sanitizeTextInput(user.photoURL || '', 500),
      text,
      attachmentType,
      attachmentUrl,
      attachmentName,
      attachmentSize,
      attachmentMime,
      replyToId: sanitizeTextInput(input.replyToId || '', 128),
      replyToSenderName: sanitizeTextInput(input.replyToSenderName || '', 80),
      replyToPreview: sanitizeTextInput(input.replyToPreview || '', 160),
      isDeleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return msgRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function softDeleteChatMessage(messageId: string): Promise<void> {
  const path = `forum_chat_messages/${messageId}`;
  try {
    await updateDoc(doc(db, 'forum_chat_messages', messageId), {
      isDeleted: true,
      text: '[Ujumbe huu umefutwa]',
      attachmentType: 'none',
      attachmentUrl: '',
      attachmentName: '',
      attachmentSize: 0,
      attachmentMime: '',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function clearAllChatMessages(): Promise<number> {
  const path = 'forum_chat_messages';
  try {
    const snap = await getDocs(collection(db, path));
    if (snap.empty) return 0;

    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 450) {
      const chunk = docs.slice(i, i + 450);
      const batch = writeBatch(db);
      chunk.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    return docs.length;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export interface FormattedNoteResult {
  title: string;
  subtitle: string;
  body: string;
  summary: string;
  wordCount: number;
  fileName: string;
}

function splitDenseParagraphForMobile(paragraph: string): string[] {
  if (paragraph.length <= 420) return [paragraph];
  const sentences = paragraph.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [paragraph];
  const chunks: string[] = [];
  let current = '';
  for (const s of sentences) {
    const cleanS = s.trim();
    if (!cleanS) continue;
    if (current && current.length + cleanS.length > 340) {
      chunks.push(current);
      current = cleanS;
    } else {
      current = current ? `${current} ${cleanS}` : cleanS;
    }
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [paragraph];
}

function detectCodeLanguage(codeLines: string[]): string {
  const joined = codeLines.join('\n');
  if (/^\s*(npm|npx|yarn|pnpm|bun|pip3?|git|docker|kubectl|curl|wget|sudo|cd|mkdir|chmod)\s+/m.test(joined)) {
    return 'bash';
  }
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE TABLE|ALTER TABLE)\b/im.test(joined)) {
    return 'sql';
  }
  if (/<\/?[a-zA-Z][a-zA-Z0-9-]*(\s|>|\/>)/.test(joined) && !/=>/.test(joined)) {
    return 'html';
  }
  if (/^\s*(def |class .*:|from .+ import |elif\b|print\()/m.test(joined)) {
    return 'python';
  }
  if (/^\s*(interface |type \w+\s*=|:\s*(string|number|boolean)\b)/m.test(joined)) {
    return 'typescript';
  }
  if (/^\s*(const|let|var|function|export|import|async\s+function|console\.log)\b/m.test(joined) || /=>/.test(joined)) {
    return 'javascript';
  }
  if (/^\s*[\[{]/.test(joined) && /"[\w-]+"\s*:/.test(joined)) {
    return 'json';
  }
  if (/^\s*([.#]?[a-zA-Z][\w-]*)\s*\{[^}]*:\s*[^}]+\}/m.test(joined)) {
    return 'css';
  }
  return 'code';
}

function isStrongSingleCodeLine(trimmed: string): boolean {
  if (!trimmed || trimmed.length > 220) return false;
  if (
    /^(npm|npx|yarn|pnpm|bun|pip3?|git|docker|kubectl|curl|wget)\s+\S+/i.test(trimmed) ||
    /^(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM|CREATE TABLE)\b/i.test(trimmed) ||
    /^(const|let|var|import|export|async\s+function|function)\s+\S+/.test(trimmed) ||
    /^console\.(log|error|warn)\(.*\);?$/.test(trimmed) ||
    /^<\/?[a-zA-Z][a-zA-Z0-9-]*(\s[^>]*)?>$/.test(trimmed)
  ) {
    return true;
  }
  return false;
}

function isLikelyCodeContinuation(rawLine: string): boolean {
  const trimmed = rawLine.trim();
  if (!trimmed) return false;
  if (/^(\s{2,}|\t+)/.test(rawLine) && !/^[-•*]\s+/.test(trimmed) && !/^\d{1,2}[.)]\s+/.test(trimmed)) {
    return true;
  }
  if (isStrongSingleCodeLine(trimmed)) return true;
  if (
    /^(\{|\}|\[|\]|\);?|\};?)$/.test(trimmed) ||
    /^(if|else|for|while|switch|try|catch|finally|return|def|class|elif|from|public|private)\b/.test(trimmed) ||
    /;\s*$/.test(trimmed) ||
    /=>/.test(trimmed) ||
    /^[a-zA-Z_][a-zA-Z0-9_.]*\s*=\s*[^=]/.test(trimmed) ||
    /^\/\/\s*/.test(trimmed) ||
    /^<\/?[a-zA-Z][a-zA-Z0-9-]*[\s>/]/.test(trimmed)
  ) {
    return true;
  }
  return false;
}

export function formatRawTextAsStructuredNote(
  rawTextInput: string,
  optionalTitle?: string,
  optionalSubtitle?: string
): FormattedNoteResult {
  const normalizedRaw = rawTextInput.replace(/\r\n/g, '\n').trim();
  const lines = normalizedRaw.split('\n').map((l) => l.trimEnd());

  let title = sanitizeTextInput(optionalTitle || '', 160);
  let subtitle = sanitizeTextInput(optionalSubtitle || '', 220);
  let cursor = 0;

  // Find first non-empty line
  while (cursor < lines.length && !lines[cursor].trim()) {
    cursor++;
  }

  // Extract Title if not explicitly provided
  if (!title && cursor < lines.length) {
    const firstTrim = lines[cursor].trim();
    const isFence = firstTrim.startsWith('```') || firstTrim.startsWith('~~~');
    const isMediaToken =
      /^!\[[^\]]*\]\(https:\/\/[^\s)]+\)$/i.test(firstTrim) ||
      /^@\[video(?:\|[^\]]*)?\]\(https:\/\/[^\s)]+\)$/i.test(firstTrim);
    if (!isFence && !isMediaToken && !isStrongSingleCodeLine(firstTrim)) {
      const firstClean = firstTrim
        .replace(/^#{1,4}\s*/, '')
        .replace(/^(title|kichwa)\s*:\s*/i, '')
        .replace(/^[•\-*▪✓✔►➢]+\s*/, '')
        .replace(/:$/, '')
        .trim();

      if (firstClean.length >= 2 && firstClean.length <= 95) {
        title = firstClean;
        const hasMoreContent = lines.slice(cursor + 1).some((l) => l.trim().length > 0);
        if (hasMoreContent) {
          cursor++;
        }
      } else if (firstClean.length > 95) {
        const sentenceEnd = firstClean.search(/[.!?]\s/);
        title =
          sentenceEnd > 12 && sentenceEnd <= 90
            ? firstClean.slice(0, sentenceEnd)
            : `${firstClean.slice(0, 75).trim()}...`;
      }
    }
  }

  // Advance past blanks
  while (cursor < lines.length && !lines[cursor].trim()) {
    cursor++;
  }

  // Extract Subtitle if not explicitly provided
  if (!subtitle && cursor < lines.length) {
    const nextTrim = lines[cursor].trim();
    const explicitSubMatch = nextTrim.match(/^(?:subtitle|kichwa kidogo|muhtasari mfupi)\s*:\s*(.+)$/i);
    if (explicitSubMatch) {
      subtitle = sanitizeTextInput(explicitSubMatch[1], 220);
      const hasMoreAfterSub = lines.slice(cursor + 1).some((l) => l.trim().length > 0);
      if (hasMoreAfterSub) cursor++;
    } else {
      const isBulletOrNum =
        /^[•·–—▪‣✓✔➢►*-]\s+/.test(nextTrim) || /^\d{1,2}[.)]\s+/.test(nextTrim);
      const isFence = nextTrim.startsWith('```') || nextTrim.startsWith('~~~');
      const isHeading = /^#{1,3}\s+/.test(nextTrim) || nextTrim.endsWith(':');
      const isMediaToken =
        /^!\[[^\]]*\]\(https:\/\/[^\s)]+\)$/i.test(nextTrim) ||
        /^@\[video(?:\|[^\]]*)?\]\(https:\/\/[^\s)]+\)$/i.test(nextTrim);
      const hasMoreAfterSub = lines.slice(cursor + 1).some((l) => l.trim().length > 0);
      if (
        hasMoreAfterSub &&
        !isBulletOrNum &&
        !isFence &&
        !isHeading &&
        !isMediaToken &&
        !isStrongSingleCodeLine(nextTrim) &&
        nextTrim.length >= 10 &&
        nextTrim.length <= 150
      ) {
        subtitle = sanitizeTextInput(nextTrim, 220);
        cursor++;
      }
    }
  }

  if (title.length < 2) {
    title = 'Notes za Malosha Forums';
  }

  const formattedLines: string[] = [];
  let prevBlank = true;
  let i = cursor;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed) {
      if (!prevBlank) {
        formattedLines.push('');
        prevBlank = true;
      }
      i++;
      continue;
    }

    // 0. Preserve standalone Inline Image or Video Media Token
    if (
      /^!\[[^\]]*\]\(https:\/\/[^\s)]+\)$/i.test(trimmed) ||
      /^@\[video(?:\|[^\]]*)?\]\(https:\/\/[^\s)]+\)$/i.test(trimmed)
    ) {
      if (formattedLines.length > 0 && formattedLines[formattedLines.length - 1] !== '') {
        formattedLines.push('');
      }
      formattedLines.push(trimmed);
      formattedLines.push('');
      prevBlank = true;
      i++;
      continue;
    }

    // 1. Explicit Markdown Fenced Code Block (``` or ~~~)
    const fenceMatch = trimmed.match(/^(```|~~~)([a-zA-Z0-9_+-]*)\s*$/);
    if (fenceMatch) {
      const fenceDelim = fenceMatch[1];
      const langHint = (fenceMatch[2] || '').toLowerCase();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length) {
        if (lines[i].trim().startsWith(fenceDelim)) {
          i++;
          break;
        }
        codeLines.push(lines[i]);
        i++;
      }
      if (formattedLines.length > 0 && formattedLines[formattedLines.length - 1] !== '') {
        formattedLines.push('');
      }
      const detectedLang = langHint || detectCodeLanguage(codeLines);
      formattedLines.push(`\`\`\`${detectedLang}`);
      codeLines.forEach((cl) => formattedLines.push(cl));
      formattedLines.push('```');
      formattedLines.push('');
      prevBlank = true;
      continue;
    }

    // 2. Unfenced Pasted Code Detection (single strong command or 2+ consecutive code lines)
    if (isLikelyCodeContinuation(raw)) {
      const probeLines: string[] = [raw];
      let j = i + 1;
      let braceBalance =
        (raw.match(/\{/g) || []).length - (raw.match(/\}/g) || []).length;

      while (j < lines.length) {
        const nextRaw = lines[j];
        const nextTrim = nextRaw.trim();
        if (!nextTrim) {
          // Keep blank lines inside an open brace block or if code continues right after
          const lookAhead = j + 1 < lines.length ? lines[j + 1] : '';
          if (braceBalance > 0 || isLikelyCodeContinuation(lookAhead)) {
            probeLines.push('');
            j++;
            continue;
          }
          break;
        }
        if (nextTrim.startsWith('```') || nextTrim.startsWith('~~~')) break;
        if (braceBalance > 0 || isLikelyCodeContinuation(nextRaw)) {
          probeLines.push(nextRaw);
          braceBalance +=
            (nextRaw.match(/\{/g) || []).length - (nextRaw.match(/\}/g) || []).length;
          j++;
        } else {
          break;
        }
      }

      const nonEmptyProbe = probeLines.filter((l) => l.trim().length > 0);
      if (
        nonEmptyProbe.length >= 2 ||
        (nonEmptyProbe.length === 1 && isStrongSingleCodeLine(nonEmptyProbe[0].trim()))
      ) {
        if (formattedLines.length > 0 && formattedLines[formattedLines.length - 1] !== '') {
          formattedLines.push('');
        }
        const detectedLang = detectCodeLanguage(nonEmptyProbe);
        formattedLines.push(`\`\`\`${detectedLang}`);
        probeLines.forEach((cl) => formattedLines.push(cl));
        formattedLines.push('```');
        formattedLines.push('');
        prevBlank = true;
        i = j;
        continue;
      }
    }

    prevBlank = false;

    // 3. Markdown Subheading (### or ##)
    if (/^###\s+/.test(trimmed)) {
      if (formattedLines.length > 0 && formattedLines[formattedLines.length - 1] !== '') {
        formattedLines.push('');
      }
      formattedLines.push(`### ${trimmed.replace(/^###\s+/, '').trim()}`);
      i++;
      continue;
    }

    if (/^#{1,2}\s+/.test(trimmed)) {
      if (formattedLines.length > 0 && formattedLines[formattedLines.length - 1] !== '') {
        formattedLines.push('');
      }
      formattedLines.push(`## ${trimmed.replace(/^#{1,2}\s+/, '').trim()}`);
      i++;
      continue;
    }

    // 4. Bullet item normalization
    if (/^[•·–—▪‣✓✔➢►*]\s+/.test(trimmed) || /^-\s+/.test(trimmed)) {
      const itemText = trimmed.replace(/^[•·–—▪‣✓✔➢►*-]\s+/, '').trim();
      if (itemText) formattedLines.push(`- ${itemText}`);
      i++;
      continue;
    }

    // 5. Numbered list normalization
    const numMatch = trimmed.match(/^(\d{1,2})[.)]\s+(.+)$/);
    if (numMatch) {
      formattedLines.push(`${numMatch[1]}. ${numMatch[2].trim()}`);
      i++;
      continue;
    }

    // 6. Auto-detected Section Titles & Subheadings
    const looksLikeUrl = /https?:\/\//i.test(trimmed);
    const lettersOnly = trimmed.replace(/[^a-zA-Z]/g, '');
    const isAllCapsHeading =
      lettersOnly.length >= 3 &&
      lettersOnly === lettersOnly.toUpperCase() &&
      trimmed.length <= 70;
    const isColonHeading =
      !looksLikeUrl && trimmed.endsWith(':') && trimmed.length >= 4 && trimmed.length <= 75;
    const isNamedSection =
      /^(sehemu|somo|chapter|part|hatua|muhtasari|utangulizi|hitimisho|kumbuka|zingatia)\b/i.test(
        trimmed
      ) && trimmed.length <= 80;

    if (isAllCapsHeading || isNamedSection) {
      if (formattedLines.length > 0 && formattedLines[formattedLines.length - 1] !== '') {
        formattedLines.push('');
      }
      formattedLines.push(`## ${trimmed.replace(/:$/, '').trim()}`);
      i++;
      continue;
    }

    if (isColonHeading) {
      if (formattedLines.length > 0 && formattedLines[formattedLines.length - 1] !== '') {
        formattedLines.push('');
      }
      formattedLines.push(`### ${trimmed.replace(/:$/, '').trim()}`);
      i++;
      continue;
    }

    // 7. Prose Paragraph (wrapped smoothly for mobile)
    const mobileChunks = splitDenseParagraphForMobile(trimmed);
    for (let c = 0; c < mobileChunks.length; c++) {
      formattedLines.push(mobileChunks[c]);
      if (c < mobileChunks.length - 1) {
        formattedLines.push('');
      }
    }
    i++;
  }

  let body = formattedLines.join('\n').trim();
  if (body.length < 5) {
    body = normalizedRaw.slice(0, 14800);
  }
  body = sanitizeTextInput(body, 15000);

  const plainForSummary = body
    .replace(/!\[[^\]]*\]\(https:\/\/[^\s)]+\)/gi, ' [Picha] ')
    .replace(/@\[video(?:\|[^\]]*)?\]\(https:\/\/[^\s)]+\)/gi, ' [Video] ')
    .replace(/```[\s\S]*?```/g, ' [Code Snippet] ')
    .replace(/^#{2,3}\s+/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  const summary = sanitizeTextInput(
    plainForSummary.length > 200 ? `${plainForSummary.slice(0, 197)}...` : plainForSummary,
    240
  );

  const words = plainForSummary.split(/\s+/).filter(Boolean);
  const wordCount = Math.max(1, Math.min(words.length, 50000));

  const now = new Date();
  const datePart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'notes';
  const fileName = `malosha-${datePart}-${slug}.pdf`.slice(0, 120);

  return {
    title: sanitizeTextInput(title, 160),
    subtitle: sanitizeTextInput(subtitle, 220),
    body,
    summary,
    wordCount,
    fileName,
  };
}

export async function createMchartNote(
  user: User,
  displayName: string,
  input: {
    rawText?: string;
    title?: string;
    subtitle?: string;
    isPinned?: boolean;
    isArchived?: boolean;
    pdfUrl?: string;
    pdfFileName?: string;
    pdfSize?: number;
    isLocked?: boolean;
    lockedTargetMode?: 'all' | 'selected';
    lockPrice?: number;
    lockCurrency?: string;
    paymentInstructions?: string;
    lockedUsers?: { uid: string; displayName: string }[];
  }
): Promise<string> {
  const cleanPdfUrl = sanitizeTextInput(input.pdfUrl || '', 500);
  const hasPdf = cleanPdfUrl.startsWith('https://');
  const cleanPdfName = hasPdf
    ? sanitizeTextInput(input.pdfFileName || 'malosha-notes.pdf', 140)
    : '';
  const cleanPdfSize = hasPdf
    ? Math.max(0, Math.min(Math.floor(Number(input.pdfSize || 0)), 20_971_520))
    : 0;

  const rawTextClean = (input.rawText || '').trim();
  const hasText = rawTextClean.length >= 5;

  if (!hasText && !hasPdf) {
    throw new Error('Weka maudhui ya notes au pakia faili la PDF kabla ya kuchapisha.');
  }

  const derivedTitle =
    sanitizeTextInput(input.title || '', 160) ||
    (hasPdf && !hasText
      ? cleanPdfName.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim()
      : '');

  const fallbackPdfBody = `## Faili la PDF la Kusoma\n\nFaili "${cleanPdfName}" limepakiwa kwa ajili ya kusoma moja kwa moja kwenye simu au kupakua kama PDF.`;

  const formatted = formatRawTextAsStructuredNote(
    hasText ? rawTextClean : fallbackPdfBody,
    derivedTitle,
    input.subtitle
  );

  const noteType: 'text' | 'pdf' | 'mixed' =
    hasPdf && hasText ? 'mixed' : hasPdf ? 'pdf' : 'text';

  const isLocked = Boolean(input.isLocked);
  const lockedTargetMode: 'all' | 'selected' =
    input.lockedTargetMode === 'selected' ? 'selected' : 'all';
  const lockPrice = isLocked
    ? Math.max(0, Math.min(Math.floor(Number(input.lockPrice || 0)), 100_000_000))
    : 0;
  const lockCurrency = sanitizeTextInput(input.lockCurrency || 'TZS', 10) || 'TZS';
  const paymentInstructions = sanitizeTextInput(
    input.paymentInstructions || '',
    500
  );

  const noteRef = doc(collection(db, 'mchart_notes'));
  const path = `mchart_notes/${noteRef.id}`;

  const lockedPlaceholderBody =
    'Maudhui ya note hii yamefungwa na msimamizi. Haiwezi kusomwa mpaka uwe na ruhusa au malipo yathibitishwe.';
  const lockedPlaceholderSummary =
    lockPrice > 0
      ? `Imefungwa kwa malipo (${lockCurrency} ${lockPrice.toLocaleString()}). Lipia au omba ruhusa ya msimamizi kusoma.`
      : 'Imefungwa na msimamizi — haiwezi kusomwa mpaka upate ruhusa ya msimamizi.';

  try {
    await setDoc(noteRef, {
      authorId: user.uid,
      authorName:
        sanitizeTextInput(displayName || user.displayName || 'Mmiliki', 80) || 'Mmiliki',
      title: formatted.title,
      subtitle: formatted.subtitle,
      body: isLocked ? lockedPlaceholderBody : formatted.body,
      summary: isLocked ? lockedPlaceholderSummary : formatted.summary,
      fileName: hasPdf && !hasText ? cleanPdfName.slice(0, 120) : formatted.fileName,
      wordCount: formatted.wordCount,
      isArchived: Boolean(input.isArchived),
      isPinned: Boolean(input.isPinned),
      pdfUrl: isLocked ? '' : cleanPdfUrl,
      pdfFileName: cleanPdfName,
      pdfSize: cleanPdfSize,
      noteType,
      isLocked,
      lockedTargetMode,
      lockPrice,
      lockCurrency,
      paymentInstructions,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (isLocked) {
      await setDoc(doc(db, 'mchart_notes', noteRef.id, 'content', 'full'), {
        noteId: noteRef.id,
        body: formatted.body,
        pdfUrl: cleanPdfUrl,
        pdfFileName: cleanPdfName,
        pdfSize: cleanPdfSize,
        updatedAt: serverTimestamp(),
      });

      if (lockedTargetMode === 'selected' && input.lockedUsers?.length) {
        await Promise.all(
          input.lockedUsers.map((u) =>
            setDoc(doc(db, 'mchart_notes', noteRef.id, 'access', u.uid), {
              noteId: noteRef.id,
              userId: u.uid,
              userName: sanitizeTextInput(u.displayName || 'Mwanachama', 80) || 'Mwanachama',
              status: 'locked',
              paymentReference: '',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })
          )
        );
      }
    }

    return noteRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateMchartNote(
  noteId: string,
  updates: {
    title?: string;
    subtitle?: string;
    rawText?: string;
    isArchived?: boolean;
    isPinned?: boolean;
  }
): Promise<void> {
  const path = `mchart_notes/${noteId}`;
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (updates.rawText !== undefined) {
    const formatted = formatRawTextAsStructuredNote(
      updates.rawText,
      updates.title,
      updates.subtitle
    );
    payload.title = formatted.title;
    payload.subtitle = formatted.subtitle;
    payload.body = formatted.body;
    payload.summary = formatted.summary;
    payload.wordCount = formatted.wordCount;
    payload.fileName = formatted.fileName;
  } else {
    if (updates.title !== undefined) {
      const cleanTitle = sanitizeTextInput(updates.title, 160);
      if (cleanTitle.length < 2) {
        throw new Error('Kichwa cha note lazima kiwe na herufi angalau 2.');
      }
      payload.title = cleanTitle;
    }
    if (updates.subtitle !== undefined) {
      payload.subtitle = sanitizeTextInput(updates.subtitle, 220);
    }
  }

  if (updates.isArchived !== undefined) {
    payload.isArchived = Boolean(updates.isArchived);
  }
  if (updates.isPinned !== undefined) {
    payload.isPinned = Boolean(updates.isPinned);
  }

  try {
    await updateDoc(doc(db, 'mchart_notes', noteId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function configureMchartNoteLock(
  note: MchartNote,
  config: {
    isLocked: boolean;
    lockedTargetMode: 'all' | 'selected';
    lockPrice: number;
    lockCurrency: string;
    paymentInstructions: string;
  }
): Promise<void> {
  const notePath = `mchart_notes/${note.id}`;
  const contentPath = `mchart_notes/${note.id}/content/full`;
  const noteRef = doc(db, 'mchart_notes', note.id);
  const contentRef = doc(db, 'mchart_notes', note.id, 'content', 'full');

  const safePrice = Math.max(0, Math.min(Math.floor(Number(config.lockPrice || 0)), 100_000_000));
  const safeCurrency = sanitizeTextInput(config.lockCurrency || 'TZS', 10) || 'TZS';
  const safeInstructions = sanitizeTextInput(config.paymentInstructions || '', 500);
  const safeMode = config.lockedTargetMode === 'selected' ? 'selected' : 'all';

  try {
    if (config.isLocked) {
      // Preserve real full content inside protected subdocument before hiding on parent doc
      let fullBody = note.body;
      let fullPdfUrl = note.pdfUrl || '';
      let fullPdfName = note.pdfFileName || '';
      let fullPdfSize = Number(note.pdfSize || 0);

      const existingProtected = await getDoc(contentRef);
      if (existingProtected.exists()) {
        const pd = existingProtected.data();
        fullBody = String(pd.body || fullBody);
        fullPdfUrl = String(pd.pdfUrl || fullPdfUrl);
        fullPdfName = String(pd.pdfFileName || fullPdfName);
        fullPdfSize = Number(pd.pdfSize || fullPdfSize);
      }

      await setDoc(contentRef, {
        noteId: note.id,
        body: fullBody.length >= 5 ? fullBody : 'Maudhui ya note.',
        pdfUrl: fullPdfUrl,
        pdfFileName: fullPdfName,
        pdfSize: fullPdfSize,
        updatedAt: serverTimestamp(),
      });

      await updateDoc(noteRef, {
        isLocked: true,
        lockedTargetMode: safeMode,
        lockPrice: safePrice,
        lockCurrency: safeCurrency,
        paymentInstructions: safeInstructions,
        body:
          safePrice > 0
            ? 'Maudhui ya note hii yamefungwa kwa malipo. Lipia kiasi kilichowekwa ili kufungua na kusoma.'
            : 'Maudhui ya note hii yamefungwa kabisa na msimamizi. Haiwezi kusomwa bila ruhusa ya msimamizi.',
        summary:
          safePrice > 0
            ? `Imefungwa kwa malipo (${safeCurrency} ${safePrice.toLocaleString()}).`
            : 'Imefungwa kabisa na msimamizi — haiwezi kusomwa.',
        pdfUrl: '',
        updatedAt: serverTimestamp(),
      });
    } else {
      // Unlock note globally and restore protected content back to the public note doc
      let restoredBody = note.body;
      let restoredPdfUrl = note.pdfUrl || '';
      let restoredPdfName = note.pdfFileName || '';
      let restoredPdfSize = Number(note.pdfSize || 0);

      const existingProtected = await getDoc(contentRef);
      if (existingProtected.exists()) {
        const pd = existingProtected.data();
        if (typeof pd.body === 'string' && pd.body.length >= 5) {
          restoredBody = pd.body;
        }
        restoredPdfUrl = typeof pd.pdfUrl === 'string' ? pd.pdfUrl : '';
        restoredPdfName = typeof pd.pdfFileName === 'string' ? pd.pdfFileName : '';
        restoredPdfSize = Number(pd.pdfSize || 0);
      }

      const restoredPlain = restoredBody
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/#{1,3}\s+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const restoredSummary = sanitizeTextInput(
        restoredPlain.slice(0, 220) || note.subtitle || 'Notes za Malosha Forums.',
        240
      );

      await updateDoc(noteRef, {
        isLocked: false,
        lockedTargetMode: 'all',
        lockPrice: 0,
        paymentInstructions: safeInstructions,
        body: restoredBody,
        summary: restoredSummary,
        pdfUrl: restoredPdfUrl,
        pdfFileName: restoredPdfName,
        pdfSize: restoredPdfSize,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, existingOpPath(notePath, contentPath));
  }
}

function existingOpPath(a: string, _b: string): string {
  return a;
}

export async function fetchProtectedNoteContent(
  noteId: string
): Promise<MchartNoteContent | null> {
  const path = `mchart_notes/${noteId}/content/full`;
  try {
    const snap = await getDoc(doc(db, 'mchart_notes', noteId, 'content', 'full'));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      noteId: String(d.noteId || noteId),
      body: String(d.body || ''),
      pdfUrl: String(d.pdfUrl || ''),
      pdfFileName: String(d.pdfFileName || ''),
      pdfSize: Number(d.pdfSize || 0),
      updatedAt: d.updatedAt || null,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function fetchUserNoteAccess(
  noteId: string,
  userId: string
): Promise<MchartNoteAccess | null> {
  const path = `mchart_notes/${noteId}/access/${userId}`;
  try {
    const snap = await getDoc(doc(db, 'mchart_notes', noteId, 'access', userId));
    if (!snap.exists()) return null;
    const d = snap.data();
    const status =
      d.status === 'unlocked' || d.status === 'locked' || d.status === 'pending'
        ? d.status
        : 'pending';
    return {
      noteId: String(d.noteId || noteId),
      userId: String(d.userId || userId),
      userName: String(d.userName || 'Mwanachama'),
      status,
      paymentReference: String(d.paymentReference || ''),
      createdAt: d.createdAt || null,
      updatedAt: d.updatedAt || null,
    };
  } catch {
    return null;
  }
}

export async function submitNotePaymentRequest(
  noteId: string,
  user: User,
  displayName: string,
  paymentReference: string
): Promise<void> {
  const path = `mchart_notes/${noteId}/access/${user.uid}`;
  const accessRef = doc(db, 'mchart_notes', noteId, 'access', user.uid);
  const safeName =
    sanitizeTextInput(displayName || user.displayName || 'Mwanachama', 80) || 'Mwanachama';
  const safeRef = sanitizeTextInput(paymentReference || '', 240);

  try {
    const existingSnap = await getDoc(accessRef);
    if (existingSnap.exists()) {
      await updateDoc(accessRef, {
        status: 'pending',
        userName: safeName,
        paymentReference: safeRef,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(accessRef, {
        noteId,
        userId: user.uid,
        userName: safeName,
        status: 'pending',
        paymentReference: safeRef,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function setNoteMemberAccess(
  noteId: string,
  targetUid: string,
  targetName: string,
  status: 'unlocked' | 'locked' | 'pending',
  paymentReference = ''
): Promise<void> {
  const path = `mchart_notes/${noteId}/access/${targetUid}`;
  const noteRef = doc(db, 'mchart_notes', noteId);
  const contentRef = doc(db, 'mchart_notes', noteId, 'content', 'full');
  const accessRef = doc(db, 'mchart_notes', noteId, 'access', targetUid);
  const safeName = sanitizeTextInput(targetName || 'Mwanachama', 80) || 'Mwanachama';
  const safeRef = sanitizeTextInput(paymentReference || '', 240);

  try {
    // If admin locks a specific user on a currently unlocked note, automatically move
    // full body & PDF into /content/full and lock the parent doc in 'selected' mode
    if (status === 'locked') {
      const noteSnap = await getDoc(noteRef);
      if (noteSnap.exists()) {
        const nd = noteSnap.data();
        if (nd.isLocked !== true) {
          const existingContentSnap = await getDoc(contentRef);
          const fullBody =
            existingContentSnap.exists() && typeof existingContentSnap.data().body === 'string'
              ? String(existingContentSnap.data().body)
              : String(nd.body || 'Maudhui ya note.');
          const fullPdfUrl =
            existingContentSnap.exists() && typeof existingContentSnap.data().pdfUrl === 'string'
              ? String(existingContentSnap.data().pdfUrl)
              : String(nd.pdfUrl || '');
          const fullPdfName =
            existingContentSnap.exists() && typeof existingContentSnap.data().pdfFileName === 'string'
              ? String(existingContentSnap.data().pdfFileName)
              : String(nd.pdfFileName || '');
          const fullPdfSize =
            existingContentSnap.exists()
              ? Number(existingContentSnap.data().pdfSize || 0)
              : Number(nd.pdfSize || 0);

          await setDoc(contentRef, {
            noteId,
            body: fullBody.length >= 5 ? fullBody : 'Maudhui ya note.',
            pdfUrl: fullPdfUrl,
            pdfFileName: fullPdfName,
            pdfSize: fullPdfSize,
            updatedAt: serverTimestamp(),
          });

          await updateDoc(noteRef, {
            isLocked: true,
            lockedTargetMode: 'selected',
            lockPrice: Number(nd.lockPrice || 0),
            lockCurrency: String(nd.lockCurrency || 'TZS'),
            body: 'Maudhui ya note hii yamefungwa na msimamizi kwa baadhi ya watumiaji.',
            summary: 'Imefungwa na msimamizi — baadhi ya watumiaji hawana ruhusa ya kusoma.',
            pdfUrl: '',
            updatedAt: serverTimestamp(),
          });
        }
      }
    }

    const existingSnap = await getDoc(accessRef);
    if (existingSnap.exists()) {
      await updateDoc(accessRef, {
        status,
        userName: safeName,
        ...(paymentReference ? { paymentReference: safeRef } : {}),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(accessRef, {
        noteId,
        userId: targetUid,
        userName: safeName,
        status,
        paymentReference: safeRef,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function removeNoteMemberAccess(
  noteId: string,
  targetUid: string
): Promise<void> {
  const path = `mchart_notes/${noteId}/access/${targetUid}`;
  try {
    await deleteDoc(doc(db, 'mchart_notes', noteId, 'access', targetUid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function deleteMchartNote(noteId: string): Promise<void> {
  const path = `mchart_notes/${noteId}`;
  try {
    await deleteDoc(doc(db, 'mchart_notes', noteId, 'content', 'full')).catch(() => {});
    await deleteDoc(doc(db, 'mchart_notes', noteId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function syncMemberIdRecord(profile: UserProfile): Promise<MemberIdRecord> {
  const cardNumber = formatMemberCode(profile.uid);
  const controlSerial = computeMemberControlSerial(profile.uid);
  const path = `member_ids/${cardNumber}`;
  const ref = doc(db, 'member_ids', cardNumber);

  const safeName = sanitizeTextInput(profile.displayName || 'Mwanachama', 80) || 'Mwanachama';
  const safePhoto = sanitizeTextInput(profile.photoURL || '', 500);
  const role: 'member' | 'moderator' = profile.role === 'moderator' ? 'moderator' : 'member';
  const badge = normalizeVerificationBadge(profile.verificationBadge);
  const accountStatus = normalizeAccountStatus(profile.accountStatus);

  const issuedTs = profile.createdAt || Timestamp.now();
  const issuedDate = issuedTs.toDate();
  const expiryDate = new Date(
    issuedDate.getFullYear() + 10,
    issuedDate.getMonth(),
    issuedDate.getDate()
  );
  const expiresTs = Timestamp.fromDate(expiryDate);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        cardNumber,
        controlSerial,
        uid: profile.uid,
        displayName: safeName,
        photoURL: safePhoto,
        role,
        verificationBadge: badge,
        accountStatus,
        issuedAt: issuedTs,
        expiresAt: expiresTs,
        updatedAt: serverTimestamp(),
      });
      return {
        cardNumber,
        controlSerial,
        uid: profile.uid,
        displayName: safeName,
        photoURL: safePhoto,
        role,
        verificationBadge: badge,
        accountStatus,
        issuedAt: issuedTs,
        expiresAt: expiresTs,
        updatedAt: Timestamp.now(),
      };
    }

    const existing = snap.data();
    const needsSync =
      existing.displayName !== safeName ||
      existing.photoURL !== safePhoto;

    if (needsSync && accountStatus !== 'suspended') {
      await updateDoc(ref, {
        displayName: safeName,
        photoURL: safePhoto,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }

    return {
      cardNumber: String(existing.cardNumber || cardNumber),
      controlSerial: String(existing.controlSerial || controlSerial),
      uid: String(existing.uid || profile.uid),
      displayName: safeName,
      photoURL: safePhoto,
      role: existing.role === 'moderator' ? 'moderator' : role,
      verificationBadge: normalizeVerificationBadge(existing.verificationBadge ?? badge),
      accountStatus: normalizeAccountStatus(existing.accountStatus ?? accountStatus),
      issuedAt: existing.issuedAt || issuedTs,
      expiresAt: existing.expiresAt || expiresTs,
      updatedAt: existing.updatedAt || Timestamp.now(),
    };
  } catch (error) {
    // Graceful fallback if suspended user tries initial write; read-only view still works
    if (accountStatus === 'suspended') {
      return {
        cardNumber,
        controlSerial,
        uid: profile.uid,
        displayName: safeName,
        photoURL: safePhoto,
        role,
        verificationBadge: badge,
        accountStatus,
        issuedAt: issuedTs,
        expiresAt: expiresTs,
        updatedAt: Timestamp.now(),
      };
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function verifyMemberIdByInput(
  rawCardQuery: string,
  rawControlSerial = ''
): Promise<MemberIdVerificationResult> {
  const trimmed = rawCardQuery.trim().toUpperCase().replace(/[\s.]+/g, '');
  const cleanSerialInput = rawControlSerial.trim().replace(/\s+/g, '');

  if (!trimmed) {
    return { authentic: false, reason: 'not_found', record: null, source: 'none' };
  }

  let candidateCardId = '';
  let serialQuery = '';

  if (/^[0-9]{8}$/.test(trimmed)) {
    serialQuery = trimmed;
  } else if (trimmed.startsWith('MLF-')) {
    candidateCardId = trimmed;
  } else if (trimmed.startsWith('MLF') && trimmed.length > 3) {
    candidateCardId = `MLF-${trimmed.slice(3)}`;
  } else if (/^[A-Z0-9]{6,16}$/.test(trimmed)) {
    candidateCardId = `MLF-${trimmed}`;
  } else {
    return { authentic: false, reason: 'not_found', record: null, source: 'none' };
  }

  let matchedRecord: MemberIdRecord | null = null;
  let source: MemberIdVerificationResult['source'] = 'none';

  // 1. Direct exact lookup in member_ids registry
  if (candidateCardId && /^[A-Z0-9_\-]+$/.test(candidateCardId)) {
    const path = `member_ids/${candidateCardId}`;
    try {
      const snap = await getDoc(doc(db, 'member_ids', candidateCardId));
      if (snap.exists()) {
        const d = snap.data();
        matchedRecord = {
          cardNumber: String(d.cardNumber || candidateCardId),
          controlSerial: String(d.controlSerial || ''),
          uid: String(d.uid || ''),
          displayName: String(d.displayName || 'Mwanachama'),
          photoURL: String(d.photoURL || ''),
          role: d.role === 'moderator' ? 'moderator' : 'member',
          verificationBadge: normalizeVerificationBadge(d.verificationBadge),
          accountStatus: normalizeAccountStatus(d.accountStatus),
          issuedAt: d.issuedAt || null,
          expiresAt: d.expiresAt || null,
          updatedAt: d.updatedAt || null,
        };
        source = 'registry';
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }

  // 2. Lookup by 8-digit control serial if entered directly
  if (!matchedRecord && serialQuery) {
    const path = 'member_ids';
    try {
      const q = query(
        collection(db, 'member_ids'),
        where('controlSerial', '==', serialQuery),
        limit(1)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const d = snap.docs[0].data();
        matchedRecord = {
          cardNumber: String(d.cardNumber || snap.docs[0].id),
          controlSerial: String(d.controlSerial || serialQuery),
          uid: String(d.uid || ''),
          displayName: String(d.displayName || 'Mwanachama'),
          photoURL: String(d.photoURL || ''),
          role: d.role === 'moderator' ? 'moderator' : 'member',
          verificationBadge: normalizeVerificationBadge(d.verificationBadge),
          accountStatus: normalizeAccountStatus(d.accountStatus),
          issuedAt: d.issuedAt || null,
          expiresAt: d.expiresAt || null,
          updatedAt: d.updatedAt || null,
        };
        source = 'registry';
      }
    } catch {
      // Non-admin cannot list; proceed to fallback check below
    }
  }

  // 3. Fallback: Admin can check /users collection in case member never opened Profile tab yet
  if (!matchedRecord) {
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      for (const uDoc of usersSnap.docs) {
        const uData = uDoc.data();
        const uid = String(uData.uid || uDoc.id);
        const generatedCode = formatMemberCode(uid);
        const generatedSerial = computeMemberControlSerial(uid);
        const matchesCode = candidateCardId !== '' && generatedCode === candidateCardId;
        const matchesSerial = serialQuery !== '' && generatedSerial === serialQuery;
        if (matchesCode || matchesSerial) {
          const issuedTs: Timestamp = uData.createdAt || Timestamp.now();
          const idDate = issuedTs.toDate();
          const expTs = Timestamp.fromDate(
            new Date(idDate.getFullYear() + 10, idDate.getMonth(), idDate.getDate())
          );
          matchedRecord = {
            cardNumber: generatedCode,
            controlSerial: generatedSerial,
            uid,
            displayName: String(uData.displayName || 'Mwanachama'),
            photoURL: String(uData.photoURL || ''),
            role: uData.role === 'moderator' ? 'moderator' : 'member',
            verificationBadge: normalizeVerificationBadge(uData.verificationBadge),
            accountStatus: normalizeAccountStatus(uData.accountStatus),
            issuedAt: issuedTs,
            expiresAt: expTs,
            updatedAt: uData.updatedAt || issuedTs,
          };
          source = 'users_fallback';
          break;
        }
      }
    } catch {
      // Non-admins cannot list /users; ignore cleanly
    }
  }

  if (!matchedRecord) {
    return { authentic: false, reason: 'not_found', record: null, source: 'none' };
  }

  // Always cross-check live /users/{uid} record so displayName, photo, badge & suspension state are fresh
  try {
    const liveUserSnap = await getDoc(doc(db, 'users', matchedRecord.uid));
    if (liveUserSnap.exists()) {
      const ud = liveUserSnap.data();
      matchedRecord = {
        ...matchedRecord,
        displayName: String(ud.displayName || matchedRecord.displayName),
        photoURL: String(ud.photoURL ?? matchedRecord.photoURL),
        role: ud.role === 'moderator' ? 'moderator' : matchedRecord.role,
        verificationBadge: normalizeVerificationBadge(ud.verificationBadge),
        accountStatus: normalizeAccountStatus(ud.accountStatus),
      };
    }
  } catch {
    // Keep matchedRecord if /users fetch fails
  }

  if (cleanSerialInput && matchedRecord.controlSerial !== cleanSerialInput) {
    return {
      authentic: false,
      reason: 'serial_mismatch',
      record: matchedRecord,
      source,
    };
  }

  if (matchedRecord.accountStatus === 'suspended') {
    return {
      authentic: false,
      reason: 'suspended',
      record: matchedRecord,
      source,
    };
  }

  return {
    authentic: true,
    reason: 'valid',
    record: matchedRecord,
    source,
  };
}

export async function writeUserPresence(
  uid: string,
  input: {
    displayName: string;
    photoURL?: string;
    isOnline: boolean;
    isTypingInMchart?: boolean;
    typingChatId?: string;
    replyingToName?: string;
    activeArea?: PresenceArea;
  }
): Promise<void> {
  if (!uid || !/^[a-zA-Z0-9_-]{1,128}$/.test(uid)) return;
  const path = `user_presence/${uid}`;
  const cleanName = sanitizeTextInput(input.displayName || 'Mwanachama', 80) || 'Mwanachama';
  const rawPhoto = input.photoURL ?? auth.currentUser?.photoURL ?? '';
  const cleanPhoto = sanitizeTextInput(rawPhoto, 500);
  const cleanReply = input.isTypingInMchart
    ? sanitizeTextInput(input.replyingToName || '', 80)
    : '';
  const cleanTypingChatId = input.isTypingInMchart
    ? sanitizeTextInput(input.typingChatId || 'group', 128)
    : '';
  const area: PresenceArea =
    input.activeArea === 'kijiweni' ||
    input.activeArea === 'video' ||
    input.activeArea === 'fursa' ||
    input.activeArea === 'makala' ||
    input.activeArea === 'mchart' ||
    input.activeArea === 'profile'
      ? input.activeArea
      : 'forum';

  try {
    await setDoc(doc(db, 'user_presence', uid), {
      uid,
      displayName: cleanName,
      photoURL: cleanPhoto,
      isOnline: Boolean(input.isOnline),
      isTypingInMchart: Boolean(input.isOnline && input.isTypingInMchart),
      typingChatId: input.isOnline && input.isTypingInMchart ? cleanTypingChatId : '',
      replyingToName: cleanReply,
      activeArea: area,
      lastSeenAt: serverTimestamp(),
      typingUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    // Non-fatal during offline/tab-unload transitions unless permission denied while active
    if (error instanceof Error && error.message.toLowerCase().includes('permission')) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }
}

export function getDeterministicDmId(uid1: string, uid2: string): string {
  const [a, b] = [uid1, uid2].sort();
  return `${a}__${b}`;
}

export function generateDirectMessageId(chatId: string): string {
  return doc(collection(db, 'direct_chats', chatId, 'messages')).id;
}

export async function lookupMemberProfileByIdOrCard(
  rawQuery: string
): Promise<MemberDirectoryCandidate | null> {
  const cleaned = rawQuery.trim();
  if (!cleaned) return null;

  const upper = cleaned.toUpperCase().replace(/[\s.]+/g, '');
  let cardId = '';
  if (upper.startsWith('MLF-')) {
    cardId = upper;
  } else if (/^MLF[A-Z0-9]{4,}$/.test(upper)) {
    cardId = `MLF-${upper.slice(3)}`;
  }

  if (cardId && /^[A-Z0-9_-]{4,64}$/.test(cardId)) {
    try {
      const cardSnap = await getDoc(doc(db, 'member_ids', cardId));
      if (cardSnap.exists()) {
        const d = cardSnap.data();
        if (d.accountStatus !== 'suspended') {
          return {
            uid: String(d.uid || ''),
            displayName: String(d.displayName || 'Mwanachama'),
            photoURL: String(d.photoURL || ''),
          };
        }
      }
    } catch {
      // Fall through to direct UID check
    }
  }

  if (/^[a-zA-Z0-9_-]{6,128}$/.test(cleaned)) {
    try {
      const userSnap = await getDoc(doc(db, 'users', cleaned));
      if (userSnap.exists()) {
        const d = userSnap.data();
        if (d.accountStatus !== 'suspended') {
          return {
            uid: String(d.uid || userSnap.id),
            displayName: String(d.displayName || 'Mwanachama'),
            photoURL: String(d.photoURL || ''),
          };
        }
      }
    } catch {
      return null;
    }
  }

  return null;
}

export async function ensureDirectChatThread(
  user: User,
  selfDisplayName: string,
  selfPhoto: string,
  target: { uid: string; displayName: string; photoURL?: string }
): Promise<DirectChatThread> {
  if (!target.uid || target.uid === user.uid) {
    throw new Error('Huwezi kuanzisha mazungumzo binafsi na wewe mwenyewe.');
  }
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(target.uid)) {
    throw new Error('Kitambulisho cha mwanachama si sahihi.');
  }

  const [participantA, participantB] = [user.uid, target.uid].sort();
  const chatId = `${participantA}__${participantB}`;
  const path = `direct_chats/${chatId}`;
  const threadRef = doc(db, 'direct_chats', chatId);

  const selfIsA = user.uid === participantA;
  const safeSelfName = sanitizeTextInput(selfDisplayName || user.displayName || 'Mwanachama', 80) || 'Mwanachama';
  const safeSelfPhoto = sanitizeTextInput(selfPhoto || user.photoURL || '', 500);
  const safeTargetName = sanitizeTextInput(target.displayName || 'Mwanachama', 80) || 'Mwanachama';
  const safeTargetPhoto = sanitizeTextInput(target.photoURL || '', 500);

  // Pull fresher profile if target name/photo looks sparse
  let resolvedTargetName = safeTargetName;
  let resolvedTargetPhoto = safeTargetPhoto;
  if (!resolvedTargetPhoto || resolvedTargetName === 'Mwanachama') {
    try {
      const targetSnap = await getDoc(doc(db, 'users', target.uid));
      if (targetSnap.exists()) {
        const td = targetSnap.data();
        if (typeof td.displayName === 'string' && td.displayName.trim()) {
          resolvedTargetName = sanitizeTextInput(td.displayName, 80);
        }
        if (typeof td.photoURL === 'string' && td.photoURL.trim()) {
          resolvedTargetPhoto = sanitizeTextInput(td.photoURL, 500);
        }
      }
    } catch {
      // Keep provided target fields
    }
  }

  const participantAName = selfIsA ? safeSelfName : resolvedTargetName;
  const participantAPhoto = selfIsA ? safeSelfPhoto : resolvedTargetPhoto;
  const participantBName = selfIsA ? resolvedTargetName : safeSelfName;
  const participantBPhoto = selfIsA ? resolvedTargetPhoto : safeSelfPhoto;

  try {
    await setDoc(threadRef, {
      chatId,
      participantA,
      participantB,
      participants: [participantA, participantB],
      participantAName,
      participantAPhoto,
      participantBName,
      participantBPhoto,
      lastMessageText: '',
      lastSenderId: '',
      lastMessageAt: serverTimestamp(),
      unreadCountA: 0,
      unreadCountB: 0,
      lastReadAtA: serverTimestamp(),
      lastReadAtB: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (createError) {
    // If thread already exists, allow create denies because doc exists; read the existing thread cleanly
    try {
      const existingSnap = await getDoc(threadRef);
      if (existingSnap.exists()) {
        const d = existingSnap.data();
        return {
          chatId: existingSnap.id,
          participantA: String(d.participantA || participantA),
          participantB: String(d.participantB || participantB),
          participants: [
            String(d.participantA || participantA),
            String(d.participantB || participantB),
          ],
          participantAName: String(d.participantAName || participantAName),
          participantAPhoto: String(d.participantAPhoto || participantAPhoto),
          participantBName: String(d.participantBName || participantBName),
          participantBPhoto: String(d.participantBPhoto || participantBPhoto),
          lastMessageText: String(d.lastMessageText || ''),
          lastSenderId: String(d.lastSenderId || ''),
          lastMessageAt: d.lastMessageAt || null,
          unreadCountA: Number(d.unreadCountA || 0),
          unreadCountB: Number(d.unreadCountB || 0),
          lastReadAtA: d.lastReadAtA || null,
          lastReadAtB: d.lastReadAtB || null,
          createdAt: d.createdAt || null,
          updatedAt: d.updatedAt || null,
        };
      }
    } catch (getError) {
      handleFirestoreError(getError, OperationType.GET, path);
    }
    handleFirestoreError(createError, OperationType.CREATE, path);
  }

  return {
    chatId,
    participantA,
    participantB,
    participants: [participantA, participantB],
    participantAName,
    participantAPhoto,
    participantBName,
    participantBPhoto,
    lastMessageText: '',
    lastSenderId: '',
    lastMessageAt: Timestamp.now(),
    unreadCountA: 0,
    unreadCountB: 0,
    lastReadAtA: Timestamp.now(),
    lastReadAtB: Timestamp.now(),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
}

export async function sendDirectMessage(
  user: User,
  displayName: string,
  selfPhoto: string,
  thread: DirectChatThread,
  input: SendChatMessageInput
): Promise<string> {
  const text = sanitizeTextInput(input.text || '', 2000);
  const attachmentType: ChatAttachmentType =
    input.attachmentType === 'image' || input.attachmentType === 'document'
      ? input.attachmentType
      : 'none';
  const attachmentUrl =
    attachmentType === 'none' ? '' : sanitizeTextInput(input.attachmentUrl || '', 500);
  const attachmentName =
    attachmentType === 'none' ? '' : sanitizeTextInput(input.attachmentName || '', 140);
  const attachmentSize =
    attachmentType === 'none'
      ? 0
      : Math.max(0, Math.min(Math.floor(Number(input.attachmentSize || 0)), 15_728_640));
  const attachmentMime =
    attachmentType === 'none' ? '' : sanitizeTextInput(input.attachmentMime || '', 120);

  if (text.length === 0 && (attachmentType === 'none' || !attachmentUrl.startsWith('https://'))) {
    throw new Error('Andika ujumbe au ambatanisha picha/nyaraka kabla ya kutuma.');
  }

  const chatId = thread.chatId;
  const msgRef =
    input.customId && /^[a-zA-Z0-9_\-]+$/.test(input.customId)
      ? doc(db, 'direct_chats', chatId, 'messages', input.customId)
      : doc(collection(db, 'direct_chats', chatId, 'messages'));
  const threadRef = doc(db, 'direct_chats', chatId);
  const path = `direct_chats/${chatId}/messages/${msgRef.id}`;

  const safeName = sanitizeTextInput(displayName || user.displayName || 'Mwanachama', 80) || 'Mwanachama';
  const safePhoto = sanitizeTextInput(selfPhoto || user.photoURL || '', 500);
  const senderIsA = user.uid === thread.participantA;
  const isViewOnce = Boolean(input.viewOnce && attachmentType === 'image');
  const previewText = sanitizeTextInput(
    text ||
      (attachmentType === 'image'
        ? isViewOnce
          ? '👁️ Picha ya Mara Moja (1x)'
          : '📷 Picha'
        : `📄 ${attachmentName || 'Nyaraka'}`),
    200
  );

  try {
    const batch = writeBatch(db);
    batch.set(msgRef, {
      chatId,
      participants: thread.participants,
      senderId: user.uid,
      senderName: safeName,
      senderPhoto: safePhoto,
      text,
      attachmentType,
      attachmentUrl,
      attachmentName,
      attachmentSize,
      attachmentMime,
      replyToId: sanitizeTextInput(input.replyToId || '', 128),
      replyToSenderName: sanitizeTextInput(input.replyToSenderName || '', 80),
      replyToPreview: sanitizeTextInput(input.replyToPreview || '', 160),
      isDeleted: false,
      ...(isViewOnce ? { viewOnce: true, viewOnceConsumed: false, viewOnceOpenedAt: null } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.update(threadRef, {
      lastMessageText: previewText,
      lastSenderId: user.uid,
      lastMessageAt: serverTimestamp(),
      [senderIsA ? 'unreadCountA' : 'unreadCountB']: 0,
      [senderIsA ? 'unreadCountB' : 'unreadCountA']: increment(1),
      [senderIsA ? 'lastReadAtA' : 'lastReadAtB']: serverTimestamp(),
      [senderIsA ? 'participantAName' : 'participantBName']: safeName,
      [senderIsA ? 'participantAPhoto' : 'participantBPhoto']: safePhoto,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return msgRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function markDirectViewOnceConsumed(
  chatId: string,
  messageId: string
): Promise<void> {
  const path = `direct_chats/${chatId}/messages/${messageId}`;
  try {
    await updateDoc(doc(db, 'direct_chats', chatId, 'messages', messageId), {
      viewOnceConsumed: true,
      viewOnceOpenedAt: serverTimestamp(),
      attachmentUrl: '',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function softDeleteDirectMessage(
  chatId: string,
  messageId: string
): Promise<void> {
  const path = `direct_chats/${chatId}/messages/${messageId}`;
  try {
    await updateDoc(doc(db, 'direct_chats', chatId, 'messages', messageId), {
      isDeleted: true,
      text: '[Ujumbe huu umefutwa]',
      attachmentType: 'none',
      attachmentUrl: '',
      attachmentName: '',
      attachmentSize: 0,
      attachmentMime: '',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function markDirectChatRead(
  chatId: string,
  uid: string,
  participantA: string
): Promise<void> {
  const path = `direct_chats/${chatId}`;
  const selfIsA = uid === participantA;
  try {
    await updateDoc(doc(db, 'direct_chats', chatId), {
      [selfIsA ? 'unreadCountA' : 'unreadCountB']: 0,
      [selfIsA ? 'lastReadAtA' : 'lastReadAtB']: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes('permission')) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }
}

export async function createMchartStatus(
  user: User,
  displayName: string,
  selfPhoto: string,
  input: {
    mediaType?: 'image' | 'video';
    imageUrl: string;
    videoUrl?: string;
    durationSec?: number;
    caption?: string;
    privacy: StatusPrivacyMode;
    allowedViewerIds?: string[];
  }
): Promise<string> {
  const mediaType: 'image' | 'video' = input.mediaType === 'video' ? 'video' : 'image';
  const videoUrl = mediaType === 'video' ? sanitizeTextInput(input.videoUrl || '', 500) : '';
  if (mediaType === 'video' && (!videoUrl.startsWith('https://') || videoUrl.length < 10)) {
    throw new Error('Kiungo cha video ya Status hakiko sahihi.');
  }

  let imageUrl = sanitizeTextInput(input.imageUrl || '', 500);
  if ((!imageUrl.startsWith('https://') || imageUrl.length < 10) && mediaType === 'video') {
    imageUrl = 'https://res.cloudinary.com/demo/image/upload/w_720,f_jpg/sample.jpg';
  }
  if (!imageUrl.startsWith('https://') || imageUrl.length < 10) {
    throw new Error('Kiungo cha picha ya Status hakiko sahihi.');
  }

  const durationSec =
    mediaType === 'video'
      ? Math.max(0, Math.min(300, Math.round(Number(input.durationSec || 0))))
      : 0;
  const caption = sanitizeTextInput(input.caption || '', 280);
  const privacy: StatusPrivacyMode = input.privacy === 'selected' ? 'selected' : 'members';
  const cleanedAllowed =
    privacy === 'selected'
      ? Array.from(
          new Set(
            (input.allowedViewerIds || [])
              .filter((id) => id && id !== user.uid && /^[a-zA-Z0-9_-]{1,128}$/.test(id))
          )
        ).slice(0, 50)
      : [];

  const audienceTokens =
    privacy === 'members' ? ['__MEMBERS__'] : [user.uid, ...cleanedAllowed];

  const statusRef = doc(collection(db, 'mchart_statuses'));
  const path = `mchart_statuses/${statusRef.id}`;
  const expiresAtTs = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);

  try {
    await setDoc(statusRef, {
      authorId: user.uid,
      authorName: sanitizeTextInput(displayName || user.displayName || 'Mwanachama', 80) || 'Mwanachama',
      authorPhoto: sanitizeTextInput(selfPhoto || user.photoURL || '', 500),
      mediaType,
      imageUrl,
      ...(mediaType === 'video' ? { videoUrl, durationSec } : {}),
      caption,
      privacy,
      allowedViewerIds: cleanedAllowed,
      audienceTokens,
      viewsCount: 0,
      createdAt: serverTimestamp(),
      expiresAt: expiresAtTs,
    });
    return statusRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteMchartStatus(statusId: string): Promise<void> {
  const path = `mchart_statuses/${statusId}`;
  try {
    await deleteDoc(doc(db, 'mchart_statuses', statusId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function markStatusViewed(
  status: MchartStatus,
  viewer: User,
  viewerDisplayName: string,
  viewerPhoto: string
): Promise<void> {
  if (!status.id || status.authorId === viewer.uid) return;
  if (status.expiresAt && status.expiresAt.toMillis() <= Date.now()) return;

  const viewRef = doc(db, 'mchart_statuses', status.id, 'views', viewer.uid);
  const statusRef = doc(db, 'mchart_statuses', status.id);
  const path = `mchart_statuses/${status.id}/views/${viewer.uid}`;

  try {
    const existing = await getDoc(viewRef);
    if (existing.exists()) return;

    const batch = writeBatch(db);
    batch.set(viewRef, {
      statusId: status.id,
      statusAuthorId: status.authorId,
      viewerId: viewer.uid,
      viewerName: sanitizeTextInput(viewerDisplayName || viewer.displayName || 'Mwanachama', 80) || 'Mwanachama',
      viewerPhoto: sanitizeTextInput(viewerPhoto || viewer.photoURL || '', 500),
      viewedAt: serverTimestamp(),
    });
    batch.update(statusRef, {
      viewsCount: increment(1),
    });
    await batch.commit();
  } catch (error) {
    // Non-fatal if status expired between check and commit
    if (error instanceof Error && error.message.toLowerCase().includes('permission')) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }
}

export async function fetchMemberPublicProfile(targetUid: string): Promise<UserProfile | null> {
  if (!targetUid || !/^[a-zA-Z0-9_-]{1,128}$/.test(targetUid)) return null;
  try {
    const snap = await getDoc(doc(db, 'users', targetUid));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      uid: String(d.uid || snap.id),
      displayName: String(d.displayName || 'Mwanachama'),
      photoURL: String(d.photoURL || ''),
      bio: String(d.bio || ''),
      role: d.role === 'moderator' ? 'moderator' : 'member',
      verificationBadge: normalizeVerificationBadge(d.verificationBadge),
      accountStatus: normalizeAccountStatus(d.accountStatus),
      suspendedReason: typeof d.suspendedReason === 'string' ? d.suspendedReason : '',
      suspendedRuleNumber: Number(d.suspendedRuleNumber || 0),
      topicsCount: Number(d.topicsCount || 0),
      repliesCount: Number(d.repliesCount || 0),
      followersCount: Number(d.followersCount || 0),
      createdAt: d.createdAt || null,
      updatedAt: d.updatedAt || null,
    };
  } catch {
    return null;
  }
}

export async function checkIsFollowingUser(
  targetUid: string,
  viewerUid: string
): Promise<boolean> {
  if (!targetUid || !viewerUid || targetUid === viewerUid) return false;
  try {
    const snap = await getDoc(doc(db, 'users', targetUid, 'followers', viewerUid));
    return snap.exists();
  } catch {
    return false;
  }
}

export async function toggleFollowUser(
  targetUid: string,
  viewer: User,
  viewerDisplayName: string,
  viewerPhoto: string,
  currentlyFollowing: boolean
): Promise<boolean> {
  if (!targetUid || targetUid === viewer.uid) {
    throw new Error('Huwezi kujifuata wewe mwenyewe.');
  }
  const followerRef = doc(db, 'users', targetUid, 'followers', viewer.uid);
  const targetUserRef = doc(db, 'users', targetUid);
  const path = `users/${targetUid}/followers/${viewer.uid}`;

  try {
    const batch = writeBatch(db);
    if (currentlyFollowing) {
      batch.delete(followerRef);
      batch.update(targetUserRef, {
        followersCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return false;
    } else {
      batch.set(followerRef, {
        followerId: viewer.uid,
        followerName:
          sanitizeTextInput(viewerDisplayName || viewer.displayName || 'Mwanachama', 80) ||
          'Mwanachama',
        followerPhoto: sanitizeTextInput(viewerPhoto || viewer.photoURL || '', 500),
        createdAt: serverTimestamp(),
      });
      batch.update(targetUserRef, {
        followersCount: increment(1),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return true;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export interface CreateVideoPostInput {
  mediaType?: 'video' | 'photo';
  videoUrl?: string;
  photoUrls?: string[];
  audioUrl?: string;
  cloudinaryPublicId?: string;
  thumbnailUrl?: string;
  caption: string;
  soundName?: string;
  tags: string[];
  durationSec: number;
  allowComments?: boolean;
  allowDownload?: boolean;
  allowLikes?: boolean;
  showLikeCount?: boolean;
  autoReplyEnabled?: boolean;
  autoReplyMessage?: string;
  autoReplyTrigger?: 'all' | 'keyword';
  autoReplyKeyword?: string;
}

export async function createVideoPost(
  user: User,
  displayName: string,
  authorPhoto: string,
  input: CreateVideoPostInput
): Promise<string> {
  const mediaType: 'video' | 'photo' = input.mediaType === 'photo' ? 'photo' : 'video';
  const rawVideoUrl = sanitizeTextInput(input.videoUrl || '', 500);
  const cleanedPhotoUrls = (input.photoUrls || [])
    .map((u) => sanitizeTextInput(u, 500))
    .filter((u) => u.startsWith('https://'))
    .slice(0, 10);

  if (mediaType === 'video' && !rawVideoUrl.startsWith('https://')) {
    throw new Error('Kiungo cha video si sahihi.');
  }
  if (mediaType === 'photo' && cleanedPhotoUrls.length === 0) {
    throw new Error('Chagua angalau picha 1 kabla ya kuchapisha.');
  }

  const audioUrl = sanitizeTextInput(input.audioUrl || '', 500);
  const safeAudioUrl = audioUrl.startsWith('https://') ? audioUrl : '';
  const publicId = sanitizeTextInput(input.cloudinaryPublicId || '', 240);
  const rawThumb = sanitizeTextInput(input.thumbnailUrl || '', 500);
  const thumbnailUrl =
    rawThumb.startsWith('https://')
      ? rawThumb
      : mediaType === 'photo'
        ? cleanedPhotoUrls[0] || ''
        : '';
  const caption = sanitizeTextInput(input.caption || '', 600);
  const safeAuthorName =
    sanitizeTextInput(displayName || user.displayName || 'Mwanachama', 80) || 'Mwanachama';
  const safePhoto = sanitizeTextInput(authorPhoto || user.photoURL || '', 500);
  const soundName =
    sanitizeTextInput(input.soundName || '', 120) ||
    (mediaType === 'photo' && !safeAudioUrl
      ? ''
      : sanitizeTextInput(`Sauti Halisi - ${safeAuthorName}`, 120) || 'Sauti Halisi');
  const tags = (input.tags || [])
    .map((t) => sanitizeTextInput(t.replace(/^#/, ''), 30))
    .filter(Boolean)
    .slice(0, 5);
  const durationSec = Math.max(0, Math.min(1200, Math.round(Number(input.durationSec || 0))));

  const autoReplyMessage = sanitizeTextInput(input.autoReplyMessage || '', 300);
  const autoReplyEnabled = Boolean(input.autoReplyEnabled && autoReplyMessage.length >= 1);
  const autoReplyTrigger: 'all' | 'keyword' =
    input.autoReplyTrigger === 'keyword' ? 'keyword' : 'all';
  const autoReplyKeyword = sanitizeTextInput(input.autoReplyKeyword || '', 60);

  const videoRef = doc(collection(db, 'videos'));
  const path = `videos/${videoRef.id}`;

  try {
    await setDoc(videoRef, {
      authorId: user.uid,
      authorName: safeAuthorName,
      authorPhoto: safePhoto,
      mediaType,
      videoUrl: mediaType === 'video' ? rawVideoUrl : '',
      photoUrls: mediaType === 'photo' ? cleanedPhotoUrls : [],
      audioUrl: safeAudioUrl,
      cloudinaryPublicId: publicId,
      thumbnailUrl,
      caption,
      soundName,
      tags,
      durationSec,
      likesCount: 0,
      commentsCount: 0,
      sharesCount: 0,
      isArchived: false,
      allowComments: input.allowComments !== false,
      allowDownload: input.allowDownload !== false,
      allowLikes: input.allowLikes !== false,
      showLikeCount: input.showLikeCount !== false,
      autoReplyEnabled,
      autoReplyMessage,
      autoReplyTrigger,
      autoReplyKeyword,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return videoRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export interface UpdateVideoSettingsInput {
  caption?: string;
  soundName?: string;
  tags?: string[];
  isArchived?: boolean;
  allowComments?: boolean;
  allowDownload?: boolean;
  allowLikes?: boolean;
  showLikeCount?: boolean;
  autoReplyEnabled?: boolean;
  autoReplyMessage?: string;
  autoReplyTrigger?: 'all' | 'keyword';
  autoReplyKeyword?: string;
}

export async function updateVideoSettings(
  videoId: string,
  updates: UpdateVideoSettingsInput
): Promise<void> {
  const path = `videos/${videoId}`;
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (updates.caption !== undefined) {
    payload.caption = sanitizeTextInput(updates.caption, 600);
  }
  if (updates.soundName !== undefined) {
    const cleanSound = sanitizeTextInput(updates.soundName, 120);
    if (cleanSound) payload.soundName = cleanSound;
  }
  if (updates.tags !== undefined) {
    payload.tags = updates.tags
      .map((t) => sanitizeTextInput(t.replace(/^#/, ''), 30))
      .filter(Boolean)
      .slice(0, 5);
  }
  if (updates.isArchived !== undefined) {
    payload.isArchived = Boolean(updates.isArchived);
  }
  if (updates.allowComments !== undefined) {
    payload.allowComments = Boolean(updates.allowComments);
  }
  if (updates.allowDownload !== undefined) {
    payload.allowDownload = Boolean(updates.allowDownload);
  }
  if (updates.allowLikes !== undefined) {
    payload.allowLikes = Boolean(updates.allowLikes);
  }
  if (updates.showLikeCount !== undefined) {
    payload.showLikeCount = Boolean(updates.showLikeCount);
  }
  if (updates.autoReplyMessage !== undefined) {
    payload.autoReplyMessage = sanitizeTextInput(updates.autoReplyMessage, 300);
  }
  if (updates.autoReplyEnabled !== undefined) {
    payload.autoReplyEnabled = Boolean(updates.autoReplyEnabled);
  }
  if (updates.autoReplyTrigger !== undefined) {
    payload.autoReplyTrigger = updates.autoReplyTrigger === 'keyword' ? 'keyword' : 'all';
  }
  if (updates.autoReplyKeyword !== undefined) {
    payload.autoReplyKeyword = sanitizeTextInput(updates.autoReplyKeyword, 60);
  }

  try {
    await updateDoc(doc(db, 'videos', videoId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function moderateVideoPost(
  video: { id: string; authorId: string; caption?: string },
  options: { isArchived: boolean; ruleNumber?: number; reason?: string }
): Promise<void> {
  const path = `videos/${video.id}`;
  const cleanRuleNum =
    options.isArchived && options.ruleNumber && Number.isFinite(options.ruleNumber)
      ? Math.max(0, Math.min(13, Math.round(options.ruleNumber)))
      : 0;
  const matchedRule = cleanRuleNum > 0 ? findCommunityRule(cleanRuleNum) : null;
  const cleanReason = options.isArchived
    ? sanitizeTextInput(
        options.reason ||
          (matchedRule ? `${matchedRule.titleSw}: ${matchedRule.summarySw}` : 'Ukiukaji wa kanuni za jukwaa.'),
        300
      )
    : '';

  try {
    await updateDoc(doc(db, 'videos', video.id), {
      isArchived: Boolean(options.isArchived),
      moderationRuleNumber: cleanRuleNum,
      moderationReason: cleanReason,
      updatedAt: serverTimestamp(),
    });

    const adminUser = auth.currentUser;
    if (
      adminUser &&
      video.authorId &&
      /^[a-zA-Z0-9_-]{1,128}$/.test(video.authorId)
    ) {
      const notifRef = doc(collection(db, 'users', video.authorId, 'notifications'));
      const ruleTitleText = matchedRule
        ? `Kanuni #${matchedRule.number}: ${matchedRule.titleSw}`
        : options.isArchived
          ? 'Video Imefungiwa'
          : 'Video Imerejeshwa';
      const preview = options.isArchived
        ? sanitizeTextInput(
            matchedRule
              ? `Video yako imefungiwa kwa kukiuka Kanuni #${matchedRule.number} (${matchedRule.titleSw}). ${cleanReason}`
              : `Video yako imefungiwa kwa sababu: ${cleanReason}`,
            200
          )
        : 'Video yako imerejeshwa hewani na sasa inaonekana kwa wanachama wote.';

      await setDoc(notifRef, {
        recipientId: video.authorId,
        actorId: adminUser.uid,
        actorName: sanitizeTextInput(adminUser.displayName || 'Msimamizi Malosha', 80) || 'Msimamizi Malosha',
        actorPhoto: sanitizeTextInput(adminUser.photoURL || '', 500),
        type: 'video_moderation',
        topicId: video.id,
        topicTitle: sanitizeTextInput(video.caption || 'Chapisho la Video', 140) || 'Chapisho la Video',
        topicCategory: 'Kijiweni',
        replyId: video.id,
        parentReplyId: '',
        replyPreview: preview,
        ...(cleanRuleNum > 0 ? { ruleNumber: cleanRuleNum, ruleTitle: sanitizeTextInput(ruleTitleText, 140) } : {}),
        isRead: false,
        createdAt: serverTimestamp(),
      }).catch(() => {});
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteVideoPost(videoId: string): Promise<void> {
  const path = `videos/${videoId}`;
  try {
    await deleteDoc(doc(db, 'videos', videoId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function toggleVideoLike(
  videoId: string,
  userId: string,
  hasLiked: boolean
): Promise<void> {
  const likeRef = doc(db, 'videos', videoId, 'likes', userId);
  const videoRef = doc(db, 'videos', videoId);
  const path = `videos/${videoId}/likes/${userId}`;

  try {
    const batch = writeBatch(db);
    if (hasLiked) {
      batch.delete(likeRef);
      batch.update(videoRef, {
        likesCount: increment(-1),
      });
    } else {
      batch.set(likeRef, {
        userId,
        createdAt: serverTimestamp(),
      });
      batch.update(videoRef, {
        likesCount: increment(1),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function checkUserVideoLikesBatch(
  videoIds: string[],
  userId: string
): Promise<Record<string, boolean>> {
  const entries = await Promise.all(
    videoIds.map(async (vid) => {
      try {
        const snap = await getDoc(doc(db, 'videos', vid, 'likes', userId));
        return [vid, snap.exists()] as const;
      } catch {
        return [vid, false] as const;
      }
    })
  );
  return Object.fromEntries(entries);
}

export async function incrementVideoShareCount(videoId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'videos', videoId), {
      sharesCount: increment(1),
    });
  } catch {
    // Non-fatal
  }
}

export async function addVideoComment(
  videoId: string,
  user: User,
  displayName: string,
  authorPhoto: string,
  bodyRaw: string,
  options?: {
    parentCommentId?: string;
    replyToAuthorName?: string;
    postContext?: {
      authorId: string;
      authorName: string;
      authorPhoto: string;
      autoReplyEnabled?: boolean;
      autoReplyMessage?: string;
      autoReplyTrigger?: 'all' | 'keyword';
      autoReplyKeyword?: string;
    };
  }
): Promise<string> {
  const body = sanitizeTextInput(bodyRaw, 1000);
  if (body.length < 1) {
    throw new Error('Andika maoni kabla ya kutuma.');
  }

  const commentRef = doc(collection(db, 'videos', videoId, 'comments'));
  const videoRef = doc(db, 'videos', videoId);
  const path = `videos/${videoId}/comments/${commentRef.id}`;
  const safeAuthorName =
    sanitizeTextInput(displayName || user.displayName || 'Mwanachama', 80) || 'Mwanachama';
  const safePhoto = sanitizeTextInput(authorPhoto || user.photoURL || '', 500);
  const parentCommentId = sanitizeTextInput(options?.parentCommentId || '', 128);
  const replyToAuthorName = sanitizeTextInput(options?.replyToAuthorName || '', 80);

  // Check if creator Auto-Reply should trigger automatically
  const ctx = options?.postContext;
  const autoMsg = sanitizeTextInput(ctx?.autoReplyMessage || '', 300);
  const keywordClean = (ctx?.autoReplyKeyword || '').trim().toLowerCase();
  const keywordMatch =
    ctx?.autoReplyTrigger !== 'keyword' ||
    !keywordClean ||
    body.toLowerCase().includes(keywordClean);
  const shouldAutoReply = Boolean(
    ctx &&
      ctx.authorId &&
      ctx.authorId !== user.uid &&
      ctx.autoReplyEnabled === true &&
      autoMsg.length >= 1 &&
      keywordMatch
  );

  try {
    const batch = writeBatch(db);
    batch.set(commentRef, {
      videoId,
      authorId: user.uid,
      authorName: safeAuthorName,
      authorPhoto: safePhoto,
      body,
      parentCommentId,
      replyToAuthorName,
      isAutoReply: false,
      isDeleted: false,
      createdAt: serverTimestamp(),
    });

    if (shouldAutoReply && ctx) {
      const autoReplyRef = doc(collection(db, 'videos', videoId, 'comments'));
      batch.set(autoReplyRef, {
        videoId,
        authorId: ctx.authorId,
        authorName: sanitizeTextInput(ctx.authorName || 'Mwandishi', 80) || 'Mwandishi',
        authorPhoto: sanitizeTextInput(ctx.authorPhoto || '', 500),
        body: autoMsg,
        parentCommentId: commentRef.id,
        replyToAuthorName: safeAuthorName,
        isAutoReply: true,
        isDeleted: false,
        createdAt: serverTimestamp(),
      });
    }

    batch.update(videoRef, {
      commentsCount: increment(shouldAutoReply ? 2 : 1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return commentRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteVideoComment(videoId: string, commentId: string): Promise<void> {
  const commentRef = doc(db, 'videos', videoId, 'comments', commentId);
  const videoRef = doc(db, 'videos', videoId);
  const path = `videos/${videoId}/comments/${commentId}`;

  try {
    const batch = writeBatch(db);
    batch.update(commentRef, {
      isDeleted: true,
    });
    batch.update(videoRef, {
      commentsCount: increment(-1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeSiteNavSettings(
  onUpdate: (settings: { hideVideoTabForUsers: boolean }) => void
): () => void {
  const settingsRef = doc(db, 'site_settings', 'navigation');
  return onSnapshot(
    settingsRef,
    (snap) => {
      if (!snap.exists()) {
        onUpdate({ hideVideoTabForUsers: false });
        return;
      }
      const data = snap.data();
      onUpdate({
        hideVideoTabForUsers: Boolean(data?.hideVideoTabForUsers),
      });
    },
    () => {
      onUpdate({ hideVideoTabForUsers: false });
    }
  );
}

export async function updateHideVideoTabForUsers(
  ownerUid: string,
  hideVideoTabForUsers: boolean
): Promise<void> {
  const path = 'site_settings/navigation';
  try {
    await setDoc(doc(db, 'site_settings', 'navigation'), {
      hideVideoTabForUsers: Boolean(hideVideoTabForUsers),
      updatedBy: ownerUid,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchOwnerCustomIdCard(
  cardId = 'primary'
): Promise<OwnerCustomIdCardData | null> {
  const path = `owner_id_cards/${cardId}`;
  try {
    const snap = await getDoc(doc(db, 'owner_id_cards', cardId));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      cardId: String(d.cardId || cardId),
      ownerUid: String(d.ownerUid || ''),
      headerTopLeftSw: String(d.headerTopLeftSw || ''),
      headerTopLeftEn: String(d.headerTopLeftEn || ''),
      headerTopRightSw: String(d.headerTopRightSw || ''),
      headerTopRightEn: String(d.headerTopRightEn || ''),
      idNumberLabel: String(d.idNumberLabel || ''),
      idNumber: String(d.idNumber || ''),
      surnameLabel: String(d.surnameLabel || ''),
      surname: String(d.surname || ''),
      givenNamesLabel: String(d.givenNamesLabel || ''),
      givenNames: String(d.givenNames || ''),
      dobLabel: String(d.dobLabel || ''),
      dateOfBirth: String(d.dateOfBirth || ''),
      sexLabel: String(d.sexLabel || ''),
      sex: String(d.sex || ''),
      nationalityLabel: String(d.nationalityLabel || ''),
      nationality: String(d.nationality || ''),
      signatureLabel: String(d.signatureLabel || ''),
      signatureText: String(d.signatureText || ''),
      signaturePath: String(d.signaturePath || ''),
      portraitUrl: String(d.portraitUrl || ''),
      hologramPhotoUrl: String(d.hologramPhotoUrl || ''),
      showSpecimenStamp: Boolean(d.showSpecimenStamp),
      specimenText: String(d.specimenText || ''),
      showRightEmblem: Boolean(d.showRightEmblem),
      createdAt: d.createdAt || null,
      updatedAt: d.updatedAt || null,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function saveOwnerCustomIdCard(
  ownerUid: string,
  payload: Omit<OwnerCustomIdCardData, 'cardId' | 'ownerUid' | 'createdAt' | 'updatedAt'>,
  cardId = 'primary'
): Promise<void> {
  const path = `owner_id_cards/${cardId}`;
  const docRef = doc(db, 'owner_id_cards', cardId);

  const cleanPayload = {
    headerTopLeftSw: sanitizeTextInput(payload.headerTopLeftSw, 100),
    headerTopLeftEn: sanitizeTextInput(payload.headerTopLeftEn, 100),
    headerTopRightSw: sanitizeTextInput(payload.headerTopRightSw, 100),
    headerTopRightEn: sanitizeTextInput(payload.headerTopRightEn, 100),
    idNumberLabel: sanitizeTextInput(payload.idNumberLabel, 80),
    idNumber: sanitizeTextInput(payload.idNumber, 60),
    surnameLabel: sanitizeTextInput(payload.surnameLabel, 80),
    surname: sanitizeTextInput(payload.surname, 80),
    givenNamesLabel: sanitizeTextInput(payload.givenNamesLabel, 80),
    givenNames: sanitizeTextInput(payload.givenNames, 120),
    dobLabel: sanitizeTextInput(payload.dobLabel, 80),
    dateOfBirth: sanitizeTextInput(payload.dateOfBirth, 60),
    sexLabel: sanitizeTextInput(payload.sexLabel, 80),
    sex: sanitizeTextInput(payload.sex, 30),
    nationalityLabel: sanitizeTextInput(payload.nationalityLabel, 80),
    nationality: sanitizeTextInput(payload.nationality, 80),
    signatureLabel: sanitizeTextInput(payload.signatureLabel, 80),
    signatureText: sanitizeTextInput(payload.signatureText, 80),
    signaturePath: String(payload.signaturePath || '').slice(0, 4000),
    portraitUrl: sanitizeTextInput(payload.portraitUrl, 500),
    hologramPhotoUrl: sanitizeTextInput(payload.hologramPhotoUrl, 500),
    showSpecimenStamp: Boolean(payload.showSpecimenStamp),
    specimenText: sanitizeTextInput(payload.specimenText, 40),
    showRightEmblem: Boolean(payload.showRightEmblem),
  };

  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      await updateDoc(docRef, {
        ...cleanPayload,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(docRef, {
        cardId,
        ownerUid,
        ...cleanPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function listTrainingCertificates(): Promise<TrainingCertificateData[]> {
  const path = 'training_certificates';
  try {
    const snap = await getDocs(collection(db, 'training_certificates'));
    const list: TrainingCertificateData[] = snap.docs.map((docSnap) => {
      const d = docSnap.data();
      return {
        certId: String(d.certId || docSnap.id),
        serialNumber: String(d.serialNumber || docSnap.id),
        issuerUid: String(d.issuerUid || ''),
        orientation: d.orientation === 'portrait' ? 'portrait' : 'landscape',
        theme:
          d.theme === 'emerald_gold' || d.theme === 'burgundy_gold' ? d.theme : 'navy_gold',
        institutionName: String(d.institutionName || ''),
        institutionSubtitle: String(d.institutionSubtitle || ''),
        institutionLogoUrl: String(d.institutionLogoUrl || ''),
        kickerText: String(d.kickerText || ''),
        certificateTitle: String(d.certificateTitle || ''),
        certificateSubtitle: String(d.certificateSubtitle || ''),
        introLine: String(d.introLine || ''),
        recipientUid: String(d.recipientUid || ''),
        recipientName: String(d.recipientName || ''),
        completionLine: String(d.completionLine || ''),
        courseTitle: String(d.courseTitle || ''),
        courseDetails: String(d.courseDetails || ''),
        durationText: String(d.durationText || ''),
        gradeText: String(d.gradeText || ''),
        issueDateText: String(d.issueDateText || ''),
        issueLocation: String(d.issueLocation || ''),
        signatory1Name: String(d.signatory1Name || ''),
        signatory1Title: String(d.signatory1Title || ''),
        signatory1SigText: String(d.signatory1SigText || ''),
        signatory1SigPath: String(d.signatory1SigPath || ''),
        showSignatory2: Boolean(d.showSignatory2),
        signatory2Name: String(d.signatory2Name || ''),
        signatory2Title: String(d.signatory2Title || ''),
        signatory2SigText: String(d.signatory2SigText || ''),
        signatory2SigPath: String(d.signatory2SigPath || ''),
        sealText: String(d.sealText || ''),
        watermarkText: String(d.watermarkText || ''),
        createdAt: d.createdAt || null,
        updatedAt: d.updatedAt || null,
      };
    });
    return list.sort((a, b) => {
      const aMs = a.updatedAt ? a.updatedAt.toMillis() : 0;
      const bMs = b.updatedAt ? b.updatedAt.toMillis() : 0;
      return bMs - aMs;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function saveTrainingCertificate(
  issuerUid: string,
  payload: Omit<TrainingCertificateData, 'issuerUid' | 'createdAt' | 'updatedAt'>
): Promise<TrainingCertificateData> {
  const safeCertId = payload.certId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  if (!safeCertId) {
    throw new Error('Namba ya utambulisho wa cheti si sahihi.');
  }
  const cleanRecipient = sanitizeTextInput(payload.recipientName, 120);
  const cleanCourse = sanitizeTextInput(payload.courseTitle, 180);
  if (!cleanRecipient) {
    throw new Error('Weka jina kamili la mshiriki / mhitimu.');
  }
  if (!cleanCourse) {
    throw new Error('Weka jina la mafunzo au kozi.');
  }

  const path = `training_certificates/${safeCertId}`;
  const docRef = doc(db, 'training_certificates', safeCertId);

  const cleanFields = {
    serialNumber: sanitizeTextInput(payload.serialNumber || safeCertId, 64) || safeCertId,
    orientation: payload.orientation === 'portrait' ? ('portrait' as const) : ('landscape' as const),
    theme:
      payload.theme === 'emerald_gold' || payload.theme === 'burgundy_gold'
        ? payload.theme
        : ('navy_gold' as const),
    institutionName: sanitizeTextInput(payload.institutionName, 140),
    institutionSubtitle: sanitizeTextInput(payload.institutionSubtitle, 180),
    institutionLogoUrl: sanitizeTextInput(payload.institutionLogoUrl, 500),
    kickerText: sanitizeTextInput(payload.kickerText, 120),
    certificateTitle: sanitizeTextInput(payload.certificateTitle, 120),
    certificateSubtitle: sanitizeTextInput(payload.certificateSubtitle, 140),
    introLine: sanitizeTextInput(payload.introLine, 140),
    recipientUid: sanitizeTextInput(payload.recipientUid, 128),
    recipientName: cleanRecipient,
    completionLine: sanitizeTextInput(payload.completionLine, 180),
    courseTitle: cleanCourse,
    courseDetails: sanitizeTextInput(payload.courseDetails, 500),
    durationText: sanitizeTextInput(payload.durationText, 80),
    gradeText: sanitizeTextInput(payload.gradeText, 80),
    issueDateText: sanitizeTextInput(payload.issueDateText, 80),
    issueLocation: sanitizeTextInput(payload.issueLocation, 100),
    signatory1Name: sanitizeTextInput(payload.signatory1Name, 100),
    signatory1Title: sanitizeTextInput(payload.signatory1Title, 100),
    signatory1SigText: sanitizeTextInput(payload.signatory1SigText, 80),
    signatory1SigPath: String(payload.signatory1SigPath || '').slice(0, 4000),
    showSignatory2: Boolean(payload.showSignatory2),
    signatory2Name: sanitizeTextInput(payload.signatory2Name, 100),
    signatory2Title: sanitizeTextInput(payload.signatory2Title, 100),
    signatory2SigText: sanitizeTextInput(payload.signatory2SigText, 80),
    signatory2SigPath: String(payload.signatory2SigPath || '').slice(0, 4000),
    sealText: sanitizeTextInput(payload.sealText, 80),
    watermarkText: sanitizeTextInput(payload.watermarkText, 100),
  };

  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      await updateDoc(docRef, {
        ...cleanFields,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(docRef, {
        certId: safeCertId,
        issuerUid,
        ...cleanFields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return {
      certId: safeCertId,
      issuerUid,
      ...cleanFields,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteTrainingCertificate(certId: string): Promise<void> {
  const path = `training_certificates/${certId}`;
  try {
    await deleteDoc(doc(db, 'training_certificates', certId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function fetchForumMembersDirectory(): Promise<MemberDirectoryCandidate[]> {
  try {
    const snap = await getDocs(collection(db, 'users'));
    const members: MemberDirectoryCandidate[] = snap.docs
      .map((docSnap) => {
        const d = docSnap.data();
        return {
          uid: String(d.uid || docSnap.id),
          displayName: String(d.displayName || 'Mwanachama'),
          photoURL: String(d.photoURL || ''),
          verificationBadge: normalizeVerificationBadge(d.verificationBadge),
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'sw'));
    return members;
  } catch {
    return [];
  }
}
