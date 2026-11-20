import React, { useState } from 'react';
import { Check, Code2, Copy } from 'lucide-react';
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
}

function renderRichNoteInline(text: string): React.ReactNode {
  // Split on inline backtick code spans `...` first, then pass plain spans through renderLinkedInline
  const parts = text.split(/(`[^`\n]+`)/g);
  if (parts.length === 1) {
    return renderLinkedInline(text);
  }
  return parts.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 3) {
      return (
        <code
          key={idx}
          className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[0.88em] font-semibold text-[#0E2640]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={idx}>{renderLinkedInline(part)}</React.Fragment>;
  });
}

const NoteCodeBlock: React.FC<{
  language: string;
  code: string;
  onCopied?: (msg: string) => void;
}> = ({ language, code, onCopied }) => {
  const { tr } = useLanguage();
  const [copied, setCopied] = useState(false);

  const handleCopyOnlyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      onCopied?.(tr('Code imenakiliwa pekee!', 'Code copied!'));
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      onCopied?.(tr('Imeshindwa kunakili code.', 'Failed to copy code.'));
    }
  };

  const langLabel = (language || 'code').toUpperCase();

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-slate-800 bg-[#0F172A] shadow-xs">
      <div className="flex items-center justify-between border-b border-slate-800 bg-[#1E293B] px-3.5 py-2">
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold tracking-wider text-slate-300">
          <Code2 className="h-3.5 w-3.5 text-[#25D366]" aria-hidden="true" />
          <span>{langLabel}</span>
        </span>
        <button
          type="button"
          onClick={() => void handleCopyOnlyCode()}
          className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-white transition-colors hover:bg-slate-700"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-[#25D366]" aria-hidden="true" />
              <span className="text-[#25D366]">{tr('Imenakiliwa', 'Copied')}</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5 text-slate-300" aria-hidden="true" />
              <span>{tr('Nakili Code', 'Copy Code')}</span>
            </>
          )}
        </button>
      </div>
      <div className="overflow-x-auto p-3.5">
        <pre className="m-0 font-mono text-[13px] leading-relaxed text-slate-100">
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
}) => {
  const lines = body.split('\n');
  const blocks: React.ReactNode[] = [];
  let bulletItems: string[] = [];
  let numberedItems: { num: string; text: string }[] = [];

  const flushBullets = (keyIdx: number) => {
    if (bulletItems.length === 0) return;
    blocks.push(
      <ul
        key={`ul-${keyIdx}`}
        className={`my-3.5 space-y-2.5 rounded-xl border border-emerald-900/10 bg-emerald-50/45 px-4 py-3.5 text-slate-800 ${fontSizeClass}`}
      >
        {bulletItems.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5 leading-relaxed">
            <span
              className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#075E54]"
              aria-hidden="true"
            />
            <span className="flex-1">{renderRichNoteInline(item)}</span>
          </li>
        ))}
      </ul>
    );
    bulletItems = [];
  };

  const flushNumbered = (keyIdx: number) => {
    if (numberedItems.length === 0) return;
    blocks.push(
      <ol
        key={`ol-${keyIdx}`}
        className={`my-3.5 space-y-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-slate-800 ${fontSizeClass}`}
      >
        {numberedItems.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5 leading-relaxed">
            <span className="mt-0.5 flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-md bg-[#0E2640] px-1 text-[11px] font-bold text-white tabular-nums">
              {item.num}
            </span>
            <span className="flex-1">{renderRichNoteInline(item.text)}</span>
          </li>
        ))}
      </ol>
    );
    numberedItems = [];
  };

  let idx = 0;
  while (idx < lines.length) {
    const rawLine = lines[idx];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushBullets(idx);
      flushNumbered(idx);
      idx++;
      continue;
    }

    // Fenced code block (```lang ... ```)
    const fenceMatch = trimmed.match(/^```([a-zA-Z0-9_+-]*)\s*$/);
    if (fenceMatch) {
      flushBullets(idx);
      flushNumbered(idx);
      const language = fenceMatch[1] || 'code';
      const codeLines: string[] = [];
      const startKey = idx;
      idx++;
      while (idx < lines.length && !lines[idx].trim().startsWith('```')) {
        codeLines.push(lines[idx]);
        idx++;
      }
      if (idx < lines.length) idx++;
      blocks.push(
        <NoteCodeBlock
          key={`code-${startKey}`}
          language={language}
          code={codeLines.join('\n')}
          onCopied={onCopyCodeSuccess}
        />
      );
      continue;
    }

    // Embedded inline photo or video token
    const mediaToken = parseStandaloneMediaToken(trimmed);
    if (mediaToken) {
      flushBullets(idx);
      flushNumbered(idx);
      if (mediaToken.type === 'image') {
        const showCaption = Boolean(
          mediaToken.caption && mediaToken.caption.toLowerCase() !== 'picha'
        );
        blocks.push(
          <figure
            key={`note-img-${idx}`}
            className="my-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-xs"
          >
            <img
              src={optimizeCloudinaryPhotoUrl(mediaToken.url)}
              alt={mediaToken.caption || 'Picha ya note'}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="block max-h-[500px] w-full bg-slate-100 object-contain"
            />
            {showCaption && (
              <figcaption className="border-t border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-600">
                {mediaToken.caption}
              </figcaption>
            )}
          </figure>
        );
      } else {
        const poster = deriveCloudinaryVideoThumbnail(mediaToken.url);
        blocks.push(
          <figure
            key={`note-vid-${idx}`}
            className="my-4 overflow-hidden rounded-xl border border-slate-200 bg-black shadow-xs"
          >
            <video
              src={optimizeCloudinaryVideoPlaybackUrl(mediaToken.url)}
              poster={poster || undefined}
              controls
              playsInline
              preload="metadata"
              className="block max-h-[500px] w-full bg-black object-contain"
            />
            {mediaToken.caption && (
              <figcaption className="border-t border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-600">
                {mediaToken.caption}
              </figcaption>
            )}
          </figure>
        );
      }
      idx++;
      continue;
    }

    // Major Section Heading (##)
    if (trimmed.startsWith('## ')) {
      flushBullets(idx);
      flushNumbered(idx);
      blocks.push(
        <h3
          key={`h2-${idx}`}
          className="mt-6 mb-2.5 border-b border-slate-200/90 pb-1.5 font-display text-lg font-bold tracking-tight text-[#0E2640] sm:text-xl [text-wrap:balance]"
        >
          {trimmed.slice(3)}
        </h3>
      );
      idx++;
      continue;
    }

    // Subsection Heading / Subtitle (###)
    if (trimmed.startsWith('### ')) {
      flushBullets(idx);
      flushNumbered(idx);
      blocks.push(
        <h4
          key={`h3-${idx}`}
          className="mt-4 mb-1.5 font-display text-[15px] font-bold text-[#075E54] sm:text-base [text-wrap:balance]"
        >
          {trimmed.slice(4)}
        </h4>
      );
      idx++;
      continue;
    }

    // Bullet List Item
    if (trimmed.startsWith('- ')) {
      flushNumbered(idx);
      bulletItems.push(trimmed.slice(2));
      idx++;
      continue;
    }

    // Numbered List Item
    const numMatch = trimmed.match(/^(\d{1,2})\.\s+(.+)$/);
    if (numMatch) {
      flushBullets(idx);
      numberedItems.push({ num: numMatch[1], text: numMatch[2] });
      idx++;
      continue;
    }

    // Standard Paragraph
    flushBullets(idx);
    flushNumbered(idx);
    blocks.push(
      <p
        key={`p-${idx}`}
        className={`my-2.5 max-w-[68ch] leading-[1.78] text-slate-800 ${fontSizeClass}`}
      >
        {renderRichNoteInline(trimmed)}
      </p>
    );
    idx++;
  }

  flushBullets(lines.length);
  flushNumbered(lines.length);

  return <div className="space-y-0.5">{blocks}</div>;
};
