import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ViteDevServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface FirebaseAppletConfig {
  projectId: string;
  firestoreDatabaseId: string;
  apiKey: string;
}

interface PublicTopicRecord {
  id: string;
  title: string;
  body: string;
  category: string;
  authorName: string;
  coverImage: string;
  images: string[];
  tags: string[];
  status: string;
  createdAtIso: string;
}

const PORT = Number(process.env.PORT) || 3000;
const distDir = path.join(__dirname, 'dist');
const distIndexHtmlPath = path.join(distDir, 'index.html');
const isTsxRuntime = process.execArgv.some((arg) => arg.includes('tsx'));
const IS_PRODUCTION =
  process.env.NODE_ENV === 'production' ||
  process.env.npm_lifecycle_event === 'start' ||
  (!isTsxRuntime && fs.existsSync(distIndexHtmlPath));

const BUILTIN_COVER_FILES = [
  'makala_tech_africa_1794671923666.jpg',
  'makala_kilimo_kisasa_1794671924292.jpg',
  'makala_nishati_jua_1794671924767.jpg',
  'makala_elimu_vijana_1794671924801.jpg',
];

const TOPIC_CACHE_TTL_MS = 45_000;
const topicCache = new Map<string, { expiresAt: number; data: PublicTopicRecord | null }>();

function loadFirebaseConfig(): FirebaseAppletConfig | null {
  try {
    const cfgPath = path.join(__dirname, 'firebase-applet-config.json');
    if (!fs.existsSync(cfgPath)) return null;
    const raw = fs.readFileSync(cfgPath, 'utf8');
    return JSON.parse(raw) as FirebaseAppletConfig;
  } catch (err) {
    console.warn('Could not load firebase-applet-config.json:', err);
    return null;
  }
}

const firebaseCfg = loadFirebaseConfig();

function decodeFirestoreValue(val: unknown): unknown {
  if (!val || typeof val !== 'object') return undefined;
  const v = val as Record<string, unknown>;
  if ('stringValue' in v) return String(v.stringValue ?? '');
  if ('integerValue' in v) return Number(v.integerValue ?? 0);
  if ('doubleValue' in v) return Number(v.doubleValue ?? 0);
  if ('booleanValue' in v) return Boolean(v.booleanValue);
  if ('timestampValue' in v) return String(v.timestampValue ?? '');
  if ('nullValue' in v) return null;
  if ('arrayValue' in v && v.arrayValue && typeof v.arrayValue === 'object') {
    const arr = (v.arrayValue as { values?: unknown[] }).values;
    return Array.isArray(arr) ? arr.map(decodeFirestoreValue) : [];
  }
  if ('mapValue' in v && v.mapValue && typeof v.mapValue === 'object') {
    const fields = (v.mapValue as { fields?: Record<string, unknown> }).fields || {};
    const out: Record<string, unknown> = {};
    for (const [k, fv] of Object.entries(fields)) {
      out[k] = decodeFirestoreValue(fv);
    }
    return out;
  }
  return undefined;
}

async function fetchPublicTopicById(topicId: string): Promise<PublicTopicRecord | null> {
  if (!/^[a-zA-Z0-9_-]{2,128}$/.test(topicId)) return null;
  if (!firebaseCfg?.projectId || !firebaseCfg?.firestoreDatabaseId || !firebaseCfg?.apiKey) {
    return null;
  }

  const cached = topicCache.get(topicId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      firebaseCfg.projectId
    )}/databases/${encodeURIComponent(
      firebaseCfg.firestoreDatabaseId
    )}/documents/topics/${encodeURIComponent(topicId)}?key=${encodeURIComponent(
      firebaseCfg.apiKey
    )}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(3500),
    });

    if (!res.ok) {
      topicCache.set(topicId, { expiresAt: Date.now() + 10_000, data: null });
      return null;
    }

    const doc = (await res.json()) as { fields?: Record<string, unknown> };
    const f = doc.fields || {};
    const status = String(decodeFirestoreValue(f.status) || 'open');

    if (status !== 'open' && status !== 'locked') {
      topicCache.set(topicId, { expiresAt: Date.now() + TOPIC_CACHE_TTL_MS, data: null });
      return null;
    }

    const imagesRaw = decodeFirestoreValue(f.images);
    const tagsRaw = decodeFirestoreValue(f.tags);

    const record: PublicTopicRecord = {
      id: topicId,
      title: String(decodeFirestoreValue(f.title) || '').trim(),
      body: String(decodeFirestoreValue(f.body) || ''),
      category: String(decodeFirestoreValue(f.category) || 'Kijiweni'),
      authorName: String(decodeFirestoreValue(f.authorName) || 'Mwandishi').trim(),
      coverImage: String(decodeFirestoreValue(f.coverImage) || '').trim(),
      images: Array.isArray(imagesRaw)
        ? imagesRaw.filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
        : [],
      tags: Array.isArray(tagsRaw)
        ? tagsRaw.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
        : [],
      status,
      createdAtIso: String(decodeFirestoreValue(f.createdAt) || ''),
    };

    topicCache.set(topicId, { expiresAt: Date.now() + TOPIC_CACHE_TTL_MS, data: record });
    return record;
  } catch {
    return null;
  }
}

function getRequestOrigin(req: Request): string {
  const envOrigin = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  const rawHost = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim();
  const rawProto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https')
    .split(',')[0]
    .trim()
    .toLowerCase();

  if (rawHost) {
    const isLocal =
      rawHost.startsWith('localhost') ||
      rawHost.startsWith('127.0.0.1') ||
      rawHost.startsWith('0.0.0.0');
    const proto = isLocal ? rawProto || 'http' : 'https';
    return `${proto}://${rawHost}`;
  }

  return envOrigin || `http://localhost:${PORT}`;
}

function toSocialJpgUrl(rawUrl: string, origin: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  for (const file of BUILTIN_COVER_FILES) {
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

function resolveTopicSocialImage(topic: PublicTopicRecord, origin: string): string {
  const candidates: string[] = [];
  if (topic.coverImage) candidates.push(topic.coverImage);
  if (topic.images.length > 0) candidates.push(topic.images[0]);

  const inlineMatch = topic.body.match(/!\[[^\]]*\]\((https:\/\/[^\s)]+)\)/i);
  if (inlineMatch?.[1]) {
    candidates.push(inlineMatch[1]);
  }

  for (const candidate of candidates) {
    const resolved = toSocialJpgUrl(candidate, origin);
    if (resolved) return resolved;
  }

  return `${origin}/pwa-512x512.png`;
}

function extractSocialDescription(body: string, authorName: string, isMakala: boolean): string {
  const clean = body
    .replace(/\r\n/g, '\n')
    .replace(/!\[[^\]]*\]\(https?:\/\/[^\s)]+\)/gi, ' ')
    .replace(/@\[video(?:\|[^\]]*)?\]\(https?:\/\/[^\s)]+\)/gi, ' ')
    .replace(/\[(?:color|bg)=#[0-9a-fA-F]{3,6}\]/gi, '')
    .replace(/\[\/(?:color|bg|u)\]/gi, '')
    .replace(/\[u\]/gi, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s*/gm, '')
    .replace(/^[-*_]{3,}$/gm, ' ')
    .replace(/[*`_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) {
    return isMakala
      ? `Soma makala kamili iliyoandikwa na ${authorName} kwenye Malosha Forums.`
      : `Shiriki na soma mjadala huu na ${authorName} kwenye Malosha Forums.`;
  }

  if (clean.length <= 185) return clean;
  const sliced = clean.slice(0, 182);
  const lastSpace = sliced.lastIndexOf(' ');
  return `${(lastSpace > 100 ? sliced.slice(0, lastSpace) : sliced).trim()}…`;
}

function isMakalaCategory(category: string, tags: string[]): boolean {
  const cat = category.trim().toLowerCase();
  if (
    cat === 'makala' ||
    cat === 'jamii intelligence' ||
    cat === 'teknolojia & sayansi' ||
    cat === 'teknolojia' ||
    cat === 'sayansi'
  ) {
    return true;
  }
  return tags.some((t) => t.trim().toLowerCase() === 'makala');
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function applySocialMetaToHtml(
  html: string,
  opts: {
    origin: string;
    canonicalUrl: string;
    title: string;
    description: string;
    imageUrl: string;
    imageAlt: string;
    ogType: 'website' | 'article';
    authorName?: string;
    section?: string;
    publishedIso?: string;
    topic?: PublicTopicRecord | null;
  }
): string {
  const safeTitle = escapeHtmlAttr(opts.title);
  const safeDesc = escapeHtmlAttr(opts.description);
  const safeUrl = escapeHtmlAttr(opts.canonicalUrl);
  const safeImg = escapeHtmlAttr(opts.imageUrl);
  const safeImgAlt = escapeHtmlAttr(opts.imageAlt);

  let out = html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`)
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="description" content="${safeDesc}" />`
    )
    .replace(
      /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:title" content="${safeTitle}" />`
    )
    .replace(
      /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:description" content="${safeDesc}" />`
    )
    .replace(
      /<meta\s+property="og:type"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:type" content="${opts.ogType}" />`
    )
    .replace(
      /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:image" content="${safeImg}" />`
    )
    .replace(
      /<meta\s+name="twitter:card"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="twitter:card" content="summary_large_image" />`
    )
    .replace(
      /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="twitter:title" content="${safeTitle}" />`
    )
    .replace(
      /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="twitter:description" content="${safeDesc}" />`
    )
    .replace(
      /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="twitter:image" content="${safeImg}" />`
    );

  const extraTags: string[] = [
    `<link rel="canonical" href="${safeUrl}" />`,
    `<meta property="og:url" content="${safeUrl}" />`,
    `<meta property="og:image:secure_url" content="${safeImg}" />`,
    `<meta property="og:image:alt" content="${safeImgAlt}" />`,
    `<meta name="twitter:image:alt" content="${safeImgAlt}" />`,
    `<meta property="og:locale" content="sw_TZ" />`,
  ];

  if (/\.(jpe?g)(\?|$)/i.test(opts.imageUrl) || opts.imageUrl.includes('f_jpg')) {
    extraTags.push(`<meta property="og:image:type" content="image/jpeg" />`);
  } else if (/\.png(\?|$)/i.test(opts.imageUrl)) {
    extraTags.push(`<meta property="og:image:type" content="image/png" />`);
  }

  if (opts.ogType === 'article' && opts.topic) {
    if (opts.authorName) {
      extraTags.push(`<meta property="article:author" content="${escapeHtmlAttr(opts.authorName)}" />`);
    }
    if (opts.section) {
      extraTags.push(`<meta property="article:section" content="${escapeHtmlAttr(opts.section)}" />`);
    }
    if (opts.publishedIso) {
      extraTags.push(
        `<meta property="article:published_time" content="${escapeHtmlAttr(opts.publishedIso)}" />`
      );
    }

    const articleLd = {
      '@context': 'https://schema.org',
      '@type': 'NewsArticle',
      headline: opts.topic.title || opts.title,
      description: opts.description,
      image: [opts.imageUrl],
      datePublished: opts.publishedIso || undefined,
      author: {
        '@type': 'Person',
        name: opts.topic.authorName,
      },
      publisher: {
        '@type': 'Organization',
        name: 'Malosha Forums',
        logo: {
          '@type': 'ImageObject',
          url: `${opts.origin}/pwa-512x512.png`,
        },
      },
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': opts.canonicalUrl,
      },
    };
    extraTags.push(`<script type="application/ld+json">${escapeJsonLd(articleLd)}</script>`);
  }

  out = out.replace('</head>', `    ${extraTags.join('\n    ')}\n  </head>`);
  return out;
}

async function startServer() {
  const app = express();
  app.set('trust proxy', true);
  const httpServer = http.createServer(app);

  let vite: ViteDevServer | null = null;
  if (!IS_PRODUCTION) {
    try {
      const { createServer } = await import('vite');
      vite = await createServer({
        server: {
          middlewareMode: { server: httpServer },
          ws: { server: httpServer },
          hmr: false,
          watch: null,
          allowedHosts: true,
        },
        appType: 'custom',
      });
    } catch (err) {
      console.warn('Vite dev server unavailable, falling back to static dist:', err);
    }
  }

  async function renderHtmlWithSocialMeta(
    req: Request,
    res: Response,
    topicId: string | null
  ) {
    try {
      const origin = getRequestOrigin(req);
      const useDist = (IS_PRODUCTION || !vite) && fs.existsSync(distIndexHtmlPath);
      const htmlFilePath = useDist
        ? distIndexHtmlPath
        : path.join(__dirname, 'index.html');

      if (!fs.existsSync(htmlFilePath)) {
        res.status(503).send('Application build not found');
        return;
      }

      let rawHtml = fs.readFileSync(htmlFilePath, 'utf8');
      if (!useDist && vite) {
        rawHtml = await vite.transformIndexHtml(req.originalUrl, rawHtml);
      }

      if (topicId) {
        const topic = await fetchPublicTopicById(topicId);
        if (topic) {
          const makala = isMakalaCategory(topic.category, topic.tags);
          const canonicalUrl = makala
            ? `${origin}/m/${encodeURIComponent(topic.id)}`
            : `${origin}/?mada=${encodeURIComponent(topic.id)}`;
          const imageUrl = resolveTopicSocialImage(topic, origin);
          const cleanTitle = topic.title || (makala ? 'Makala — Malosha Forums' : 'Mjadala — Malosha Forums');
          const fullTitle = `${cleanTitle} | Malosha Forums`;
          const description = extractSocialDescription(topic.body, topic.authorName, makala);

          const finalHtml = applySocialMetaToHtml(rawHtml, {
            origin,
            canonicalUrl,
            title: fullTitle,
            description,
            imageUrl,
            imageAlt: cleanTitle,
            ogType: 'article',
            authorName: topic.authorName,
            section: makala ? 'Makala' : topic.category,
            publishedIso: topic.createdAtIso,
            topic,
          });

          res
            .status(200)
            .set({
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'public, max-age=30, stale-while-revalidate=120',
            })
            .end(finalHtml);
          return;
        }
      }

      const defaultTitle = 'Malosha Forums — Jukwaa la Mijadala';
      const defaultDesc =
        'Mfumo wa kisasa wa mijadala, makala, fursa, video fupi, na Mchart kwa usalama na ufanisi.';
      const cleanPath = req.path === '/' ? '/' : req.path;
      const finalHtml = applySocialMetaToHtml(rawHtml, {
        origin,
        canonicalUrl: `${origin}${cleanPath}`,
        title: defaultTitle,
        description: defaultDesc,
        imageUrl: `${origin}/pwa-512x512.png`,
        imageAlt: 'Malosha Forums',
        ogType: 'website',
      });

      res
        .status(200)
        .set({ 'Content-Type': 'text/html; charset=utf-8' })
        .end(finalHtml);
    } catch (err) {
      if (!IS_PRODUCTION && vite && err instanceof Error) {
        vite.ssrFixStacktrace(err);
      }
      res.status(500).send('Server error');
    }
  }

  // Dedicated dynamic OpenGraph routes for Makala & Topic links (before Vite/static fallback)
  app.get(['/m/:topicId', '/m/:topicId/'], async (req, res) => {
    const topicId = String(req.params.topicId || '').trim();
    await renderHtmlWithSocialMeta(req, res, topicId || null);
  });

  app.get('/', async (req, res) => {
    const queryTopicId =
      typeof req.query.m === 'string' && req.query.m.trim()
        ? req.query.m.trim()
        : typeof req.query.mada === 'string' && req.query.mada.trim()
          ? req.query.mada.trim()
          : null;
    await renderHtmlWithSocialMeta(req, res, queryTopicId);
  });

  app.get('/healthz', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  if (!IS_PRODUCTION && vite) {
    app.use(vite.middlewares);
  } else if (fs.existsSync(distDir)) {
    app.use(express.static(distDir, { index: false }));
  }

  app.use(async (req, res, next) => {
    if (req.method !== 'GET' || req.path.includes('.')) {
      next();
      return;
    }
    const queryTopicId =
      typeof req.query.m === 'string' && req.query.m.trim()
        ? req.query.m.trim()
        : typeof req.query.mada === 'string' && req.query.mada.trim()
          ? req.query.mada.trim()
          : null;
    await renderHtmlWithSocialMeta(req, res, queryTopicId);
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Malosha Forums server running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
