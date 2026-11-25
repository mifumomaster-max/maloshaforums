export type MakalaFormatAction =
  | 'h2'
  | 'h3'
  | 'quote'
  | 'bullets'
  | 'numbered'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'upper'
  | 'lower'
  | 'title'
  | 'code'
  | 'divider'
  | { type: 'color'; hex: string }
  | { type: 'bg'; hex: string };

export const MAKALA_TEXT_COLORS = [
  { hex: '#B80000', labelSw: 'Nyekundu (BBC)', labelEn: 'Crimson' },
  { hex: '#0E2640', labelSw: 'Bluu Kuu', labelEn: 'Navy' },
  { hex: '#0F766E', labelSw: 'Kijani Kina', labelEn: 'Teal' },
  { hex: '#B45309', labelSw: 'Kahawia/Dhahabu', labelEn: 'Amber' },
  { hex: '#6D28D9', labelSw: 'Zambarau', labelEn: 'Violet' },
  { hex: '#1E293B', labelSw: 'Nyeusi', labelEn: 'Slate' },
];

export const MAKALA_HIGHLIGHT_COLORS = [
  { hex: '#FEF08A', labelSw: 'Njano Angavu', labelEn: 'Yellow' },
  { hex: '#BBF7D0', labelSw: 'Kijani Laini', labelEn: 'Mint' },
  { hex: '#FECACA', labelSw: 'Waridi/Nyekundu', labelEn: 'Rose' },
  { hex: '#BFDBFE', labelSw: 'Bluu Laini', labelEn: 'Sky' },
  { hex: '#E9D5FF', labelSw: 'Zambarau Laini', labelEn: 'Lavender' },
];

export interface TextareaScrollSnapshot {
  textareaScrollTop: number;
  windowScrollY: number;
  scrollParent: HTMLElement | null;
  parentScrollTop: number;
}

function findNearestScrollParent(el: HTMLElement | null): HTMLElement | null {
  let curr = el?.parentElement || null;
  while (curr && curr !== document.body && curr !== document.documentElement) {
    const style = window.getComputedStyle(curr);
    const overflowY = style.overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && curr.scrollHeight > curr.clientHeight) {
      return curr;
    }
    curr = curr.parentElement;
  }
  return null;
}

export function captureTextareaScrollSnapshot(el: HTMLTextAreaElement | null): TextareaScrollSnapshot {
  const scrollParent = typeof window !== 'undefined' ? findNearestScrollParent(el) : null;
  return {
    textareaScrollTop: el ? el.scrollTop : 0,
    windowScrollY: typeof window !== 'undefined' ? window.scrollY : 0,
    scrollParent,
    parentScrollTop: scrollParent ? scrollParent.scrollTop : 0,
  };
}

export function restoreTextareaSelectionAndScroll(
  el: HTMLTextAreaElement | null,
  selStart: number,
  selEnd: number,
  snapshot: TextareaScrollSnapshot
): void {
  const applyRestore = () => {
    if (el) {
      try {
        el.focus({ preventScroll: true });
      } catch {
        el.focus();
      }
      try {
        el.setSelectionRange(selStart, selEnd);
      } catch {
        // Ignore invalid range
      }
      el.scrollTop = snapshot.textareaScrollTop;
    }
    if (snapshot.scrollParent) {
      snapshot.scrollParent.scrollTop = snapshot.parentScrollTop;
    }
    if (typeof window !== 'undefined') {
      window.scrollTo(0, snapshot.windowScrollY);
    }
  };

  window.requestAnimationFrame(() => {
    applyRestore();
    window.requestAnimationFrame(() => {
      applyRestore();
    });
  });
}

function toTitleCase(input: string): string {
  return input.replace(/\S+/g, (word) => {
    const first = word.charAt(0).toUpperCase();
    const rest = word.slice(1).toLowerCase();
    return first + rest;
  });
}

function wrapLinesWithTag(selected: string, openTag: string, closeTag: string): string {
  if (!selected.includes('\n')) {
    if (selected.startsWith(openTag) && selected.endsWith(closeTag)) {
      return selected.slice(openTag.length, selected.length - closeTag.length);
    }
    return `${openTag}${selected}${closeTag}`;
  }
  return selected
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      const lead = line.match(/^\s*/)?.[0] || '';
      const trail = line.match(/\s*$/)?.[0] || '';
      if (trimmed.startsWith(openTag) && trimmed.endsWith(closeTag)) {
        return `${lead}${trimmed.slice(openTag.length, trimmed.length - closeTag.length)}${trail}`;
      }
      return `${lead}${openTag}${trimmed}${closeTag}${trail}`;
    })
    .join('\n');
}

function inferQuickCodeFenceLang(sample: string): string {
  if (
    /^\s*(\$|>)?\s*(npm|npx|yarn|pnpm|bun|pip3?|git|docker|kubectl|curl|wget|sudo|cd|ls|mkdir|rm|cp|mv|cat|chmod|chown|ssh|firebase|gcloud|aws|apt|apt-get|brew|systemctl|python3?|node|tsx|export|echo)\b/im.test(
      sample
    )
  ) {
    return 'bash';
  }
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE TABLE|ALTER TABLE)\b/im.test(sample)) {
    return 'sql';
  }
  if (/\b(const|let|var|function|import|export|interface|type)\b/.test(sample) || /=>/.test(sample)) {
    return 'typescript';
  }
  if (/^\s*(def |class .*:|from .+ import |print\()/m.test(sample)) {
    return 'python';
  }
  return 'bash';
}

export function applyMakalaFormatAction(
  body: string,
  el: HTMLTextAreaElement | null,
  action: MakalaFormatAction,
  fallbackSample: string
): {
  nextBody: string;
  nextSelStart: number;
  nextSelEnd: number;
  snapshot: TextareaScrollSnapshot;
} {
  const snapshot = captureTextareaScrollSnapshot(el);
  const start = el?.selectionStart ?? body.length;
  const end = el?.selectionEnd ?? body.length;
  const hasSelection = end > start;
  const rawSelected = body.slice(start, end);
  const workingText = hasSelection ? rawSelected : fallbackSample;

  let transformed = workingText;
  let leadingNewline = '';
  let trailingNewline = '';

  const needsBlockPrefixNewline = (s: number) =>
    s > 0 && body[s - 1] !== '\n' ? '\n' : '';
  const needsBlockSuffixNewline = (e: number) =>
    e < body.length && body[e] !== '\n' ? '\n' : '';

  if (action === 'h2') {
    leadingNewline = needsBlockPrefixNewline(start);
    transformed = workingText
      .split('\n')
      .map((line) => {
        const clean = line.replace(/^#{1,4}\s+/, '').trim();
        return clean ? `## ${clean}` : line;
      })
      .join('\n');
  } else if (action === 'h3') {
    leadingNewline = needsBlockPrefixNewline(start);
    transformed = workingText
      .split('\n')
      .map((line) => {
        const clean = line.replace(/^#{1,4}\s+/, '').trim();
        return clean ? `### ${clean}` : line;
      })
      .join('\n');
  } else if (action === 'quote') {
    leadingNewline = needsBlockPrefixNewline(start);
    const lines = workingText.split('\n');
    const nonEmpty = lines.filter((l) => l.trim().length > 0);
    const allQuoted = nonEmpty.length > 0 && nonEmpty.every((l) => l.trim().startsWith('>'));
    transformed = lines
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return line;
        if (allQuoted) {
          return trimmed.replace(/^>\s*/, '');
        }
        return `> ${trimmed.replace(/^>\s*/, '')}`;
      })
      .join('\n');
  } else if (action === 'bullets') {
    leadingNewline = needsBlockPrefixNewline(start);
    const lines = workingText.split('\n');
    const nonEmpty = lines.filter((l) => l.trim().length > 0);
    const allBullets =
      nonEmpty.length > 0 && nonEmpty.every((l) => /^(?:[-*•▪‣]|–(?=\s))\s+/.test(l.trim()));
    transformed = lines
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return line;
        if (allBullets) {
          return trimmed.replace(/^(?:[-*•▪‣]|–(?=\s))\s+/, '');
        }
        const stripped = trimmed
          .replace(/^(?:[-*•▪‣]|–(?=\s))\s+/, '')
          .replace(/^\d{1,2}[.)]\s+/, '');
        return `- ${stripped}`;
      })
      .join('\n');
  } else if (action === 'numbered') {
    leadingNewline = needsBlockPrefixNewline(start);
    const lines = workingText.split('\n');
    const nonEmpty = lines.filter((l) => l.trim().length > 0);
    const allNumbered =
      nonEmpty.length > 0 && nonEmpty.every((l) => /^\d{1,2}[.)]\s+/.test(l.trim()));
    let numIdx = 1;
    transformed = lines
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return line;
        if (allNumbered) {
          return trimmed.replace(/^\d{1,2}[.)]\s+/, '');
        }
        const stripped = trimmed
          .replace(/^(?:[-*•▪‣]|–(?=\s))\s+/, '')
          .replace(/^\d{1,2}[.)]\s+/, '');
        return `${numIdx++}. ${stripped}`;
      })
      .join('\n');
  } else if (action === 'code') {
    const trimmed = workingText.trim();
    const fenceMatch = trimmed.match(/^```[a-zA-Z0-9_+-]*\n([\s\S]*?)\n```$/);
    if (fenceMatch) {
      transformed = fenceMatch[1];
    } else {
      leadingNewline = needsBlockPrefixNewline(start);
      trailingNewline = needsBlockSuffixNewline(end);
      const lang = inferQuickCodeFenceLang(trimmed);
      transformed = `\`\`\`${lang}\n${trimmed}\n\`\`\``;
    }
  } else if (action === 'divider') {
    leadingNewline = start > 0 && !body.slice(0, start).endsWith('\n\n')
      ? body[start - 1] === '\n'
        ? '\n'
        : '\n\n'
      : '';
    trailingNewline = end < body.length && !body.slice(end).startsWith('\n\n')
      ? body[end] === '\n'
        ? '\n'
        : '\n\n'
      : '';
    transformed = '---';
  } else if (action === 'bold') {
    transformed = wrapLinesWithTag(workingText, '**', '**');
  } else if (action === 'italic') {
    transformed = wrapLinesWithTag(workingText, '*', '*');
  } else if (action === 'underline') {
    transformed = wrapLinesWithTag(workingText, '[u]', '[/u]');
  } else if (action === 'upper') {
    transformed = workingText.toUpperCase();
  } else if (action === 'lower') {
    transformed = workingText.toLowerCase();
  } else if (action === 'title') {
    transformed = toTitleCase(workingText);
  } else if (typeof action === 'object' && action.type === 'color') {
    const stripped = workingText.replace(/^\[color=#[0-9a-fA-F]{3,6}\]([\s\S]*)\[\/color\]$/i, '$1');
    transformed = wrapLinesWithTag(stripped, `[color=${action.hex}]`, '[/color]');
  } else if (typeof action === 'object' && action.type === 'bg') {
    const stripped = workingText.replace(/^\[bg=#[0-9a-fA-F]{3,6}\]([\s\S]*)\[\/bg\]$/i, '$1');
    transformed = wrapLinesWithTag(stripped, `[bg=${action.hex}]`, '[/bg]');
  }

  const insertion = `${leadingNewline}${transformed}${trailingNewline}`;
  const nextBody = body.slice(0, start) + insertion + body.slice(end);
  const nextSelStart = hasSelection
    ? start + leadingNewline.length
    : start + leadingNewline.length + transformed.length;
  const nextSelEnd = start + leadingNewline.length + transformed.length;

  return {
    nextBody,
    nextSelStart,
    nextSelEnd,
    snapshot,
  };
}
