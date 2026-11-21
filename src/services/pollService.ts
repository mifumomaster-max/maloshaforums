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
import { OperationType, db, handleFirestoreError } from '../firebase';
import {
  POLL_CATEGORIES,
  Poll,
  PollBallot,
  PollCategory,
  PollComment,
  PollOption,
  PollQuestionType,
  PollResultsVisibility,
  PollStatus,
  PollStyle,
} from '../types';

export const POLL_NO_DEADLINE_SENTINEL = new Date('2099-12-31T23:59:59.000Z');

export interface CreateOrUpdatePollInput {
  question: string;
  description: string;
  imageUrl?: string;
  category: PollCategory;
  questionType: PollQuestionType;
  pollStyle: PollStyle;
  institutionName: string;
  options: PollOption[];
  maxChoices: number;
  status: PollStatus;
  resultsVisibility: PollResultsVisibility;
  allowVoteChange: boolean;
  anonymousMode: boolean;
  showVoterCount: boolean;
  allowShare: boolean;
  isPinned: boolean;
  hasDeadline: boolean;
  endsAtDate: Date | null;
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

export function mapPollDoc(id: string, data: Record<string, unknown>): Poll {
  const rawOptions = Array.isArray(data.options) ? data.options : [];
  const options: PollOption[] = rawOptions
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item, idx) => ({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `opt_${idx + 1}`,
      label: typeof item.label === 'string' ? item.label : `Chaguo ${idx + 1}`,
      subtitle: typeof item.subtitle === 'string' && item.subtitle ? item.subtitle : undefined,
      imageUrl: typeof item.imageUrl === 'string' && item.imageUrl ? item.imageUrl : undefined,
      color: typeof item.color === 'string' && item.color ? item.color : undefined,
    }));

  const optionIds = Array.isArray(data.optionIds)
    ? data.optionIds.filter((x): x is string => typeof x === 'string')
    : options.map((o) => o.id);

  return {
    id,
    pollId: typeof data.pollId === 'string' && data.pollId ? data.pollId : id,
    question: String(data.question || ''),
    description: String(data.description || ''),
    imageUrl: typeof data.imageUrl === 'string' && data.imageUrl ? data.imageUrl : undefined,
    category: normalizePollCategory(data.category),
    questionType: normalizeQuestionType(data.questionType),
    pollStyle: normalizePollStyle(data.pollStyle),
    institutionName: String(data.institutionName || ''),
    options,
    optionIds,
    maxChoices: Math.max(1, Math.min(12, Number(data.maxChoices || 1))),
    status: normalizeStatus(data.status),
    resultsVisibility: normalizeResultsVisibility(data.resultsVisibility),
    allowVoteChange: Boolean(data.allowVoteChange),
    anonymousMode: Boolean(data.anonymousMode),
    showVoterCount: data.showVoterCount !== false,
    allowShare: data.allowShare !== false,
    isPinned: Boolean(data.isPinned),
    hasDeadline: Boolean(data.hasDeadline),
    endsAt: (data.endsAt as Timestamp) || null,
    totalBallots: Math.max(0, Number(data.totalBallots || 0)),
    commentsCount: Math.max(0, Number(data.commentsCount || 0)),
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
  nowMs = Date.now()
): boolean {
  if (isAdmin) return true;
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
  if (!canRead || poll.options.length === 0) {
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
  return rawOptions
    .map((opt, idx) => {
      const cleanId =
        (opt.id || `opt_${idx + 1}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) ||
        `opt_${idx + 1}`;
      const cleanLabel = opt.label.trim().slice(0, 160);
      const cleanSubtitle = (opt.subtitle || '').trim().slice(0, 160);
      const cleanImageUrl = (opt.imageUrl || '').trim().slice(0, 500);
      const cleanColor =
        opt.color && opt.color.trim() ? opt.color.trim().slice(0, 30) : palette[idx % palette.length];

      const obj: PollOption = {
        id: cleanId,
        label: cleanLabel,
        color: cleanColor,
      };
      if (cleanSubtitle) obj.subtitle = cleanSubtitle;
      if (cleanImageUrl) obj.imageUrl = cleanImageUrl;
      return obj;
    })
    .filter((opt) => opt.label.length >= 1)
    .slice(0, questionType === 'rating' ? 5 : 12);
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

  const pollDocPayload: Record<string, unknown> = {
    pollId,
    question: cleanQuestion,
    description: input.description.trim().slice(0, 1500),
    category: input.category,
    questionType: input.questionType,
    pollStyle: input.pollStyle,
    institutionName: input.institutionName.trim().slice(0, 120),
    options,
    optionIds: options.map((o) => o.id),
    maxChoices,
    status: input.status,
    resultsVisibility: input.resultsVisibility,
    allowVoteChange: Boolean(input.allowVoteChange),
    anonymousMode: Boolean(input.anonymousMode),
    showVoterCount: Boolean(input.showVoterCount),
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

  try {
    await batch.commit();
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

  batch.update(pollRef, {
    question: cleanQuestion,
    description: input.description.trim().slice(0, 1500),
    imageUrl: validImageUrl,
    category: input.category,
    questionType: input.questionType,
    pollStyle: input.pollStyle,
    institutionName: input.institutionName.trim().slice(0, 120),
    options,
    optionIds: options.map((o) => o.id),
    maxChoices,
    status: input.status,
    resultsVisibility: input.resultsVisibility,
    allowVoteChange: Boolean(input.allowVoteChange),
    anonymousMode: Boolean(input.anonymousMode),
    showVoterCount: Boolean(input.showVoterCount),
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
