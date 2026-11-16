import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { ADMIN_EMAIL, db, handleFirestoreError, OperationType } from '../firebase';
import {
  AccountStatus,
  ChatAttachmentType,
  MAKALA_COVERS,
  MchartNote,
  MchartNoteAccess,
  MchartNoteContent,
  ReportReason,
  TopicCategory,
  TopicStatus,
  VerificationBadgeType,
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
      const updates: Record<string, unknown> = {};
      if (
        isPlatformOwner &&
        (!snap.data().verificationBadge || snap.data().verificationBadge === 'none')
      ) {
        updates.verificationBadge = 'owner';
      }
      if (effectiveDisplayName && snap.data().displayName !== safeName) {
        updates.displayName = safeName;
      }
      if (Object.keys(updates).length > 0) {
        updates.updatedAt = serverTimestamp();
        await updateDoc(userRef, updates);
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
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
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateUserAccountStatus(
  targetUid: string,
  status: AccountStatus,
  reason = ''
): Promise<void> {
  const path = `users/${targetUid}`;
  const cleanReason = status === 'suspended' ? sanitizeTextInput(reason, 300) : '';
  try {
    await updateDoc(doc(db, 'users', targetUid), {
      accountStatus: status,
      suspendedReason: cleanReason,
      updatedAt: serverTimestamp(),
    });
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

export async function createReply(
  user: User,
  displayName: string,
  topicId: string,
  bodyRaw: string,
  parentReplyId = ''
): Promise<string> {
  const body = sanitizeTextInput(bodyRaw, 4000);
  if (body.length < 2) {
    throw new Error('Jibu lazima liwe na herufi angalau 2.');
  }

  const replyRef = doc(collection(db, 'topics', topicId, 'replies'));
  const topicRef = doc(db, 'topics', topicId);
  const userRef = doc(db, 'users', user.uid);
  const path = `topics/${topicId}/replies/${replyRef.id}`;

  try {
    const batch = writeBatch(db);
    batch.set(replyRef, {
      topicId,
      authorId: user.uid,
      authorName: sanitizeTextInput(displayName || user.displayName || 'Mwanachama', 80),
      authorPhoto: sanitizeTextInput(user.photoURL || '', 500),
      body,
      parentReplyId: sanitizeTextInput(parentReplyId, 128),
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

    await batch.commit();
    return replyRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
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
  targetType: 'topic' | 'reply',
  targetId: string,
  topicId: string,
  reason: ReportReason,
  detailsRaw: string
): Promise<void> {
  const reportRef = doc(collection(db, 'reports'));
  const path = `reports/${reportRef.id}`;
  try {
    await setDoc(reportRef, {
      reporterId,
      targetType,
      targetId,
      topicId,
      reason,
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
    if (!isFence && !isStrongSingleCodeLine(firstTrim)) {
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
      const hasMoreAfterSub = lines.slice(cursor + 1).some((l) => l.trim().length > 0);
      if (
        hasMoreAfterSub &&
        !isBulletOrNum &&
        !isFence &&
        !isHeading &&
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
    'Maudhui ya note hii yamefungwa kwa malipo. Lipia kiasi kilichowekwa ili kufungua na kusoma.';

  try {
    await setDoc(noteRef, {
      authorId: user.uid,
      authorName:
        sanitizeTextInput(displayName || user.displayName || 'Mmiliki', 80) || 'Mmiliki',
      title: formatted.title,
      subtitle: formatted.subtitle,
      body: isLocked ? lockedPlaceholderBody : formatted.body,
      summary: isLocked
        ? sanitizeTextInput(
            formatted.subtitle || 'Note maalum yenye malipo ya kufungua.',
            240
          )
        : formatted.summary,
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
        body: 'Maudhui ya note hii yamefungwa kwa malipo. Lipia kiasi kilichowekwa ili kufungua na kusoma.',
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

      await updateDoc(noteRef, {
        isLocked: false,
        lockedTargetMode: 'all',
        lockPrice: 0,
        paymentInstructions: safeInstructions,
        body: restoredBody,
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
  const accessRef = doc(db, 'mchart_notes', noteId, 'access', targetUid);
  const safeName = sanitizeTextInput(targetName || 'Mwanachama', 80) || 'Mwanachama';
  const safeRef = sanitizeTextInput(paymentReference || '', 240);

  try {
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
