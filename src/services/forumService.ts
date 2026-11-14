import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { ADMIN_EMAIL, db, handleFirestoreError, OperationType } from '../firebase';
import {
  MAKALA_COVERS,
  ReportReason,
  TopicCategory,
  TopicStatus,
  VerificationBadgeType,
} from '../types';
import { sanitizeTextInput } from '../utils/formatters';

export async function syncUserProfile(user: User): Promise<void> {
  const userPath = `users/${user.uid}`;
  const privatePath = `users/${user.uid}/private/info`;
  const userRef = doc(db, 'users', user.uid);
  const privateRef = doc(db, 'users', user.uid, 'private', 'info');

  const safeName = sanitizeTextInput(user.displayName || 'Mwanachama', 80) || 'Mwanachama';
  const safePhoto = sanitizeTextInput(user.photoURL || '', 500);
  const safeEmail = sanitizeTextInput(user.email || 'unknown@example.com', 200);
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
        topicsCount: 0,
        repliesCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (
      isPlatformOwner &&
      (!snap.data().verificationBadge || snap.data().verificationBadge === 'none')
    ) {
      await updateDoc(userRef, {
        verificationBadge: 'owner',
        updatedAt: serverTimestamp(),
      });
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
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (privSnap.data().email !== safeEmail) {
      await updateDoc(privateRef, {
        email: safeEmail,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, privatePath);
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
