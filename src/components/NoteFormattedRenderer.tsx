import React, { useMemo, useState } from 'react';
import { Check, Code2, Copy, ListTree, Terminal, WrapText } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import {
  deriveCloudinaryVideoThumbnail,
  optimizeCloudinaryPhotoUrl,
  optimizeCloudinaryVideoPlaybackUrl,
} from '../services/cloudinaryService';
import { parseStandaloneMediaToken } from '../utils/editorialFormatter';
import { renderLinkedInline } from './RichText';

interface NoteFormattedRendererProps {
  body: string;
  fontSizeClass: string;
  onCopyCodeSuccess?: (message: string) => void;
  previewMode?: boolean;
}

type NoteBlock =
  | { type: 'h2'; id: string; text: string }
  | { type: 'h3'; id: string; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'numbered'; items: { num: string; text: string }[] }
  | { type: 'quote'; lines: string[] }
  | { type: 'code'; language: string; code: string }
  | { type: 'image'; url: string; caption?: string }
  | { type: 'video'; url: string; caption?: string }
  | { type: 'divider' };

function slugifyNoteHeading(text: string, index: number): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 36);
  return `note-sec-${index}-${base || 'part'}`;
}

export function extractAllCodeBlocksFromNote(body: string): string[] {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const snippets: string[] = [];
  let idx = 0;
  while (idx < lines.length) {
    const trimmed = lines[idx].trim();
    const fenceMatch = trimmed.match(/^(```|~~~)([a-zA-Z0-9_+-]*)\s*$/);
    if (fenceMatch) {
      const delim = fenceMatch[1];
      const codeLines: string[] = [];
      idx++;
      while (idx < lines.length && !lines[idx].trim().startsWith(delim)) {
        codeLines.push(lines[idx]);
        idx++;
      }
      if (idx < lines.length) idx++;
      const joined = codeLines.join('\n').trim();
      if (joined) snippets.push(joined);
      continue;
    }
    idx++;
  }
  return snippets;
}

function parseNoteBlocks(rawBody: string): NoteBlock[] {
  const lines = rawBody.replace(/\r\n/g, '\n').split('\n');
  const blocks: NoteBlock[] = [];
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

  const flushAll = () => {
    flushBullets();
    flushNumbered();
    flushQuote();
  };

  let idx = 0;
  while (idx < lines.length) {
    const rawLine = lines[idx];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushAll();
      idx++;
      continue;
    }

    // 1. Fenced Code / Command Block (```lang ... ``` or ~~~)
    const fenceMatch = trimmed.match(/^(```|~~~)([a-zA-Z0-9_+-]*)\s*$/);
    if (fenceMatch) {
      flushAll();
      const delim = fenceMatch[1];
      const language = fenceMatch[2] || 'code';
      const codeLines: string[] = [];
      idx++;
      while (idx < lines.length && !lines[idx].trim().startsWith(delim)) {
        codeLines.push(lines[idx]);
        idx++;
      }
      if (idx < lines.length) idx++;
      blocks.push({
        type: 'code',
        language,
        code: codeLines.join('\n'),
      });
      continue;
    }

    // 2. Embedded Image or Video
    const mediaToken = parseStandaloneMediaToken(trimmed);
    if (mediaToken) {
      flushAll();
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
      idx++;
      continue;
    }

    // 3. Ornamental Horizontal Divider
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushAll();
      blocks.push({ type: 'divider' });
      idx++;
      continue;
    }

    // 4. Headings (## / ###)
    const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (hMatch) {
      flushAll();
      const level = hMatch[1].length;
      const text = hMatch[2].trim();
      if (level <= 2) {
        blocks.push({ type: 'h2', id: slugifyNoteHeading(text, headingIdx++), text });
      } else {
        blocks.push({ type: 'h3', id: slugifyNoteHeading(text, headingIdx++), text });
      }
      idx++;
      continue;
    }

    // 5. Blockquote (>)
    if (trimmed.startsWith('>')) {
      const qText = trimmed.replace(/^>\s*/, '').trim();
      if (qText) {
        flushBullets();
        flushNumbered();
        quoteLines.push(qText);
        idx++;
        continue;
      }
    }

    // 6. Bullet List Item (-, *, •, ▪, etc.)
    const bulletMatch = trimmed.match(/^(?:[-*•▪‣◦●]|–(?=\s))\s+(.+)$/);
    if (bulletMatch) {
      flushNumbered();
      flushQuote();
      bulletItems.push(bulletMatch[1].trim());
      idx++;
      continue;
    }

    // 7. Numbered List Item
    const numMatch = trimmed.match(/^(\d{1,2})[.)]\s+(.+)$/);
    if (numMatch) {
      flushBullets();
      flushQuote();
      numberedItems.push({ num: numMatch[1], text: numMatch[2].trim() });
      idx++;
      continue;
    }

    // 8. Narrative Paragraph
    flushAll();
    blocks.push({ type: 'paragraph', text: trimmed });
    idx++;
  }

  flushAll();
  return blocks;
}

const InlineCopyCodeChip: React.FC<{
  code: string;
  onCopySuccess?: (msg: string) => void;
}> = ({ code, onCopySuccess }) => {
  const { tr } = useLanguage();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      onCopySuccess?.(tr(`Imenakiliwa: ${code}`, `Copied: ${code}`));
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      onCopySuccess?.(tr('Imeshindwa kunakili.', 'Copy failed.'));
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      title={tr('Gusa kunakili amri hii', 'Tap to copy')}
      className="mx-0.5 inline-flex max-w-full items-center gap-1 rounded-md border border-slate-300 bg-slate-900 px-1.5 py-0.5 align-baseline font-mono text-[0.86em] font-semibold text-[#25D366] transition-colors hover:bg-slate-800"
    >
      <span className="truncate">{code}</span>
      {copied ? (
        <Check className="h-3 w-3 shrink-0 text-[#25D366]" aria-hidden="true" />
      ) : (
        <Copy className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
      )}
    </button>
  );
};

function renderRichNoteInline(
  text: string,
  onCopyCodeSuccess?: (message: string) => void
): React.ReactNode {
  const parts = text.split(/(`[^`\n]+`)/g);
  if (parts.length === 1) {
    return renderLinkedInline(text);
  }
  return parts.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 3) {
      return (
        <InlineCopyCodeChip
          key={idx}
          code={part.slice(1, -1)}
          onCopySuccess={onCopyCodeSuccess}
        />
      );
    }
    return <React.Fragment key={idx}>{renderLinkedInline(part)}</React.Fragment>;
  });
}

function renderScholarlyListText(
  raw: string,
  onCopyCodeSuccess?: (message: string) => void
): React.ReactNode {
  const colonIdx = raw.indexOf(':');
  if (colonIdx > 1 && colonIdx <= 54) {
    const prefix = raw.slice(0, colonIdx).trim();
    const rest = raw.slice(colonIdx + 1).trim();
    if (
      prefix.length >= 2 &&
      rest.length >= 2 &&
      !/^https?$/i.test(prefix) &&
      !prefix.includes('http') &&
      !prefix.startsWith('**') &&
      !prefix.startsWith('`') &&
      !prefix.startsWith('[')
    ) {
      return (
        <>
          <strong className="font-bold text-slate-950">{renderLinkedInline(prefix)}:</strong>{' '}
          <span>{renderRichNoteInline(rest, onCopyCodeSuccess)}</span>
        </>
      );
    }
  }
  return renderRichNoteInline(raw, onCopyCodeSuccess);
}

const NoteCodeBlock: React.FC<{
  language: string;
  code: string;
  onCopied?: (msg: string) => void;
}> = ({ language, code, onCopied }) => {
  const { tr } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [wrapLines, setWrapLines] = useState(false);

  const normalizedLang = (language || 'code').toLowerCase();
  const isCommand = ['bash', 'sh', 'shell', 'zsh', 'terminal', 'cmd'].includes(normalizedLang);

  const handleCopyOnlyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      onCopied?.(
        isCommand
          ? tr('Amri imenakiliwa tayari kutumia!', 'Command copied!')
          : tr('Code imenakiliwa pekee!', 'Code copied!')
      );
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      onCopied?.(tr('Imeshindwa kunakili code.', 'Failed to copy code.'));
    }
  };

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-slate-800 bg-[#0F172A] shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-[#1E293B] px-3.5 py-2">
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold tracking-wider text-slate-200">
          {isCommand ? (
            <Terminal className="h-3.5 w-3.5 text-[#25D366]" aria-hidden="true" />
          ) : (
            <Code2 className="h-3.5 w-3.5 text-[#25D366]" aria-hidden="true" />
          )}
          <span>
            {isCommand
              ? tr(`AMRI / TERMINAL · ${normalizedLang.toUpperCase()}`, `COMMAND · ${normalizedLang.toUpperCase()}`)
              : `CODE · ${normalizedLang.toUpperCase()}`}
          </span>
        </span>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setWrapLines((w) => !w)}
            title={tr('Kunja mistari mirefu', 'Toggle line wrap')}
            className={`inline-flex min-h-[30px] items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors ${
              wrapLines
                ? 'border-emerald-500/50 bg-emerald-950/60 text-[#25D366]'
                : 'border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <WrapText className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{tr('Kunja', 'Wrap')}</span>
          </button>

          <button
            type="button"
            onClick={() => void handleCopyOnlyCode()}
            className="inline-flex min-h-[30px] items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-white transition-colors hover:bg-slate-700"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-[#25D366]" aria-hidden="true" />
                <span className="text-[#25D366]">{tr('Imenakiliwa', 'Copied')}</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-[#25D366]" aria-hidden="true" />
                <span>
                  {isCommand ? tr('Nakili Amri', 'Copy Command') : tr('Nakili Code', 'Copy Code')}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto p-3.5">
        <pre
          className={`m-0 font-mono text-[13px] leading-relaxed text-slate-100 ${
            wrapLines ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
          }`}
        >
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
};

export const NoteFormattedRenderer: React.FC<NoteFormattedRendererProps> = ({
  body,
  fontSizeClass,
  onCopyCodeSuccess,
  previewMode = false,
}) => {
  const { tr } = useLanguage();
  const blocks = useMemo(() => parseNoteBlocks(body), [body]);

  const headings = useMemo(
    () =>
      blocks.filter(
        (b): b is Extract<NoteBlock, { type: 'h2' | 'h3' }> =>
          b.type === 'h2' || b.type === 'h3'
      ),
    [blocks]
  );

  const hasStandfirst =
    blocks.length >= 2 && blocks[0].type === 'paragraph' && blocks[0].text.length <= 360;

  const dropCapIndex = useMemo(() => {
    const startIdx = hasStandfirst ? 1 : 0;
    return blocks.findIndex(
      (b, idx) =>
        idx >= startIdx &&
        b.type === 'paragraph' &&
        b.text.length >= 90 &&
        !/^\[(?:color|bg)=/i.test(b.text)
    );
  }, [blocks, hasStandfirst]);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (blocks.length === 0) {
    return (
      <p className="py-4 text-sm italic text-slate-500">
        {tr('Hakuna maudhui bado...', 'No note content yet...')}
      </p>
    );
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-[68ch] break-words">
      {/* Scholarly Table of Sections ("Katika Faili Hili") */}
      {!previewMode && headings.length >= 2 && (
        <nav
          aria-label={tr('Katika faili hili', 'In this file')}
          className="mb-5 rounded-xl border border-stone-300 bg-white px-3.5 py-3.5 shadow-2xs sm:mb-6 sm:px-5 sm:py-4"
        >
          <div className="mb-2 flex items-center gap-2 text-[11px] font-black tracking-widest text-[#075E54] uppercase">
            <ListTree className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{tr('Katika Faili Hili', 'In This Study File')}</span>
          </div>
          <ol className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {headings.map((h, i) => (
              <li key={h.id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => scrollToSection(h.id)}
                  className={`flex min-h-[32px] w-full min-w-0 items-baseline gap-2 py-0.5 text-left text-[13px] leading-snug transition-colors hover:text-[#075E54] sm:text-xs ${
                    h.type === 'h2' ? 'font-bold text-[#0E2640]' : 'pl-2.5 font-medium text-slate-700'
                  }`}
                >
                  <span className="shrink-0 font-mono text-[11px] font-bold text-[#075E54] tabular-nums">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1 break-words underline-offset-2 hover:underline">
                    {h.text}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}

      {/* Structured Scholarly Note Blocks */}
      <div className="min-w-0 space-y-1">
        {blocks.map((block, idx) => {
          if (block.type === 'code') {
            return (
              <NoteCodeBlock
                key={`code-${idx}`}
                language={block.language}
                code={block.code}
                onCopied={onCopyCodeSuccess}
              />
            );
          }

          if (block.type === 'h2') {
            return (
              <h2
                key={block.id}
                id={block.id}
                className="scroll-mt-24 break-words border-b border-stone-200 pt-5 pb-2 font-display text-[19px] font-bold leading-snug tracking-tight text-[#0E2640] sm:text-[23px] [text-wrap:balance]"
              >
                <span
                  aria-hidden="true"
                  className="mb-2 block h-[3px] w-10 bg-[#075E54]"
                />
                {renderRichNoteInline(block.text, onCopyCodeSuccess)}
              </h2>
            );
          }

          if (block.type === 'h3') {
            return (
              <h3
                key={block.id}
                id={block.id}
                className="scroll-mt-24 mt-5 mb-1.5 flex min-w-0 items-baseline gap-2 font-sans text-[16px] font-extrabold leading-snug text-[#075E54] sm:text-[18px] [text-wrap:balance]"
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 shrink-0 translate-y-[-1px] bg-[#075E54]"
                />
                <span className="min-w-0 flex-1 break-words">
                  {renderRichNoteInline(block.text, onCopyCodeSuccess)}
                </span>
              </h3>
            );
          }

          if (block.type === 'bullets') {
            return (
              <div
                key={`ul-${idx}`}
                className="my-4 rounded-xl border border-emerald-900/15 bg-white px-4 py-3.5 shadow-2xs sm:px-5 sm:py-4"
              >
                <ul className={`space-y-2.5 text-slate-800 ${fontSizeClass}`}>
                  {block.items.map((item, i) => (
                    <li key={i} className="flex min-w-0 items-start gap-2.5 leading-relaxed">
                      <span
                        className="mt-[0.62em] h-2 w-2 shrink-0 rounded-full bg-[#075E54]"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
                        {renderScholarlyListText(item, onCopyCodeSuccess)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          }

          if (block.type === 'numbered') {
            return (
              <div
                key={`ol-${idx}`}
                className="my-4 rounded-xl border border-stone-200 bg-white px-4 py-3.5 shadow-2xs sm:px-5 sm:py-4"
              >
                <ol className={`divide-y divide-stone-200/80 text-slate-800 ${fontSizeClass}`}>
                  {block.items.map((item, i) => (
                    <li
                      key={i}
                      className={`flex min-w-0 items-start gap-3 leading-relaxed ${
                        i > 0 ? 'pt-2.5' : ''
                      } ${i < block.items.length - 1 ? 'pb-2.5' : ''}`}
                    >
                      <span className="mt-0.5 inline-flex min-w-[24px] shrink-0 items-center justify-center rounded-md bg-[#0E2640] px-1.5 py-0.5 font-mono text-[11px] font-bold text-white tabular-nums">
                        {item.num.padStart(2, '0')}
                      </span>
                      <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
                        {renderScholarlyListText(item.text, onCopyCodeSuccess)}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            );
          }

          if (block.type === 'quote') {
            return (
              <blockquote
                key={`quote-${idx}`}
                className="my-5 rounded-xl border-y border-l-4 border-stone-300 border-l-[#075E54] bg-white px-4 py-4 shadow-2xs sm:px-7 sm:py-5"
              >
                <span
                  aria-hidden="true"
                  className="block font-display text-3xl leading-none font-bold text-[#075E54]"
                >
                  “
                </span>
                <div className="mt-1 space-y-2 break-words font-display text-[16px] leading-relaxed font-medium italic text-stone-900 sm:text-lg">
                  {block.lines.map((line, i) => (
                    <p key={i} className="break-words">
                      {renderRichNoteInline(line, onCopyCodeSuccess)}
                    </p>
                  ))}
                </div>
              </blockquote>
            );
          }

          if (block.type === 'image') {
            const showCaption = Boolean(
              block.caption && !/^(picha|image|photo)$/i.test(block.caption)
            );
            return (
              <figure
                key={`note-img-${idx}`}
                className="my-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-xs"
              >
                <img
                  src={optimizeCloudinaryPhotoUrl(block.url)}
                  alt={block.caption || tr('Picha ya note', 'Note photo')}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="block max-h-[500px] w-full bg-slate-100 object-contain"
                />
                {showCaption && (
                  <figcaption className="border-t border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-600">
                    {block.caption}
                  </figcaption>
                )}
              </figure>
            );
          }

          if (block.type === 'video') {
            const poster = deriveCloudinaryVideoThumbnail(block.url);
            return (
              <figure
                key={`note-vid-${idx}`}
                className="my-4 overflow-hidden rounded-xl border border-slate-200 bg-black shadow-xs"
              >
                <video
                  src={optimizeCloudinaryVideoPlaybackUrl(block.url)}
                  poster={poster || undefined}
                  controls
                  playsInline
                  preload="metadata"
                  className="block max-h-[500px] w-full bg-black object-contain"
                />
                {block.caption && (
                  <figcaption className="border-t border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-600">
                    {block.caption}
                  </figcaption>
                )}
              </figure>
            );
          }

          if (block.type === 'divider') {
            return (
              <div
                key={`div-${idx}`}
                aria-hidden="true"
                className="my-5 flex items-center justify-center gap-3 text-xs tracking-[0.6em] text-[#075E54]"
              >
                <span>•</span>
                <span>•</span>
                <span>•</span>
              </div>
            );
          }

          if (hasStandfirst && idx === 0) {
            return (
              <p
                key={`lead-${idx}`}
                className="mb-4 break-words border-b border-stone-200 pb-3.5 text-[16px] font-semibold leading-[1.65] text-[#0E2640] sm:text-[17.5px] [overflow-wrap:anywhere]"
              >
                {renderRichNoteInline(block.text, onCopyCodeSuccess)}
              </p>
            );
          }

          const isDropCap = idx === dropCapIndex;
          return (
            <p
              key={`p-${idx}`}
              className={`my-3 break-words leading-[1.78] text-slate-800 [overflow-wrap:anywhere] ${fontSizeClass} ${
                isDropCap
                  ? 'sm:first-letter:float-left sm:first-letter:mr-3 sm:first-letter:mt-1 sm:first-letter:font-display sm:first-letter:text-5xl sm:first-letter:font-bold sm:first-letter:leading-[0.82] sm:first-letter:text-[#075E54]'
                  : ''
              }`}
            >
              {renderRichNoteInline(block.text, onCopyCodeSuccess)}
            </p>
          );
        })}
      </div>
    </div>
  );
};
