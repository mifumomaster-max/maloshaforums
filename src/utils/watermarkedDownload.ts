import { optimizeCloudinaryUrl } from '../services/cloudinaryService';

const WATERMARK_HANDLE = '@maloshadavid';
const PLATFORM_ICON_SRC = '/icon.svg';

function loadImageElement(src: string, crossOrigin?: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) {
      img.crossOrigin = crossOrigin;
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

async function fetchImageAsObjectUrl(url: string): Promise<string> {
  const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function sanitizeFilenameSlug(raw?: string): string {
  const clean = (raw || 'picha')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);
  return clean || 'picha';
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Downloads a Kijiweni image with a semi-transparent centered watermark
 * combining the Malosha logo (/icon.svg) and "@maloshadavid" so the source is clear
 * without obstructing the photo underneath.
 */
export async function downloadPhotoWithMaloshaWatermark(
  imageUrl: string,
  titleHint?: string
): Promise<void> {
  const highResUrl = optimizeCloudinaryUrl(imageUrl, 2048, { quality: 'ultra' }) || imageUrl;
  let tempObjectUrl: string | null = null;

  try {
    let sourceImg: HTMLImageElement;
    try {
      tempObjectUrl = await fetchImageAsObjectUrl(highResUrl);
      sourceImg = await loadImageElement(tempObjectUrl);
    } catch {
      sourceImg = await loadImageElement(highResUrl, 'anonymous');
    }

    const width = Math.max(1, sourceImg.naturalWidth || sourceImg.width || 1200);
    const height = Math.max(1, sourceImg.naturalHeight || sourceImg.height || 900);
    const minSide = Math.min(width, height);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas haipatikani kwenye kivinjari hiki.');
    }

    ctx.drawImage(sourceImg, 0, 0, width, height);

    let logoImg: HTMLImageElement | null = null;
    try {
      logoImg = await loadImageElement(PLATFORM_ICON_SRC);
    } catch {
      logoImg = null;
    }

    // Proportional sizing so the watermark remains gentle & readable on any photo size
    const fontSize = Math.max(18, Math.min(54, Math.round(minSide * 0.052)));
    const logoSize = Math.round(fontSize * 1.32);
    const gap = Math.max(8, Math.round(fontSize * 0.36));

    ctx.save();
    ctx.font = `700 ${fontSize}px Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    const textWidth = ctx.measureText(WATERMARK_HANDLE).width;
    const totalGroupWidth = (logoImg ? logoSize + gap : 0) + textWidth;
    const startX = (width - totalGroupWidth) / 2;
    const centerY = height / 2;

    // Very soft translucent backdrop pill right behind the centered mark for legibility on bright skies
    const padX = Math.round(fontSize * 0.55);
    const padY = Math.round(fontSize * 0.38);
    const pillW = totalGroupWidth + padX * 2;
    const pillH = Math.max(logoSize, fontSize) + padY * 2;
    const pillX = width / 2 - pillW / 2;
    const pillY = centerY - pillH / 2;

    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#0B1F35';
    drawRoundedRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    ctx.fill();

    // Subtle crisp border around the translucent pill
    ctx.globalAlpha = 0.26;
    ctx.lineWidth = Math.max(1, Math.round(fontSize * 0.05));
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();

    // Draw logo mark + "@maloshadavid" centered at low opacity so photo stays crystal clear
    ctx.globalAlpha = 0.48;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = Math.max(3, Math.round(fontSize * 0.16));
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1;

    let textStartX = startX;
    if (logoImg) {
      const logoY = centerY - logoSize / 2;
      ctx.save();
      drawRoundedRect(ctx, startX, logoY, logoSize, logoSize, Math.round(logoSize * 0.24));
      ctx.clip();
      ctx.drawImage(logoImg, startX, logoY, logoSize, logoSize);
      ctx.restore();
      textStartX = startX + logoSize + gap;
    }

    ctx.lineWidth = Math.max(1, Math.round(fontSize * 0.08));
    ctx.strokeStyle = 'rgba(11, 31, 53, 0.55)';
    ctx.strokeText(WATERMARK_HANDLE, textStartX, centerY);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(WATERMARK_HANDLE, textStartX, centerY);
    ctx.restore();

    const outputBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error('Imeshindwa kuandaa faili la picha.'));
        },
        'image/jpeg',
        0.93
      );
    });

    const slug = sanitizeFilenameSlug(titleHint);
    const filename = `maloshadavid-${slug}-${Date.now()}.jpg`;
    triggerBlobDownload(outputBlob, filename);
  } finally {
    if (tempObjectUrl) {
      URL.revokeObjectURL(tempObjectUrl);
    }
  }
}
