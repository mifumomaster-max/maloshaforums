import { Topic, getMakalaSection, normalizeBoardCategory, resolveMakalaCover } from '../types';
import { extractEditorialPreview } from './editorialFormatter';

const BUILTIN_COVER_PUBLIC_FILES = [
  'makala_tech_africa_1794671923666.jpg',
  'makala_kilimo_kisasa_1794671924292.jpg',
  'makala_nishati_jua_1794671924767.jpg',
  'makala_elimu_vijana_1794671924801.jpg',
];

export interface MakalaSocialSharePayload {
  shareUrl: string;
  title: string;
  excerpt: string;
  section: string;
  authorName: string;
  imageUrl: string;
  hasArticleImage: boolean;
  hashtags: string[];
  fullCaption: string;
  shortTweetCaption: string;
}

export function extractFirstMarkdownImageUrl(body: string): string {
  const match = body.match(/!\[[^\]]*\]\((https:\/\/[^\s)]+)\)/i);
  return match?.[1]?.trim() || '';
}

export function toAbsoluteSocialImageUrl(rawUrl: string, origin: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  for (const file of BUILTIN_COVER_PUBLIC_FILES) {
    const stem = file.replace(/\.jpg$/i, '');
    if (trimmed.includes(stem)) {
      return `${origin}/makala-covers/${file}`;
    }
  }

  const marker = '/image/upload/';
  if (trimmed.startsWith('https://res.cloudinary.com/') && trimmed.includes(marker)) {
    const idx = trimmed.indexOf(marker);
    const after = trimmed.slice(idx + marker.length);
    if (/^(?:[a-z_]+:[^/]+,?)+(\/|$)/i.test(after)) {
      return trimmed;
    }
    return `${trimmed.slice(0, idx + marker.length)}f_jpg,q_auto:good,w_1200,h_1200,c_limit/${after}`;
  }

  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed;
  }

  if (trimmed.startsWith('/')) {
    return `${origin}${trimmed}`;
  }

  return '';
}

export function resolveTopicShareImageUrl(topic: Topic, origin: string): {
  imageUrl: string;
  hasArticleImage: boolean;
} {
  const candidates: string[] = [];

  if (topic.coverImage) {
    candidates.push(resolveMakalaCover(topic.coverImage));
  }
  if (Array.isArray(topic.images) && topic.images.length > 0) {
    candidates.push(topic.images[0]);
  }
  const inlineImg = extractFirstMarkdownImageUrl(topic.body || '');
  if (inlineImg) {
    candidates.push(inlineImg);
  }

  for (const candidate of candidates) {
    const resolved = toAbsoluteSocialImageUrl(candidate, origin);
    if (resolved) {
      return { imageUrl: resolved, hasArticleImage: true };
    }
  }

  return {
    imageUrl: `${origin}/pwa-512x512.png`,
    hasArticleImage: false,
  };
}

function toCleanHashtag(raw: string): string {
  const cleaned = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  return cleaned ? `#${cleaned}` : '';
}

export function buildMakalaSocialPayload(
  topic: Topic,
  origin: string,
  lang: 'sw' | 'en' = 'sw'
): MakalaSocialSharePayload {
  const isMakala = normalizeBoardCategory(topic.category) === 'Makala';
  const shareUrl = isMakala
    ? `${origin}/m/${topic.id}`
    : `${origin}/?mada=${topic.id}`;

  const title =
    topic.title.trim() ||
    (lang === 'en' ? 'Featured Article on Malosha Forums' : 'Makala Kwenye Malosha Forums');

  const section = isMakala ? getMakalaSection(topic.tags || [], title) : topic.category;
  const preview = extractEditorialPreview(topic.body || '');
  let excerpt = preview.leadText.trim();
  if (excerpt.length > 220) {
    const cut = excerpt.slice(0, 217);
    const spaceIdx = cut.lastIndexOf(' ');
    excerpt = `${(spaceIdx > 120 ? cut.slice(0, spaceIdx) : cut).trim()}…`;
  }

  const authorName = (topic.authorName || 'Malosha Forums').trim();
  const { imageUrl, hasArticleImage } = resolveTopicShareImageUrl(topic, origin);

  const tagSet = new Set<string>(['#MaloshaForums']);
  const secTag = toCleanHashtag(section);
  if (secTag) tagSet.add(secTag);
  for (const t of topic.tags || []) {
    if (tagSet.size >= 5) break;
    const formatted = toCleanHashtag(t);
    if (formatted) tagSet.add(formatted);
  }
  const hashtags = Array.from(tagSet);

  const lines: string[] = [`📰 ${title}`];
  if (excerpt) {
    lines.push('', excerpt);
  }
  lines.push(
    '',
    lang === 'en'
      ? `✍️ By ${authorName} · ${section} | Malosha Forums`
      : `✍️ Na ${authorName} · ${section} | Malosha Forums`,
    lang === 'en' ? `👉 Read full article: ${shareUrl}` : `👉 Soma makala kamili: ${shareUrl}`,
    '',
    hashtags.join(' ')
  );

  const fullCaption = lines.join('\n');

  const tweetPrefix = `📰 ${title}`;
  const tweetRoom = 230 - tweetPrefix.length;
  const tweetExcerpt =
    excerpt && tweetRoom > 45
      ? `\n\n${excerpt.slice(0, Math.max(40, tweetRoom - 4)).trim()}…`
      : '';
  const shortTweetCaption = `${tweetPrefix}${tweetExcerpt}\n\n${hashtags.slice(0, 2).join(' ')}`;

  return {
    shareUrl,
    title,
    excerpt,
    section,
    authorName,
    imageUrl,
    hasArticleImage,
    hashtags,
    fullCaption,
    shortTweetCaption,
  };
}

export async function fetchShareImageFile(
  imageUrl: string,
  title: string
): Promise<File | null> {
  if (!imageUrl) return null;
  const safeBase =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'makala-malosha';

  try {
    const res = await fetch(imageUrl, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob || blob.size === 0) return null;

    if (blob.type === 'image/jpeg' || blob.type === 'image/png') {
      const ext = blob.type === 'image/png' ? 'png' : 'jpg';
      return new File([blob], `${safeBase}.${ext}`, { type: blob.type });
    }

    // Normalize WEBP or unknown image blobs to standard JPEG so Facebook/Instagram/WhatsApp accept it cleanly
    if (typeof document !== 'undefined' && typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width || 1200;
        canvas.height = bitmap.height || 630;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(bitmap, 0, 0);
          bitmap.close();
          const jpgBlob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, 'image/jpeg', 0.92)
          );
          if (jpgBlob && jpgBlob.size > 0) {
            return new File([jpgBlob], `${safeBase}.jpg`, { type: 'image/jpeg' });
          }
        } else {
          bitmap.close();
        }
      } catch {
        // Fallback below
      }
    }

    return new File([blob], `${safeBase}.jpg`, { type: blob.type || 'image/jpeg' });
  } catch {
    return null;
  }
}
