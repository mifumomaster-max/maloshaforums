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
