import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Download,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  Share2,
  Type,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useLanguage } from '../context/LanguageContext';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface MobilePdfNoteReaderProps {
  pdfUrl: string;
  fileName: string;
  fallbackBody?: string;
  onDownload: () => void;
}

interface ExtractedPageText {
  pageNum: number;
  paragraphs: string[];
}

export function groupPdfTextItemsIntoParagraphs(
  items: Array<{ str?: string; transform?: number[]; hasEOL?: boolean }>
): string[] {
  const lines: string[] = [];
  let currentLine = '';
  let lastY: number | null = null;

  for (const item of items) {
    const str = typeof item.str === 'string' ? item.str : '';
    const y = Array.isArray(item.transform) && item.transform.length >= 6 ? item.transform[5] : null;

    if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) {
      if (currentLine.trim()) lines.push(currentLine.trim());
      currentLine = str;
    } else {
      currentLine = currentLine && str ? `${currentLine} ${str}` : `${currentLine}${str}`;
    }

    if (item.hasEOL) {
      if (currentLine.trim()) lines.push(currentLine.trim());
      currentLine = '';
    }
    if (y !== null) lastY = y;
  }

  if (currentLine.trim()) lines.push(currentLine.trim());

  const paragraphs: string[] = [];
  let buf = '';
  for (const line of lines) {
    const clean = line.replace(/\s+/g, ' ').trim();
    if (!clean) continue;
    if (!buf) {
      buf = clean;
    } else if (buf.length > 260 || /[.!?:]$/.test(buf)) {
      paragraphs.push(buf);
      buf = clean;
    } else {
      buf = `${buf} ${clean}`;
    }
  }
  if (buf) paragraphs.push(buf);
  return paragraphs;
}

export async function extractPlainTextFromPdfFile(file: File, maxPages = 25): Promise<string> {
  try {
    const buffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      disableRange: true,
      disableStream: true,
    });
    const pdfDoc = await loadingTask.promise;
    const total = Math.min(pdfDoc.numPages, maxPages);
    const chunks: string[] = [];
    for (let p = 1; p <= total; p++) {
      const page = await pdfDoc.getPage(p);
      const content = await page.getTextContent();
      const paras = groupPdfTextItemsIntoParagraphs(
        content.items as Array<{ str?: string; transform?: number[]; hasEOL?: boolean }>
      );
      if (paras.length > 0) {
        if (total > 1) chunks.push(`## Ukurasa ${p}`);
        chunks.push(...paras);
      }
    }
    void loadingTask.destroy();
    return chunks.join('\n\n').slice(0, 12000);
  } catch {
    return '';
  }
}

function buildCloudinaryPdfPageUrl(pdfUrl: string, pageNum: number): string | null {
  if (!pdfUrl.includes('res.cloudinary.com')) return null;
  if (pdfUrl.includes('/image/upload/')) {
    return pdfUrl.replace(
      '/image/upload/',
      `/image/upload/f_jpg,q_auto:good,w_1200,pg_${pageNum}/`
    );
  }
  return null;
}

function probeImageLoad(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

const PdfPageCanvas: React.FC<{
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  containerWidth: number;
  zoom: number;
}> = ({ pdfDoc, pageNumber, containerWidth, zoom }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;

    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const targetWidth = Math.max(260, containerWidth - 4);
        const fitScale = (targetWidth / baseViewport.width) * zoom;
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);

        const viewport = page.getViewport({ scale: fitScale });
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const transform =
          outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

        renderTask = page.render({
          canvas,
          canvasContext: ctx,
          viewport,
          transform,
        });
        await renderTask.promise;
        if (!cancelled) setRendered(true);
      } catch {
        // Ignore cancellation errors during zoom/unmount
      }
    };

    void renderPage();

    return () => {
      cancelled = true;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch {
          // Ignore cancel error
        }
      }
    };
  }, [pdfDoc, pageNumber, containerWidth, zoom]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-500">
        <span>Ukurasa {pageNumber}</span>
        {!rendered && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#075E54]" />}
      </div>
      <div className="flex justify-center overflow-x-auto bg-slate-100/60 p-1">
        <canvas ref={canvasRef} className="block max-w-full rounded-b-lg bg-white" />
      </div>
    </div>
  );
};

export const MobilePdfNoteReader: React.FC<MobilePdfNoteReaderProps> = ({
  pdfUrl,
  fileName,
  fallbackBody = '',
  onDownload,
}) => {
  const { tr } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(340);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [cloudinaryPageUrls, setCloudinaryPageUrls] = useState<string[]>([]);
  const [blobPreviewUrl, setBlobPreviewUrl] = useState('');
  const [cachedPdfBlob, setCachedPdfBlob] = useState<Blob | null>(null);
  const [readerMode, setReaderMode] = useState<'pages' | 'text' | 'embed'>('pages');
  const [zoom, setZoom] = useState(1);
  const [textFontStep, setTextFontStep] = useState<'sm' | 'md' | 'lg'>('md');
  const [extractedPages, setExtractedPages] = useState<ExtractedPageText[]>([]);
  const [extractingText, setExtractingText] = useState(false);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(Math.min(containerRef.current.clientWidth, 740));
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null;
    let createdBlobUrl = '';

    setLoading(true);
    setLoadError(false);
    setExtractedPages([]);
    setCloudinaryPageUrls([]);
    setCachedPdfBlob(null);
    setBlobPreviewUrl('');
    setPdfDoc(null);
    setNumPages(0);
    setReaderMode('pages');

    const load = async () => {
      try {
        // Strategy 1: Fetch full PDF bytes directly over CORS so pdfjs doesn't fail on range/stream headers
        const res = await fetch(pdfUrl, { mode: 'cors', credentials: 'omit' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arrayBuf = await res.arrayBuffer();
        if (cancelled) return;

        const blob = new Blob([arrayBuf], { type: 'application/pdf' });
        createdBlobUrl = URL.createObjectURL(blob);
        setCachedPdfBlob(blob);
        setBlobPreviewUrl(createdBlobUrl);

        loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(arrayBuf),
          disableRange: true,
          disableStream: true,
        });
        const loadedDoc = await loadingTask.promise;
        if (cancelled) {
          void loadingTask.destroy();
          return;
        }
        setPdfDoc(loadedDoc);
        setNumPages(loadedDoc.numPages);
        setLoading(false);
        return;
      } catch {
        // Fall through to Strategy 2
      }

      // Strategy 2: Direct URL fallback with disableRange/disableStream
      try {
        loadingTask = pdfjsLib.getDocument({
          url: pdfUrl,
          withCredentials: false,
          disableRange: true,
          disableStream: true,
        });
        const loadedDoc = await loadingTask.promise;
        if (cancelled) {
          void loadingTask.destroy();
          return;
        }
        setPdfDoc(loadedDoc);
        setNumPages(loadedDoc.numPages);
        setLoading(false);
        return;
      } catch {
        // Fall through to Strategy 3
      }

      // Strategy 3: Cloudinary server-side PDF-to-JPG page rasterization
      const firstPageImg = buildCloudinaryPdfPageUrl(pdfUrl, 1);
      if (firstPageImg && (await probeImageLoad(firstPageImg))) {
        const imgs: string[] = [firstPageImg];
        for (let p = 2; p <= 20; p++) {
          if (cancelled) return;
          const nextUrl = buildCloudinaryPdfPageUrl(pdfUrl, p);
          if (!nextUrl || !(await probeImageLoad(nextUrl))) break;
          imgs.push(nextUrl);
        }
        if (!cancelled && imgs.length > 0) {
          setCloudinaryPageUrls(imgs);
          setNumPages(imgs.length);
          setLoading(false);
          return;
        }
      }

      if (!cancelled) {
        // Strategy 4: Show embedded viewer automatically so user can still read in-app
        setLoadError(true);
        setReaderMode('embed');
        setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (loadingTask) {
        void loadingTask.destroy();
      }
      if (createdBlobUrl) {
        URL.revokeObjectURL(createdBlobUrl);
      }
    };
  }, [pdfUrl]);

  useEffect(() => {
    if (readerMode !== 'text' || !pdfDoc || extractedPages.length > 0) return;
    let cancelled = false;
    setExtractingText(true);

    const extractAll = async () => {
      const results: ExtractedPageText[] = [];
      const limitPages = Math.min(pdfDoc.numPages, 40);
      for (let p = 1; p <= limitPages; p++) {
        if (cancelled) return;
        const page = await pdfDoc.getPage(p);
        const content = await page.getTextContent();
        const paragraphs = groupPdfTextItemsIntoParagraphs(
          content.items as Array<{ str?: string; transform?: number[]; hasEOL?: boolean }>
        );
        results.push({ pageNum: p, paragraphs });
      }
      if (!cancelled) {
        setExtractedPages(results);
        setExtractingText(false);
      }
    };

    void extractAll().catch(() => {
      if (!cancelled) setExtractingText(false);
    });

    return () => {
      cancelled = true;
    };
  }, [readerMode, pdfDoc, extractedPages.length]);

  const textSizeClass =
    textFontStep === 'sm'
      ? 'text-[14px]'
      : textFontStep === 'lg'
        ? 'text-[17.5px]'
        : 'text-[15.5px]';

  const gviewEmbedUrl = `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(
    pdfUrl
  )}`;
  const effectiveIframeUrl = blobPreviewUrl || gviewEmbedUrl;

  const fallbackParagraphs = fallbackBody
    .split(/\n{2,}/)
    .map((p) => p.replace(/^#{1,3}\s+/, '').trim())
    .filter((p) => p && !p.startsWith('Faili "'));

  return (
    <div ref={containerRef} className="mt-4">
      {/* Mobile PDF Reader Controls */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs">
        <div
          role="group"
          aria-label={tr('Namna ya kusoma PDF', 'PDF Reading Mode')}
          className="inline-flex flex-wrap rounded-xl bg-slate-100 p-0.5"
        >
          {(pdfDoc || cloudinaryPageUrls.length > 0) && (
            <button
              type="button"
              onClick={() => setReaderMode('pages')}
              className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition-colors ${
                readerMode === 'pages'
                  ? 'bg-[#075E54] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr('Kurasa za PDF', 'PDF Pages')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setReaderMode('text')}
            className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition-colors ${
              readerMode === 'text'
                ? 'bg-[#075E54] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Type className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{tr('Soma kama Notes', 'Mobile Notes Mode')}</span>
          </button>
          <button
            type="button"
            onClick={() => setReaderMode('embed')}
            className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition-colors ${
              readerMode === 'embed'
                ? 'bg-[#075E54] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Globe className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{tr('Kisomaji cha Ndani', 'Embedded Reader')}</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {readerMode === 'pages' ? (
            <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-0.5">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.75, Number((z - 0.15).toFixed(2))))}
                aria-label={tr('Punguza ukubwa', 'Zoom out')}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-700 hover:bg-white"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="px-1.5 text-[11px] font-bold text-slate-700 tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(2, Number((z + 0.15).toFixed(2))))}
                aria-label={tr('Kuza ukurasa', 'Zoom in')}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-700 hover:bg-white"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
            </div>
          ) : readerMode === 'text' ? (
            <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-0.5">
              {(['sm', 'md', 'lg'] as const).map((sz, i) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setTextFontStep(sz)}
                  className={`min-h-[32px] rounded-lg px-2 text-xs font-bold ${
                    textFontStep === sz ? 'bg-[#0E2640] text-white' : 'text-slate-600'
                  }`}
                >
                  {i === 0 ? 'A-' : i === 1 ? 'A' : 'A+'}
                </button>
              ))}
            </div>
          ) : null}

          {numPages > 0 && (
            <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-bold text-[#075E54] tabular-nums">
              {tr(`Kurasa ${numPages}`, `${numPages} pages`)}
            </span>
          )}

          {blobPreviewUrl ? (
            <a
              href={blobPreviewUrl}
              download={fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`}
              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-[#075E54] px-2.5 text-[11px] font-bold text-white hover:bg-[#064E46]"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr('Pakua', 'Save')}</span>
            </a>
          ) : (
            <button
              type="button"
              onClick={onDownload}
              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-[#075E54] px-2.5 text-[11px] font-bold text-white hover:bg-[#064E46]"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr('Pakua', 'Save')}</span>
            </button>
          )}

          <a
            href={blobPreviewUrl || pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-[11px] font-bold text-slate-800 hover:bg-slate-50"
          >
            <ExternalLink className="h-3.5 w-3.5 text-[#0E2640]" aria-hidden="true" />
            <span>{tr('Soma Nje', 'Open Outside')}</span>
          </a>

          {cachedPdfBlob &&
            typeof navigator !== 'undefined' &&
            typeof navigator.share === 'function' && (
              <button
                type="button"
                onClick={() => {
                  const safePdfName = fileName.toLowerCase().endsWith('.pdf')
                    ? fileName
                    : `${fileName}.pdf`;
                  const pdfFile = new File([cachedPdfBlob], safePdfName, {
                    type: 'application/pdf',
                  });
                  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [pdfFile] })) {
                    void navigator.share({ files: [pdfFile], title: safePdfName }).catch(() => {});
                  } else {
                    void navigator.share({ title: safePdfName, url: pdfUrl }).catch(() => {});
                  }
                }}
                className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 text-[11px] font-bold text-[#075E54] hover:bg-emerald-100"
              >
                <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{tr('Hifadhi / Tuma', 'Save / Share')}</span>
              </button>
            )}
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center">
          <Loader2 className="h-7 w-7 animate-spin text-[#075E54]" aria-hidden="true" />
          <p className="mt-3 text-xs font-bold text-slate-800">
            {tr('Inafungua faili la PDF ndani ya mfumo...', 'Opening PDF inside the app...')}
          </p>
        </div>
      ) : readerMode === 'embed' ? (
        <div className="space-y-3">
          {loadError && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs text-amber-900">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                <span>
                  {tr(
                    'Kisomaji mbadala kimetumika. Unaweza pia kupakua PDF moja kwa moja.',
                    'Using embedded fallback viewer. You can also download the PDF.'
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onDownload}
                  className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-[#075E54] px-3 text-xs font-bold text-white"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{tr('Pakua', 'Download')}</span>
                </button>
                <a
                  href={blobPreviewUrl || pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{tr('Fungua Nje', 'Open')}</span>
                </a>
              </div>
            </div>
          )}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <iframe
              src={effectiveIframeUrl}
              title={fileName}
              className="h-[68vh] min-h-[420px] w-full border-0 bg-slate-50"
            />
          </div>
        </div>
      ) : readerMode === 'pages' && pdfDoc ? (
        <div className="space-y-3">
          {Array.from({ length: numPages }, (_, idx) => idx + 1).map((pageNum) => (
            <PdfPageCanvas
              key={`${pageNum}-${zoom}`}
              pdfDoc={pdfDoc}
              pageNumber={pageNum}
              containerWidth={containerWidth}
              zoom={zoom}
            />
          ))}
        </div>
      ) : readerMode === 'pages' && cloudinaryPageUrls.length > 0 ? (
        <div className="space-y-3">
          {cloudinaryPageUrls.map((imgUrl, idx) => (
            <div
              key={imgUrl}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs"
            >
              <div className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-500">
                <span>
                  {tr(`Ukurasa ${idx + 1}`, `Page ${idx + 1}`)}
                </span>
              </div>
              <div className="overflow-x-auto bg-slate-100/50 p-1">
                <img
                  src={imgUrl}
                  alt={`${fileName} — ${tr('Ukurasa', 'Page')} ${idx + 1}`}
                  style={{ width: `${Math.round(zoom * 100)}%` }}
                  className="mx-auto block max-w-none rounded-b-lg bg-white"
                />
              </div>
            </div>
          ))}
        </div>
      ) : extractingText ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#075E54]" aria-hidden="true" />
          <p className="mt-2 text-xs font-semibold text-slate-700">
            {tr('Inapanga maandishi ya PDF kwa ajili ya simu...', 'Formatting PDF text for mobile reading...')}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {extractedPages.every((p) => p.paragraphs.length === 0) ? (
            fallbackParagraphs.length > 0 ? (
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                {fallbackParagraphs.map((para, idx) => (
                  <p key={idx} className={`leading-[1.75] text-slate-800 ${textSizeClass}`}>
                    {para}
                  </p>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center text-xs text-slate-600">
                {tr(
                  'PDF hii ina kurasa za picha (scanned). Tumia "Kurasa za PDF" au "Kisomaji cha Ndani" kusoma kurasa zote vizuri.',
                  'This PDF contains scanned image pages. Switch to "PDF Pages" or "Embedded Reader" to read clearly.'
                )}
              </div>
            )
          ) : (
            extractedPages.map((pg) => (
              <div
                key={pg.pageNum}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs"
              >
                <div className="mb-2 border-b border-slate-100 pb-1.5 text-[11px] font-bold text-[#075E54] uppercase">
                  {tr(`Ukurasa ${pg.pageNum}`, `Page ${pg.pageNum}`)}
                </div>
                {pg.paragraphs.length === 0 ? (
                  <p className="text-xs italic text-slate-400">
                    {tr('(Ukurasa wenye picha au tupu)', '(Image or blank page)')}
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {pg.paragraphs.map((para, i) => (
                      <p key={i} className={`leading-[1.75] text-slate-800 ${textSizeClass}`}>
                        {para}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
