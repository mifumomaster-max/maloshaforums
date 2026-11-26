import React from 'react';
import {
  deriveCloudinaryVideoThumbnail,
  optimizeCloudinaryPhotoUrl,
  optimizeCloudinaryVideoPlaybackUrl,
} from '../services/cloudinaryService';
import { KijiweniFontStyle, getKijiweniFontMeta } from '../types';
import { parseStandaloneMediaToken } from '../utils/editorialFormatter';

interface RichTextProps {
  content: string;
  className?: string;
  fontStyle?: KijiweniFontStyle;
  scholarly?: boolean;
}

const INLINE_TOKEN_PATTERN =
  /(\[color=#[0-9a-fA-F]{3,6}\].+?\[\/color\]|\[bg=#[0-9a-fA-F]{3,6}\].+?\[\/bg\]|\[u\].+?\[\/u\]|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|https?:\/\/[^\s<>"']+|www\.[^\s<>"']+\.[^\s<>"']+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;

function splitTrailingPunctuation(raw: string): { core: string; trailing: string } {
  let core = raw;
  let trailing = '';
  while (core.length > 0 && /[.,;:!?)]$/.test(core)) {
    const last = core[core.length - 1];
    if (last === ')') {
      const opens = (core.match(/\(/g) || []).length;
      const closes = (core.match(/\)/g) || []).length;
      if (closes <= opens) break;
    }
    trailing = last + trailing;
    core = core.slice(0, -1);
  }
  return { core, trailing };
}

function toSafeHref(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  const normalized = /^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function extractFirstUrl(text?: string): string | null {
  if (!text) return null;
  const match = text.match(/(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+\.[^\s<>"']+)/i);
  if (!match) return null;
  const { core } = splitTrailingPunctuation(match[0]);
  return toSafeHref(core);
}

export function renderLinkedInline(text: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  const pattern = new RegExp(INLINE_TOKEN_PATTERN.source, 'gi');
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];

    const colorMatch = token.match(/^\[color=(#[0-9a-fA-F]{3,6})\](.+)\[\/color\]$/i);
    const bgMatch = token.match(/^\[bg=(#[0-9a-fA-F]{3,6})\](.+)\[\/bg\]$/i);
    const uMatch = token.match(/^\[u\](.+)\[\/u\]$/i);

    if (colorMatch) {
      tokens.push(
        <span key={keyIdx++} style={{ color: colorMatch[1] }} className="font-medium">
          {renderLinkedInline(colorMatch[2])}
        </span>
      );
    } else if (bgMatch) {
      tokens.push(
        <mark
          key={keyIdx++}
          style={{ backgroundColor: bgMatch[1] }}
          className="rounded px-1 py-0.5 text-slate-900"
        >
          {renderLinkedInline(bgMatch[2])}
        </mark>
      );
    } else if (uMatch) {
      tokens.push(
        <span key={keyIdx++} className="underline decoration-2 underline-offset-2">
          {renderLinkedInline(uMatch[1])}
        </span>
      );
    } else if (token.startsWith('[') && token.includes('](') && token.endsWith(')')) {
      const splitIdx = token.indexOf('](');
      const label = token.slice(1, splitIdx);
      const rawUrl = token.slice(splitIdx + 2, -1);
      const safeHref = toSafeHref(rawUrl);
      if (safeHref) {
        tokens.push(
          <a
            key={keyIdx++}
            href={safeHref}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[#1D4E89] underline decoration-[#1D4E89]/50 underline-offset-2 break-words hover:text-[#163A5F]"
          >
            {label}
          </a>
        );
      } else {
        tokens.push(token);
      }
    } else if (token.startsWith('**') && token.endsWith('**')) {
      tokens.push(
        <strong key={keyIdx++} className="font-semibold text-slate-900">
          {renderLinkedInline(token.slice(2, -2))}
        </strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      tokens.push(
        <em key={keyIdx++} className="italic text-slate-800">
          {renderLinkedInline(token.slice(1, -1))}
        </em>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      tokens.push(
        <code
          key={keyIdx++}
          className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-slate-800"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (/^(https?:\/\/|www\.)/i.test(token)) {
      const { core, trailing } = splitTrailingPunctuation(token);
      const safeHref = toSafeHref(core);
      if (safeHref) {
        tokens.push(
          <a
            key={keyIdx++}
            href={safeHref}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[#1D4E89] underline decoration-[#1D4E89]/50 underline-offset-2 break-all hover:text-[#163A5F]"
          >
            {core}
          </a>
        );
        if (trailing) tokens.push(trailing);
      } else {
        tokens.push(token);
      }
    } else if (token.includes('@')) {
      const { core, trailing } = splitTrailingPunctuation(token);
      tokens.push(
        <a
          key={keyIdx++}
          href={`mailto:${core}`}
          className="font-medium text-[#1D4E89] underline decoration-[#1D4E89]/50 underline-offset-2 break-all hover:text-[#163A5F]"
        >
          {core}
        </a>
      );
      if (trailing) tokens.push(trailing);
    } else {
      tokens.push(token);
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex));
  }

  return tokens;
}

export const LinkedText: React.FC<{ text: string; className?: string }> = ({
  text,
  className = '',
}) => <span className={className}>{renderLinkedInline(text)}</span>;

export const RichText: React.FC<RichTextProps> = ({
  content,
  className = '',
  fontStyle,
  scholarly = false,
}) => {
  const fontMeta = getKijiweniFontMeta(fontStyle);
  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let listItems: string[] = [];
  let numberedItems: { num: string; text: string }[] = [];
  let quoteLines: string[] = [];
  let dropCapApplied = false;

  const flushList = (keyPrefix: number) => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul
        key={`list-${keyPrefix}`}
        className={`${scholarly ? 'my-3 space-y-2 leading-[1.72]' : 'my-2.5 space-y-1.5'} list-disc pl-5 text-slate-800`}
      >
        {listItems.map((item, idx) => (
          <li key={idx}>{renderLinkedInline(item)}</li>
        ))}
      </ul>
    );
    listItems = [];
  };

  const flushNumbered = (keyPrefix: number) => {
    if (numberedItems.length === 0) return;
    blocks.push(
      <ol
        key={`num-${keyPrefix}`}
        className={`${scholarly ? 'my-3 space-y-2 leading-[1.72]' : 'my-2.5 space-y-1.5'} list-decimal pl-5 text-slate-800`}
      >
        {numberedItems.map((item, idx) => (
          <li key={idx}>{renderLinkedInline(item.text)}</li>
        ))}
      </ol>
    );
    numberedItems = [];
  };

  const flushQuote = (keyPrefix: number) => {
    if (quoteLines.length === 0) return;
    blocks.push(
      <blockquote
        key={`quote-${keyPrefix}`}
        className={
          scholarly
            ? 'my-4 border-y border-slate-200 bg-[#FAF8F5] px-5 py-3.5 text-[#0E2640] italic leading-[1.72]'
            : 'my-3.5 border-y border-slate-200 bg-slate-50 px-4 py-3 text-slate-700 italic'
        }
      >
        {quoteLines.map((q, idx) => (
          <p key={idx} className={idx > 0 ? 'mt-1.5' : ''}>
            {renderLinkedInline(q)}
          </p>
        ))}
      </blockquote>
    );
    quoteLines = [];
  };

  const keepAuthorFontOnHeadings = fontStyle === 'handwriting' || fontStyle === 'mono';

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (/^(?:-{3,}|\*{3,})$/.test(trimmed)) {
      flushList(index);
      flushNumbered(index);
      flushQuote(index);
      blocks.push(<hr key={`hr-${index}`} className="my-4 border-slate-200" />);
      return;
    }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      flushList(index);
      flushNumbered(index);
      flushQuote(index);
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      blocks.push(
        level <= 2 ? (
          <h3
            key={`h2-${index}`}
            className={`${
              scholarly
                ? 'mt-5 mb-2 border-b border-slate-200 pb-1 text-[19px] tracking-[-0.015em] text-[#0E2640]'
                : 'mt-4 mb-1.5 text-lg text-slate-900'
            } ${keepAuthorFontOnHeadings ? '' : 'font-display'} font-bold`}
          >
            {renderLinkedInline(text)}
          </h3>
        ) : (
          <h4
            key={`h3-${index}`}
            className={`${
              scholarly ? 'mt-4 mb-1.5 text-[16px] text-[#0E2640]' : 'mt-3 mb-1 text-[15px] text-[#0E2640]'
            } ${keepAuthorFontOnHeadings ? '' : 'font-sans'} font-bold`}
          >
            {renderLinkedInline(text)}
          </h4>
        )
      );
      return;
    }

    const bulletMatch = trimmed.match(/^(?:[-*•▪‣]|–(?=\s))\s+(.+)$/);
    if (bulletMatch) {
      flushQuote(index);
      flushNumbered(index);
      listItems.push(bulletMatch[1]);
      return;
    }

    const numMatch = trimmed.match(/^(\d{1,2})[.)]\s+(.+)$/);
    if (numMatch) {
      flushQuote(index);
      flushList(index);
      numberedItems.push({ num: numMatch[1], text: numMatch[2] });
      return;
    }

    if (trimmed.startsWith('>')) {
      const qText = trimmed.replace(/^>\s*/, '').trim();
      if (qText) {
        flushList(index);
        flushNumbered(index);
        quoteLines.push(qText);
        return;
      }
    }

    flushList(index);
    flushNumbered(index);
    flushQuote(index);

    if (trimmed === '') {
      return;
    }

    const mediaToken = parseStandaloneMediaToken(trimmed);
    if (mediaToken) {
      if (mediaToken.type === 'image') {
        const showCaption = Boolean(
          mediaToken.caption && mediaToken.caption.toLowerCase() !== 'picha'
        );
        blocks.push(
          <figure
            key={`rt-img-${index}`}
            className="my-3.5 overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
          >
            <img
              src={optimizeCloudinaryPhotoUrl(mediaToken.url)}
              alt={mediaToken.caption || 'Picha'}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="block max-h-[480px] w-full bg-slate-100 object-contain"
            />
            {showCaption && (
              <figcaption className="border-t border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
                {mediaToken.caption}
              </figcaption>
            )}
          </figure>
        );
      } else {
        const poster = deriveCloudinaryVideoThumbnail(mediaToken.url);
        blocks.push(
          <figure
            key={`rt-vid-${index}`}
            className="my-3.5 overflow-hidden rounded-xl border border-slate-200 bg-black"
          >
            <video
              src={optimizeCloudinaryVideoPlaybackUrl(mediaToken.url)}
              poster={poster || undefined}
              controls
              playsInline
              preload="metadata"
              className="block max-h-[480px] w-full bg-black object-contain"
            />
            {mediaToken.caption && (
              <figcaption className="border-t border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
                {mediaToken.caption}
              </figcaption>
            )}
          </figure>
        );
      }
      return;
    }

    const useDropCap =
      scholarly &&
      !dropCapApplied &&
      fontStyle !== 'mono' &&
      /^[A-Za-z]/.test(trimmed) &&
      trimmed.length >= 75;
    if (useDropCap) {
      dropCapApplied = true;
    }

    blocks.push(
      <p
        key={`p-${index}`}
        className={`${
          scholarly ? 'my-3 leading-[1.75]' : 'my-2 leading-relaxed'
        } text-slate-800 ${
          useDropCap
            ? 'first-letter:float-left first-letter:mr-2.5 first-letter:mt-1 first-letter:font-display first-letter:text-[2.45rem] first-letter:font-bold first-letter:leading-[0.82] first-letter:text-[#0E2640]'
            : ''
        }`}
      >
        {renderLinkedInline(trimmed)}
      </p>
    );
  });

  flushList(lines.length);
  flushNumbered(lines.length);
  flushQuote(lines.length);

  return (
    <div
      style={fontStyle ? { fontFamily: fontMeta.fontFamilyCss } : undefined}
      className={`${fontStyle ? fontMeta.bodySizeClass : 'text-[15px]'} ${
        scholarly ? 'max-w-[68ch]' : ''
      } ${className}`}
    >
      {blocks}
    </div>
  );
};
