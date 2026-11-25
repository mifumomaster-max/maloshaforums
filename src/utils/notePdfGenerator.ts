import { jsPDF } from 'jspdf';
import {
  downloadChatAttachmentFile,
  optimizeCloudinaryPhotoUrl,
} from '../services/cloudinaryService';
import { MchartNote } from '../types';

function stripInlineMarkupForPdf(input: string): string {
  return input
    .replace(/\[(?:color|bg)=#[0-9a-fA-F]{3,6}\]/gi, '')
    .replace(/\[\/(?:color|bg|u)\]/gi, '')
    .replace(/\[u\]/gi, '')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, '$1 ($2)')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

function normalizePdfText(input: string): string {
  return stripInlineMarkupForPdf(input)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCodeLineForPdf(input: string): string {
  return input
    .replace(/\t/g, '  ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, '');
}

interface LoadedPdfImage {
  dataUrl: string;
  width: number;
  height: number;
}

async function blobOrUrlToJpegDataUrl(url: string): Promise<LoadedPdfImage | null> {
  const candidateUrls = Array.from(
    new Set([optimizeCloudinaryPhotoUrl(url), url].filter((u) => Boolean(u && u.startsWith('http'))))
  );

  for (const targetUrl of candidateUrls) {
    try {
      const response = await fetch(targetUrl, { mode: 'cors' });
      if (response.ok) {
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        try {
          const loaded = await loadHtmlImage(objectUrl, false);
          if (loaded) return loaded;
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      }
    } catch {
      // Fallback to direct crossOrigin Image below
    }

    try {
      const loaded = await loadHtmlImage(targetUrl, true);
      if (loaded) return loaded;
    } catch {
      // Try next URL candidate
    }
  }
  return null;
}

function loadHtmlImage(src: string, useCors: boolean): Promise<LoadedPdfImage | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (useCors) {
      img.crossOrigin = 'anonymous';
    }
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      try {
        const natW = img.naturalWidth || img.width;
        const natH = img.naturalHeight || img.height;
        if (!natW || !natH) {
          resolve(null);
          return;
        }
        // Cap pixel dimensions for crisp quality & reasonable PDF size
        const maxPx = 1400;
        const scale = Math.min(1, maxPx / Math.max(natW, natH));
        const w = Math.max(1, Math.round(natW * scale));
        const h = Math.max(1, Math.round(natH * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        resolve({ dataUrl, width: w, height: h });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function downloadUploadedPdfFile(
  pdfUrl: string,
  fileName = 'malosha-notes.pdf'
): Promise<void> {
  await downloadChatAttachmentFile(pdfUrl, fileName, 'application/pdf');
}

export function downloadNoteAsTextFile(note: MchartNote): void {
  const header = note.subtitle ? `# ${note.title}\n## ${note.subtitle}` : `# ${note.title}`;
  const cleanBody = note.body
    .replace(/\[(?:color|bg)=#[0-9a-fA-F]{3,6}\]/gi, '')
    .replace(/\[\/(?:color|bg|u)\]/gi, '')
    .replace(/\[u\]/gi, '');
  const content = `${header}\n\n${cleanBody}\n`;
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const baseName = (note.fileName || 'malosha-note').replace(/\.[^.]+$/, '');
  a.href = url;
  a.download = `${baseName}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadNoteAsPdf(note: MchartNote): Promise<void> {
  if (note.pdfUrl && note.noteType === 'pdf') {
    await downloadUploadedPdfFile(
      note.pdfUrl,
      note.pdfFileName || note.fileName || 'malosha-notes.pdf'
    );
    return;
  }

  // Preload all embedded images concurrently before building the PDF
  const rawLines = note.body.split('\n');
  const imageUrls = Array.from(
    new Set(
      rawLines
        .map((line) => line.trim().match(/^!\[[^\]]*\]\((https:\/\/[^\s)]+)\)$/i)?.[1])
        .filter((u): u is string => Boolean(u))
    )
  );
  const imageCache = new Map<string, LoadedPdfImage | null>();
  if (imageUrls.length > 0) {
    await Promise.all(
      imageUrls.map(async (u) => {
        const loaded = await blobOrUrlToJpegDataUrl(u);
        imageCache.set(u, loaded);
      })
    );
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const centerX = pageWidth / 2;
  const marginX = 16;
  const maxContentWidth = pageWidth - marginX * 2;
  const bottomLimit = pageHeight - 20;

  const drawOfficialHeader = () => {
    // Formal top institutional accent stripes
    doc.setFillColor(14, 38, 64);
    doc.rect(0, 0, pageWidth, 3.8, 'F');
    doc.setFillColor(217, 119, 6);
    doc.rect(0, 3.8, pageWidth, 1.0, 'F');

    // Centered circular official crest emblem
    const emblemY = 14.5;
    doc.setFillColor(14, 38, 64);
    doc.circle(centerX, emblemY, 6.4, 'F');
    doc.setDrawColor(217, 119, 6);
    doc.setLineWidth(0.5);
    doc.circle(centerX, emblemY, 5.3, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(255, 255, 255);
    doc.text('MF', centerX, emblemY + 2.6, { align: 'center' });

    // Centered official institution title & division
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15.5);
    doc.setTextColor(14, 38, 64);
    doc.text('MALOSHA FORUMS', centerX, 27.5, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.2);
    doc.setTextColor(7, 94, 84);
    doc.text('MCHART OFFICIAL STUDY NOTES & DIGITAL ARCHIVE', centerX, 32.8, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(71, 85, 105);
    doc.text('Nyaraka Rasmi ya Kiofisi  |  Elimu, Fursa na Kumbukumbu', centerX, 37.5, {
      align: 'center',
    });

    // Double official divider rule
    doc.setDrawColor(14, 38, 64);
    doc.setLineWidth(0.65);
    doc.line(marginX, 41, pageWidth - marginX, 41);
    doc.setDrawColor(217, 119, 6);
    doc.setLineWidth(0.28);
    doc.line(marginX, 42.3, pageWidth - marginX, 42.3);
  };

  drawOfficialHeader();
  let y = 49;

  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight <= bottomLimit) return;
    doc.addPage();
    doc.setFillColor(14, 38, 64);
    doc.rect(0, 0, pageWidth, 2.2, 'F');
    doc.setFillColor(217, 119, 6);
    doc.rect(0, 2.2, pageWidth, 0.7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('MALOSHA FORUMS  ·  MCHART OFFICIAL NOTES', centerX, 9.5, { align: 'center' });
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.line(marginX, 12, pageWidth - marginX, 12);
    y = 19;
  };

  // Pre-calculate centered official document title card
  const cleanTitle = normalizePdfText(note.title) || 'Notes za Malosha Forums';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15.5);
  const titleLines = doc.splitTextToSize(cleanTitle, maxContentWidth - 12) as string[];

  const cleanSubtitle = note.subtitle ? normalizePdfText(note.subtitle) : '';
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(10.5);
  const subLines = cleanSubtitle
    ? (doc.splitTextToSize(cleanSubtitle, maxContentWidth - 14) as string[])
    : [];

  const dateLabel = note.createdAt
    ? note.createdAt.toDate().toLocaleDateString('sw-TZ', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : new Date().toLocaleDateString();
  const refCode = `MF-${(note.id || 'NOTE').slice(0, 6).toUpperCase()}`;
  const metaText = normalizePdfText(
    `Kumbukumbu: ${refCode}  |  Mwandishi: ${note.authorName || 'Mmiliki'}  |  Tarehe: ${dateLabel}`
  );

  const cardHeight =
    10 + titleLines.length * 7 + (subLines.length > 0 ? subLines.length * 5.2 + 2 : 0) + 8;

  // Soft centered official title block
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, y - 3, maxContentWidth, cardHeight, 2, 2, 'FD');

  y += 4.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15.5);
  doc.setTextColor(14, 38, 64);
  for (const line of titleLines) {
    doc.text(line, centerX, y, { align: 'center' });
    y += 7;
  }

  if (subLines.length > 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10.5);
    doc.setTextColor(71, 85, 105);
    for (const sl of subLines) {
      doc.text(sl, centerX, y, { align: 'center' });
      y += 5.2;
    }
    y += 1.5;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(metaText, centerX, y + 1, { align: 'center' });
  y += 11;

  // Render structured body lines including fenced code/command blocks, images, quotes & dividers
  let i = 0;
  while (i < rawLines.length) {
    const rawLine = rawLines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      y += 2.8;
      i++;
      continue;
    }

    // Fenced code or command block
    const fenceMatch = trimmed.match(/^(?:```|~~~)([a-zA-Z0-9_+-]*)/);
    if (fenceMatch) {
      const codeLangRaw = (fenceMatch[1] || 'code').toLowerCase();
      const isCmdBlock = ['bash', 'sh', 'shell', 'zsh', 'terminal', 'cmd'].includes(codeLangRaw);
      const codeHeaderLabel = isCmdBlock
        ? `AMRI / TERMINAL  ·  ${codeLangRaw.toUpperCase()}`
        : `CODE  ·  ${codeLangRaw.toUpperCase()}`;
      const codeLines: string[] = [];
      i++;
      while (i < rawLines.length && !rawLines[i].trim().startsWith('```') && !rawLines[i].trim().startsWith('~~~')) {
        codeLines.push(rawLines[i]);
        i++;
      }
      if (i < rawLines.length) i++;

      doc.setFont('courier', 'normal');
      doc.setFontSize(9.2);
      const wrappedCodeLines: string[] = [];
      for (const cl of codeLines) {
        const cleanCl = normalizeCodeLineForPdf(cl);
        if (!cleanCl.trim()) {
          wrappedCodeLines.push(' ');
        } else {
          const splitCl = doc.splitTextToSize(cleanCl, maxContentWidth - 8) as string[];
          wrappedCodeLines.push(...splitCl);
        }
      }

      if (wrappedCodeLines.length > 0) {
        ensureSpace(16);
        doc.setFillColor(15, 23, 42);
        doc.rect(marginX, y, maxContentWidth, 6.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(isCmdBlock ? 74 : 148, isCmdBlock ? 222 : 163, isCmdBlock ? 128 : 184);
        doc.text(codeHeaderLabel, marginX + 3.5, y + 4.4);
        y += 6.5;

        doc.setFont('courier', 'normal');
        doc.setFontSize(9.2);
        for (const wLine of wrappedCodeLines) {
          ensureSpace(5.5);
          doc.setFillColor(241, 245, 249);
          doc.rect(marginX, y, maxContentWidth, 5.2, 'F');
          doc.setDrawColor(203, 213, 225);
          doc.line(marginX, y, marginX, y + 5.2);
          doc.line(marginX + maxContentWidth, y, marginX + maxContentWidth, y + 5.2);
          doc.setTextColor(15, 23, 42);
          doc.text(wLine, marginX + 3.5, y + 3.7);
          y += 5.2;
        }
        doc.setDrawColor(203, 213, 225);
        doc.line(marginX, y, marginX + maxContentWidth, y);
        y += 4;
      }
      continue;
    }

    // Standalone inline image (embedded visually as actual image!) or video link
    const imgTokenMatch = trimmed.match(/^!\[([^\]]*)\]\((https:\/\/[^\s)]+)\)$/i);
    if (imgTokenMatch) {
      const cap = normalizePdfText(imgTokenMatch[1] || '');
      const imgUrl = imgTokenMatch[2].trim();
      const loadedImg = imageCache.get(imgUrl) || null;
      const showCap = Boolean(cap && !/^(picha|image|photo|picha ya note)$/i.test(cap));

      if (loadedImg) {
        const maxImgWidthMm = maxContentWidth - 8;
        const maxImgHeightMm = 118;
        const ratio = Math.min(maxImgWidthMm / loadedImg.width, maxImgHeightMm / loadedImg.height);
        const drawW = Math.max(24, loadedImg.width * ratio);
        const drawH = Math.max(18, loadedImg.height * ratio);
        const capLines = showCap
          ? (doc.splitTextToSize(cap, maxContentWidth - 8) as string[])
          : [];
        const totalBlockH = drawH + (capLines.length > 0 ? capLines.length * 4.8 + 4 : 2);

        ensureSpace(totalBlockH + 4);
        const imgX = marginX + (maxContentWidth - drawW) / 2;
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.3);
        doc.rect(imgX - 0.8, y - 0.8, drawW + 1.6, drawH + 1.6, 'S');
        doc.addImage(loadedImg.dataUrl, 'JPEG', imgX, y, drawW, drawH);
        y += drawH + 3.5;

        if (capLines.length > 0) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(8.8);
          doc.setTextColor(71, 85, 105);
          for (const cl of capLines) {
            ensureSpace(5);
            doc.text(cl, centerX, y, { align: 'center' });
            y += 4.6;
          }
        }
        y += 2.5;
      } else {
        const fallbackLabel = `[Picha${showCap ? `: ${cap}` : ''}] ${imgUrl}`;
        ensureSpace(8);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9.2);
        doc.setTextColor(7, 94, 84);
        const mLines = doc.splitTextToSize(normalizePdfText(fallbackLabel), maxContentWidth) as string[];
        for (const ml of mLines) {
          ensureSpace(5.2);
          doc.text(ml, marginX, y);
          y += 5;
        }
        y += 2;
      }
      i++;
      continue;
    }

    const vidTokenMatch = trimmed.match(/^@\[video(?:\|([^\]]*))?\]\((https:\/\/[^\s)]+)\)$/i);
    if (vidTokenMatch) {
      const cap = normalizePdfText(vidTokenMatch[1] || '');
      const mediaUrl = vidTokenMatch[2] || '';
      const label = `[Video Iliyoambatanishwa${cap ? `: ${cap}` : ''}] ${mediaUrl}`;
      ensureSpace(10);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9.5);
      doc.setTextColor(7, 94, 84);
      const mLines = doc.splitTextToSize(normalizePdfText(label), maxContentWidth) as string[];
      for (const ml of mLines) {
        ensureSpace(5.5);
        doc.text(ml, marginX, y);
        y += 5.2;
      }
      y += 2;
      i++;
      continue;
    }

    // Horizontal divider
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      ensureSpace(8);
      y += 2;
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.4);
      doc.line(marginX + 20, y, pageWidth - marginX - 20, y);
      y += 5;
      i++;
      continue;
    }

    // Editorial Blockquote (> ...)
    if (trimmed.startsWith('>')) {
      const quoteLinesCollected: string[] = [];
      while (i < rawLines.length && rawLines[i].trim().startsWith('>')) {
        const qt = normalizePdfText(rawLines[i].trim().replace(/^>\s*/, ''));
        if (qt) quoteLinesCollected.push(qt);
        i++;
      }
      if (quoteLinesCollected.length > 0) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(10.5);
        const wrappedQ = quoteLinesCollected.flatMap(
          (ql) => doc.splitTextToSize(ql, maxContentWidth - 14) as string[]
        );
        const qHeight = wrappedQ.length * 5.4 + 6;
        ensureSpace(qHeight + 2);
        doc.setFillColor(248, 250, 252);
        doc.rect(marginX, y - 2, maxContentWidth, qHeight, 'F');
        doc.setFillColor(7, 94, 84);
        doc.rect(marginX, y - 2, 1.5, qHeight, 'F');
        doc.setTextColor(30, 41, 59);
        y += 2.5;
        for (const ql of wrappedQ) {
          doc.text(ql, marginX + 6, y);
          y += 5.4;
        }
        y += 3;
      }
      continue;
    }

    // Major section heading (##)
    if (trimmed.startsWith('## ')) {
      const heading = normalizePdfText(trimmed.slice(3));
      if (heading) {
        ensureSpace(12);
        y += 2.5;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(14, 38, 64);
        const hLines = doc.splitTextToSize(heading, maxContentWidth) as string[];
        for (const hl of hLines) {
          ensureSpace(6.5);
          doc.text(hl, marginX, y);
          y += 6;
        }
        doc.setDrawColor(7, 94, 84);
        doc.setLineWidth(0.35);
        doc.line(marginX, y - 3, marginX + 26, y - 3);
        y += 2;
      }
      i++;
      continue;
    }

    // Subsection heading / Subtitle (###)
    if (trimmed.startsWith('### ')) {
      const subheading = normalizePdfText(trimmed.slice(4));
      if (subheading) {
        ensureSpace(10);
        y += 1.5;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.2);
        doc.setTextColor(7, 94, 84);
        const shLines = doc.splitTextToSize(subheading, maxContentWidth) as string[];
        for (const shl of shLines) {
          ensureSpace(5.8);
          doc.text(shl, marginX, y);
          y += 5.5;
        }
        y += 1;
      }
      i++;
      continue;
    }

    // Bullet point
    if (/^(?:[-*•▪‣]|–(?=\s))\s+/.test(trimmed)) {
      const itemText = normalizePdfText(trimmed.replace(/^(?:[-*•▪‣]|–(?=\s))\s+/, ''));
      if (itemText) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10.5);
        doc.setTextColor(30, 41, 59);
        const bLines = doc.splitTextToSize(itemText, maxContentWidth - 7) as string[];
        for (let bIdx = 0; bIdx < bLines.length; bIdx++) {
          ensureSpace(5.8);
          if (bIdx === 0) {
            doc.setFillColor(7, 94, 84);
            doc.circle(marginX + 2, y - 1.3, 0.9, 'F');
          }
          doc.text(bLines[bIdx], marginX + 6, y);
          y += 5.4;
        }
        y += 1.2;
      }
      i++;
      continue;
    }

    // Numbered list
    const numMatch = trimmed.match(/^(\d{1,2})\.\s+(.+)$/);
    if (numMatch) {
      const numLabel = `${numMatch[1]}.`;
      const itemText = normalizePdfText(numMatch[2]);
      doc.setFontSize(10.5);
      doc.setTextColor(30, 41, 59);
      const nLines = doc.splitTextToSize(itemText, maxContentWidth - 8) as string[];
      for (let nIdx = 0; nIdx < nLines.length; nIdx++) {
        ensureSpace(5.8);
        if (nIdx === 0) {
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(14, 38, 64);
          doc.text(numLabel, marginX + 1, y);
        }
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 41, 59);
        doc.text(nLines[nIdx], marginX + 8, y);
        y += 5.4;
      }
      y += 1.2;
      i++;
      continue;
    }

    // Regular paragraph
    const cleanPara = normalizePdfText(trimmed);
    if (cleanPara) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.8);
      doc.setTextColor(30, 41, 59);
      const pLines = doc.splitTextToSize(cleanPara, maxContentWidth) as string[];
      for (const pl of pLines) {
        ensureSpace(6);
        doc.text(pl, marginX, y);
        y += 5.6;
      }
      y += 2;
    }
    i++;
  }

  // Centered official footer & page numbers
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.line(marginX, pageHeight - 13, pageWidth - marginX, pageHeight - 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Malosha Forums  ·  Nyaraka Rasmi ya Mchart Notes  |  Ukurasa ${p} / ${totalPages}`,
      centerX,
      pageHeight - 8.5,
      { align: 'center' }
    );
  }

  const baseName = (note.fileName || 'malosha-note').replace(/\.[^.]+$/, '');
  doc.save(`${baseName}.pdf`);
}
