export type EditorialBlock =
  | { type: 'h2'; id: string; text: string }
  | { type: 'h3'; id: string; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'numbered'; items: { num: string; text: string }[] }
  | { type: 'quote'; lines: string[] }
  | { type: 'image'; url: string; caption?: string }
  | { type: 'video'; url: string; caption?: string }
  | { type: 'divider' };

export type StandaloneMediaToken =
  | { type: 'image'; url: string; caption: string }
  | { type: 'video'; url: string; caption: string };

export function parseStandaloneMediaToken(trimmed: string): StandaloneMediaToken | null {
  const clean = trimmed.trim();
  const imgMatch = clean.match(/^!\[([^\]]*)\]\((https:\/\/[^\s)]+)\)$/i);
  if (imgMatch) {
    const rawCap = (imgMatch[1] || '').trim();
    const caption = /^(picha|image|photo)$/i.test(rawCap) ? '' : rawCap;
    return { type: 'image', url: imgMatch[2].trim(), caption };
  }
  const vidMatch = clean.match(/^@\[video(?:\|([^\]]*))?\]\((https:\/\/[^\s)]+)\)$/i);
  if (vidMatch) {
    return {
      type: 'video',
      url: vidMatch[2].trim(),
      caption: (vidMatch[1] || '').trim(),
    };
  }
  return null;
}

function slugifyHeading(text: string, index: number): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 36);
  return `sec-${index}-${base || 'part'}`;
}

function isBulletLine(trimmed: string): string | null {
  const match = trimmed.match(/^(?:[-*•▪‣◦●]|–(?=\s))\s+(.+)$/);
  return match ? match[1].trim() : null;
}

function isNumberedLine(trimmed: string): { num: string; text: string } | null {
  const match = trimmed.match(/^(\d{1,2})[.)]\s+(.+)$/);
  if (!match) return null;
  return { num: match[1], text: match[2].trim() };
}

function isAllCapsHeadingCandidate(trimmed: string): boolean {
  if (trimmed.length < 4 || trimmed.length > 72) return false;
  if (/[.!?]$/.test(trimmed)) return false;
  if (/https?:\/\//i.test(trimmed)) return false;
  const lettersOnly = trimmed.replace(/[^a-zA-Z\u00C0-\u024F]/g, '');
  if (lettersOnly.length < 4) return false;
  return lettersOnly === lettersOnly.toUpperCase();
}

function isColonSubtitleCandidate(
  trimmed: string,
  prevTrimmed: string,
  nextTrimmed: string
): boolean {
  if (trimmed.length < 4 || trimmed.length > 78) return false;
  if (!trimmed.endsWith(':')) return false;
  if (/https?:\/\//i.test(trimmed)) return false;
  // Should stand on its own or sit right before bullets/numbered list/paragraph
  const prevClear = prevTrimmed === '' || isAllCapsHeadingCandidate(prevTrimmed);
  const nextIsContent =
    Boolean(isBulletLine(nextTrimmed)) ||
    Boolean(isNumberedLine(nextTrimmed)) ||
    nextTrimmed.length >= 20;
  return prevClear && nextIsContent;
}

function isStandaloneShortHeadingCandidate(
  trimmed: string,
  prevTrimmed: string,
  nextTrimmed: string
): boolean {
  if (trimmed.length < 5 || trimmed.length > 66) return false;
  if (prevTrimmed !== '' || nextTrimmed === '') return false;
  if (/[.!?;,]$/.test(trimmed)) return false;
  if (/https?:\/\//i.test(trimmed)) return false;
  if (isBulletLine(trimmed) || isNumberedLine(trimmed) || trimmed.startsWith('>')) return false;
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount > 10) return false;
  // Must be followed by real prose or a list
  const nextIsBody =
    Boolean(isBulletLine(nextTrimmed)) ||
    Boolean(isNumberedLine(nextTrimmed)) ||
    nextTrimmed.length > trimmed.length + 12;
  return nextIsBody;
}

function isStandaloneBoldHeadingCandidate(
  trimmed: string,
  prevTrimmed: string,
  nextTrimmed: string
): { level: 'h2' | 'h3'; text: string } | null {
  const match = trimmed.match(/^(?:\*\*([^*]{3,84})\*\*|__([^_]{3,84})__)$/);
  if (!match) return null;
  const inner = (match[1] || match[2] || '').trim();
  if (!inner || /https?:\/\//i.test(inner) || /[.!?;,]$/.test(inner)) return null;
  const wordCount = inner.split(/\s+/).length;
  if (wordCount > 12) return null;
  // Promote numbered/section bold headings or headings preceded by blank line to h2/h3
  if (/^\d{1,2}[.)]\s+/.test(inner) || prevTrimmed === '') {
    const isMajor =
      /^\d{1,2}[.)]\s+/.test(inner) || (wordCount <= 6 && nextTrimmed.length > 0);
    return { level: isMajor ? 'h2' : 'h3', text: inner };
  }
  return { level: 'h3', text: inner };
}

/**
 * Splits inline bullet characters (e.g. "Mambo muhimu: • Kwanza • Pili") into distinct lines
 * so pasted social/news drafts render as real scholarly bullet points on mobile and desktop.
 */
function preprocessEditorialLines(rawBody: string): string[] {
  const rawLines = rawBody.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) {
      out.push('');
      continue;
    }

    // Detect multiple inline bullets (•, ▪, ◦, ●) on a single line outside URLs
    const inlineBulletMatches = trimmed.match(/\s+[•▪◦●]\s+/g);
    if (inlineBulletMatches && inlineBulletMatches.length >= 1) {
      const parts = trimmed.split(/\s+(?=[•▪◦●]\s+)/);
      for (const part of parts) {
        const cleanPart = part.trim();
        if (!cleanPart) continue;
        // If intro ends with ':' right before bullets, keep as its own line so colon detector promotes it
        out.push(cleanPart);
      }
      continue;
    }

    out.push(trimmed);
  }

  return out;
}

/**
 * Breaks huge wall-of-text paragraphs (> 340 chars with 3+ sentences) into readable 2-3 sentence
 * paragraphs so phone readers never face a 20-line unbroken block.
 */
function splitOversizedParagraph(text: string): string[] {
  if (text.length <= 340) return [text];

  // Match sentence endings followed by whitespace and an uppercase letter/quote/digit
  const sentences = text
    .split(/(?<=[.!?]["”’)]?)\s+(?=[A-Z\u00C0-\u024F0-9“"'(])/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length < 3) return [text];

  const chunks: string[] = [];
  let current = '';
  let sentenceCount = 0;

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (current && (sentenceCount >= 2 || candidate.length > 290)) {
      chunks.push(current);
      current = sentence;
      sentenceCount = 1;
    } else {
      current = candidate;
      sentenceCount += 1;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.length > 0 ? chunks : [text];
}

/**
 * Parses both Markdown-formatted articles and plain pasted articles into clean
 * scholarly BBC-editorial blocks (section titles, subtitles, bullets, numbered lists, quotes, paragraphs).
 */
export function parseEditorialBlocks(rawBody: string): EditorialBlock[] {
  const lines = preprocessEditorialLines(rawBody);
  const blocks: EditorialBlock[] = [];

  let bulletItems: string[] = [];
  let numberedItems: { num: string; text: string }[] = [];
  let quoteLines: string[] = [];
  let headingIdx = 0;

  const flushBullets = () => {
    if (bulletItems.length > 0) {
      blocks.push({ type: 'bullets', items: [...bulletItems] });
      bulletItems = [];
    }
  };

  const flushNumbered = () => {
    if (numberedItems.length > 0) {
      blocks.push({ type: 'numbered', items: [...numberedItems] });
      numberedItems = [];
    }
  };

  const flushQuote = () => {
    if (quoteLines.length > 0) {
      blocks.push({ type: 'quote', lines: [...quoteLines] });
      quoteLines = [];
    }
  };

  const flushAllListsAndQuotes = () => {
    flushBullets();
    flushNumbered();
    flushQuote();
  };

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const prevTrimmed = i > 0 ? lines[i - 1].trim() : '';
    const nextTrimmed = i + 1 < lines.length ? lines[i + 1].trim() : '';

    if (!trimmed) {
      flushAllListsAndQuotes();
      continue;
    }

    // Standalone Inline Image or Video Media Block
    const mediaToken = parseStandaloneMediaToken(trimmed);
    if (mediaToken) {
      flushAllListsAndQuotes();
      if (mediaToken.type === 'image') {
        blocks.push({
          type: 'image',
          url: mediaToken.url,
          ...(mediaToken.caption ? { caption: mediaToken.caption } : {}),
        });
      } else {
        blocks.push({
          type: 'video',
          url: mediaToken.url,
          ...(mediaToken.caption ? { caption: mediaToken.caption } : {}),
        });
      }
      continue;
    }

    // Horizontal rule
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushAllListsAndQuotes();
      blocks.push({ type: 'divider' });
      continue;
    }

    // Explicit Markdown Headings
    const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (hMatch) {
      flushAllListsAndQuotes();
      const level = hMatch[1].length;
      const text = hMatch[2].trim();
      if (level <= 2) {
        blocks.push({ type: 'h2', id: slugifyHeading(text, headingIdx++), text });
      } else {
        blocks.push({ type: 'h3', id: slugifyHeading(text, headingIdx++), text });
      }
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const qText = trimmed.replace(/^>\s*/, '').trim();
      if (qText) {
        flushBullets();
        flushNumbered();
        quoteLines.push(qText);
        continue;
      }
    }

    // Bullet item
    const bulletText = isBulletLine(trimmed);
    if (bulletText) {
      flushNumbered();
      flushQuote();
      bulletItems.push(bulletText);
      continue;
    }

    // Numbered item — check whether this is part of a numbered list or a standalone numbered section title
    const numItem = isNumberedLine(trimmed);
    if (numItem) {
      const nextIsNum = Boolean(isNumberedLine(nextTrimmed));
      const inNumList = numberedItems.length > 0;
      const nextIsBlankThenNum =
        nextTrimmed === '' &&
        i + 2 < lines.length &&
        Boolean(isNumberedLine(lines[i + 2].trim()));

      if (inNumList || nextIsNum || nextIsBlankThenNum || numItem.text.length > 68) {
        flushBullets();
        flushQuote();
        numberedItems.push(numItem);
        continue;
      } else {
        // Single short numbered section header like "1. Utangulizi" followed by paragraph
        flushAllListsAndQuotes();
        const headingText = `${numItem.num}. ${numItem.text}`;
        blocks.push({ type: 'h2', id: slugifyHeading(headingText, headingIdx++), text: headingText });
        continue;
      }
    }

    // Standalone bold line (**Utangulizi** / **1. Sababu Kuu**)
    const boldHeading = isStandaloneBoldHeadingCandidate(trimmed, prevTrimmed, nextTrimmed);
    if (boldHeading) {
      flushAllListsAndQuotes();
      blocks.push({
        type: boldHeading.level,
        id: slugifyHeading(boldHeading.text, headingIdx++),
        text: boldHeading.text,
      });
      continue;
    }

    // Natural pasted ALL CAPS heading
    if (isAllCapsHeadingCandidate(trimmed) && (prevTrimmed === '' || i === 0)) {
      flushAllListsAndQuotes();
      blocks.push({ type: 'h2', id: slugifyHeading(trimmed, headingIdx++), text: trimmed });
      continue;
    }

    // Natural pasted Subtitle ending in ":"
    if (isColonSubtitleCandidate(trimmed, prevTrimmed, nextTrimmed)) {
      flushAllListsAndQuotes();
      const cleanSub = trimmed.slice(0, -1).trim();
      blocks.push({ type: 'h3', id: slugifyHeading(cleanSub, headingIdx++), text: cleanSub });
      continue;
    }

    // Natural pasted standalone short heading between blank lines
    if (isStandaloneShortHeadingCandidate(trimmed, prevTrimmed, nextTrimmed)) {
      flushAllListsAndQuotes();
      blocks.push({ type: 'h3', id: slugifyHeading(trimmed, headingIdx++), text: trimmed });
      continue;
    }

    // Standard Narrative Paragraph (split oversized dense blocks for comfortable mobile reading)
    flushAllListsAndQuotes();
    for (const paraChunk of splitOversizedParagraph(trimmed)) {
      blocks.push({ type: 'paragraph', text: paraChunk });
    }
  }

  flushAllListsAndQuotes();
  return blocks;
}

/**
 * Cleans up raw pasted article text into clean structured Markdown (## Titles, ### Subtitles,
 * - Bullets, 1. Lists, and cleanly spaced paragraphs) for the composer's "Panga Kisomi" button.
 */
export function autoFormatScholarlyText(rawBody: string): string {
  const blocks = parseEditorialBlocks(rawBody);
  const chunks: string[] = [];

  for (const block of blocks) {
    if (block.type === 'h2') {
      chunks.push(`## ${block.text}`);
    } else if (block.type === 'h3') {
      chunks.push(`### ${block.text}`);
    } else if (block.type === 'bullets') {
      chunks.push(block.items.map((item) => `- ${item}`).join('\n'));
    } else if (block.type === 'numbered') {
      chunks.push(block.items.map((item) => `${item.num}. ${item.text}`).join('\n'));
    } else if (block.type === 'quote') {
      chunks.push(block.lines.map((l) => `> ${l}`).join('\n'));
    } else if (block.type === 'image') {
      chunks.push(`![${block.caption || 'Picha'}](${block.url})`);
    } else if (block.type === 'video') {
      chunks.push(block.caption ? `@[video|${block.caption}](${block.url})` : `@[video](${block.url})`);
    } else if (block.type === 'divider') {
      chunks.push('---');
    } else {
      chunks.push(block.text);
    }
  }

  return chunks.join('\n\n').trim();
}

/**
 * Extracts a crisp editorial excerpt and optional key bullet preview for Makala newsroom cards.
 */
export function extractEditorialPreview(rawBody: string): {
  leadText: string;
  bulletHighlights: string[];
  sectionCount: number;
} {
  const blocks = parseEditorialBlocks(rawBody);
  const firstPara = blocks.find((b) => b.type === 'paragraph');
  const firstQuote = blocks.find((b) => b.type === 'quote');
  const bulletsBlock = blocks.find((b) => b.type === 'bullets');
  const numberedBlock = blocks.find((b) => b.type === 'numbered');
  const sectionCount = blocks.filter((b) => b.type === 'h2' || b.type === 'h3').length;

  const cleanInline = (s: string) =>
    s
      .replace(/!\[[^\]]*\]\(https:\/\/[^\s)]+\)/gi, '')
      .replace(/@\[video(?:\|[^\]]*)?\]\(https:\/\/[^\s)]+\)/gi, '')
      .replace(/\[(?:color|bg)=#[0-9a-fA-F]{3,6}\]/gi, '')
      .replace(/\[\/(?:color|bg|u)\]/gi, '')
      .replace(/\[u\]/gi, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  let leadText = '';
  if (firstPara && firstPara.type === 'paragraph') {
    leadText = cleanInline(firstPara.text);
  } else if (firstQuote && firstQuote.type === 'quote') {
    leadText = cleanInline(firstQuote.lines.join(' '));
  } else {
    leadText = cleanInline(rawBody.replace(/[#>*_-]/g, ' '));
  }

  const bulletHighlights: string[] = [];
  if (bulletsBlock && bulletsBlock.type === 'bullets') {
    bulletHighlights.push(...bulletsBlock.items.slice(0, 2).map(cleanInline));
  } else if (numberedBlock && numberedBlock.type === 'numbered') {
    bulletHighlights.push(...numberedBlock.items.slice(0, 2).map((i) => cleanInline(i.text)));
  }

  return { leadText, bulletHighlights, sectionCount };
}

function stripInlineFormattingForMeasure(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\(https:\/\/[^\s)]+\)/gi, '')
    .replace(/@\[video(?:\|[^\]]*)?\]\(https:\/\/[^\s)]+\)/gi, '')
    .replace(/\[(?:color|bg)=#[0-9a-fA-F]{3,6}\]/gi, '')
    .replace(/\[\/(?:color|bg|u)\]/gi, '')
    .replace(/\[u\]/gi, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^(?:#{1,4}|>|[-*•▪‣]|–|\d{1,2}[.)])\s+/gm, '')
    .replace(/[*`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sliceTaggedLineSafely(
  line: string,
  budget: number
): { text: string; consumed: number; hitLimit: boolean } {
  if (budget <= 0) return { text: '', consumed: 0, hitLimit: true };

  const prefixMatch = line.match(/^((?:#{1,4}|>|[-*•▪‣]|–|\d{1,2}[.)])\s+)?(.*)$/);
  const blockPrefix = prefixMatch?.[1] || '';
  const bodyPart = prefixMatch?.[2] || line;

  const tokenRegex =
    /(\[color=#[0-9a-fA-F]{3,6}\].+?\[\/color\]|\[bg=#[0-9a-fA-F]{3,6}\].+?\[\/bg\]|\[u\].+?\[\/u\]|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\S+)/gi;

  let out = '';
  let consumed = 0;
  let hitLimit = false;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(bodyPart)) !== null) {
    const token = match[0];
    const visible = stripInlineFormattingForMeasure(token);
    if (!visible) continue;

    const spaceCost = out ? 1 : 0;
    if (consumed + spaceCost + visible.length <= budget) {
      out += (out ? ' ' : '') + token;
      consumed += spaceCost + visible.length;
      continue;
    }

    const remaining = budget - consumed - spaceCost;
    if (remaining >= 10) {
      const cutWordSafe = (plain: string) => {
        const sliced = plain.slice(0, remaining);
        const lastSpace = sliced.lastIndexOf(' ');
        return (lastSpace >= 8 ? sliced.slice(0, lastSpace) : sliced).trimEnd();
      };

      const colorMatch = token.match(/^(\[color=#[0-9a-fA-F]{3,6}\])(.+)\[\/color\]$/i);
      const bgMatch = token.match(/^(\[bg=#[0-9a-fA-F]{3,6}\])(.+)\[\/bg\]$/i);
      const uMatch = token.match(/^\[u\](.+)\[\/u\]$/i);

      if (colorMatch) {
        const snippet = cutWordSafe(stripInlineFormattingForMeasure(colorMatch[2]));
        if (snippet) out += (out ? ' ' : '') + `${colorMatch[1]}${snippet}[/color]`;
      } else if (bgMatch) {
        const snippet = cutWordSafe(stripInlineFormattingForMeasure(bgMatch[2]));
        if (snippet) out += (out ? ' ' : '') + `${bgMatch[1]}${snippet}[/bg]`;
      } else if (uMatch) {
        const snippet = cutWordSafe(stripInlineFormattingForMeasure(uMatch[1]));
        if (snippet) out += (out ? ' ' : '') + `[u]${snippet}[/u]`;
      } else if (token.startsWith('**') && token.endsWith('**')) {
        const snippet = cutWordSafe(stripInlineFormattingForMeasure(token.slice(2, -2)));
        if (snippet) out += (out ? ' ' : '') + `**${snippet}**`;
      } else if (token.startsWith('*') && token.endsWith('*')) {
        const snippet = cutWordSafe(stripInlineFormattingForMeasure(token.slice(1, -1)));
        if (snippet) out += (out ? ' ' : '') + `*${snippet}*`;
      } else if (token.startsWith('[') && token.includes('](') && token.endsWith(')')) {
        // Keep short links intact only if there's minimal overflow, otherwise omit cleanly
      } else {
        const snippet = cutWordSafe(visible);
        if (snippet) out += (out ? ' ' : '') + snippet;
      }
    }
    hitLimit = true;
    break;
  }

  return {
    text: out ? `${blockPrefix}${out}` : '',
    consumed,
    hitLimit,
  };
}

/**
 * Builds a concise, tag-safe preview excerpt for Kijiweni feed cards so long
 * descriptions stay brief (max ~2 lines / ~150 visible characters) until expanded
 * with "Soma zaidi".
 */
export function buildKijiweniExcerpt(
  rawBody: string,
  maxChars = 150,
  maxLines = 2
): { isTruncated: boolean; previewText: string; visibleLength: number } {
  const normalized = rawBody.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return { isTruncated: false, previewText: '', visibleLength: 0 };
  }

  const lines = normalized
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^(?:-{3,}|\*{3,}|_{3,})$/.test(l) && !parseStandaloneMediaToken(l));

  const fullVisible = stripInlineFormattingForMeasure(normalized);
  const visibleLength = fullVisible.length;

  if (visibleLength <= maxChars && lines.length <= maxLines) {
    return { isTruncated: false, previewText: rawBody, visibleLength };
  }

  const previewLines: string[] = [];
  let remaining = maxChars;
  let clipped = false;

  for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
    const res = sliceTaggedLineSafely(lines[i], remaining);
    if (res.text) {
      previewLines.push(res.text);
      remaining = Math.max(0, remaining - res.consumed - 1);
    }
    if (res.hitLimit) {
      clipped = true;
      break;
    }
  }

  const hasMoreLines = lines.length > maxLines;
  const isTruncated = clipped || hasMoreLines || visibleLength > maxChars;

  if (previewLines.length === 0) {
    const fallback = fullVisible.slice(0, maxChars).trimEnd();
    return {
      isTruncated: true,
      previewText: fallback ? `${fallback}...` : '...',
      visibleLength,
    };
  }

  const lastIdx = previewLines.length - 1;
  previewLines[lastIdx] = `${previewLines[lastIdx].replace(/[.…,;:]+$/, '').trimEnd()}...`;

  return {
    isTruncated,
    previewText: previewLines.join('\n'),
    visibleLength,
  };
}

