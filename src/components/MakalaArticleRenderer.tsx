import React, { useMemo, useState } from 'react';
import { BookOpen, ListTree } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { EditorialBlock, parseEditorialBlocks } from '../utils/editorialFormatter';
import { renderLinkedInline } from './RichText';

type ReaderScale = 'compact' | 'normal' | 'large';

interface MakalaArticleRendererProps {
  body: string;
  previewMode?: boolean;
}

function renderBulletOrNumberContent(raw: string): React.ReactNode {
  // Highlight bold lead-in phrase like "Sababu kuu: maelezo..." when not a URL
  const colonIdx = raw.indexOf(':');
  if (colonIdx > 1 && colonIdx <= 54) {
    const prefix = raw.slice(0, colonIdx).trim();
    const rest = raw.slice(colonIdx + 1).trim();
    if (
      prefix.length >= 2 &&
      rest.length >= 3 &&
      !/^https?$/i.test(prefix) &&
      !prefix.includes('http') &&
      !prefix.startsWith('**')
    ) {
      return (
        <>
          <strong className="font-bold text-slate-950">{renderLinkedInline(prefix)}:</strong>{' '}
          <span>{renderLinkedInline(rest)}</span>
        </>
      );
    }
  }
  return renderLinkedInline(raw);
}

export const MakalaArticleRenderer: React.FC<MakalaArticleRendererProps> = ({
  body,
  previewMode = false,
}) => {
  const { tr } = useLanguage();
  const [scale, setScale] = useState<ReaderScale>('normal');

  const blocks = useMemo(() => parseEditorialBlocks(body), [body]);

  const headings = useMemo(
    () =>
      blocks.filter(
        (b): b is Extract<EditorialBlock, { type: 'h2' | 'h3' }> =>
          b.type === 'h2' || b.type === 'h3'
      ),
    [blocks]
  );

  const proseSizeClass =
    scale === 'compact'
      ? 'text-[14.5px] leading-[1.72] sm:text-[15px] sm:leading-[1.78]'
      : scale === 'large'
        ? 'text-[17.5px] leading-[1.82] sm:text-[19px] sm:leading-[1.88]'
        : 'text-[15.5px] leading-[1.76] sm:text-[17px] sm:leading-[1.85]';

  // Detect opening BBC Standfirst (Lead Summary) when article has multiple blocks starting with a paragraph
  const hasStandfirst =
    blocks.length >= 2 && blocks[0].type === 'paragraph' && blocks[0].text.length <= 360;

  // Choose the first substantial narrative paragraph (after standfirst if present) for Drop Cap
  const dropCapIndex = useMemo(() => {
    const startIdx = hasStandfirst ? 1 : 0;
    return blocks.findIndex(
      (b, idx) => idx >= startIdx && b.type === 'paragraph' && b.text.length >= 85
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
        {tr('Hakuna matini bado...', 'No article body yet...')}
      </p>
    );
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-[68ch] break-words">
      {/* Scholarly Reader Comfort Bar */}
      {!previewMode && (
        <div className="mb-4 flex items-center justify-between gap-2 border-b border-stone-200 pb-2.5 text-xs text-slate-600 sm:mb-5 sm:pb-3">
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            <BookOpen className="h-3.5 w-3.5 shrink-0 text-[#B80000]" aria-hidden="true" />
            <span className="truncate font-semibold text-slate-800 sm:hidden">
              {tr('Mpangilio wa Kisomi', 'Editorial View')}
            </span>
            <span className="hidden font-semibold text-slate-800 sm:inline">
              {tr('Mpangilio wa Kusoma wa Kisomi', 'Editorial Reading View')}
            </span>
            {headings.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="shrink-0 tabular-nums text-slate-500">
                  {tr(`Sehemu ${headings.length}`, `${headings.length} sections`)}
                </span>
              </>
            )}
          </div>

          <div
            role="group"
            aria-label={tr('Ukubwa wa maandishi', 'Text size')}
            className="inline-flex shrink-0 items-center gap-0.5 border border-slate-200 bg-[#F7F6F2] p-0.5"
          >
            {(
              [
                { id: 'compact', label: 'A-' },
                { id: 'normal', label: 'A' },
                { id: 'large', label: 'A+' },
              ] as { id: ReaderScale; label: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setScale(opt.id)}
                className={`min-h-[32px] min-w-[32px] px-2 text-[11px] font-bold transition-colors sm:min-h-[28px] sm:min-w-0 sm:px-2.5 ${
                  scale === opt.id
                    ? 'bg-[#B80000] text-white'
                    : 'text-slate-700 hover:bg-white hover:text-slate-950'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* BBC-Style Table of Sections ("Katika Makala Hii") when 2+ subtitles exist */}
      {!previewMode && headings.length >= 2 && (
        <nav
          aria-label={tr('Katika makala hii', 'In this article')}
          className="mb-5 border-y border-stone-300 bg-[#FAF9F5] px-3.5 py-3.5 sm:mb-6 sm:px-5 sm:py-4"
        >
          <div className="mb-2 flex items-center gap-2 text-[11px] font-black tracking-widest text-[#B80000] uppercase sm:mb-2.5">
            <ListTree className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{tr('Katika Makala Hii', 'In This Article')}</span>
          </div>
          <ol className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {headings.map((h, i) => (
              <li key={h.id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => scrollToSection(h.id)}
                  className={`flex min-h-[34px] w-full min-w-0 items-baseline gap-2 py-0.5 text-left text-[13px] leading-snug transition-colors hover:text-[#B80000] sm:min-h-0 sm:text-xs ${
                    h.type === 'h2' ? 'font-bold text-slate-900' : 'pl-2.5 font-medium text-slate-700 sm:pl-3'
                  }`}
                >
                  <span className="shrink-0 font-mono text-[11px] font-bold text-[#B80000] tabular-nums">
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

      {/* Structured Editorial Blocks */}
      <div className="min-w-0 space-y-1">
        {blocks.map((block, idx) => {
          if (block.type === 'h2') {
            return (
              <h2
                key={block.id}
                id={block.id}
                className="scroll-mt-36 break-words border-b border-stone-200 pt-5 pb-2 font-display text-[19px] font-bold leading-snug tracking-tight text-slate-950 sm:scroll-mt-32 sm:text-[25px] [text-wrap:balance]"
              >
                <span
                  aria-hidden="true"
                  className="mb-2 block h-[3px] w-9 bg-[#B80000] sm:mb-2.5 sm:w-11"
                />
                {block.text}
              </h2>
            );
          }

          if (block.type === 'h3') {
            return (
              <h3
                key={block.id}
                id={block.id}
                className="scroll-mt-36 mt-5 mb-1.5 flex min-w-0 items-baseline gap-2 font-sans text-[16.5px] font-extrabold leading-snug text-[#0E2640] sm:scroll-mt-32 sm:mt-6 sm:mb-2 sm:gap-2.5 sm:text-[19px] [text-wrap:balance]"
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 shrink-0 translate-y-[-1px] bg-[#B80000]"
                />
                <span className="min-w-0 flex-1 break-words">{block.text}</span>
              </h3>
            );
          }

          if (block.type === 'bullets') {
            return (
              <div
                key={`ul-${idx}`}
                className="my-4 border-y border-stone-200 bg-[#FAF9F5] px-3.5 py-3.5 sm:my-5 sm:px-6 sm:py-5"
              >
                <ul className={`space-y-2.5 text-slate-800 sm:space-y-3 ${proseSizeClass}`}>
                  {block.items.map((item, i) => (
                    <li key={i} className="flex min-w-0 items-start gap-2.5 sm:gap-3">
                      <span
                        aria-hidden="true"
                        className="mt-[0.62em] h-2 w-2 shrink-0 bg-[#B80000]"
                      />
                      <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
                        {renderBulletOrNumberContent(item)}
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
                className="my-4 border-y border-stone-200 bg-[#FAF9F5] px-3.5 py-3.5 sm:my-5 sm:px-6 sm:py-5"
              >
                <ol className={`divide-y divide-stone-200/80 text-slate-800 ${proseSizeClass}`}>
                  {block.items.map((item, i) => (
                    <li
                      key={i}
                      className={`flex min-w-0 items-start gap-3 sm:gap-3.5 ${i > 0 ? 'pt-2.5 sm:pt-3' : ''} ${
                        i < block.items.length - 1 ? 'pb-2.5 sm:pb-3' : ''
                      }`}
                    >
                      <span className="mt-0.5 inline-flex min-w-[24px] shrink-0 items-center justify-center bg-[#0E2640] px-1.5 py-0.5 font-mono text-[11px] font-bold text-white tabular-nums sm:min-w-[26px] sm:text-xs">
                        {item.num.padStart(2, '0')}
                      </span>
                      <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
                        {renderBulletOrNumberContent(item.text)}
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
                className="my-5 border-y border-stone-300 bg-[#FAF9F5] px-4 py-4 text-center sm:my-6 sm:px-8 sm:py-6"
              >
                <span
                  aria-hidden="true"
                  className="block font-display text-3xl leading-none font-bold text-[#B80000] sm:text-4xl"
                >
                  “
                </span>
                <div className="mt-1 space-y-2 break-words font-display text-[16.5px] leading-relaxed font-medium italic text-stone-900 sm:text-xl">
                  {block.lines.map((line, i) => (
                    <p key={i} className="break-words">
                      {renderLinkedInline(line)}
                    </p>
                  ))}
                </div>
              </blockquote>
            );
          }

          if (block.type === 'divider') {
            return (
              <div
                key={`div-${idx}`}
                aria-hidden="true"
                className="my-5 flex items-center justify-center gap-3 text-xs tracking-[0.6em] text-[#B80000] sm:my-6"
              >
                <span>•</span>
                <span>•</span>
                <span>•</span>
              </div>
            );
          }

          // Standfirst / Opening Lead Paragraph
          if (hasStandfirst && idx === 0) {
            return (
              <p
                key={`lead-${idx}`}
                className="mb-4 break-words border-b border-stone-200 pb-3.5 text-[16px] font-semibold leading-[1.6] text-slate-900 sm:mb-5 sm:pb-4 sm:text-[19px] sm:leading-[1.68] [overflow-wrap:anywhere]"
              >
                {renderLinkedInline(block.text)}
              </p>
            );
          }

          // Narrative Body Paragraph (Drop Cap on tablet/desktop where width allows clean line wraps)
          const isDropCap = idx === dropCapIndex;
          return (
            <p
              key={`p-${idx}`}
              className={`my-3.5 break-words text-slate-800 sm:my-4 [overflow-wrap:anywhere] ${proseSizeClass} ${
                isDropCap
                  ? 'sm:first-letter:float-left sm:first-letter:mr-3 sm:first-letter:mt-1 sm:first-letter:font-display sm:first-letter:text-5xl sm:first-letter:font-bold sm:first-letter:leading-[0.82] sm:first-letter:text-[#B80000]'
                  : ''
              }`}
            >
              {renderLinkedInline(block.text)}
            </p>
          );
        })}
      </div>
    </div>
  );
};
