const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const DEFAULT_CLOUD_NAME = 'axnd2qj1';
const DEFAULT_UPLOAD_PRESET = 'malosha';

export function getCloudinaryConfig(): {
  cloudName: string;
  uploadPreset: string;
  configured: boolean;
} {
  const cloudName = (import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || DEFAULT_CLOUD_NAME).trim();
  const uploadPreset = (
    import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || DEFAULT_UPLOAD_PRESET
  ).trim();
  return {
    cloudName,
    uploadPreset,
    configured: Boolean(cloudName && uploadPreset),
  };
}

export function optimizeCloudinaryUrl(url?: string, width = 720): string {
  if (!url) return '';
  const trimmed = url.trim();
  const marker = '/image/upload/';
  if (!trimmed.startsWith('https://res.cloudinary.com/') || !trimmed.includes(marker)) {
    return trimmed;
  }
  const idx = trimmed.indexOf(marker);
  const after = trimmed.slice(idx + marker.length);
  // Avoid double-injecting transformations if already transformed
  if (/^(?:[a-z_]+:[^/]+,?)+(\/|$)/i.test(after) || after.startsWith('f_auto')) {
    return trimmed;
  }
  return `${trimmed.slice(0, idx + marker.length)}f_auto,q_auto:eco,w_${width},c_limit/${after}`;
}

export async function uploadImageToCloudinary(file: File): Promise<string> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Aina hii ya picha hairuhusiwi. Tumia JPG, PNG, WEBP, au GIF.');
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Picha ni kubwa sana. Ukubwa usizidi MB 8.');
  }

  const { cloudName, uploadPreset, configured } = getCloudinaryConfig();
  if (!configured) {
    throw new Error(
      'Mipangilio ya Cloudinary (Cloud Name na Upload Preset) bado haijawekwa.'
    );
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (!response.ok) {
    let reason = 'Imeshindwa kupakia picha kwenda Cloudinary.';
    try {
      const errData = (await response.json()) as { error?: { message?: string } };
      if (errData?.error?.message) {
        reason = `Cloudinary: ${errData.error.message}`;
      }
    } catch {
      // Ignore JSON parse errors
    }
    throw new Error(reason);
  }

  const result = (await response.json()) as { secure_url?: string };
  if (!result.secure_url || !result.secure_url.startsWith('https://')) {
    throw new Error('Cloudinary haikurudisha kiungo sahihi cha picha.');
  }

  return result.secure_url.slice(0, 500);
}

export async function prepareDataSaverImageFile(
  file: File,
  options?: { maxDim?: number; quality?: number }
): Promise<File> {
  const prepared = await prepareSharedImageFile(file);
  if (prepared.type === 'image/gif') return prepared;
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') {
    return prepared;
  }

  const maxDim = options?.maxDim ?? 1600;
  const quality = options?.quality ?? 0.78;

  try {
    const bitmap = await createImageBitmap(prepared);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width || 1, bitmap.height || 1));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return prepared;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', quality)
    );
    const finalBlob =
      blob && blob.size > 0
        ? blob
        : await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, 'image/jpeg', quality)
          );
    if (!finalBlob || finalBlob.size >= prepared.size) return prepared;

    const ext = finalBlob.type === 'image/webp' ? 'webp' : 'jpg';
    const baseName = (prepared.name || 'picha').replace(/\.[^.]+$/, '');
    return new File([finalBlob], `${baseName}.${ext}`, { type: finalBlob.type });
  } catch {
    return prepared;
  }
}

export async function uploadImageToCloudinaryWithProgress(
  file: File,
  onProgress?: (percent: number, loadedBytes: number, totalBytes: number) => void
): Promise<string> {
  const normalizedType =
    file.type === 'image/jpg' ? 'image/jpeg' : (file.type || '').toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(normalizedType)) {
    throw new Error('Aina hii ya picha hairuhusiwi. Tumia JPG, PNG, WEBP, au GIF.');
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Picha ni kubwa sana. Ukubwa usizidi MB 8.');
  }

  const { cloudName, uploadPreset, configured } = getCloudinaryConfig();
  if (!configured) {
    throw new Error(
      'Mipangilio ya Cloudinary (Cloud Name na Upload Preset) bado haijawekwa.'
    );
  }

  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`;

  const result = await new Promise<{ secure_url?: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint, true);

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        const pct = Math.min(99, Math.max(1, Math.round((ev.loaded / ev.total) * 100)));
        onProgress(pct, ev.loaded, ev.total);
      }
    };

    xhr.onload = () => {
      try {
        const parsed = JSON.parse(xhr.responseText || '{}') as {
          secure_url?: string;
          error?: { message?: string };
        };
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(100, file.size, file.size);
          resolve(parsed);
        } else {
          reject(
            new Error(
              parsed?.error?.message
                ? `Cloudinary: ${parsed.error.message}`
                : 'Imeshindwa kupakia picha kwenda Cloudinary.'
            )
          );
        }
      } catch {
        reject(new Error('Imeshindwa kupakia picha kwenda Cloudinary.'));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Mtandao umekatika wakati wa kupakia picha. Jaribu tena.'));
    };

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);
    xhr.send(formData);
  });

  if (!result.secure_url || !result.secure_url.startsWith('https://')) {
    throw new Error('Cloudinary haikurudisha kiungo sahihi cha picha.');
  }

  return result.secure_url.slice(0, 500);
}

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_DOCUMENT_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'txt',
  'csv',
  'zip',
]);

export interface ChatAttachmentUploadResult {
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  attachmentType: 'image' | 'document';
}

export async function uploadChatFileToCloudinary(
  file: File
): Promise<ChatAttachmentUploadResult> {
  const isImage = ALLOWED_IMAGE_TYPES.has(file.type);
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const isAllowedDoc = !isImage && ALLOWED_DOCUMENT_EXTENSIONS.has(ext);

  if (!isImage && !isAllowedDoc) {
    throw new Error(
      'Faili hili haliruhusiwi. Tumia Picha (JPG, PNG, WEBP, GIF) au Nyaraka (PDF, Word, Excel, PowerPoint, TXT, CSV, ZIP).'
    );
  }

  const maxBytes = isImage ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES;
  if (file.size > maxBytes) {
    throw new Error(
      isImage
        ? 'Picha ni kubwa sana. Ukubwa usizidi MB 8.'
        : 'Nyaraka ni kubwa sana. Ukubwa usizidi MB 10.'
    );
  }

  const { cloudName, uploadPreset, configured } = getCloudinaryConfig();
  if (!configured) {
    throw new Error(
      'Mipangilio ya Cloudinary (Cloud Name na Upload Preset) bado haijawekwa.'
    );
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);

  const endpoint = isImage ? 'image/upload' : 'raw/upload';
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${endpoint}`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (!response.ok) {
    let reason = 'Imeshindwa kupakia faili kwenda Cloudinary.';
    try {
      const errData = (await response.json()) as { error?: { message?: string } };
      if (errData?.error?.message) {
        reason = `Cloudinary: ${errData.error.message}`;
      }
    } catch {
      // Ignore JSON parse errors
    }
    throw new Error(reason);
  }

  const result = (await response.json()) as { secure_url?: string };
  if (!result.secure_url || !result.secure_url.startsWith('https://')) {
    throw new Error('Cloudinary haikurudisha kiungo sahihi cha faili.');
  }

  return {
    url: result.secure_url.slice(0, 500),
    fileName: (file.name || 'faili').slice(0, 140),
    fileSize: Math.max(0, Math.min(file.size, 15_728_640)),
    mimeType: (file.type || (isImage ? 'image/jpeg' : ext === 'pdf' ? 'application/pdf' : 'application/octet-stream')).slice(0, 120),
    attachmentType: isImage ? 'image' : 'document',
  };
}

export function buildExternalAttachmentUrl(
  fileUrl: string,
  options?: { forceDownload?: boolean; fileName?: string }
): string {
  const cleanUrl = (fileUrl || '').trim();
  if (!cleanUrl) return '';
  if (options?.forceDownload && cleanUrl.includes('res.cloudinary.com') && cleanUrl.includes('/image/upload/')) {
    const cleanSlug = (options.fileName || 'nyaraka')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .slice(0, 60);
    const flag = cleanSlug ? `fl_attachment:${cleanSlug}` : 'fl_attachment';
    return cleanUrl.replace('/image/upload/', `/image/upload/${flag}/`);
  }
  return cleanUrl;
}

export async function downloadChatAttachmentFile(
  fileUrl: string,
  fileName = 'nyaraka.pdf',
  mimeType = ''
): Promise<'blob' | 'external'> {
  const cleanUrl = (fileUrl || '').trim();
  if (!cleanUrl) {
    throw new Error('Kiungo cha faili hakipatikani.');
  }

  const isPdf =
    mimeType.toLowerCase().includes('pdf') ||
    fileName.toLowerCase().endsWith('.pdf') ||
    cleanUrl.toLowerCase().split('?')[0].endsWith('.pdf');

  const baseName = (fileName || (isPdf ? 'nyaraka.pdf' : 'faili')).trim();
  const safeName = isPdf
    ? baseName.toLowerCase().endsWith('.pdf')
      ? baseName
      : `${baseName.replace(/\.[^.]+$/, '')}.pdf`
    : baseName;

  const attachmentUrl = buildExternalAttachmentUrl(cleanUrl, {
    forceDownload: true,
    fileName: safeName,
  });

  const candidateUrls = [cleanUrl, attachmentUrl].filter(
    (u, idx, arr) => Boolean(u) && arr.indexOf(u) === idx
  );

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) continue;
      const arrayBuf = await res.arrayBuffer();
      if (!arrayBuf || arrayBuf.byteLength === 0) continue;
      const contentType = isPdf
        ? 'application/pdf'
        : mimeType || res.headers.get('content-type') || 'application/octet-stream';
      const blob = new Blob([arrayBuf], { type: contentType });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = safeName;
      a.rel = 'noopener noreferrer';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      return 'blob';
    } catch {
      // Try next candidate URL
    }
  }

  const a = document.createElement('a');
  a.href = attachmentUrl || cleanUrl;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.download = safeName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  return 'external';
}

const MAX_NOTE_PDF_BYTES = 15 * 1024 * 1024; // 15MB

export interface NotePdfUploadResult {
  url: string;
  fileName: string;
  fileSize: number;
}

export async function uploadNotePdfToCloudinary(file: File): Promise<NotePdfUploadResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const isPdf = file.type === 'application/pdf' || ext === 'pdf';
  if (!isPdf) {
    throw new Error('Tafadhali chagua faili la PDF pekee (.pdf).');
  }

  if (file.size > MAX_NOTE_PDF_BYTES) {
    throw new Error('Faili la PDF ni kubwa sana. Ukubwa usizidi MB 15.');
  }

  const { cloudName, uploadPreset, configured } = getCloudinaryConfig();
  if (!configured) {
    throw new Error(
      'Mipangilio ya Cloudinary (Cloud Name na Upload Preset) bado haijawekwa.'
    );
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/auto/upload`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (!response.ok) {
    let reason = 'Imeshindwa kupakia faili la PDF kwenda Cloudinary.';
    try {
      const errData = (await response.json()) as { error?: { message?: string } };
      if (errData?.error?.message) {
        reason = `Cloudinary: ${errData.error.message}`;
      }
    } catch {
      // Ignore JSON parse error
    }
    throw new Error(reason);
  }

  const result = (await response.json()) as { secure_url?: string };
  if (!result.secure_url || !result.secure_url.startsWith('https://')) {
    throw new Error('Cloudinary haikurudisha kiungo sahihi cha PDF.');
  }

  return {
    url: result.secure_url.slice(0, 500),
    fileName: (file.name || 'notes.pdf').slice(0, 140),
    fileSize: Math.max(0, Math.min(file.size, 20_971_520)),
  };
}

export async function prepareSharedImageFile(file: File): Promise<File> {
  const normalizedType =
    file.type === 'image/jpg' ? 'image/jpeg' : (file.type || '').toLowerCase();

  if (
    ALLOWED_IMAGE_TYPES.has(normalizedType) &&
    file.size > 0 &&
    file.size <= MAX_IMAGE_BYTES
  ) {
    if (normalizedType !== file.type) {
      return new File([file], file.name || 'picha-ya-simu.jpg', { type: normalizedType });
    }
    return file;
  }

  // Re-encode oversized (>8MB) or non-standard phone images into a clean JPEG <= 1920px
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const maxDim = 1920;
    const scale = Math.min(1, maxDim / Math.max(bitmap.width || 1, bitmap.height || 1));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.88)
    );
    if (!blob) return file;
    const baseName = (file.name || 'picha-ya-simu').replace(/\.[^.]+$/, '');
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

const MAX_VIDEO_BYTES = 95 * 1024 * 1024; // 95MB
const ALLOWED_VIDEO_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
  'video/3gpp',
  'video/x-matroska',
  'video/mpeg',
  'video/avi',
  'video/x-msvideo',
]);
const ALLOWED_VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', '3gp', 'mkv', 'mpeg', 'avi']);

export interface CloudinaryVideoUploadResult {
  secureUrl: string;
  publicId: string;
  thumbnailUrl: string;
  durationSec: number;
}

export function deriveCloudinaryVideoThumbnail(videoUrl: string): string {
  const clean = (videoUrl || '').trim();
  const marker = '/video/upload/';
  if (!clean.startsWith('https://res.cloudinary.com/') || !clean.includes(marker)) {
    return '';
  }
  const idx = clean.indexOf(marker);
  const head = clean.slice(0, idx + marker.length);
  const tail = clean.slice(idx + marker.length).replace(/\.[a-z0-9]+(\?.*)?$/i, '.jpg');
  return `${head}so_1,f_jpg,q_auto,w_720/${tail}`.slice(0, 500);
}

export function needsBrowserVideoTranscode(videoUrl: string): boolean {
  const clean = (videoUrl || '').trim().toLowerCase().split('?')[0];
  return /\.(mov|3gp|3gpp|mkv|avi|m4v|mpeg)$/i.test(clean);
}

export function optimizeCloudinaryVideoPlaybackUrl(
  videoUrl: string,
  options?: { dataSaver?: boolean; skipBitrateCap?: boolean; forceH264?: boolean }
): string {
  const clean = (videoUrl || '').trim();
  const marker = '/video/upload/';
  if (!clean.startsWith('https://res.cloudinary.com/') || !clean.includes(marker)) {
    return clean;
  }
  const idx = clean.indexOf(marker);
  const after = clean.slice(idx + marker.length);
  const dataSaver = options?.dataSaver === true;
  if (/^(?:[a-z_]+:[^/]+,?)+(\/|$)/i.test(after) || after.startsWith('f_')) {
    return clean;
  }
  const head = clean.slice(0, idx + marker.length);
  const mp4Tail = after.replace(/\.[a-z0-9]+(\?.*)?$/i, '.mp4');
  if (options?.forceH264 || needsBrowserVideoTranscode(clean)) {
    return dataSaver
      ? `${head}f_mp4,vc_h264,q_auto:eco,w_540,c_limit/${mp4Tail}`
      : `${head}f_mp4,vc_h264,q_auto:good,w_720,c_limit/${mp4Tail}`;
  }
  if (dataSaver) {
    return `${head}q_auto:eco,w_540,c_limit/${after}`;
  }
  return clean;
}

const prewarmedCloudinaryUrls = new Set<string>();

export function prewarmCloudinaryVideoUrl(url: string): void {
  const clean = (url || '').trim();
  if (!clean || !clean.startsWith('https://res.cloudinary.com/') || prewarmedCloudinaryUrls.has(clean)) {
    return;
  }
  prewarmedCloudinaryUrls.add(clean);
  void fetch(clean, { mode: 'cors', credentials: 'omit' }).catch(() => {});
}

export function optimizeCloudinaryPhotoUrl(
  imageUrl: string,
  options?: { dataSaver?: boolean }
): string {
  const clean = (imageUrl || '').trim();
  const marker = '/image/upload/';
  if (!clean.startsWith('https://res.cloudinary.com/') || !clean.includes(marker)) {
    return clean;
  }
  const idx = clean.indexOf(marker);
  const after = clean.slice(idx + marker.length);
  if (/^(?:[a-z_]+:[^/]+,?)+(\/|$)/i.test(after) || after.startsWith('f_')) {
    return clean;
  }
  const head = clean.slice(0, idx + marker.length);
  if (options?.dataSaver) {
    return `${head}f_auto,q_auto:eco,w_640,c_limit/${after}`;
  }
  return `${head}f_auto,q_auto:good,w_1080,c_limit/${after}`;
}

export async function uploadVideoToCloudinary(
  file: File,
  onProgress?: (percent: number) => void
): Promise<CloudinaryVideoUploadResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const mime = (file.type || '').toLowerCase();
  const typeOk =
    mime.startsWith('video/') ||
    ALLOWED_VIDEO_TYPES.has(mime) ||
    ALLOWED_VIDEO_EXTENSIONS.has(ext);

  if (!typeOk) {
    throw new Error('Aina hii ya video hairuhusiwi. Tumia MP4, MOV, M4V, 3GP, au WEBM.');
  }

  if (file.size <= 0) {
    throw new Error('Faili la video halina maudhui.');
  }

  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error('Video ni kubwa sana. Ukubwa usizidi MB 95.');
  }

  const { cloudName, uploadPreset, configured } = getCloudinaryConfig();
  if (!configured) {
    throw new Error(
      'Mipangilio ya Cloudinary (Cloud Name na Upload Preset) bado haijawekwa.'
    );
  }

  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/video/upload`;

  const result = await new Promise<{
    secure_url?: string;
    public_id?: string;
    duration?: number;
  }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint, true);

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        const pct = Math.min(99, Math.max(1, Math.round((ev.loaded / ev.total) * 100)));
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      try {
        const parsed = JSON.parse(xhr.responseText || '{}') as {
          secure_url?: string;
          public_id?: string;
          duration?: number;
          error?: { message?: string };
        };
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(100);
          resolve(parsed);
        } else {
          reject(
            new Error(
              parsed?.error?.message
                ? `Cloudinary: ${parsed.error.message}`
                : 'Imeshindwa kupakia video kwenda Cloudinary.'
            )
          );
        }
      } catch {
        reject(new Error('Imeshindwa kupakia video kwenda Cloudinary.'));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Mtandao umekatika wakati wa kupakia video. Jaribu tena.'));
    };

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);
    xhr.send(formData);
  });

  if (!result.secure_url || !result.secure_url.startsWith('https://')) {
    throw new Error('Cloudinary haikurudisha kiungo sahihi cha video.');
  }

  const secureUrl = result.secure_url.slice(0, 500);
  const publicId = String(result.public_id || '').slice(0, 240);
  const durationSec = Math.max(0, Math.min(1200, Math.round(Number(result.duration || 0))));
  const thumbnailUrl = deriveCloudinaryVideoThumbnail(secureUrl);

  return {
    secureUrl,
    publicId,
    thumbnailUrl,
    durationSec,
  };
}

const MALOSHA_LOGO_PID_STORAGE_KEY = 'malosha_watermark_logo_at_v3';
const MALOSHA_OUTRO_PID_STORAGE_KEY = 'malosha_outro_card_pid_v3';

function drawMaloshaCircularCrest(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  fillAlpha = 0.52
) {
  ctx.save();
  ctx.fillStyle = `rgba(10, 30, 51, ${fillAlpha})`;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.lineWidth = Math.max(2, radius * 0.032);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(252, 209, 22, 0.78)';
  ctx.lineWidth = Math.max(1.2, radius * 0.018);
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.9, 0, Math.PI * 2);
  ctx.stroke();

  const bW = radius * 0.56;
  const bH = radius * 0.39;
  const bx = cx - bW / 2;
  const by = cy - radius * 0.52;
  ctx.fillStyle = 'rgba(251, 191, 36, 0.94)';
  ctx.beginPath();
  ctx.roundRect(bx, by, bW, bH, radius * 0.11);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(bx + bW * 0.27, by + bH - 1);
  ctx.lineTo(bx + bW * 0.15, by + bH + radius * 0.12);
  ctx.lineTo(bx + bW * 0.46, by + bH - 1);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(14, 38, 64, 0.95)';
  [0.29, 0.5, 0.71].forEach((frac) => {
    ctx.beginPath();
    ctx.arc(bx + bW * frac, by + bH * 0.5, Math.max(2, radius * 0.036), 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${Math.round(radius * 0.24)}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.fillText('MALOSHA', cx, cy + radius * 0.21);

  ctx.fillStyle = 'rgba(253, 224, 71, 0.94)';
  ctx.font = `700 ${Math.round(radius * 0.155)}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.fillText('FORUMS', cx, cy + radius * 0.46);
  ctx.restore();
}

async function generateMaloshaWatermarkLogoFile(): Promise<File | null> {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 260;
  canvas.height = 268;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Circular Malosha Forums logo at top center
  drawMaloshaCircularCrest(ctx, 130, 96, 82, 0.48);

  // "@malosha forums" label directly underneath the logo
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 24px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
  ctx.fillText('@malosha forums', 130, 214);
  ctx.restore();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return null;
  return new File([blob], 'malosha-logo-handle-watermark.png', { type: 'image/png' });
}

async function generateMaloshaOutroCardFile(): Promise<File | null> {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 1280;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#07182B');
  grad.addColorStop(0.5, '#0D2643');
  grad.addColorStop(1, '#061322');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle radial golden spotlight behind crest
  const glow = ctx.createRadialGradient(360, 560, 20, 360, 560, 320);
  glow.addColorStop(0, 'rgba(251, 191, 36, 0.24)');
  glow.addColorStop(0.55, 'rgba(56, 189, 248, 0.12)');
  glow.addColorStop(1, 'rgba(7, 24, 43, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(360, 560, 320, 0, Math.PI * 2);
  ctx.fill();

  // Centered Malosha Forums circular emblem
  drawMaloshaCircularCrest(ctx, 360, 540, 148, 0.88);

  // Bold "@malosha forums" label directly below logo
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 44px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText('@malosha forums', 360, 748);

  // Subtle Tanzania accent strip below handle
  const barW = 240;
  const barX = 360 - barW / 2;
  const barY = 796;
  ctx.fillStyle = '#1EB53A';
  ctx.fillRect(barX, barY, barW * 0.35, 6);
  ctx.fillStyle = '#FCD116';
  ctx.fillRect(barX + barW * 0.35, barY, barW * 0.08, 6);
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(barX + barW * 0.43, barY, barW * 0.14, 6);
  ctx.fillStyle = '#FCD116';
  ctx.fillRect(barX + barW * 0.57, barY, barW * 0.08, 6);
  ctx.fillStyle = '#00A3DD';
  ctx.fillRect(barX + barW * 0.65, barY, barW * 0.35, 6);

  ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
  ctx.font = '700 22px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText('MALOSHA FORUMS · TANZANIA', 360, 842);
  ctx.restore();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return null;
  return new File([blob], 'malosha-outro-endcard.png', { type: 'image/png' });
}

async function uploadCachedCloudinaryPng(
  storageKey: string,
  fileFactory: () => Promise<File | null>
): Promise<string> {
  if (typeof window !== 'undefined') {
    const cached = window.localStorage.getItem(storageKey);
    if (cached && cached.trim().length > 2) {
      return cached.trim();
    }
  }

  const { cloudName, uploadPreset, configured } = getCloudinaryConfig();
  if (!configured) return '';

  const assetFile = await fileFactory();
  if (!assetFile) return '';

  const formData = new FormData();
  formData.append('file', assetFile);
  formData.append('upload_preset', uploadPreset);

  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
      { method: 'POST', body: formData }
    );
    if (!response.ok) return '';
    const data = (await response.json()) as { public_id?: string };
    const pid = (data.public_id || '').trim();
    if (pid && typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, pid);
    }
    return pid;
  } catch {
    return '';
  }
}

export async function ensureMaloshaWatermarkLogoPublicId(): Promise<string> {
  return uploadCachedCloudinaryPng(MALOSHA_LOGO_PID_STORAGE_KEY, generateMaloshaWatermarkLogoFile);
}

export async function ensureMaloshaOutroCardPublicId(): Promise<string> {
  return uploadCachedCloudinaryPng(MALOSHA_OUTRO_PID_STORAGE_KEY, generateMaloshaOutroCardFile);
}

export interface VideoWatermarkDownloadOptions {
  logoPublicId?: string;
  outroPublicId?: string;
  durationSec?: number;
  outroMode?: 'splice' | 'endOverlay' | 'watermarkOnly';
  dataSaver?: boolean;
}

export function buildWatermarkedVideoDownloadUrl(
  videoUrl: string,
  authorName: string,
  options?: string | VideoWatermarkDownloadOptions
): string {
  const clean = (videoUrl || '').trim();
  const marker = '/video/upload/';
  if (!clean.startsWith('https://res.cloudinary.com/') || !clean.includes(marker)) {
    return clean;
  }

  const opts: VideoWatermarkDownloadOptions =
    typeof options === 'string' ? { logoPublicId: options } : options || {};

  const idx = clean.indexOf(marker);
  const head = clean.slice(0, idx + marker.length);
  const tail = clean.slice(idx + marker.length).replace(/\.[a-z0-9]+(\?.*)?$/i, '.mp4');

  const safeSlug =
    (authorName || 'malosha')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 20) || 'video';
  const encodedBrandHandle = encodeURIComponent('@malosha forums');
  const fileSlug = `malosha-forums-${safeSlug}`;
  const isEco = opts.dataSaver !== false;
  const maxWidth = isEco ? 540 : 720;
  const bitrateCap = isEco ? 'br_550k' : 'br_950k';
  const qualityFlag = isEco ? 'q_auto:eco' : 'q_auto:good';

  const transforms: string[] = [];

  // Cap resolution first so overlays and outro match compact dimensions without inflating file MBs
  transforms.push(`w_${maxWidth},c_limit`);

  if (opts.logoPublicId && opts.logoPublicId.trim()) {
    const layerId = opts.logoPublicId.trim().replace(/\//g, ':');
    // Circular logo with "@malosha forums" directly underneath it (proportional, subtle & translucent)
    transforms.push(`l_${layerId},w_0.18,fl_relative,g_north_west,x_14,y_16,o_74/fl_layer_apply`);
  } else {
    transforms.push(
      `l_text:Arial_18_bold:${encodedBrandHandle},co_white,g_north_west,x_16,y_18,o_65/fl_layer_apply`
    );
  }

  // Append end-of-video Malosha Forums label bumper or timed end-card
  if (opts.outroMode === 'splice' && opts.outroPublicId && opts.outroPublicId.trim()) {
    const outroLayerId = opts.outroPublicId.trim().replace(/\//g, ':');
    transforms.push(
      `l_${outroLayerId},w_1.0,h_1.0,c_pad,b_rgb:07182B,fl_relative,du_1.6,fl_splice/fl_layer_apply`
    );
  } else if (
    opts.outroMode === 'endOverlay' &&
    opts.logoPublicId &&
    opts.logoPublicId.trim() &&
    (opts.durationSec || 0) >= 3
  ) {
    const layerId = opts.logoPublicId.trim().replace(/\//g, ':');
    const startSec = Math.max(1, Math.floor((opts.durationSec || 3) - 2));
    transforms.push(`l_${layerId},w_0.36,fl_relative,g_center,o_95,so_${startSec}/fl_layer_apply`);
  }

  transforms.push(`f_mp4,vc_h264,${qualityFlag},${bitrateCap},fl_attachment:${fileSlug}`);

  return `${head}${transforms.join('/')}/${tail}`;
}

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25MB
const ALLOWED_AUDIO_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',
  'audio/flac',
]);
const ALLOWED_AUDIO_EXTENSIONS = new Set(['mp3', 'm4a', 'aac', 'wav', 'ogg', 'webm', 'flac']);

export interface CloudinaryAudioUploadResult {
  secureUrl: string;
  publicId: string;
  durationSec: number;
}

export async function uploadAudioToCloudinary(
  file: File,
  onProgress?: (percent: number) => void
): Promise<CloudinaryAudioUploadResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const mime = (file.type || '').toLowerCase();
  const typeOk =
    mime.startsWith('audio/') ||
    ALLOWED_AUDIO_TYPES.has(mime) ||
    ALLOWED_AUDIO_EXTENSIONS.has(ext);

  if (!typeOk) {
    throw new Error('Aina hii ya sauti/muziki hairuhusiwi. Tumia MP3, M4A, WAV, AAC, au OGG.');
  }

  if (file.size <= 0) {
    throw new Error('Faili la muziki halina maudhui.');
  }

  if (file.size > MAX_AUDIO_BYTES) {
    throw new Error('Muziki ni mkubwa sana. Ukubwa usizidi MB 25.');
  }

  const { cloudName, uploadPreset, configured } = getCloudinaryConfig();
  if (!configured) {
    throw new Error(
      'Mipangilio ya Cloudinary (Cloud Name na Upload Preset) bado haijawekwa.'
    );
  }

  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/video/upload`;

  const result = await new Promise<{
    secure_url?: string;
    public_id?: string;
    duration?: number;
  }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint, true);

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        const pct = Math.min(99, Math.max(1, Math.round((ev.loaded / ev.total) * 100)));
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      try {
        const parsed = JSON.parse(xhr.responseText || '{}') as {
          secure_url?: string;
          public_id?: string;
          duration?: number;
          error?: { message?: string };
        };
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(100);
          resolve(parsed);
        } else {
          reject(
            new Error(
              parsed?.error?.message
                ? `Cloudinary: ${parsed.error.message}`
                : 'Imeshindwa kupakia muziki kwenda Cloudinary.'
            )
          );
        }
      } catch {
        reject(new Error('Imeshindwa kupakia muziki kwenda Cloudinary.'));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Mtandao umekatika wakati wa kupakia muziki. Jaribu tena.'));
    };

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);
    xhr.send(formData);
  });

  if (!result.secure_url || !result.secure_url.startsWith('https://')) {
    throw new Error('Cloudinary haikurudisha kiungo sahihi cha muziki.');
  }

  return {
    secureUrl: result.secure_url.slice(0, 500),
    publicId: String(result.public_id || '').slice(0, 240),
    durationSec: Math.max(0, Math.min(1200, Math.round(Number(result.duration || 0)))),
  };
}

async function prepareCompactFeedPhotoFile(file: File): Promise<File> {
  const prepared = await prepareSharedImageFile(file);
  if (prepared.type === 'image/gif') return prepared;
  if (
    prepared.size <= 900 * 1024 ||
    typeof document === 'undefined' ||
    typeof createImageBitmap === 'undefined'
  ) {
    return prepared;
  }

  try {
    const bitmap = await createImageBitmap(prepared);
    const maxDim = 1440;
    const scale = Math.min(1, maxDim / Math.max(bitmap.width || 1, bitmap.height || 1));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return prepared;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.84)
    );
    if (!blob || blob.size >= prepared.size) return prepared;
    const baseName = (prepared.name || 'picha').replace(/\.[^.]+$/, '');
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
  } catch {
    return prepared;
  }
}

export async function uploadPhotoCarouselToCloudinary(
  files: File[],
  onProgress?: (percent: number) => void
): Promise<string[]> {
  const limited = files.slice(0, 10);
  if (limited.length === 0) {
    throw new Error('Chagua angalau picha 1.');
  }

  const urls: string[] = [];
  for (let i = 0; i < limited.length; i++) {
    const prepared = await prepareCompactFeedPhotoFile(limited[i]);
    const url = await uploadImageToCloudinary(prepared);
    urls.push(url);
    onProgress?.(Math.round(((i + 1) / limited.length) * 100));
  }
  return urls;
}

export function buildWatermarkedPhotoDownloadUrl(
  imageUrl: string,
  _authorName: string,
  logoPublicId?: string
): string {
  const clean = (imageUrl || '').trim();
  const marker = '/image/upload/';
  if (!clean.startsWith('https://res.cloudinary.com/') || !clean.includes(marker)) {
    return clean;
  }

  const idx = clean.indexOf(marker);
  const head = clean.slice(0, idx + marker.length);
  const tail = clean.slice(idx + marker.length).replace(/\.[a-z0-9]+(\?.*)?$/i, '.jpg');

  const encodedBrandHandle = encodeURIComponent('@malosha forums');
  const fileSlug = 'malosha-forums-photo';

  const transforms: string[] = [];
  if (logoPublicId && logoPublicId.trim()) {
    const layerId = logoPublicId.trim().replace(/\//g, ':');
    transforms.push(`l_${layerId},w_120,c_scale,g_north_west,x_18,y_18,o_68/fl_layer_apply`);
  } else {
    transforms.push(
      `l_text:Arial_20_bold:${encodedBrandHandle},co_white,g_north_west,x_18,y_18,o_60/fl_layer_apply`
    );
  }
  transforms.push(`f_jpg,q_auto:good,fl_attachment:${fileSlug}`);

  return `${head}${transforms.join('/')}/${tail}`;
}

async function loadImageElementCors(srcUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = srcUrl;
  });
}

export async function downloadWatermarkedPhoto(
  imageUrl: string,
  authorName: string,
  fileName: string
): Promise<void> {
  const logoPid = await ensureMaloshaWatermarkLogoPublicId();
  const fallbackUrl = buildWatermarkedPhotoDownloadUrl(imageUrl, authorName, logoPid);
  const finalFileName = /\.(jpe?g|png|webp)$/i.test(fileName)
    ? fileName.replace(/\.(png|webp)$/i, '.jpg')
    : `${fileName}.jpg`;

  try {
    const canvas = document.createElement('canvas');
    let drawn = false;

    try {
      const res = await fetch(imageUrl, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) throw new Error('Fetch failed');
      const srcBlob = await res.blob();
      const bitmap = await createImageBitmap(srcBlob);
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0);
        drawn = true;
      }
      bitmap.close();
    } catch {
      const img = await loadImageElementCors(imageUrl);
      canvas.width = img.naturalWidth || img.width || 1080;
      canvas.height = img.naturalHeight || img.height || 1080;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        drawn = true;
      }
    }

    const ctx = canvas.getContext('2d');
    if (!drawn || !ctx) {
      throw new Error('No canvas context');
    }

    const baseDim = Math.max(480, Math.min(canvas.width, canvas.height));
    const scale = baseDim / 720;

    // Subtle translucent circular seal in top-left corner with "@malosha forums" underneath
    const pad = Math.round(22 * scale);
    const radius = Math.round(40 * scale);
    const cx = pad + radius + Math.round(22 * scale);
    const cy = pad + radius;

    ctx.save();
    ctx.globalAlpha = 0.68;
    drawMaloshaCircularCrest(ctx, cx, cy, radius, 0.56);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.round(13 * scale)}px system-ui, -apple-system, sans-serif`;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
    ctx.shadowBlur = Math.round(4 * scale);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('@malosha forums', cx, cy + radius + Math.round(16 * scale));
    ctx.restore();

    const outBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.94)
    );
    if (!outBlob) throw new Error('Canvas export failed');

    const blobUrl = URL.createObjectURL(outBlob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = finalFileName;
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 8000);
  } catch {
    const a = document.createElement('a');
    a.href = fallbackUrl || imageUrl;
    a.download = finalFileName;
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}


