import React from 'react';

interface RichTextProps {
  content: string;
  className?: string;
}

const INLINE_TOKEN_PATTERN =
  /(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|https?:\/\/[^\s<>"']+|www\.[^\s<>"']+\.[^\s<>"']+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;

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

    if (token.startsWith('[') && token.includes('](') && token.endsWith(')')) {
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

export const RichText: React.FC<RichTextProps> = ({ content, className = '' }) => {
  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let listItems: string[] = [];
  let quoteLines: string[] = [];

  const flushList = (keyPrefix: number) => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={`list-${keyPrefix}`} className="my-2.5 list-disc space-y-1.5 pl-5 text-slate-800">
        {listItems.map((item, idx) => (
          <li key={idx}>{renderLinkedInline(item)}</li>
        ))}
      </ul>
    );
    listItems = [];
  };

  const flushQuote = (keyPrefix: number) => {
    if (quoteLines.length === 0) return;
    blocks.push(
      <blockquote
        key={`quote-${keyPrefix}`}
        className="my-3.5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700 italic"
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

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      flushQuote(index);
      listItems.push(trimmed.slice(2));
      return;
    }

    if (trimmed.startsWith('> ')) {
      flushList(index);
      quoteLines.push(trimmed.slice(2));
      return;
    }

    flushList(index);
    flushQuote(index);

    if (trimmed === '') {
      return;
    }

    blocks.push(
      <p key={`p-${index}`} className="my-2 leading-relaxed text-slate-800">
        {renderLinkedInline(trimmed)}
      </p>
    );
  });

  flushList(lines.length);
  flushQuote(lines.length);

  return <div className={`text-[15px] ${className}`}>{blocks}</div>;
};
