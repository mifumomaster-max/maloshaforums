import { Timestamp } from 'firebase/firestore';
import { Topic } from '../types';
import { buildMakalaSocialPayload, fetchShareImageFile } from './makalaSocialShare';

export function formatRelativeSwahili(ts: Timestamp | null | undefined): string {
  if (!ts) return 'Sasa hivi';
  const date = ts.toDate();
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));

  if (diffSec < 45) return 'Sasa hivi';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return diffMin === 1 ? 'Dakika 1 iliyopita' : `Dakika ${diffMin} zilizopita`;
  }
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return diffHours === 1 ? 'Saa 1 iliyopita' : `Saa ${diffHours} zilizopita`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) {
    return diffDays === 1 ? 'Jana' : `Siku ${diffDays} zilizopita`;
  }

  return new Intl.DateTimeFormat('sw-TZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function sanitizeTextInput(value: string, maxLength: number): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

export function parseTagsInput(raw: string): string[] {
  const parts = raw
    .split(',')
    .map((t) =>
      t
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .trim()
        .toLowerCase()
        .slice(0, 30)
    )
    .filter((t) => t.length >= 1);

  return Array.from(new Set(parts)).slice(0, 5);
}

export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'M';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function estimateReadMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 180));
}

export async function shareTopic(
  topic: Topic,
  onResult: (message: string) => void,
  lang: 'sw' | 'en' = 'sw'
): Promise<boolean> {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const payload = buildMakalaSocialPayload(topic, origin, lang);

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(payload.fullCaption).catch(() => {});
  }

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      if (payload.hasArticleImage) {
        const imgFile = await fetchShareImageFile(payload.imageUrl, payload.title);
        if (
          imgFile &&
          typeof navigator.canShare === 'function' &&
          navigator.canShare({ files: [imgFile] })
        ) {
          await navigator.share({
            files: [imgFile],
            title: payload.title,
            text: payload.fullCaption,
            url: payload.shareUrl,
          });
          onResult(lang === 'en' ? 'Shared with photo!' : 'Umeshiriki pamoja na picha!');
          return true;
        }
      }

      await navigator.share({
        title: payload.title,
        text: payload.fullCaption,
        url: payload.shareUrl,
      });
      onResult(lang === 'en' ? 'Shared successfully!' : 'Umeshiriki chapisho hili!');
      return true;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return false;
    }
  }

  try {
    await navigator.clipboard.writeText(payload.fullCaption);
    onResult(
      lang === 'en'
        ? 'Complete post & link copied!'
        : 'Chapisho kamili na kiungo vimenakiliwa!'
    );
    return true;
  } catch {
    onResult(
      lang === 'en'
        ? 'Link ready: copy the URL from your browser address bar.'
        : 'Kiungo tayari: tumia anwani ya kivinjari chako kushiriki.'
    );
    return true;
  }
}
