/**
 * Compress a phone photo in the browser before upload.
 * Redrawing through a canvas drops all EXIF metadata, including GPS location.
 */
const MAX_EDGE = 1600;
const QUALITY = 0.8;

export async function compressImage(file) {
  const src = await loadSource(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(src.width, src.height));
  const w = Math.round(src.width * scale);
  const h = Math.round(src.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(src, 0, 0, w, h);
  if (typeof src.close === 'function') src.close();

  // Older Safari can't encode WebP and returns PNG instead; use JPEG then.
  const webp = await toBlob(canvas, 'image/webp');
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await toBlob(canvas, 'image/jpeg');
  if (!jpeg) throw new Error('Could not compress image');
  return jpeg;
}

async function loadSource(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall back to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const toBlob = (canvas, type) => new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));

export const extFor = (blob) => (blob.type === 'image/webp' ? 'webp' : 'jpg');
