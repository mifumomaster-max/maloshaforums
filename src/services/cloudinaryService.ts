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

  const endpoint = isImage ? 'image/upload' : 'auto/upload';
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
    mimeType: (file.type || (isImage ? 'image/jpeg' : 'application/octet-stream')).slice(0, 120),
    attachmentType: isImage ? 'image' : 'document',
  };
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
]);
const ALLOWED_VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', '3gp']);

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

export async function uploadVideoToCloudinary(
  file: File,
  onProgress?: (percent: number) => void
): Promise<CloudinaryVideoUploadResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const typeOk =
    ALLOWED_VIDEO_TYPES.has((file.type || '').toLowerCase()) ||
    ALLOWED_VIDEO_EXTENSIONS.has(ext);

  if (!typeOk) {
    throw new Error('Aina hii ya video hairuhusiwi. Tumia MP4, MOV, M4V, au WEBM.');
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

const MALOSHA_LOGO_PID_STORAGE_KEY = 'malosha_watermark_logo_pid_v1';

async function generateMaloshaWatermarkLogoFile(): Promise<File | null> {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 460;
  canvas.height = 112;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Translucent dark navy badge pill
  const r = 24;
  ctx.fillStyle = 'rgba(10, 30, 51, 0.82)';
  ctx.beginPath();
  ctx.moveTo(r, 4);
  ctx.lineTo(canvas.width - r, 4);
  ctx.quadraticCurveTo(canvas.width - 4, 4, canvas.width - 4, r);
  ctx.lineTo(canvas.width - 4, canvas.height - r);
  ctx.quadraticCurveTo(canvas.width - 4, canvas.height - 4, canvas.width - r, canvas.height - 4);
  ctx.lineTo(r, canvas.height - 4);
  ctx.quadraticCurveTo(4, canvas.height - 4, 4, canvas.height - r);
  ctx.lineTo(4, r);
  ctx.quadraticCurveTo(4, 4, r, 4);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(245, 158, 11, 0.9)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Golden rounded square emblem matching app brand
  const bx = 18;
  const by = 18;
  const bs = 76;
  const br = 18;
  const grad = ctx.createLinearGradient(bx, by, bx + bs, by + bs);
  grad.addColorStop(0, '#FBBF24');
  grad.addColorStop(1, '#D97706');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(bx + br, by);
  ctx.lineTo(bx + bs - br, by);
  ctx.quadraticCurveTo(bx + bs, by, bx + bs, by + br);
  ctx.lineTo(bx + bs, by + bs - br);
  ctx.quadraticCurveTo(bx + bs, by + bs, bx + bs - br, by + bs);
  ctx.lineTo(bx + br, by + bs);
  ctx.quadraticCurveTo(bx, by + bs, bx, by + bs - br);
  ctx.lineTo(bx, by + br);
  ctx.quadraticCurveTo(bx, by, bx + br, by);
  ctx.closePath();
  ctx.fill();

  // White speech bubble inside emblem
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.roundRect(bx + 15, by + 16, 46, 34, 8);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(bx + 26, by + 48);
  ctx.lineTo(bx + 20, by + 60);
  ctx.lineTo(bx + 36, by + 48);
  ctx.closePath();
  ctx.fill();

  // 3 Navy dots inside bubble
  ctx.fillStyle = '#0E2640';
  for (const dx of [28, 38, 48]) {
    ctx.beginPath();
    ctx.arc(bx + dx, by + 33, 3.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Wordmark text
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 32px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('Malosha Forums', 110, 46);

  ctx.fillStyle = '#FCD34D';
  ctx.font = '700 18px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText('SAUTI YA JAMII · REELS', 112, 80);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return null;
  return new File([blob], 'malosha-watermark-logo.png', { type: 'image/png' });
}

export async function ensureMaloshaWatermarkLogoPublicId(): Promise<string> {
  if (typeof window !== 'undefined') {
    const cached = window.localStorage.getItem(MALOSHA_LOGO_PID_STORAGE_KEY);
    if (cached && cached.trim().length > 2) {
      return cached.trim();
    }
  }

  const { cloudName, uploadPreset, configured } = getCloudinaryConfig();
  if (!configured) return '';

  const logoFile = await generateMaloshaWatermarkLogoFile();
  if (!logoFile) return '';

  const formData = new FormData();
  formData.append('file', logoFile);
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
      window.localStorage.setItem(MALOSHA_LOGO_PID_STORAGE_KEY, pid);
    }
    return pid;
  } catch {
    return '';
  }
}

export function buildWatermarkedVideoDownloadUrl(
  videoUrl: string,
  authorName: string,
  logoPublicId?: string
): string {
  const clean = (videoUrl || '').trim();
  const marker = '/video/upload/';
  if (!clean.startsWith('https://res.cloudinary.com/') || !clean.includes(marker)) {
    return clean;
  }

  const idx = clean.indexOf(marker);
  const head = clean.slice(0, idx + marker.length);
  const tail = clean.slice(idx + marker.length).replace(/\.[a-z0-9]+(\?.*)?$/i, '.mp4');

  const safeHandle = (authorName || 'Mwanachama')
    .trim()
    .replace(/[^a-zA-Z0-9._\s-]/g, '')
    .slice(0, 24) || 'Mwanachama';
  const encodedHandle = encodeURIComponent(`@${safeHandle} | Malosha Forums`);
  const encodedBrand = encodeURIComponent('MALOSHA FORUMS');
  const fileSlug = `malosha-forums-${safeHandle.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'video'}`;

  const transforms: string[] = [];

  if (logoPublicId && logoPublicId.trim()) {
    const layerId = logoPublicId.trim().replace(/\//g, ':');
    transforms.push(`l_${layerId},w_230,g_north_west,x_24,y_28,o_94/fl_layer_apply`);
  } else {
    transforms.push(
      `l_text:Arial_28_bold:${encodedBrand},co_white,b_rgb:0A1E33,g_north_west,x_24,y_28,o_88/fl_layer_apply`
    );
  }

  transforms.push(
    `l_text:Arial_22_bold:${encodedHandle},co_rgb:FDE68A,b_rgb:0A1E33,g_south_east,x_24,y_38,o_88/fl_layer_apply`
  );
  transforms.push(`f_mp4,fl_attachment:${fileSlug}`);

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
    const prepared = await prepareSharedImageFile(limited[i]);
    const url = await uploadImageToCloudinary(prepared);
    urls.push(url);
    onProgress?.(Math.round(((i + 1) / limited.length) * 100));
  }
  return urls;
}

export function buildWatermarkedPhotoDownloadUrl(
  imageUrl: string,
  authorName: string,
  logoPublicId?: string
): string {
  const clean = (imageUrl || '').trim();
  const marker = '/image/upload/';
  if (!clean.startsWith('https://res.cloudinary.com/') || !clean.includes(marker)) {
    return clean;
  }

  const idx = clean.indexOf(marker);
  const head = clean.slice(0, idx + marker.length);
  const tail = clean.slice(idx + marker.length).replace(/\.[a-z0-9]+(\?.*)?$/i, '.png');

  const safeHandle =
    (authorName || 'Mwanachama')
      .trim()
      .replace(/[^a-zA-Z0-9._\s-]/g, '')
      .slice(0, 24) || 'Mwanachama';
  const encodedHandle = encodeURIComponent(`@${safeHandle} | Malosha Forums`);
  const encodedBrand = encodeURIComponent('MALOSHA FORUMS');
  const fileSlug = `malosha-forums-${safeHandle.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'photo'}`;

  const transforms: string[] = [];
  if (logoPublicId && logoPublicId.trim()) {
    const layerId = logoPublicId.trim().replace(/\//g, ':');
    transforms.push(`l_${layerId},w_220,g_north_west,x_24,y_24,o_94/fl_layer_apply`);
  } else {
    transforms.push(
      `l_text:Arial_26_bold:${encodedBrand},co_white,b_rgb:0A1E33,g_north_west,x_24,y_24,o_90/fl_layer_apply`
    );
  }
  transforms.push(
    `l_text:Arial_20_bold:${encodedHandle},co_rgb:FDE68A,b_rgb:0A1E33,g_south_east,x_24,y_24,o_90/fl_layer_apply`
  );
  transforms.push(`f_png,fl_attachment:${fileSlug}`);

  return `${head}${transforms.join('/')}/${tail}`;
}

export async function downloadWatermarkedPhoto(
  imageUrl: string,
  authorName: string,
  fileName: string
): Promise<void> {
  const logoPid = await ensureMaloshaWatermarkLogoPublicId();
  const fallbackUrl = buildWatermarkedPhotoDownloadUrl(imageUrl, authorName, logoPid);

  try {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error('Fetch failed');
    const srcBlob = await res.blob();
    const bitmap = await createImageBitmap(srcBlob);

    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      throw new Error('No canvas context');
    }

    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const baseDim = Math.max(480, Math.min(canvas.width, canvas.height));
    const scale = baseDim / 720;

    // Top-left Malosha Forums emblem badge
    const pad = Math.round(20 * scale);
    const pillW = Math.round(250 * scale);
    const pillH = Math.round(56 * scale);
    ctx.save();
    ctx.fillStyle = 'rgba(10, 30, 51, 0.84)';
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.92)';
    ctx.lineWidth = Math.max(2, Math.round(2.5 * scale));
    ctx.beginPath();
    ctx.roundRect(pad, pad, pillW, pillH, Math.round(14 * scale));
    ctx.fill();
    ctx.stroke();

    const boxSize = Math.round(36 * scale);
    const boxX = pad + Math.round(10 * scale);
    const boxY = pad + Math.round((pillH - boxSize) / 2);
    const grad = ctx.createLinearGradient(boxX, boxY, boxX + boxSize, boxY + boxSize);
    grad.addColorStop(0, '#FBBF24');
    grad.addColorStop(1, '#D97706');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxSize, boxSize, Math.round(9 * scale));
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `800 ${Math.round(19 * scale)}px system-ui, -apple-system, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText('Malosha Forums', boxX + boxSize + Math.round(10 * scale), pad + Math.round(pillH * 0.42));

    ctx.fillStyle = '#FCD34D';
    ctx.font = `700 ${Math.round(11 * scale)}px system-ui, -apple-system, sans-serif`;
    ctx.fillText('SAUTI YA JAMII', boxX + boxSize + Math.round(10 * scale), pad + Math.round(pillH * 0.74));

    // Bottom-right author handle badge
    const handleText = `@${(authorName || 'Mwanachama').trim().slice(0, 24)} · Malosha Forums`;
    ctx.font = `700 ${Math.round(16 * scale)}px system-ui, -apple-system, sans-serif`;
    const metrics = ctx.measureText(handleText);
    const bW = Math.round(metrics.width + 26 * scale);
    const bH = Math.round(36 * scale);
    const bX = Math.max(pad, canvas.width - bW - pad);
    const bY = Math.max(pad, canvas.height - bH - pad);

    ctx.fillStyle = 'rgba(10, 30, 51, 0.82)';
    ctx.beginPath();
    ctx.roundRect(bX, bY, bW, bH, Math.round(10 * scale));
    ctx.fill();

    ctx.fillStyle = '#FDE68A';
    ctx.fillText(handleText, bX + Math.round(13 * scale), bY + bH / 2);
    ctx.restore();

    const outBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png', 0.94)
    );
    if (!outBlob) throw new Error('Canvas export failed');

    const blobUrl = URL.createObjectURL(outBlob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
  } catch {
    const a = document.createElement('a');
    a.href = fallbackUrl || imageUrl;
    a.download = fileName;
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}


