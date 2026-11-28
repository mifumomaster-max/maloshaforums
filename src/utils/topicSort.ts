import { SortMode, Topic } from '../types';

function getCreatedMillis(topic: Topic): number {
  return topic.createdAt ? topic.createdAt.toMillis() : Date.now();
}

function getActivityMillis(topic: Topic): number {
  return topic.lastActivityAt ? topic.lastActivityAt.toMillis() : getCreatedMillis(topic);
}

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createMulberry32(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fisherYatesShuffle<T>(items: T[], seed: number): T[] {
  const copy = [...items];
  const rand = createMulberry32(seed);
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

const FRESH_TOP_WINDOW_MS = 12 * 60 * 60 * 1000;

export function sortTopicsList(
  list: Topic[],
  sortMode: SortMode,
  mixSeed = 1,
  previousTopId?: string
): Topic[] {
  if (sortMode === 'votes') {
    return [...list].sort((a, b) => {
      if (b.upvotesCount !== a.upvotesCount) {
        return b.upvotesCount - a.upvotesCount;
      }
      if (b.repliesCount !== a.repliesCount) {
        return b.repliesCount - a.repliesCount;
      }
      const diff = getCreatedMillis(b) - getCreatedMillis(a);
      return diff !== 0 ? diff : b.id.localeCompare(a.id);
    });
  }

  if (sortMode === 'oldest') {
    return [...list].sort((a, b) => {
      const diff = getCreatedMillis(a) - getCreatedMillis(b);
      if (diff !== 0) return diff;
      return a.id.localeCompare(b.id);
    });
  }

  const newestFirst = [...list].sort((a, b) => {
    const diff = getCreatedMillis(b) - getCreatedMillis(a);
    if (diff !== 0) return diff;
    const actDiff = getActivityMillis(b) - getActivityMillis(a);
    return actDiff !== 0 ? actDiff : b.id.localeCompare(a.id);
  });

  if (sortMode !== 'mixed' || newestFirst.length <= 3) {
    if (sortMode === 'newest' && newestFirst.length > 1) {
      const nowMs = Date.now();
      const fresh12h: Topic[] = [];
      const olderThan12h: Topic[] = [];

      for (const item of newestFirst) {
        if (nowMs - getCreatedMillis(item) <= FRESH_TOP_WINDOW_MS) {
          fresh12h.push(item);
        } else {
          olderThan12h.push(item);
        }
      }

      const shuffledOlderFirst100 =
        olderThan12h.length > 1
          ? fisherYatesShuffle(olderThan12h.slice(0, 100), mixSeed)
          : olderThan12h.slice(0, 100);

      if (
        fresh12h.length === 0 &&
        previousTopId &&
        shuffledOlderFirst100.length > 1 &&
        shuffledOlderFirst100[0]?.id === previousTopId
      ) {
        const rand = createMulberry32(mixSeed ^ 0x9e3779b9);
        const swapPool = Math.min(shuffledOlderFirst100.length - 1, 20);
        const swapIdx = 1 + Math.floor(rand() * swapPool);
        const tmp = shuffledOlderFirst100[0];
        shuffledOlderFirst100[0] = shuffledOlderFirst100[swapIdx];
        shuffledOlderFirst100[swapIdx] = tmp;
      }

      const restOlder = olderThan12h.slice(100);
      return [...fresh12h, ...shuffledOlderFirst100, ...restOlder];
    }
    return newestFirst;
  }

  const n = newestFirst.length;
  const q1 = Math.max(1, Math.floor(n * 0.25));
  const q2 = Math.max(q1 + 1, Math.floor(n * 0.5));
  const q3 = Math.max(q2 + 1, Math.floor(n * 0.75));

  const newestBand = newestFirst.slice(0, q1);
  const midNewBand = newestFirst.slice(q1, q2);
  const midOldBand = newestFirst.slice(q2, q3);
  const oldestBand = newestFirst.slice(q3).reverse();

  const arrangeBand = (band: Topic[]) => {
    if (mixSeed <= 1 || band.length <= 1) return band;
    return [...band].sort(
      (a, b) => stableHash(`${a.id}:${mixSeed}`) - stableHash(`${b.id}:${mixSeed}`)
    );
  };

  const buckets = [
    arrangeBand(newestBand),
    arrangeBand(oldestBand),
    arrangeBand(midNewBand),
    arrangeBand(midOldBand),
  ].filter((b) => b.length > 0);

  const mixed: Topic[] = [];
  let round = 0;
  while (mixed.length < n) {
    let addedInRound = false;
    for (const bucket of buckets) {
      if (round < bucket.length) {
        mixed.push(bucket[round]);
        addedInRound = true;
      }
    }
    if (!addedInRound) break;
    round += 1;
  }

  return mixed;
}
