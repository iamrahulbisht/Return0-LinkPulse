// Shrinks a chosen photo in the browser before upload: centre-crops to a square and resizes to 256 × 256.
// A phone photo of several MB becomes a few dozen KB, so it fits the API's 1 MB limit and loads fast.

export const AVATAR_SIZE = 256;
export const AVATAR_ACCEPT = 'image/png,image/jpeg,image/webp';
/** Raw files above this are refused before reading (decoding huge images can freeze a phone). */
export const AVATAR_MAX_INPUT_BYTES = 15 * 1024 * 1024;

export class ImageError extends Error {}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageError('This file could not be read as a photo. Try a PNG, JPEG or WebP.'));
    };
    img.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function prepareAvatar(file: File): Promise<{ blob: Blob; name: string }> {
  if (!AVATAR_ACCEPT.split(',').includes(file.type)) throw new ImageError('Use a PNG, JPEG or WebP photo.');
  if (file.size > AVATAR_MAX_INPUT_BYTES) throw new ImageError('That photo is too large. Pick one under 15 MB.');
  const img = await loadImage(file);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  if (!side) throw new ImageError('This photo looks empty. Try another one.');
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageError('Your browser could not prepare the photo.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  // WebP where the browser can encode it, otherwise JPEG (older Safari returns null or PNG for WebP).
  const webp = await toBlob(canvas, 'image/webp', 0.88);
  if (webp && webp.type === 'image/webp') return { blob: webp, name: 'avatar.webp' };
  const jpeg = await toBlob(canvas, 'image/jpeg', 0.9);
  if (!jpeg) throw new ImageError('Your browser could not prepare the photo.');
  return { blob: jpeg, name: 'avatar.jpg' };
}
