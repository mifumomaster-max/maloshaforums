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
