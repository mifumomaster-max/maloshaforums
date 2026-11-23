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
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { OperationType, auth, db, handleFirestoreError } from '../firebase';
import {
  POLL_CATEGORIES,
  POLL_THEME_COLORS,
  Poll,
  PollBallot,
  PollCategory,
  PollComment,
  PollGender,
  PollOption,
  PollQuestionType,
  PollResultsVisibility,
  PollStatus,
  PollStyle,
  PollThemeColor,
  PollTournament,
  TournamentCandidate,
  TournamentStageGroup,
  TournamentStageRecord,
} from '../types';

export const POLL_NO_DEADLINE_SENTINEL = new Date('2099-12-31T23:59:59.000Z');

export interface CreateOrUpdatePollInput {
  question: string;
  description: string;
  imageUrl?: string;
  category: PollCategory;
  questionType: PollQuestionType;
  pollStyle: PollStyle;
  themeColor: PollThemeColor;
  institutionName: string;
  options: PollOption[];
  maxChoices: number;
  status: PollStatus;
  resultsVisibility: PollResultsVisibility;
  allowVoteChange: boolean;
  anonymousMode: boolean;
  showVoterCount: boolean;
  showLivePercentages: boolean;
  shuffleOptions: boolean;
  allowComments: boolean;
  quorumTarget: number;
  allowShare: boolean;
  isPinned: boolean;
  hasDeadline: boolean;
  endsAtDate: Date | null;
  tournamentId?: string;
  tournamentRound?: number;
  tournamentGroupLabel?: string;
}

function generateShortPollId(length = 8): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buf = new Uint8Array(length);
    crypto.getRandomValues(buf);
    for (let i = 0; i < length; i++) {
      out += alphabet[buf[i] % alphabet.length];
    }
    return out;
  }
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function normalizePollCategory(raw: unknown): PollCategory {
  if (typeof raw === 'string' && (POLL_CATEGORIES as readonly string[]).includes(raw)) {
    return raw as PollCategory;
  }
  return 'Jamii';
}

function normalizeQuestionType(raw: unknown): PollQuestionType {
  if (
    raw === 'single' ||
    raw === 'multiple' ||
    raw === 'yes_no' ||
    raw === 'rating' ||
    raw === 'open_opinion'
  ) {
    return raw;
  }
  return 'single';
}

function normalizePollStyle(raw: unknown): PollStyle {
  if (
    raw === 'standard' ||
    raw === 'social_x' ||
    raw === 'whatsapp' ||
    raw === 'candidate_election' ||
    raw === 'school_election' ||
    raw === 'local_govt' ||
    raw === 'open_opinion'
  ) {
    return raw;
  }
  return 'standard';
}

function normalizeStatus(raw: unknown): PollStatus {
  if (raw === 'open' || raw === 'closed' || raw === 'draft') {
    return raw;
  }
  return 'open';
}

function normalizeResultsVisibility(raw: unknown): PollResultsVisibility {
  if (
    raw === 'always' ||
    raw === 'after_vote' ||
    raw === 'after_close' ||
    raw === 'owner_only'
  ) {
    return raw;
  }
  return 'always';
}

function normalizeThemeColor(raw: unknown, pollId: string, pollStyle: PollStyle): PollThemeColor {
  if (typeof raw === 'string' && (POLL_THEME_COLORS as readonly string[]).includes(raw)) {
    return raw as PollThemeColor;
  }
  if (pollStyle === 'whatsapp') return 'emerald';
  if (pollStyle === 'social_x') return 'cyan';
  if (pollStyle === 'open_opinion') return 'violet';
  if (pollStyle === 'local_govt') return 'teal';
  if (pollStyle === 'school_election') return 'indigo';
  if (pollStyle === 'candidate_election') return 'cobalt';
  // Deterministically rotate vibrant theme colors across existing polls without explicit themeColor
  let hash = 0;
  for (let i = 0; i < pollId.length; i++) {
    hash = (hash * 31 + pollId.charCodeAt(i)) >>> 0;
  }
  return POLL_THEME_COLORS[hash % POLL_THEME_COLORS.length];
}

export function mapPollDoc(id: string, data: Record<string, unknown>): Poll {
  const rawOptions = Array.isArray(data.options) ? data.options : [];
  const options: PollOption[] = rawOptions
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item, idx) => ({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `opt_${idx + 1}`,
      label: typeof item.label === 'string' ? item.label : `Chaguo ${idx + 1}`,
      subtitle: typeof item.subtitle === 'string' && item.subtitle ? item.subtitle : undefined,
      positionTitle:
        typeof item.positionTitle === 'string' && item.positionTitle ? item.positionTitle : undefined,
      gender:
        item.gender === 'male' || item.gender === 'female' || item.gender === 'other'
          ? item.gender
          : undefined,
      imageUrl: typeof item.imageUrl === 'string' && item.imageUrl ? item.imageUrl : undefined,
      color: typeof item.color === 'string' && item.color ? item.color : undefined,
    }));

  const optionIds = Array.isArray(data.optionIds)
    ? data.optionIds.filter((x): x is string => typeof x === 'string')
    : options.map((o) => o.id);

  const pollStyle = normalizePollStyle(data.pollStyle);

  return {
    id,
    pollId: typeof data.pollId === 'string' && data.pollId ? data.pollId : id,
    question: String(data.question || ''),
    description: String(data.description || ''),
    imageUrl: typeof data.imageUrl === 'string' && data.imageUrl ? data.imageUrl : undefined,
    category: normalizePollCategory(data.category),
    questionType: normalizeQuestionType(data.questionType),
    pollStyle,
    themeColor: normalizeThemeColor(data.themeColor, id, pollStyle),
    institutionName: String(data.institutionName || ''),
    options,
    optionIds,
    maxChoices: Math.max(1, Math.min(12, Number(data.maxChoices || 1))),
    status: normalizeStatus(data.status),
    resultsVisibility: normalizeResultsVisibility(data.resultsVisibility),
    allowVoteChange: Boolean(data.allowVoteChange),
    anonymousMode: Boolean(data.anonymousMode),
    showVoterCount: data.showVoterCount !== false,
    showLivePercentages: data.showLivePercentages !== false,
    shuffleOptions: Boolean(data.shuffleOptions),
    allowComments: data.allowComments !== false,
    quorumTarget: Math.max(0, Math.min(1000000, Math.round(Number(data.quorumTarget || 0)))),
    allowShare: data.allowShare !== false,
    isPinned: Boolean(data.isPinned),
    hasDeadline: Boolean(data.hasDeadline),
    endsAt: (data.endsAt as Timestamp) || null,
    totalBallots: Math.max(0, Number(data.totalBallots || 0)),
    commentsCount: Math.max(0, Number(data.commentsCount || 0)),
    tournamentId:
      typeof data.tournamentId === 'string' && data.tournamentId ? data.tournamentId : undefined,
    tournamentRound:
      typeof data.tournamentRound === 'number' && data.tournamentRound >= 1
        ? data.tournamentRound
        : undefined,
    tournamentGroupLabel:
      typeof data.tournamentGroupLabel === 'string' && data.tournamentGroupLabel
        ? data.tournamentGroupLabel
        : undefined,
    createdBy: String(data.createdBy || ''),
    createdByName: String(data.createdByName || 'Mmiliki'),
    createdByPhoto: String(data.createdByPhoto || ''),
    createdAt: (data.createdAt as Timestamp) || null,
    updatedAt: (data.updatedAt as Timestamp) || null,
  };
}

export function isPollExpired(poll: Poll, nowMs = Date.now()): boolean {
  if (!poll.hasDeadline || !poll.endsAt) return false;
  return poll.endsAt.toMillis() <= nowMs;
}

export function isPollEffectivelyOpen(poll: Poll, nowMs = Date.now()): boolean {
  return poll.status === 'open' && !isPollExpired(poll, nowMs);
}

export function canViewPollResults(
  poll: Poll,
  hasVoted: boolean,
  isAdmin: boolean,
  nowMs = Date.now(),
  isAuthenticated?: boolean
): boolean {
  const signedIn =
    isAuthenticated !== undefined ? isAuthenticated : Boolean(auth.currentUser);
  if (isAdmin) return true;
  if (!signedIn) return false;
  if (poll.status === 'draft') return false;
  if (poll.resultsVisibility === 'owner_only') return false;
  if (poll.resultsVisibility === 'always') return true;
  const closedOrExpired = poll.status === 'closed' || isPollExpired(poll, nowMs);
  if (poll.resultsVisibility === 'after_close') {
    return closedOrExpired;
  }
  if (poll.resultsVisibility === 'after_vote') {
    return hasVoted || closedOrExpired;
  }
  return false;
}

export function subscribePolls(
  isAdmin: boolean,
  onUpdate: (polls: Poll[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const path = 'polls';
  const q = isAdmin
    ? query(collection(db, path), limit(100))
    : query(collection(db, path), where('status', 'in', ['open', 'closed']), limit(100));

  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => mapPollDoc(d.id, d.data()));
      list.sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        const aOpen = isPollEffectivelyOpen(a) ? 1 : 0;
        const bOpen = isPollEffectivelyOpen(b) ? 1 : 0;
        if (aOpen !== bOpen) return bOpen - aOpen;
        const am = a.createdAt ? a.createdAt.toMillis() : 0;
        const bm = b.createdAt ? b.createdAt.toMillis() : 0;
        return bm - am;
      });
      onUpdate(list);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function fetchPollById(pollId: string): Promise<Poll | null> {
  const path = `polls/${pollId}`;
  try {
    const snap = await getDoc(doc(db, 'polls', pollId));
    if (!snap.exists()) return null;
    return mapPollDoc(snap.id, snap.data());
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

export async function fetchTalliesForPoll(poll: Poll): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  if (!auth.currentUser) return counts;
  await Promise.all(
    poll.options.map(async (opt) => {
      try {
        const snap = await getDoc(doc(db, 'polls', poll.id, 'tallies', opt.id));
        counts[opt.id] = snap.exists() ? Math.max(0, Number(snap.data().votesCount || 0)) : 0;
      } catch {
        // Hidden per resultsVisibility rules
      }
    })
  );
  return counts;
}

export function subscribePollTallies(
  poll: Poll,
  canRead: boolean,
  onUpdate: (counts: Record<string, number>) => void
): () => void {
  if (!canRead || !auth.currentUser || poll.options.length === 0) {
    onUpdate({});
    return () => {};
  }

  const current: Record<string, number> = {};
  poll.options.forEach((opt) => {
    current[opt.id] = 0;
  });

  const unsubs = poll.options.map((opt) => {
    const ref = doc(db, 'polls', poll.id, 'tallies', opt.id);
    return onSnapshot(
      ref,
      (snap) => {
        current[opt.id] = snap.exists() ? Math.max(0, Number(snap.data().votesCount || 0)) : 0;
        onUpdate({ ...current });
      },
      () => {
        // Transitional/permission fallback
      }
    );
  });

  return () => {
    unsubs.forEach((fn) => fn());
  };
}

export async function fetchUserBallotsForPolls(
  pollIds: string[],
  userId: string
): Promise<Record<string, PollBallot>> {
  const map: Record<string, PollBallot> = {};
  if (!userId || pollIds.length === 0) return map;

  await Promise.all(
    pollIds.map(async (pollId) => {
      try {
        const snap = await getDoc(doc(db, 'polls', pollId, 'ballots', userId));
        if (snap.exists()) {
          const d = snap.data();
          map[pollId] = {
            pollId: String(d.pollId || pollId),
            userId: String(d.userId || userId),
            voterName: String(d.voterName || 'Mwanachama'),
            voterPhoto: String(d.voterPhoto || ''),
            selectedOptionIds: Array.isArray(d.selectedOptionIds)
              ? d.selectedOptionIds.filter((x): x is string => typeof x === 'string')
              : [],
            createdAt: (d.createdAt as Timestamp) || null,
            updatedAt: (d.updatedAt as Timestamp) || null,
          };
        }
      } catch {
        // Ignore individual read error
      }
    })
  );
  return map;
}

export async function fetchPollBallotsForOwner(pollId: string): Promise<PollBallot[]> {
  const path = `polls/${pollId}/ballots`;
  try {
    const q = query(
      collection(db, 'polls', pollId, 'ballots'),
      orderBy('createdAt', 'desc'),
      limit(500)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        pollId: String(data.pollId || pollId),
        userId: String(data.userId || d.id),
        voterName: String(data.voterName || 'Mwanachama'),
        voterPhoto: String(data.voterPhoto || ''),
        selectedOptionIds: Array.isArray(data.selectedOptionIds)
          ? data.selectedOptionIds.filter((x): x is string => typeof x === 'string')
          : [],
        createdAt: (data.createdAt as Timestamp) || null,
        updatedAt: (data.updatedAt as Timestamp) || null,
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

function sanitizePollOptions(
  questionType: PollQuestionType,
  rawOptions: PollOption[]
): PollOption[] {
  const palette = [
    '#1D4E89',
    '#D97706',
    '#059669',
    '#DC2626',
    '#7C3AED',
    '#0284C7',
    '#DB2777',
    '#0F766E',
  ];
  const seenIds = new Set<string>();
  const cleaned: PollOption[] = [];

  for (let idx = 0; idx < rawOptions.length; idx++) {
    const opt = rawOptions[idx];
    const cleanLabel = opt.label.trim().slice(0, 160);
    if (cleanLabel.length < 1) continue;

    let baseId =
      (opt.id || `opt_${cleaned.length + 1}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) ||
      `opt_${cleaned.length + 1}`;
    let cleanId = baseId;
    let suffix = 2;
    while (seenIds.has(cleanId)) {
      cleanId = `${baseId.slice(0, 32)}_${suffix}`;
      suffix++;
    }
    seenIds.add(cleanId);

    const cleanSubtitle = (opt.subtitle || '').trim().slice(0, 160);
    const cleanPositionTitle = (opt.positionTitle || '').trim().slice(0, 80);
    const cleanImageUrl = (opt.imageUrl || '').trim().slice(0, 500);
    const validOptImageUrl = cleanImageUrl.startsWith('https://') ? cleanImageUrl : '';
    const cleanColor =
      opt.color && opt.color.trim()
        ? opt.color.trim().slice(0, 30)
        : palette[cleaned.length % palette.length];

    const obj: PollOption = {
      id: cleanId,
      label: cleanLabel,
      color: cleanColor,
    };
    if (cleanSubtitle) obj.subtitle = cleanSubtitle;
    if (cleanPositionTitle) obj.positionTitle = cleanPositionTitle;
    if (opt.gender === 'male' || opt.gender === 'female' || opt.gender === 'other') {
      obj.gender = opt.gender;
    }
    if (validOptImageUrl) obj.imageUrl = validOptImageUrl;
    cleaned.push(obj);
    if (cleaned.length >= (questionType === 'rating' ? 5 : 12)) break;
  }

  return cleaned;
}

async function commitBatchWithTokenRefreshRetry(
  buildBatch: () => ReturnType<typeof writeBatch>
): Promise<void> {
  try {
    await buildBatch().commit();
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : String(err || '').toLowerCase();
    const isPerm = msg.includes('permission') || msg.includes('insufficient');
    if (isPerm && auth.currentUser) {
      try {
        await auth.currentUser.getIdToken(true);
      } catch {
        // Ignore refresh error and fall through to retry/throw
      }
      await buildBatch().commit();
      return;
    }
    throw err;
  }
}

export async function createPoll(
  user: User,
  displayName: string,
  photoURL: string,
  input: CreateOrUpdatePollInput
): Promise<string> {
  const cleanQuestion = input.question.trim().slice(0, 300);
  if (cleanQuestion.length < 4) {
    throw new Error('Swali la kura lazima liwe na angalau herufi 4.');
  }

  const isOpenOpinion = input.questionType === 'open_opinion';
  const options = isOpenOpinion ? [] : sanitizePollOptions(input.questionType, input.options);
  if (!isOpenOpinion && options.length < 2) {
    throw new Error('Weka angalau machaguo au wagombea 2.');
  }

  const maxChoices =
    input.questionType === 'multiple'
      ? Math.max(1, Math.min(options.length, input.maxChoices || 2))
      : 1;

  const cleanImageUrl = (input.imageUrl || '').trim().slice(0, 500);
  const validImageUrl = cleanImageUrl.startsWith('https://') ? cleanImageUrl : '';

  const pollId = generateShortPollId(8);
  const pollRef = doc(db, 'polls', pollId);
  const endsAtTs = Timestamp.fromDate(
    input.hasDeadline && input.endsAtDate ? input.endsAtDate : POLL_NO_DEADLINE_SENTINEL
  );

  const safeQuorum = Math.max(0, Math.min(1000000, Math.round(Number(input.quorumTarget || 0))));

  const pollDocPayload: Record<string, unknown> = {
    pollId,
    question: cleanQuestion,
    description: input.description.trim().slice(0, 1500),
    category: input.category,
    questionType: input.questionType,
    pollStyle: input.pollStyle,
    themeColor: normalizeThemeColor(input.themeColor, pollId, input.pollStyle),
    institutionName: input.institutionName.trim().slice(0, 120),
    options,
    optionIds: options.map((o) => o.id),
    maxChoices,
    status: input.status,
    resultsVisibility: input.resultsVisibility,
    allowVoteChange: Boolean(input.allowVoteChange),
    anonymousMode: Boolean(input.anonymousMode),
    showVoterCount: Boolean(input.showVoterCount),
    showLivePercentages: Boolean(input.showLivePercentages),
    shuffleOptions: Boolean(input.shuffleOptions),
    allowComments: Boolean(input.allowComments),
    quorumTarget: safeQuorum,
    allowShare: Boolean(input.allowShare),
    isPinned: Boolean(input.isPinned),
    hasDeadline: Boolean(input.hasDeadline),
    endsAt: endsAtTs,
    totalBallots: 0,
    commentsCount: 0,
    createdBy: user.uid,
    createdByName: displayName.trim().slice(0, 80) || 'Mmiliki',
    createdByPhoto: (photoURL || '').slice(0, 500),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (validImageUrl) {
    pollDocPayload.imageUrl = validImageUrl;
  }
  if (input.tournamentId) {
    pollDocPayload.tournamentId = input.tournamentId.slice(0, 128);
  }
  if (typeof input.tournamentRound === 'number' && input.tournamentRound >= 1) {
    pollDocPayload.tournamentRound = Math.round(input.tournamentRound);
  }
  if (input.tournamentGroupLabel) {
    pollDocPayload.tournamentGroupLabel = input.tournamentGroupLabel.trim().slice(0, 80);
  }

  const actingUid = auth.currentUser?.uid || user?.uid || '';
  if (!actingUid || !/^[a-zA-Z0-9_-]{1,128}$/.test(actingUid)) {
    throw new Error('Kitambulisho cha akaunti si sahihi. Tafadhali ingia tena.');
  }
  pollDocPayload.createdBy = actingUid;

  const buildBatch = () => {
    const batch = writeBatch(db);
    batch.set(pollRef, pollDocPayload);

    for (const opt of options) {
      const tallyRef = doc(db, 'polls', pollId, 'tallies', opt.id);
      batch.set(tallyRef, {
        pollId,
        optionId: opt.id,
        votesCount: 0,
        updatedAt: serverTimestamp(),
      });
    }
    return batch;
  };

  try {
    await commitBatchWithTokenRefreshRetry(buildBatch);
    return pollId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `polls/${pollId}`);
    throw error;
  }
}

export async function updatePoll(
  pollId: string,
  existingPoll: Poll,
  input: CreateOrUpdatePollInput
): Promise<void> {
  const cleanQuestion = input.question.trim().slice(0, 300);
  if (cleanQuestion.length < 4) {
    throw new Error('Swali la kura lazima liwe na angalau herufi 4.');
  }

  const isOpenOpinion = input.questionType === 'open_opinion';
  const options = isOpenOpinion ? [] : sanitizePollOptions(input.questionType, input.options);
  if (!isOpenOpinion && options.length < 2) {
    throw new Error('Weka angalau machaguo au wagombea 2.');
  }

  const maxChoices =
    input.questionType === 'multiple'
      ? Math.max(1, Math.min(options.length, input.maxChoices || 2))
      : 1;

  const cleanImageUrl = (input.imageUrl || '').trim().slice(0, 500);
  const validImageUrl = cleanImageUrl.startsWith('https://') ? cleanImageUrl : '';

  const endsAtTs = Timestamp.fromDate(
    input.hasDeadline && input.endsAtDate ? input.endsAtDate : POLL_NO_DEADLINE_SENTINEL
  );

  const pollRef = doc(db, 'polls', pollId);
  const batch = writeBatch(db);

  const safeQuorum = Math.max(0, Math.min(1000000, Math.round(Number(input.quorumTarget || 0))));

  batch.update(pollRef, {
    question: cleanQuestion,
    description: input.description.trim().slice(0, 1500),
    imageUrl: validImageUrl,
    category: input.category,
    questionType: input.questionType,
    pollStyle: input.pollStyle,
    themeColor: normalizeThemeColor(input.themeColor, pollId, input.pollStyle),
    institutionName: input.institutionName.trim().slice(0, 120),
    options,
    optionIds: options.map((o) => o.id),
    maxChoices,
    status: input.status,
    resultsVisibility: input.resultsVisibility,
    allowVoteChange: Boolean(input.allowVoteChange),
    anonymousMode: Boolean(input.anonymousMode),
    showVoterCount: Boolean(input.showVoterCount),
    showLivePercentages: Boolean(input.showLivePercentages),
    shuffleOptions: Boolean(input.shuffleOptions),
    allowComments: Boolean(input.allowComments),
    quorumTarget: safeQuorum,
    allowShare: Boolean(input.allowShare),
    isPinned: Boolean(input.isPinned),
    hasDeadline: Boolean(input.hasDeadline),
    endsAt: endsAtTs,
    updatedAt: serverTimestamp(),
  });

  const existingIds = new Set(existingPoll.optionIds);
  const nextIds = new Set(options.map((o) => o.id));

  for (const opt of options) {
    if (!existingIds.has(opt.id)) {
      batch.set(doc(db, 'polls', pollId, 'tallies', opt.id), {
        pollId,
        optionId: opt.id,
        votesCount: 0,
        updatedAt: serverTimestamp(),
      });
    }
  }

  for (const oldId of existingPoll.optionIds) {
    if (!nextIds.has(oldId)) {
      batch.delete(doc(db, 'polls', pollId, 'tallies', oldId));
    }
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `polls/${pollId}`);
    throw error;
  }
}

export async function updatePollStatus(pollId: string, status: PollStatus): Promise<void> {
  const path = `polls/${pollId}`;
  try {
    await updateDoc(doc(db, 'polls', pollId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    throw error;
  }
}

export async function togglePollPin(pollId: string, isPinned: boolean): Promise<void> {
  const path = `polls/${pollId}`;
  try {
    await updateDoc(doc(db, 'polls', pollId), {
      isPinned,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    throw error;
  }
}

export async function deletePoll(poll: Poll): Promise<void> {
  const path = `polls/${poll.id}`;
  try {
    const ballotsSnap = await getDocs(collection(db, 'polls', poll.id, 'ballots'));
    const talliesSnap = await getDocs(collection(db, 'polls', poll.id, 'tallies'));
    const commentsSnap = await getDocs(collection(db, 'polls', poll.id, 'comments'));

    const commentLikesSnaps = await Promise.all(
      commentsSnap.docs.map((cDoc) =>
        getDocs(collection(db, 'polls', poll.id, 'comments', cDoc.id, 'likes'))
      )
    );

    const allRefs = [
      ...ballotsSnap.docs.map((d) => d.ref),
      ...talliesSnap.docs.map((d) => d.ref),
      ...commentLikesSnaps.flatMap((snap) => snap.docs.map((d) => d.ref)),
      ...commentsSnap.docs.map((d) => d.ref),
    ];
    for (let i = 0; i < allRefs.length; i += 400) {
      const chunk = allRefs.slice(i, i + 400);
      const batch = writeBatch(db);
      chunk.forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

    await deleteDoc(doc(db, 'polls', poll.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
    throw error;
  }
}

export async function castOrUpdatePollVote(
  poll: Poll,
  user: User,
  voterName: string,
  voterPhoto: string,
  rawSelectedIds: string[],
  existingBallot: PollBallot | null
): Promise<PollBallot> {
  const validOptionSet = new Set(poll.optionIds);
  const selectedOptionIds = Array.from(
    new Set(rawSelectedIds.filter((id) => validOptionSet.has(id)))
  );

  if (selectedOptionIds.length === 0) {
    throw new Error('Chagua angalau jibu au mgombea mmoja kabla ya kupiga kura.');
  }
  if (poll.questionType !== 'multiple' && selectedOptionIds.length !== 1) {
    throw new Error('Kura hii inaruhusu chaguo moja pekee.');
  }
  if (selectedOptionIds.length > poll.maxChoices) {
    throw new Error(`Unaweza kuchagua hadi machaguo ${poll.maxChoices} pekee.`);
  }
  if (!isPollEffectivelyOpen(poll)) {
    throw new Error('Kura hii imeshafungwa au muda wake umekwisha.');
  }
  if (existingBallot && !poll.allowVoteChange) {
    throw new Error('Kura hii hairuhusu kubadilisha jibu baada ya kupiga kura.');
  }

  const cleanVoterName = voterName.trim().slice(0, 80) || 'Mwanachama';
  const cleanVoterPhoto = (voterPhoto || '').slice(0, 500);
  const ballotRef = doc(db, 'polls', poll.id, 'ballots', user.uid);
  const pollRef = doc(db, 'polls', poll.id);
  const batch = writeBatch(db);

  if (!existingBallot) {
    batch.set(ballotRef, {
      pollId: poll.id,
      userId: user.uid,
      voterName: cleanVoterName,
      voterPhoto: cleanVoterPhoto,
      selectedOptionIds,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.update(pollRef, {
      totalBallots: increment(1),
      updatedAt: serverTimestamp(),
    });

    for (const optionId of selectedOptionIds) {
      batch.update(doc(db, 'polls', poll.id, 'tallies', optionId), {
        votesCount: increment(1),
        updatedAt: serverTimestamp(),
      });
    }
  } else {
    const prevSet = new Set(existingBallot.selectedOptionIds);
    const nextSet = new Set(selectedOptionIds);

    const added = selectedOptionIds.filter((id) => !prevSet.has(id));
    const removed = existingBallot.selectedOptionIds.filter((id) => !nextSet.has(id));

    if (added.length === 0 && removed.length === 0) {
      return existingBallot;
    }

    batch.update(ballotRef, {
      voterName: cleanVoterName,
      voterPhoto: cleanVoterPhoto,
      selectedOptionIds,
      updatedAt: serverTimestamp(),
    });

    for (const optionId of added) {
      batch.update(doc(db, 'polls', poll.id, 'tallies', optionId), {
        votesCount: increment(1),
        updatedAt: serverTimestamp(),
      });
    }
    for (const optionId of removed) {
      batch.update(doc(db, 'polls', poll.id, 'tallies', optionId), {
        votesCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
    }
  }

  try {
    await batch.commit();
    return {
      pollId: poll.id,
      userId: user.uid,
      voterName: cleanVoterName,
      voterPhoto: cleanVoterPhoto,
      selectedOptionIds,
      createdAt: existingBallot?.createdAt || Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
  } catch (error) {
    const rawMsg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (rawMsg.includes('permission') || rawMsg.includes('insufficient')) {
      throw new Error(
        'Imeshindwa kukamilisha kura: hakikisha umejaza jina la akaunti yako, kura bado ipo wazi, na muda haujaisha.'
      );
    }
    if (rawMsg.includes('not-found') || rawMsg.includes('no document to update')) {
      throw new Error('Baadhi ya chaguzi za kura hii zimebadilishwa — tafadhali onyesha upya ukurasa.');
    }
    handleFirestoreError(
      error,
      existingBallot ? OperationType.UPDATE : OperationType.CREATE,
      `polls/${poll.id}/ballots/${user.uid}`
    );
    throw error;
  }
}

export function buildPollShareUrl(pollId: string): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/?p=${encodeURIComponent(pollId)}`;
}

export async function sharePoll(
  poll: Poll,
  onNotify: (msg: string) => void,
  lang: 'sw' | 'en' = 'sw'
): Promise<void> {
  const shareUrl = buildPollShareUrl(poll.id);
  const isOpenOpinion = poll.questionType === 'open_opinion';
  const title = isOpenOpinion
    ? lang === 'en'
      ? `Mpoll Discussion: ${poll.question}`
      : `Mjadala wa Mpoll: ${poll.question}`
    : lang === 'en'
      ? `Mpoll: ${poll.question}`
      : `Piga Kura Mpoll: ${poll.question}`;
  const text = isOpenOpinion
    ? lang === 'en'
      ? `${poll.question}\nJoin the discussion on Mpoll:`
      : `${poll.question}\nToa maoni yako kwenye Mpoll:`
    : lang === 'en'
      ? `${poll.question}\nVote now on Mpoll:`
      : `${poll.question}\nPiga kura yako kwenye Mpoll:`;

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ title, text, url: shareUrl });
      onNotify(lang === 'en' ? 'Mpoll link shared!' : 'Kiungo kifupi cha Mpoll kimeshirikiwa!');
      return;
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return;
  }

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(`${text} ${shareUrl}`);
      onNotify(
        lang === 'en'
          ? 'Short Mpoll link copied!'
          : 'Kiungo kifupi cha Mpoll kimenakiliwa!'
      );
      return;
    }
  } catch {
    // Fallback
  }

  onNotify(shareUrl);
}

export function exportPollResultsCsv(
  poll: Poll,
  tallies: Record<string, number>,
  ballots: PollBallot[],
  lang: 'sw' | 'en' = 'sw'
): void {
  const totalSelections = poll.options.reduce((sum, opt) => sum + (tallies[opt.id] || 0), 0);
  const optionLabelMap = new Map(poll.options.map((o) => [o.id, o.label]));
  const escapeCsv = (val: string) => `"${String(val).replace(/"/g, '""')}"`;

  const lines: string[] = [];
  lines.push(escapeCsv(lang === 'en' ? 'Mpoll Question' : 'Swali la Mpoll') + ',' + escapeCsv(poll.question));
  if (poll.institutionName) {
    lines.push(escapeCsv(lang === 'en' ? 'Institution / Area' : 'Taasisi / Eneo') + ',' + escapeCsv(poll.institutionName));
  }
  lines.push(escapeCsv(lang === 'en' ? 'Total Voters' : 'Jumla ya Wapiga Kura') + ',' + String(poll.totalBallots));
  lines.push('');
  lines.push(
    [
      escapeCsv(lang === 'en' ? 'Candidate / Option' : 'Mgombea / Chaguo'),
      escapeCsv(lang === 'en' ? 'Role / Subtitle' : 'Nafasi / Maelezo'),
      escapeCsv(lang === 'en' ? 'Votes' : 'Kura'),
      escapeCsv(lang === 'en' ? 'Percentage' : 'Asilimia'),
    ].join(',')
  );

  for (const opt of poll.options) {
    const count = tallies[opt.id] || 0;
    const pct = totalSelections > 0 ? ((count / totalSelections) * 100).toFixed(1) + '%' : '0.0%';
    lines.push([escapeCsv(opt.label), escapeCsv(opt.subtitle || ''), String(count), escapeCsv(pct)].join(','));
  }

  if (ballots.length > 0) {
    lines.push('');
    lines.push(
      [
        escapeCsv(lang === 'en' ? 'Voter Name' : 'Jina la Mpiga Kura'),
        escapeCsv(lang === 'en' ? 'User ID' : 'Kitambulisho'),
        escapeCsv(lang === 'en' ? 'Selected Choices' : 'Kura Aliyopiga'),
        escapeCsv(lang === 'en' ? 'Voted At' : 'Muda wa Kupiga Kura'),
      ].join(',')
    );
    for (const b of ballots) {
      const choices = b.selectedOptionIds.map((id) => optionLabelMap.get(id) || id).join(' | ');
      const dateStr = b.updatedAt
        ? b.updatedAt.toDate().toISOString()
        : b.createdAt
          ? b.createdAt.toDate().toISOString()
          : '';
      lines.push(
        [escapeCsv(b.voterName), escapeCsv(b.userId), escapeCsv(choices), escapeCsv(dateStr)].join(',')
      );
    }
  }

  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mpoll-${poll.id}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface OfficialResultsRowForReport {
  rank: number;
  label: string;
  subtitle?: string;
  count: number;
  pctRounded: number;
  color: string;
  isLeader: boolean;
}

export function exportOfficialPollReportPng(params: {
  poll: Poll;
  rows: OfficialResultsRowForReport[];
  totalSelections: number;
  marginVotes: number;
  marginPct: number;
  isTie: boolean;
  isOpen: boolean;
  accentHex: string;
  lang: 'sw' | 'en';
}): void {
  const {
    poll,
    rows,
    totalSelections,
    marginVotes,
    marginPct,
    isTie,
    isOpen,
    accentHex,
    lang,
  } = params;

  const width = 1400;
  const rowHeight = 68;
  const rowsHeight = Math.max(1, rows.length) * rowHeight;
  const height = 650 + rowsHeight;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error(lang === 'en' ? 'Canvas unavailable' : 'Canvas haipatikani');
  }

  const wrapLines = (text: string, maxWidth: number, font: string): string[] => {
    ctx.font = font;
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';
    for (const w of words) {
      const test = current ? `${current} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = w;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  // White paper background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // Subtle top double security border
  ctx.fillStyle = accentHex;
  ctx.fillRect(0, 0, width, 16);
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 16, width, 4);

  // Official Header Box
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(48, 44, width - 96, 178);
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.strokeRect(48, 44, width - 96, 178);

  // Crest badge circle on top left
  ctx.fillStyle = accentHex;
  ctx.beginPath();
  ctx.arc(118, 132, 42, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(118, 132, 34, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 22px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MPOLL', 118, 139);

  // Header Institution & Title
  ctx.textAlign = 'left';
  ctx.fillStyle = accentHex;
  ctx.font = '800 16px system-ui, -apple-system, sans-serif';
  const orgTitle = (
    poll.institutionName || (lang === 'en' ? 'MALOSHA OFFICIAL ELECTORAL BOARD' : 'TUME RASMI YA KURA YA MALOSHA · MPOLL')
  ).toUpperCase();
  ctx.fillText(orgTitle, 182, 86);

  ctx.fillStyle = '#0F172A';
  ctx.font = '900 30px system-ui, -apple-system, sans-serif';
  ctx.fillText(
    lang === 'en'
      ? 'OFFICIAL ELECTION & POLL RESULTS CERTIFICATE'
      : 'TAARIFA RASMI YA MATOKEO YA KURA / UCHAGUZI',
    182,
    126
  );

  ctx.fillStyle = '#475569';
  ctx.font = '600 17px system-ui, -apple-system, sans-serif';
  const nowStr = new Date().toLocaleString(lang === 'en' ? 'en-US' : 'sw-TZ');
  ctx.fillText(
    `${lang === 'en' ? 'Ref ID' : 'Kumb. Namba'}: MP-${poll.id.toUpperCase()}   •   ${
      lang === 'en' ? 'Category' : 'Kategoria'
    }: ${poll.category}   •   ${lang === 'en' ? 'Issued' : 'Imetolewa'}: ${nowStr}`,
    182,
    162
  );

  // Status Seal Pill on Top Right
  const statusBadgeText = isOpen
    ? lang === 'en'
      ? 'LIVE INTERIM TALLY'
      : 'MATOKEO YA MOJA KWA MOJA'
    : lang === 'en'
      ? 'FINAL CERTIFIED RESULTS'
      : 'MATOKEO RASMI YAMEFUNGA';
  ctx.fillStyle = isOpen ? '#059669' : '#B45309';
  ctx.fillRect(width - 370, 68, 294, 42);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 15px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(statusBadgeText, width - 223, 94);
  ctx.textAlign = 'left';

  // Question Title
  const qLines = wrapLines(poll.question, width - 120, '800 26px system-ui, -apple-system, sans-serif').slice(0, 2);
  ctx.fillStyle = '#0F172A';
  ctx.font = '800 26px system-ui, -apple-system, sans-serif';
  qLines.forEach((line, idx) => {
    ctx.fillText(line, 52, 266 + idx * 34);
  });

  // Winner Proclamation Summary Strip
  const winnerY = 334;
  ctx.fillStyle = '#FEFCE8';
  ctx.fillRect(48, winnerY, width - 96, 118);
  ctx.strokeStyle = '#F59E0B';
  ctx.lineWidth = 2;
  ctx.strokeRect(48, winnerY, width - 96, 118);

  const leaders = rows.filter((r) => r.isLeader && r.count > 0);
  const topLeader = leaders[0];
  ctx.fillStyle = '#92400E';
  ctx.font = '800 15px system-ui, -apple-system, sans-serif';
  ctx.fillText(
    isTie
      ? lang === 'en'
        ? 'OFFICIAL STANDING: DEADLOCKED TIE'
        : 'TANGAZO LA HALI: SARE KILELENI'
      : isOpen
        ? lang === 'en'
          ? 'CURRENT LEADING CONTENDER'
          : 'KINARA ANAYEONGOZA KWA SASA'
        : lang === 'en'
          ? 'OFFICIALLY DECLARED WINNER'
          : 'MSHINDI RASMI ALIYETANGAZWA',
    76,
    winnerY + 34
  );

  ctx.fillStyle = '#0F172A';
  ctx.font = '900 28px system-ui, -apple-system, sans-serif';
  const winnerName =
    leaders.length === 0
      ? lang === 'en'
        ? 'No ballots cast yet'
        : 'Hakuna kura zilizopigwa bado'
      : isTie
        ? leaders.map((l) => l.label).join(' & ')
        : topLeader.label;
  ctx.fillText(winnerName.slice(0, 56), 76, winnerY + 74);

  ctx.fillStyle = '#475569';
  ctx.font = '700 17px system-ui, -apple-system, sans-serif';
  const statsSummary =
    leaders.length === 0
      ? `${lang === 'en' ? 'Total Voters' : 'Wapiga Kura'}: ${poll.totalBallots.toLocaleString()}`
      : `${topLeader.count.toLocaleString()} ${lang === 'en' ? 'votes' : 'kura'} (${
          topLeader.pctRounded
        }%)   •   ${
          !isTie && rows.length > 1
            ? `${lang === 'en' ? 'Lead Margin' : 'Pengo na #2'}: +${marginVotes.toLocaleString()} (+${marginPct}%)   •   `
            : ''
        }${lang === 'en' ? 'Total Ballots' : 'Jumla ya Kura'}: ${poll.totalBallots.toLocaleString()}`;
  ctx.fillText(statsSummary, 76, winnerY + 102);

  // Table Header
  const tableTop = 482;
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(48, tableTop, width - 96, 48);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 16px system-ui, -apple-system, sans-serif';
  ctx.fillText('#', 72, tableTop + 30);
  ctx.fillText(lang === 'en' ? 'CANDIDATE / OPTION' : 'MGOMBEA / CHAGUO', 130, tableTop + 30);
  ctx.fillText(lang === 'en' ? 'PROPORTION' : 'UWIANO', 790, tableTop + 30);
  ctx.textAlign = 'right';
  ctx.fillText(lang === 'en' ? 'VOTES' : 'KURA', 1170, tableTop + 30);
  ctx.fillText(lang === 'en' ? 'SHARE' : 'ASILIMIA', 1320, tableTop + 30);
  ctx.textAlign = 'left';

  // Table Rows
  rows.forEach((row, idx) => {
    const y = tableTop + 48 + idx * rowHeight;
    ctx.fillStyle = row.isLeader && row.count > 0 ? '#FFFBEB' : idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
    ctx.fillRect(48, y, width - 96, rowHeight);
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.strokeRect(48, y, width - 96, rowHeight);

    ctx.fillStyle = '#0F172A';
    ctx.font = '800 19px system-ui, -apple-system, sans-serif';
    ctx.fillText(`#${row.rank}`, 68, y + 40);

    // Color dot
    ctx.fillStyle = row.color || accentHex;
    ctx.beginPath();
    ctx.arc(140, y + 34, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0F172A';
    ctx.font = '700 18px system-ui, -apple-system, sans-serif';
    ctx.fillText(row.label.slice(0, 46), 164, row.subtitle ? y + 30 : y + 40);

    if (row.subtitle) {
      ctx.fillStyle = '#64748B';
      ctx.font = '500 14px system-ui, -apple-system, sans-serif';
      ctx.fillText(row.subtitle.slice(0, 56), 164, y + 52);
    }

    // Progress Bar
    const barX = 790;
    const barW = 240;
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(barX, y + 24, barW, 18);
    ctx.fillStyle = row.color || accentHex;
    ctx.fillRect(barX, y + 24, Math.max(0, Math.min(barW, (row.pctRounded / 100) * barW)), 18);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#0F172A';
    ctx.font = '800 19px system-ui, -apple-system, sans-serif';
    ctx.fillText(row.count.toLocaleString(), 1170, y + 40);
    ctx.fillStyle = row.color || accentHex;
    ctx.fillText(`${row.pctRounded}%`, 1320, y + 40);
    ctx.textAlign = 'left';
  });

  // Official Verification Footer
  const footerY = tableTop + 48 + rowsHeight + 36;
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(48, footerY);
  ctx.lineTo(width - 48, footerY);
  ctx.stroke();

  ctx.fillStyle = '#475569';
  ctx.font = '600 15px system-ui, -apple-system, sans-serif';
  ctx.fillText(
    `${lang === 'en' ? 'Verified Total Selections' : 'Jumla ya Kura Zilizothibitishwa'}: ${totalSelections.toLocaleString()}   •   ${
      lang === 'en' ? 'Organizer' : 'Msimamizi'
    }: ${poll.createdByName}`,
    52,
    footerY + 34
  );

  ctx.fillStyle = accentHex;
  ctx.textAlign = 'right';
  ctx.font = '700 15px system-ui, -apple-system, sans-serif';
  ctx.fillText(buildPollShareUrl(poll.id), width - 52, footerY + 34);
  ctx.textAlign = 'left';

  const dataUrl = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `Matokeo-Rasmi-Mpoll-${poll.id}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ============================================================================
// FACEBOOK-STYLE THREADED COMMENTS & LIKES ON MPOLL QUESTIONS
// ============================================================================

function cleanCommentText(raw: string, maxLen: number): string {
  return String(raw || '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLen);
}

export function subscribePollComments(
  pollId: string,
  onUpdate: (comments: PollComment[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const path = `polls/${pollId}/comments`;
  const q = query(
    collection(db, 'polls', pollId, 'comments'),
    where('isDeleted', '==', false)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: PollComment[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          pollId: String(data.pollId || pollId),
          authorId: String(data.authorId || ''),
          authorName: String(data.authorName || 'Mwanachama'),
          authorPhoto: String(data.authorPhoto || ''),
          body: String(data.body || ''),
          parentCommentId: String(data.parentCommentId || ''),
          likesCount: Math.max(0, Number(data.likesCount || 0)),
          isDeleted: Boolean(data.isDeleted),
          createdAt: (data.createdAt as Timestamp) || null,
          updatedAt: (data.updatedAt as Timestamp) || null,
        };
      });
      onUpdate(list);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function createPollComment(
  pollId: string,
  user: User,
  displayName: string,
  photoURL: string,
  bodyRaw: string,
  parentCommentId = ''
): Promise<string> {
  const body = cleanCommentText(bodyRaw, 4000);
  if (body.length < 2) {
    throw new Error('Maoni lazima yawe na herufi angalau 2.');
  }

  const commentRef = doc(collection(db, 'polls', pollId, 'comments'));
  const pollRef = doc(db, 'polls', pollId);
  const path = `polls/${pollId}/comments/${commentRef.id}`;
  const safeName = cleanCommentText(displayName || user.displayName || 'Mwanachama', 80) || 'Mwanachama';
  const safePhoto = (photoURL || user.photoURL || '').trim().slice(0, 500);
  const cleanParent = cleanCommentText(parentCommentId, 128);

  try {
    const batch = writeBatch(db);
    batch.set(commentRef, {
      pollId,
      authorId: user.uid,
      authorName: safeName,
      authorPhoto: safePhoto,
      body,
      parentCommentId: cleanParent,
      likesCount: 0,
      isDeleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.update(pollRef, {
      commentsCount: increment(1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return commentRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
    throw error;
  }
}

export async function editPollComment(
  pollId: string,
  commentId: string,
  bodyRaw: string
): Promise<void> {
  const body = cleanCommentText(bodyRaw, 4000);
  if (body.length < 2) {
    throw new Error('Maoni lazima yawe na herufi angalau 2.');
  }

  const path = `polls/${pollId}/comments/${commentId}`;
  try {
    await updateDoc(doc(db, 'polls', pollId, 'comments', commentId), {
      body,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    throw error;
  }
}

export async function softDeletePollComment(
  pollId: string,
  commentId: string,
  canDecrementCounter: boolean
): Promise<void> {
  const commentRef = doc(db, 'polls', pollId, 'comments', commentId);
  const pollRef = doc(db, 'polls', pollId);
  const path = `polls/${pollId}/comments/${commentId}`;

  try {
    const batch = writeBatch(db);
    batch.update(commentRef, {
      isDeleted: true,
      body: '[Maoni haya yamefutwa na mwandishi]',
      updatedAt: serverTimestamp(),
    });

    if (canDecrementCounter) {
      batch.update(pollRef, {
        commentsCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    throw error;
  }
}

export async function togglePollCommentLike(
  pollId: string,
  commentId: string,
  userId: string,
  hasLiked: boolean
): Promise<void> {
  const likeRef = doc(db, 'polls', pollId, 'comments', commentId, 'likes', userId);
  const commentRef = doc(db, 'polls', pollId, 'comments', commentId);
  const path = `polls/${pollId}/comments/${commentId}/likes/${userId}`;

  try {
    const batch = writeBatch(db);
    if (hasLiked) {
      batch.delete(likeRef);
      batch.update(commentRef, {
        likesCount: increment(-1),
      });
    } else {
      batch.set(likeRef, {
        userId,
        createdAt: serverTimestamp(),
      });
      batch.update(commentRef, {
        likesCount: increment(1),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}

// ============================================================================
// DETERMINISTIC MULTI-STAGE LEADER ELIMINATION ENGINE (ZERO AI)
// ============================================================================

export function parseBulkCandidatesText(
  rawText: string,
  defaultPositionTitle = ''
): TournamentCandidate[] {
  const normalized = rawText.trim();
  if (!normalized) return [];

  const rawLines = normalized.includes('\n')
    ? normalized.split(/\r?\n/)
    : normalized.split(/[,;]/);

  const parsed: TournamentCandidate[] = [];
  const seenNames = new Set<string>();
  const cleanDefaultPos = defaultPositionTitle.trim().slice(0, 80);

  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i]
      .replace(/^\s*(?:\d+[\.\)\-:\s]+|[-•*]+\s+)/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!line) continue;

    let detectedGender: PollGender = 'male';
    const femaleSuffixRegex =
      /(?:\s*[\(\[]\s*(?:f|female|girl|woman|msichana|ke|w)\s*[\)\]]|\s*[-–/|,]\s*(?:f|female|girl|msichana|ke)\s*)$/i;
    const maleSuffixRegex =
      /(?:\s*[\(\[]\s*(?:m|male|boy|man|mvulana|me)\s*[\)\]]|\s*[-–/|,]\s*(?:m|male|boy|mvulana|me)\s*)$/i;

    if (femaleSuffixRegex.test(line)) {
      detectedGender = 'female';
      line = line.replace(femaleSuffixRegex, '').trim();
    } else if (maleSuffixRegex.test(line)) {
      detectedGender = 'male';
      line = line.replace(maleSuffixRegex, '').trim();
    }

    const cleanName = line.slice(0, 140).trim();
    if (!cleanName) continue;
    const dedupKey = cleanName.toLowerCase();
    if (seenNames.has(dedupKey)) continue;
    seenNames.add(dedupKey);

    const cand: TournamentCandidate = {
      id: `c_${parsed.length + 1}_${generateShortPollId(4)}`,
      name: cleanName,
      gender: detectedGender,
    };
    if (cleanDefaultPos) {
      cand.positionTitle = cleanDefaultPos;
    }
    parsed.push(cand);
    if (parsed.length >= 300) break;
  }

  return parsed;
}

interface TrackStagePlan {
  groups: Array<{
    labelSuffix: string;
    genderTrack: 'all' | 'male' | 'female';
    candidateIds: string[];
    advanceCount: number;
  }>;
  isFinal: boolean;
}

function buildBalancedChunks<T>(items: T[], maxPerGroup: number): T[][] {
  if (items.length === 0) return [];
  const safeMax = Math.max(3, Math.min(12, maxPerGroup));
  if (items.length <= safeMax) return [items];
  const groupCount = Math.ceil(items.length / safeMax);
  const baseSize = Math.floor(items.length / groupCount);
  const remainder = items.length % groupCount;
  const chunks: T[][] = [];
  let cursor = 0;
  for (let g = 0; g < groupCount; g++) {
    const size = baseSize + (g < remainder ? 1 : 0);
    chunks.push(items.slice(cursor, cursor + size));
    cursor += size;
  }
  return chunks;
}

function buildTrackStagePlan(
  candidateIds: string[],
  targetWinnersForTrack: number,
  groupSize: number,
  genderTrack: 'all' | 'male' | 'female'
): TrackStagePlan {
  const n = candidateIds.length;
  const k = Math.max(1, targetWinnersForTrack);
  const safeMax = Math.max(3, Math.min(12, groupSize));

  if (n <= k) {
    return { groups: [], isFinal: true };
  }

  if (n <= safeMax) {
    return {
      groups: [
        {
          labelSuffix: 'Fainali',
          genderTrack,
          candidateIds,
          advanceCount: k,
        },
      ],
      isFinal: true,
    };
  }

  const chunks = buildBalancedChunks(candidateIds, safeMax);
  const m = chunks.length;

  // Determine how many advance per group so next round shrinks steadily without deadlocking
  let desiredNextTotal = Math.max(k, Math.min(safeMax, Math.ceil(n * 0.35)));
  if (n > safeMax * 3) {
    desiredNextTotal = Math.max(k, Math.min(m * 2, Math.max(safeMax, Math.ceil(n * 0.25))));
  }
  const minRequiredPerGroup = Math.ceil(k / m);
  const baseAdv = Math.max(
    minRequiredPerGroup,
    Math.min(Math.floor(safeMax / 2), Math.ceil(desiredNextTotal / m))
  );

  const groups = chunks.map((chunk, idx) => {
    const maxSafeAdv = Math.max(1, chunk.length - 1);
    const adv = Math.min(maxSafeAdv, baseAdv);
    const letter = String.fromCharCode(65 + (idx % 26));
    const suffix = idx >= 26 ? `${letter}${Math.floor(idx / 26)}` : letter;
    return {
      labelSuffix: `Kundi ${suffix}`,
      genderTrack,
      candidateIds: chunk,
      advanceCount: adv,
    };
  });

  return { groups, isFinal: false };
}

export interface TournamentRoadmapStep {
  round: number;
  labelSw: string;
  labelEn: string;
  maleGroups: number;
  femaleGroups: number;
  totalGroups: number;
  startCount: number;
  advanceTotal: number;
  isFinal: boolean;
}

export function buildTournamentRoadmapPreview(opts: {
  candidates: TournamentCandidate[];
  targetWinnersCount: number;
  useGenderQuota: boolean;
  requiredMaleCount: number;
  requiredFemaleCount: number;
  groupSize: number;
}): {
  valid: boolean;
  errorSw?: string;
  errorEn?: string;
  rounds: TournamentRoadmapStep[];
} {
  const {
    candidates,
    targetWinnersCount,
    useGenderQuota,
    requiredMaleCount,
    requiredFemaleCount,
    groupSize,
  } = opts;

  if (candidates.length < 2) {
    return {
      valid: false,
      errorSw: 'Weka angalau wagombea 2 ili kuanza mchakato.',
      errorEn: 'Provide at least 2 candidates to start.',
      rounds: [],
    };
  }

  if (targetWinnersCount < 1 || targetWinnersCount > 50) {
    return {
      valid: false,
      errorSw: 'Idadi ya washindi wanaohitajika lazima iwe kati ya 1 na 50.',
      errorEn: 'Target winners count must be between 1 and 50.',
      rounds: [],
    };
  }

  const safeGroupSize = Math.max(3, Math.min(12, groupSize || 8));

  if (useGenderQuota) {
    const males = candidates.filter((c) => c.gender === 'male');
    const females = candidates.filter((c) => c.gender === 'female');
    if (requiredMaleCount + requiredFemaleCount !== targetWinnersCount) {
      return {
        valid: false,
        errorSw: `Jumla ya Wavulana (${requiredMaleCount}) + Wasichana (${requiredFemaleCount}) lazima ilingane na idadi ya washindi (${targetWinnersCount}).`,
        errorEn: `Males (${requiredMaleCount}) + Females (${requiredFemaleCount}) must equal target winners (${targetWinnersCount}).`,
        rounds: [],
      };
    }
    if (males.length < requiredMaleCount) {
      return {
        valid: false,
        errorSw: `Kuna wavulana ${males.length} tu kwenye orodha, lakini unahitaji washindi ${requiredMaleCount} wavulana.`,
        errorEn: `Only ${males.length} male candidates listed, need at least ${requiredMaleCount}.`,
        rounds: [],
      };
    }
    if (females.length < requiredFemaleCount) {
      return {
        valid: false,
        errorSw: `Kuna wasichana ${females.length} tu kwenye orodha, lakini unahitaji washindi ${requiredFemaleCount} wasichana.`,
        errorEn: `Only ${females.length} female candidates listed, need at least ${requiredFemaleCount}.`,
        rounds: [],
      };
    }

    let remMales = males.map((c) => c.id);
    let remFemales = females.map((c) => c.id);
    let maleDone = requiredMaleCount === 0 || remMales.length <= requiredMaleCount;
    let femaleDone = requiredFemaleCount === 0 || remFemales.length <= requiredFemaleCount;
    const rounds: TournamentRoadmapStep[] = [];

    for (let r = 1; r <= 12; r++) {
      if (maleDone && femaleDone) break;
      const malePlan =
        !maleDone && requiredMaleCount > 0
          ? buildTrackStagePlan(remMales, requiredMaleCount, safeGroupSize, 'male')
          : { groups: [], isFinal: true };
      const femalePlan =
        !femaleDone && requiredFemaleCount > 0
          ? buildTrackStagePlan(remFemales, requiredFemaleCount, safeGroupSize, 'female')
          : { groups: [], isFinal: true };

      const totalGroups = malePlan.groups.length + femalePlan.groups.length;
      if (totalGroups === 0) break;

      const advMales = malePlan.groups.reduce((s, g) => s + g.advanceCount, 0);
      const advFemales = femalePlan.groups.reduce((s, g) => s + g.advanceCount, 0);
      const startCount =
        (malePlan.groups.length > 0 ? remMales.length : 0) +
        (femalePlan.groups.length > 0 ? remFemales.length : 0);

      const willMaleFinish = maleDone || malePlan.isFinal;
      const willFemaleFinish = femaleDone || femalePlan.isFinal;
      const isFinal = willMaleFinish && willFemaleFinish;

      rounds.push({
        round: r,
        labelSw: isFinal
          ? `Hatua ya ${r} (Fainali)`
          : r === 1
            ? 'Hatua ya 1 (Mchujo wa Awali)'
            : `Hatua ya ${r} (Mchujo)`,
        labelEn: isFinal ? `Round ${r} (Final)` : `Round ${r} (Elimination)`,
        maleGroups: malePlan.groups.length,
        femaleGroups: femalePlan.groups.length,
        totalGroups,
        startCount,
        advanceTotal: advMales + advFemales,
        isFinal,
      });

      if (malePlan.groups.length > 0) {
        if (malePlan.isFinal) {
          maleDone = true;
          remMales = [];
        } else {
          remMales = Array.from({ length: advMales }, (_, i) => `m_${r}_${i}`);
        }
      }
      if (femalePlan.groups.length > 0) {
        if (femalePlan.isFinal) {
          femaleDone = true;
          remFemales = [];
        } else {
          remFemales = Array.from({ length: advFemales }, (_, i) => `f_${r}_${i}`);
        }
      }
    }

    return { valid: true, rounds };
  }

  if (candidates.length < targetWinnersCount) {
    return {
      valid: false,
      errorSw: `Wagombea (${candidates.length}) ni wachache kuliko nafasi za washindi (${targetWinnersCount}).`,
      errorEn: `Candidates (${candidates.length}) fewer than needed winners (${targetWinnersCount}).`,
      rounds: [],
    };
  }

  let rem = candidates.map((c) => c.id);
  const rounds: TournamentRoadmapStep[] = [];
  for (let r = 1; r <= 12; r++) {
    if (rem.length <= targetWinnersCount) break;
    const plan = buildTrackStagePlan(rem, targetWinnersCount, safeGroupSize, 'all');
    if (plan.groups.length === 0) break;
    const advTotal = plan.groups.reduce((s, g) => s + g.advanceCount, 0);
    rounds.push({
      round: r,
      labelSw: plan.isFinal
        ? `Hatua ya ${r} (Fainali)`
        : r === 1
          ? 'Hatua ya 1 (Mchujo wa Awali)'
          : `Hatua ya ${r} (Mchujo)`,
      labelEn: plan.isFinal ? `Round ${r} (Final)` : `Round ${r} (Elimination)`,
      maleGroups: 0,
      femaleGroups: 0,
      totalGroups: plan.groups.length,
      startCount: rem.length,
      advanceTotal: advTotal,
      isFinal: plan.isFinal,
    });
    if (plan.isFinal) break;
    rem = Array.from({ length: advTotal }, (_, i) => `a_${r}_${i}`);
  }

  return { valid: true, rounds };
}

function mapTournamentDoc(id: string, data: Record<string, unknown>): PollTournament {
  const candidatesRaw = Array.isArray(data.candidates) ? data.candidates : [];
  const candidates: TournamentCandidate[] = candidatesRaw
    .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
    .map((c, idx) => ({
      id: typeof c.id === 'string' && c.id ? c.id : `c_${idx + 1}`,
      name: String(c.name || `Mgombea ${idx + 1}`),
      gender: c.gender === 'female' || c.gender === 'other' ? c.gender : 'male',
      positionTitle: typeof c.positionTitle === 'string' && c.positionTitle ? c.positionTitle : undefined,
      subtitle: typeof c.subtitle === 'string' && c.subtitle ? c.subtitle : undefined,
      imageUrl: typeof c.imageUrl === 'string' && c.imageUrl ? c.imageUrl : undefined,
    }));

  const stagesRaw = Array.isArray(data.stages) ? data.stages : [];
  const stages: TournamentStageRecord[] = stagesRaw
    .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
    .map((s) => ({
      round: Number(s.round || 1),
      title: String(s.title || ''),
      isFinal: Boolean(s.isFinal),
      isTieBreaker: Boolean(s.isTieBreaker),
      groups: Array.isArray(s.groups)
        ? s.groups
            .filter((g): g is Record<string, unknown> => typeof g === 'object' && g !== null)
            .map((g) => ({
              pollId: String(g.pollId || ''),
              label: String(g.label || ''),
              genderTrack:
                g.genderTrack === 'male' || g.genderTrack === 'female' ? g.genderTrack : 'all',
              candidateIds: Array.isArray(g.candidateIds)
                ? g.candidateIds.filter((x): x is string => typeof x === 'string')
                : [],
              advanceCount: Math.max(1, Number(g.advanceCount || 1)),
            }))
        : [],
      advancingIds: Array.isArray(s.advancingIds)
        ? s.advancingIds.filter((x): x is string => typeof x === 'string')
        : [],
      eliminatedIds: Array.isArray(s.eliminatedIds)
        ? s.eliminatedIds.filter((x): x is string => typeof x === 'string')
        : [],
      tiedIds: Array.isArray(s.tiedIds)
        ? s.tiedIds.filter((x): x is string => typeof x === 'string')
        : undefined,
      tiedNeededCount: typeof s.tiedNeededCount === 'number' ? s.tiedNeededCount : undefined,
      status:
        s.status === 'completed' || s.status === 'awaiting_tiebreaker' ? s.status : 'active',
      startedAtMs: Number(s.startedAtMs || Date.now()),
      completedAtMs: typeof s.completedAtMs === 'number' ? s.completedAtMs : undefined,
    }));

  const winnerVotesRaw =
    typeof data.winnerVotes === 'object' && data.winnerVotes !== null
      ? (data.winnerVotes as Record<string, unknown>)
      : {};
  const winnerVotes: Record<string, number> = {};
  for (const [k, v] of Object.entries(winnerVotesRaw)) {
    if (typeof v === 'number') winnerVotes[k] = v;
  }

  return {
    id,
    tournamentId: typeof data.tournamentId === 'string' && data.tournamentId ? data.tournamentId : id,
    title: String(data.title || ''),
    description: String(data.description || ''),
    institutionName: String(data.institutionName || ''),
    category: normalizePollCategory(data.category),
    positionTitle: String(data.positionTitle || ''),
    targetWinnersCount: Math.max(1, Number(data.targetWinnersCount || 1)),
    useGenderQuota: Boolean(data.useGenderQuota),
    requiredMaleCount: Math.max(0, Number(data.requiredMaleCount || 0)),
    requiredFemaleCount: Math.max(0, Number(data.requiredFemaleCount || 0)),
    groupSize: Math.max(3, Math.min(12, Number(data.groupSize || 8))),
    roundDurationMinutes: Math.max(5, Number(data.roundDurationMinutes || 60)),
    status: data.status === 'completed' ? 'completed' : 'active',
    currentRound: Math.max(1, Number(data.currentRound || 1)),
    totalPlannedRounds: Math.max(1, Number(data.totalPlannedRounds || 1)),
    candidates,
    stages,
    winnerIds: Array.isArray(data.winnerIds)
      ? data.winnerIds.filter((x): x is string => typeof x === 'string')
      : [],
    winnerVotes,
    createdBy: String(data.createdBy || ''),
    createdByName: String(data.createdByName || 'Mmiliki'),
    createdByPhoto: String(data.createdByPhoto || ''),
    createdAt: (data.createdAt as Timestamp) || null,
    updatedAt: (data.updatedAt as Timestamp) || null,
  };
}

export function subscribePollTournaments(
  onUpdate: (tournaments: PollTournament[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const path = 'poll_tournaments';
  const q = query(collection(db, path), limit(40));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => mapTournamentDoc(d.id, d.data()));
      list.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
        const am = a.createdAt ? a.createdAt.toMillis() : 0;
        const bm = b.createdAt ? b.createdAt.toMillis() : 0;
        return bm - am;
      });
      onUpdate(list);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export interface CreatePollTournamentInput {
  title: string;
  description: string;
  institutionName: string;
  category: PollCategory;
  positionTitle: string;
  pollStyle: 'local_govt' | 'school_election';
  targetWinnersCount: number;
  useGenderQuota: boolean;
  requiredMaleCount: number;
  requiredFemaleCount: number;
  groupSize: number;
  roundDurationMinutes: number;
  candidates: TournamentCandidate[];
}

function buildPollOptionFromCandidate(
  c: TournamentCandidate,
  fallbackPosition: string,
  idx: number
): PollOption {
  const palette = ['#1D4E89', '#059669', '#D97706', '#7C3AED', '#DC2626', '#0F766E'];
  const opt: PollOption = {
    id: c.id,
    label: c.name.trim().slice(0, 160),
    gender: c.gender,
    color: palette[idx % palette.length],
  };
  const pos = (c.positionTitle || fallbackPosition).trim().slice(0, 80);
  if (pos) opt.positionTitle = pos;
  const sub = c.subtitle
    ? c.subtitle.trim().slice(0, 160)
    : c.gender === 'female'
      ? `Msichana${pos ? ` · ${pos}` : ''}`
      : c.gender === 'male'
        ? `Mvulana${pos ? ` · ${pos}` : ''}`
        : pos;
  if (sub) opt.subtitle = sub;
  const rawOptImg = (c.imageUrl || '').trim().slice(0, 500);
  if (rawOptImg.startsWith('https://')) opt.imageUrl = rawOptImg;
  return opt;
}

function buildCleanCandidatesForStorage(cands: TournamentCandidate[]): Record<string, unknown>[] {
  return cands.map((c) => {
    const clean: Record<string, unknown> = {
      id: c.id,
      name: c.name.trim().slice(0, 160),
      gender: c.gender,
    };
    if (c.positionTitle && c.positionTitle.trim()) {
      clean.positionTitle = c.positionTitle.trim().slice(0, 80);
    }
    if (c.subtitle && c.subtitle.trim()) {
      clean.subtitle = c.subtitle.trim().slice(0, 160);
    }
    const rawCandImg = (c.imageUrl || '').trim().slice(0, 500);
    if (rawCandImg.startsWith('https://')) {
      clean.imageUrl = rawCandImg;
    }
    return clean;
  });
}

function buildCleanStagesForStorage(stages: TournamentStageRecord[]): Record<string, unknown>[] {
  return stages.map((st) => {
    const clean: Record<string, unknown> = {
      round: st.round,
      title: st.title,
      isFinal: st.isFinal,
      isTieBreaker: Boolean(st.isTieBreaker),
      groups: st.groups.map((g) => ({
        pollId: g.pollId,
        label: g.label,
        genderTrack: g.genderTrack,
        candidateIds: g.candidateIds,
        advanceCount: g.advanceCount,
      })),
      advancingIds: st.advancingIds,
      eliminatedIds: st.eliminatedIds,
      status: st.status,
      startedAtMs: st.startedAtMs,
    };
    if (st.tiedIds && st.tiedIds.length > 0) clean.tiedIds = st.tiedIds;
    if (typeof st.tiedNeededCount === 'number') clean.tiedNeededCount = st.tiedNeededCount;
    if (typeof st.completedAtMs === 'number') clean.completedAtMs = st.completedAtMs;
    return clean;
  });
}

interface PendingGroupPollWrite {
  pollId: string;
  groupMeta: TournamentStageGroup;
  pollDoc: Record<string, unknown>;
  options: PollOption[];
}

function buildGroupPollWritesForPlan(params: {
  tournamentId: string;
  title: string;
  description: string;
  institutionName: string;
  category: PollCategory;
  positionTitle: string;
  pollStyle: 'local_govt' | 'school_election';
  round: number;
  roundLabel: string;
  roundDurationMinutes: number;
  groups: Array<{
    label: string;
    genderTrack: 'all' | 'male' | 'female';
    candidateIds: string[];
    advanceCount: number;
  }>;
  candidateMap: Map<string, TournamentCandidate>;
  user: User;
  displayName: string;
  photoURL: string;
  isTieBreaker?: boolean;
}): PendingGroupPollWrite[] {
  const {
    tournamentId,
    title,
    description,
    institutionName,
    category,
    positionTitle,
    pollStyle,
    round,
    roundLabel,
    roundDurationMinutes,
    groups,
    candidateMap,
    user,
    displayName,
    photoURL,
    isTieBreaker = false,
  } = params;

  const endsAtTs = Timestamp.fromDate(new Date(Date.now() + Math.max(5, roundDurationMinutes) * 60000));
  const themeCycle: PollThemeColor[] =
    pollStyle === 'school_election' ? ['indigo', 'cobalt', 'teal', 'violet'] : ['teal', 'emerald', 'cobalt', 'amber'];

  return groups.map((g, gIdx) => {
    const pollId = `t_${generateShortPollId(8)}`;
    const groupCandidates = g.candidateIds
      .map((cid) => candidateMap.get(cid))
      .filter((c): c is TournamentCandidate => Boolean(c));
    const options = groupCandidates.map((c, idx) =>
      buildPollOptionFromCandidate(c, positionTitle, idx)
    );
    if (options.length < 2) {
      throw new Error(`Kundi "${g.label}" lina chaguo pungufu ya 2.`);
    }
    const questionType: PollQuestionType =
      g.advanceCount > 1 && options.length > 2 ? 'multiple' : 'single';
    const maxChoices = questionType === 'multiple'
      ? Math.max(1, Math.min(12, Math.min(options.length - 1, Math.round(g.advanceCount))))
      : 1;

    const cleanQuestion = `${title} — ${g.label}`.slice(0, 295);
    const finalQuestion = cleanQuestion.length >= 4 ? cleanQuestion : `${cleanQuestion} Kura`.slice(0, 295);
    const guidanceNote = isTieBreaker
      ? `Kura ya kuamua sare (${g.label}): Chagua ${maxChoices} kupata anayefuzu.`
      : `Mchakato wa Mtoano · ${roundLabel} (${g.label}): Wagombea ${options.length} wanachuana — ${g.advanceCount} bora wanavuka.`;

    const pollDoc: Record<string, unknown> = {
      pollId,
      question: finalQuestion,
      description: [description.trim(), guidanceNote].filter(Boolean).join('\n').slice(0, 1500),
      category,
      questionType,
      pollStyle,
      themeColor: themeCycle[gIdx % themeCycle.length],
      institutionName: institutionName.trim().slice(0, 120),
      options,
      optionIds: options.map((o) => o.id),
      maxChoices,
      status: 'open',
      resultsVisibility: 'always',
      allowVoteChange: true,
      anonymousMode: false,
      showVoterCount: true,
      showLivePercentages: true,
      shuffleOptions: true,
      allowComments: true,
      quorumTarget: 0,
      allowShare: true,
      isPinned: gIdx === 0 && round === 1,
      hasDeadline: true,
      endsAt: endsAtTs,
      totalBallots: 0,
      commentsCount: 0,
      tournamentId,
      tournamentRound: Math.max(1, Math.min(20, Math.round(round))),
      tournamentGroupLabel: `${roundLabel} · ${g.label}`.slice(0, 80),
      createdBy: auth.currentUser?.uid || user.uid,
      createdByName: displayName.trim().slice(0, 80) || 'Mmiliki',
      createdByPhoto: (photoURL || '').slice(0, 500),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    return {
      pollId,
      groupMeta: {
        pollId,
        label: g.label,
        genderTrack: g.genderTrack,
        candidateIds: options.map((o) => o.id),
        advanceCount: g.advanceCount,
      },
      pollDoc,
      options,
    };
  });
}

async function commitPendingPollWrites(writes: PendingGroupPollWrite[]): Promise<void> {
  const ops: Array<{ type: 'poll' | 'tally'; pollId: string; optionId?: string; data: Record<string, unknown> }> = [];
  for (const w of writes) {
    ops.push({ type: 'poll', pollId: w.pollId, data: w.pollDoc });
    for (const opt of w.options) {
      ops.push({
        type: 'tally',
        pollId: w.pollId,
        optionId: opt.id,
        data: {
          pollId: w.pollId,
          optionId: opt.id,
          votesCount: 0,
          updatedAt: serverTimestamp(),
        },
      });
    }
  }

  for (let i = 0; i < ops.length; i += 380) {
    const chunk = ops.slice(i, i + 380);
    const buildBatch = () => {
      const batch = writeBatch(db);
      for (const op of chunk) {
        if (op.type === 'poll') {
          batch.set(doc(db, 'polls', op.pollId), op.data);
        } else {
          batch.set(doc(db, 'polls', op.pollId, 'tallies', op.optionId!), op.data);
        }
      }
      return batch;
    };
    try {
      await commitBatchWithTokenRefreshRetry(buildBatch);
    } catch (error) {
      const firstPollOp = chunk.find((o) => o.type === 'poll') || chunk[0];
      const errPath = firstPollOp ? `polls/${firstPollOp.pollId}` : 'polls';
      handleFirestoreError(error, OperationType.CREATE, errPath);
      throw error;
    }
  }
}

export async function createPollTournament(
  user: User,
  displayName: string,
  photoURL: string,
  input: CreatePollTournamentInput
): Promise<string> {
  const cleanTitle = input.title.trim().slice(0, 200);
  if (cleanTitle.length < 4) {
    throw new Error('Andika kichwa cha mchakato (angalau herufi 4).');
  }

  const safeTargetWinners = Math.max(1, Math.min(50, Math.round(Number(input.targetWinnersCount) || 1)));
  const safeReqMale = input.useGenderQuota
    ? Math.max(0, Math.min(50, Math.round(Number(input.requiredMaleCount) || 0)))
    : 0;
  const safeReqFemale = input.useGenderQuota
    ? Math.max(0, Math.min(50, Math.round(Number(input.requiredFemaleCount) || 0)))
    : 0;
  const safeDurationMins = Math.max(5, Math.min(525600, Math.round(Number(input.roundDurationMinutes) || 60)));

  const seenCandIds = new Set<string>();
  const sanitizedCandidates: TournamentCandidate[] = input.candidates.slice(0, 300).map((c, idx) => {
    const rawId = (c.id || `c_${idx + 1}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || `c_${idx + 1}`;
    let uniqueId = rawId;
    let dupCounter = 2;
    while (seenCandIds.has(uniqueId)) {
      uniqueId = `${rawId.slice(0, 36)}_${dupCounter}`;
      dupCounter++;
    }
    seenCandIds.add(uniqueId);
    const rawImg = (c.imageUrl || '').trim().slice(0, 500);
    const safeGender: PollGender =
      c.gender === 'female' || c.gender === 'other' ? c.gender : 'male';
    return {
      ...c,
      id: uniqueId,
      gender: safeGender,
      name: c.name.trim().slice(0, 160) || `Mgombea ${idx + 1}`,
      imageUrl: rawImg.startsWith('https://') ? rawImg : undefined,
    };
  });

  const safeGroupSize = Math.max(3, Math.min(12, Math.round(Number(input.groupSize) || 8)));

  const roadmap = buildTournamentRoadmapPreview({
    candidates: sanitizedCandidates,
    targetWinnersCount: safeTargetWinners,
    useGenderQuota: input.useGenderQuota,
    requiredMaleCount: safeReqMale,
    requiredFemaleCount: safeReqFemale,
    groupSize: safeGroupSize,
  });

  if (!roadmap.valid) {
    throw new Error(roadmap.errorSw || 'Mpangilio wa wagombea si sahihi.');
  }

  const tournamentId = `trn_${generateShortPollId(8)}`;
  const candidateMap = new Map(sanitizedCandidates.map((c) => [c.id, c]));

  const roundGroups: Array<{
    label: string;
    genderTrack: 'all' | 'male' | 'female';
    candidateIds: string[];
    advanceCount: number;
  }> = [];

  let stageIsFinal = false;

  if (input.useGenderQuota) {
    const males = sanitizedCandidates.filter((c) => c.gender === 'male').map((c) => c.id);
    const females = sanitizedCandidates.filter((c) => c.gender === 'female').map((c) => c.id);
    const malePlan =
      safeReqMale > 0
        ? buildTrackStagePlan(males, safeReqMale, safeGroupSize, 'male')
        : { groups: [], isFinal: true };
    const femalePlan =
      safeReqFemale > 0
        ? buildTrackStagePlan(females, safeReqFemale, safeGroupSize, 'female')
        : { groups: [], isFinal: true };

    malePlan.groups.forEach((g) =>
      roundGroups.push({
        ...g,
        label: `Wavulana · ${g.labelSuffix}`,
      })
    );
    femalePlan.groups.forEach((g) =>
      roundGroups.push({
        ...g,
        label: `Wasichana · ${g.labelSuffix}`,
      })
    );
    stageIsFinal = malePlan.isFinal && femalePlan.isFinal;
  } else {
    const allIds = sanitizedCandidates.map((c) => c.id);
    const plan = buildTrackStagePlan(allIds, safeTargetWinners, safeGroupSize, 'all');
    plan.groups.forEach((g) =>
      roundGroups.push({
        ...g,
        label: g.labelSuffix,
      })
    );
    stageIsFinal = plan.isFinal;
  }

  // Handle trivial edge case where every track already has exact required count (0 groups needed)
  if (roundGroups.length === 0) {
    const initialWinners = input.useGenderQuota
      ? [
          ...sanitizedCandidates.filter((c) => c.gender === 'male').slice(0, safeReqMale),
          ...sanitizedCandidates.filter((c) => c.gender === 'female').slice(0, safeReqFemale),
        ].map((c) => c.id)
      : sanitizedCandidates.slice(0, safeTargetWinners).map((c) => c.id);

    const trivialStage: TournamentStageRecord = {
      round: 1,
      title: 'Uteuzi wa Moja kwa Moja (Idadi Imetimia)',
      isFinal: true,
      groups: [],
      advancingIds: initialWinners,
      eliminatedIds: [],
      status: 'completed',
      startedAtMs: Date.now(),
      completedAtMs: Date.now(),
    };

    const actingUid = auth.currentUser?.uid || user.uid;
    const buildTrivialBatch = () => {
      const batch = writeBatch(db);
      batch.set(doc(db, 'poll_tournaments', tournamentId), {
        tournamentId,
        title: cleanTitle,
        description: input.description.trim().slice(0, 1500),
        institutionName: input.institutionName.trim().slice(0, 120),
        category: input.category,
        positionTitle: input.positionTitle.trim().slice(0, 80),
        targetWinnersCount: safeTargetWinners,
        useGenderQuota: Boolean(input.useGenderQuota),
        requiredMaleCount: safeReqMale,
        requiredFemaleCount: safeReqFemale,
        groupSize: safeGroupSize,
        roundDurationMinutes: safeDurationMins,
        status: 'completed',
        currentRound: 1,
        totalPlannedRounds: 1,
        candidates: buildCleanCandidatesForStorage(sanitizedCandidates),
        stages: buildCleanStagesForStorage([trivialStage]),
        winnerIds: initialWinners,
        winnerVotes: {},
        createdBy: actingUid,
        createdByName: displayName.trim().slice(0, 80) || 'Mmiliki',
        createdByPhoto: (photoURL || '').slice(0, 500),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return batch;
    };
    try {
      await commitBatchWithTokenRefreshRetry(buildTrivialBatch);
      return tournamentId;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `poll_tournaments/${tournamentId}`);
      throw error;
    }
  }

  const firstRoundTitle = roadmap.rounds[0]?.labelSw || (stageIsFinal ? 'Hatua ya 1 (Fainali)' : 'Hatua ya 1 (Mchujo wa Awali)');
  const pendingWrites = buildGroupPollWritesForPlan({
    tournamentId,
    title: cleanTitle,
    description: input.description,
    institutionName: input.institutionName,
    category: input.category,
    positionTitle: input.positionTitle,
    pollStyle: input.pollStyle,
    round: 1,
    roundLabel: firstRoundTitle,
    roundDurationMinutes: safeDurationMins,
    groups: roundGroups,
    candidateMap,
    user,
    displayName,
    photoURL,
  });

  const stage1: TournamentStageRecord = {
    round: 1,
    title: firstRoundTitle,
    isFinal: stageIsFinal,
    isTieBreaker: false,
    groups: pendingWrites.map((w) => w.groupMeta),
    advancingIds: [],
    eliminatedIds: [],
    status: 'active',
    startedAtMs: Date.now(),
  };

  await commitPendingPollWrites(pendingWrites);

  try {
    const actingUid = auth.currentUser?.uid || user.uid;
    const tRef = doc(db, 'poll_tournaments', tournamentId);
    const buildTournamentBatch = () => {
      const batch = writeBatch(db);
      batch.set(tRef, {
        tournamentId,
        title: cleanTitle,
        description: input.description.trim().slice(0, 1500),
        institutionName: input.institutionName.trim().slice(0, 120),
        category: input.category,
        positionTitle: input.positionTitle.trim().slice(0, 80),
        targetWinnersCount: safeTargetWinners,
        useGenderQuota: Boolean(input.useGenderQuota),
        requiredMaleCount: safeReqMale,
        requiredFemaleCount: safeReqFemale,
        groupSize: safeGroupSize,
        roundDurationMinutes: safeDurationMins,
        status: 'active',
        currentRound: 1,
        totalPlannedRounds: Math.max(1, Math.min(20, Math.round(roadmap.rounds.length))),
        candidates: buildCleanCandidatesForStorage(sanitizedCandidates),
        stages: buildCleanStagesForStorage([stage1]),
        winnerIds: [],
        winnerVotes: {},
        createdBy: actingUid,
        createdByName: displayName.trim().slice(0, 80) || 'Mmiliki',
        createdByPhoto: (photoURL || '').slice(0, 500),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return batch;
    };
    await commitBatchWithTokenRefreshRetry(buildTournamentBatch);
    return tournamentId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `poll_tournaments/${tournamentId}`);
    throw error;
  }
}

export async function resolveAndAdvanceTournament(
  tournament: PollTournament,
  allPolls: Poll[],
  user: User,
  displayName: string,
  photoURL: string
): Promise<{
  outcome: 'advanced' | 'tiebreaker_created' | 'completed';
  messageSw: string;
  messageEn: string;
}> {
  if (tournament.status === 'completed') {
    return {
      outcome: 'completed',
      messageSw: 'Mchakato huu tayari umeshakamilika na washindi wametangazwa.',
      messageEn: 'This process is already completed.',
    };
  }

  const activeStageIdx = tournament.stages.findIndex(
    (s) => s.status === 'active' || s.status === 'awaiting_tiebreaker'
  );
  if (activeStageIdx === -1) {
    throw new Error('Hakuna hatua inayoendelea kwa sasa.');
  }

  const activeStage = tournament.stages[activeStageIdx];
  const pollMap = new Map(allPolls.map((p) => [p.id, p]));
  const candidateMap = new Map(tournament.candidates.map((c) => [c.id, c]));

  const stagePolls: Array<{ group: TournamentStageGroup; poll: Poll; tallies: Record<string, number> }> = [];
  for (const g of activeStage.groups) {
    let poll = pollMap.get(g.pollId) || null;
    if (!poll) {
      poll = await fetchPollById(g.pollId);
    }
    if (!poll) {
      throw new Error(`Kadi ya kura (${g.label}) haikupatikana.`);
    }
    const tallies = await fetchTalliesForPoll(poll);
    stagePolls.push({ group: g, poll, tallies });
  }

  // Close all open group polls in this stage cleanly before moving forward
  for (const sp of stagePolls) {
    if (sp.poll.status === 'open') {
      await updatePollStatus(sp.poll.id, 'closed');
    }
  }

  // Deterministically tally each group & check cutoff ties
  const newlyAdvancingIds: string[] = [...activeStage.advancingIds];
  const newlyEliminatedIds: string[] = [...activeStage.eliminatedIds];
  const votesSnapshot: Record<string, number> = { ...(tournament.winnerVotes || {}) };

  const tieBreakerGroups: Array<{
    label: string;
    genderTrack: 'all' | 'male' | 'female';
    candidateIds: string[];
    advanceCount: number;
  }> = [];

  for (const { group, tallies } of stagePolls) {
    const scored = group.candidateIds
      .map((cid, idx) => ({
        cid,
        votes: tallies[cid] || 0,
        idx,
      }))
      .sort((a, b) => (b.votes !== a.votes ? b.votes - a.votes : a.idx - b.idx));

    for (const s of scored) {
      votesSnapshot[s.cid] = s.votes;
    }

    const k = Math.min(group.advanceCount, scored.length);
    if (k <= 0) continue;

    if (scored.length > k && scored[k - 1].votes === scored[k].votes) {
      const cutoffVotes = scored[k - 1].votes;
      const strictlyAbove = scored.filter((s) => s.votes > cutoffVotes).map((s) => s.cid);
      const tiedAtCutoff = scored.filter((s) => s.votes === cutoffVotes).map((s) => s.cid);
      const strictlyBelow = scored.filter((s) => s.votes < cutoffVotes).map((s) => s.cid);
      const neededFromTie = k - strictlyAbove.length;

      for (const cid of strictlyAbove) {
        if (!newlyAdvancingIds.includes(cid)) newlyAdvancingIds.push(cid);
      }
      for (const cid of strictlyBelow) {
        if (!newlyEliminatedIds.includes(cid)) newlyEliminatedIds.push(cid);
      }

      tieBreakerGroups.push({
        label: `Sare · ${group.label}`,
        genderTrack: group.genderTrack,
        candidateIds: tiedAtCutoff,
        advanceCount: Math.max(1, neededFromTie),
      });
    } else {
      const winners = scored.slice(0, k).map((s) => s.cid);
      const losers = scored.slice(k).map((s) => s.cid);
      for (const cid of winners) {
        if (!newlyAdvancingIds.includes(cid)) newlyAdvancingIds.push(cid);
      }
      for (const cid of losers) {
        if (!newlyEliminatedIds.includes(cid)) newlyEliminatedIds.push(cid);
      }
    }
  }

  const nextStages = tournament.stages.map((s, idx) =>
    idx === activeStageIdx ? { ...s } : { ...s }
  );

  // If ANY group had a tie on the cutoff boundary -> generate tie-breaker Mpoll(s)!
  if (tieBreakerGroups.length > 0) {
    const firstStyle: 'local_govt' | 'school_election' =
      stagePolls[0]?.poll.pollStyle === 'school_election' ? 'school_election' : 'local_govt';

    nextStages[activeStageIdx] = {
      ...activeStage,
      advancingIds: newlyAdvancingIds,
      eliminatedIds: newlyEliminatedIds,
      tiedIds: tieBreakerGroups.flatMap((t) => t.candidateIds),
      tiedNeededCount: tieBreakerGroups.reduce((s, t) => s + t.advanceCount, 0),
      status: 'completed',
      completedAtMs: Date.now(),
    };

    const tieLabel = `Mtoano wa Sare (${activeStage.title})`;
    const pendingTieWrites = buildGroupPollWritesForPlan({
      tournamentId: tournament.id,
      title: tournament.title,
      description: tournament.description,
      institutionName: tournament.institutionName,
      category: tournament.category,
      positionTitle: tournament.positionTitle,
      pollStyle: firstStyle,
      round: activeStage.round,
      roundLabel: tieLabel,
      roundDurationMinutes: Math.max(15, Math.min(tournament.roundDurationMinutes, 120)),
      groups: tieBreakerGroups,
      candidateMap,
      user,
      displayName,
      photoURL,
      isTieBreaker: true,
    });

    await commitPendingPollWrites(pendingTieWrites);

    const tieStage: TournamentStageRecord = {
      round: activeStage.round,
      title: tieLabel,
      isFinal: activeStage.isFinal,
      isTieBreaker: true,
      groups: pendingTieWrites.map((w) => w.groupMeta),
      advancingIds: newlyAdvancingIds,
      eliminatedIds: newlyEliminatedIds,
      status: 'active',
      startedAtMs: Date.now(),
    };
    nextStages.push(tieStage);

    await updateDoc(doc(db, 'poll_tournaments', tournament.id), {
      stages: buildCleanStagesForStorage(nextStages),
      winnerVotes: votesSnapshot,
      updatedAt: serverTimestamp(),
    });

    return {
      outcome: 'tiebreaker_created',
      messageSw: 'Kuna sare kwenye kura ya mchujo! Kadi ya mtoano wa sare imeundwa moja kwa moja.',
      messageEn: 'Cutoff tie detected! Automatic tie-breaker ballot(s) created.',
    };
  }

  // Mark current stage completed
  nextStages[activeStageIdx] = {
    ...activeStage,
    advancingIds: newlyAdvancingIds,
    eliminatedIds: newlyEliminatedIds,
    status: 'completed',
    completedAtMs: Date.now(),
  };

  // Determine confirmed winners from finished final tracks vs remaining pools needing next round
  const updatedWinnerIds = [...tournament.winnerIds];
  let remMaleIds: string[] = [];
  let remFemaleIds: string[] = [];
  let remAllIds: string[] = [];

  if (tournament.useGenderQuota) {
    const advancingMales = newlyAdvancingIds.filter(
      (cid) => candidateMap.get(cid)?.gender === 'male'
    );
    const advancingFemales = newlyAdvancingIds.filter(
      (cid) => candidateMap.get(cid)?.gender === 'female'
    );

    const maleAlreadyCrowned = updatedWinnerIds.filter(
      (cid) => candidateMap.get(cid)?.gender === 'male'
    );
    const femaleAlreadyCrowned = updatedWinnerIds.filter(
      (cid) => candidateMap.get(cid)?.gender === 'female'
    );

    if (maleAlreadyCrowned.length < tournament.requiredMaleCount) {
      if (advancingMales.length <= tournament.requiredMaleCount) {
        advancingMales.forEach((cid) => {
          if (!updatedWinnerIds.includes(cid)) updatedWinnerIds.push(cid);
        });
      } else {
        remMaleIds = advancingMales;
      }
    }

    if (femaleAlreadyCrowned.length < tournament.requiredFemaleCount) {
      if (advancingFemales.length <= tournament.requiredFemaleCount) {
        advancingFemales.forEach((cid) => {
          if (!updatedWinnerIds.includes(cid)) updatedWinnerIds.push(cid);
        });
      } else {
        remFemaleIds = advancingFemales;
      }
    }
  } else {
    if (newlyAdvancingIds.length <= tournament.targetWinnersCount) {
      newlyAdvancingIds.forEach((cid) => {
        if (!updatedWinnerIds.includes(cid)) updatedWinnerIds.push(cid);
      });
    } else {
      remAllIds = newlyAdvancingIds;
    }
  }

  const isCompleted = tournament.useGenderQuota
    ? remMaleIds.length === 0 && remFemaleIds.length === 0
    : remAllIds.length === 0;

  if (isCompleted) {
    await updateDoc(doc(db, 'poll_tournaments', tournament.id), {
      status: 'completed',
      stages: buildCleanStagesForStorage(nextStages),
      winnerIds: updatedWinnerIds.slice(0, tournament.targetWinnersCount),
      winnerVotes: votesSnapshot,
      updatedAt: serverTimestamp(),
    });

    return {
      outcome: 'completed',
      messageSw: `Hongera! Mchakato umekamilika na washindi ${updatedWinnerIds.length} wametangazwa rasmi!`,
      messageEn: `Process completed! ${updatedWinnerIds.length} official winners declared!`,
    };
  }

  // Otherwise build Round N+1 group polls deterministically
  const nextRound = activeStage.round + 1;
  const safeGroupSize = Math.max(3, Math.min(12, tournament.groupSize || 8));
  const nextGroups: Array<{
    label: string;
    genderTrack: 'all' | 'male' | 'female';
    candidateIds: string[];
    advanceCount: number;
  }> = [];
  let nextStageIsFinal = false;

  if (tournament.useGenderQuota) {
    const malePlan =
      remMaleIds.length > tournament.requiredMaleCount
        ? buildTrackStagePlan(remMaleIds, tournament.requiredMaleCount, safeGroupSize, 'male')
        : { groups: [], isFinal: true };
    const femalePlan =
      remFemaleIds.length > tournament.requiredFemaleCount
        ? buildTrackStagePlan(remFemaleIds, tournament.requiredFemaleCount, safeGroupSize, 'female')
        : { groups: [], isFinal: true };

    malePlan.groups.forEach((g) =>
      nextGroups.push({
        ...g,
        label: `Wavulana · ${g.labelSuffix}`,
      })
    );
    femalePlan.groups.forEach((g) =>
      nextGroups.push({
        ...g,
        label: `Wasichana · ${g.labelSuffix}`,
      })
    );
    nextStageIsFinal = malePlan.isFinal && femalePlan.isFinal;
  } else {
    const plan = buildTrackStagePlan(remAllIds, tournament.targetWinnersCount, safeGroupSize, 'all');
    plan.groups.forEach((g) =>
      nextGroups.push({
        ...g,
        label: g.labelSuffix,
      })
    );
    nextStageIsFinal = plan.isFinal;
  }

  const nextRoundLabel = nextStageIsFinal
    ? `Hatua ya ${nextRound} (Fainali)`
    : `Hatua ya ${nextRound} (Mchujo)`;
  const firstStyle: 'local_govt' | 'school_election' =
    stagePolls[0]?.poll.pollStyle === 'school_election' ? 'school_election' : 'local_govt';

  const pendingNextWrites = buildGroupPollWritesForPlan({
    tournamentId: tournament.id,
    title: tournament.title,
    description: tournament.description,
    institutionName: tournament.institutionName,
    category: tournament.category,
    positionTitle: tournament.positionTitle,
    pollStyle: firstStyle,
    round: nextRound,
    roundLabel: nextRoundLabel,
    roundDurationMinutes: tournament.roundDurationMinutes,
    groups: nextGroups,
    candidateMap,
    user,
    displayName,
    photoURL,
  });

  await commitPendingPollWrites(pendingNextWrites);

  const newStage: TournamentStageRecord = {
    round: nextRound,
    title: nextRoundLabel,
    isFinal: nextStageIsFinal,
    isTieBreaker: false,
    groups: pendingNextWrites.map((w) => w.groupMeta),
    advancingIds: [],
    eliminatedIds: [],
    status: 'active',
    startedAtMs: Date.now(),
  };
  nextStages.push(newStage);

  await updateDoc(doc(db, 'poll_tournaments', tournament.id), {
    currentRound: Math.min(20, Math.round(nextRound)),
    totalPlannedRounds: Math.min(20, Math.max(Math.round(tournament.totalPlannedRounds), Math.round(nextRound))),
    stages: buildCleanStagesForStorage(nextStages),
    winnerIds: updatedWinnerIds,
    winnerVotes: votesSnapshot,
    updatedAt: serverTimestamp(),
  });

  return {
    outcome: 'advanced',
    messageSw: `Hatua ya ${nextRound} imeanza! Makundi ${pendingNextWrites.length} mapya ya kura yameundwa.`,
    messageEn: `Round ${nextRound} launched with ${pendingNextWrites.length} new Mpoll ballots!`,
  };
}

export async function deletePollTournament(
  tournament: PollTournament,
  linkedPolls: Poll[]
): Promise<void> {
  const path = `poll_tournaments/${tournament.id}`;
  try {
    for (const p of linkedPolls) {
      if (p.tournamentId === tournament.id) {
        await deletePoll(p);
      }
    }
    await deleteDoc(doc(db, 'poll_tournaments', tournament.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
    throw error;
  }
}

