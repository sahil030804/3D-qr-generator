import type { DepthResult } from '../photo/depth';
import type { RGBA } from '../photo/imageOps';
import type { EmbedPhoto } from './embed';

export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
const WORKING_SIZE = 512;

export class PhotoReadError extends Error {}

/** Decode an image file and center-crop it to a square at a fixed working size, honoring camera orientation. */
export async function readPhoto(file: Blob): Promise<RGBA> {
  if (file.size > MAX_PHOTO_BYTES) throw new PhotoReadError('That photo is larger than 25 MB. Try a smaller one.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new PhotoReadError('Could not read that image. Try a JPG, PNG or WebP photo.');
  }
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = WORKING_SIZE;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new PhotoReadError('Canvas is not available in this browser.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, WORKING_SIZE, WORKING_SIZE);
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, WORKING_SIZE, WORKING_SIZE);
    const image = context.getImageData(0, 0, WORKING_SIZE, WORKING_SIZE);
    return { data: image.data, width: WORKING_SIZE, height: WORKING_SIZE };
  } finally {
    bitmap.close();
  }
}

/** The photo the user chose, plus its depth map, which is computed once and reused as the text changes. */
export class PhotoSession {
  square: RGBA | null = null;
  name = '';
  private depth: Promise<DepthResult> | null = null;

  get ready(): boolean {
    return this.square !== null;
  }

  async load(file: File): Promise<void> {
    if (!file.type.startsWith('image/')) throw new PhotoReadError('That file is not an image.');
    this.square = await readPhoto(file);
    this.name = file.name;
    this.depth = null;
  }

  depthFor(estimate: (image: RGBA, onStatus: (message: string) => void) => Promise<DepthResult>, onStatus: (message: string) => void): Promise<DepthResult> {
    if (!this.square) return Promise.reject(new Error('No photo loaded.'));
    this.depth ??= estimate(this.square, onStatus);
    return this.depth;
  }
}

// ---------- Carrying a photo inside an embed link ----------
// An embed is a standalone page with no server of its own, so a photo it shows has to travel inside the iframe's
// URL: a small, re-compressed copy, base64url-encoded into the hash (never the query, which real servers cap
// around 8 KB; the hash is never sent over the network at all).

const EMBED_PHOTO_SIZE = 320;
const EMBED_PHOTO_QUALITY = 0.82;
/** Longest base64url payload accepted back from an embed hash (~375 KB decoded). */
const MAX_EMBED_DATA_CHARS = 500_000;
const EMBED_FILE_MIMES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

function bytesToBase64Url(bytes: Uint8Array): string {
  const parts: string[] = [];
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
  }
  return btoa(parts.join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  if (!value || value.length > MAX_EMBED_DATA_CHARS || !/^[A-Za-z0-9\-_]*$/.test(value)) {
    throw new PhotoReadError('Could not read the embedded photo.');
  }
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    throw new PhotoReadError('Could not read the embedded photo.');
  }
}

/** Re-compress a loaded photo small enough to live inside a URL, for the embed link. */
export async function photoToEmbedData(image: RGBA, size = EMBED_PHOTO_SIZE, quality = EMBED_PHOTO_QUALITY): Promise<{ data: string; mime: string }> {
  const source = document.createElement('canvas');
  source.width = image.width;
  source.height = image.height;
  const sourceContext = source.getContext('2d');
  if (!sourceContext) throw new PhotoReadError('Canvas is not available in this browser.');
  sourceContext.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  const out = document.createElement('canvas');
  out.width = out.height = size;
  const context = out.getContext('2d');
  if (!context) throw new PhotoReadError('Canvas is not available in this browser.');
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, size, size);
  const blob = await new Promise<Blob>((resolve, reject) => {
    out.toBlob((result) => (result ? resolve(result) : reject(new PhotoReadError('Could not prepare the photo for embedding.'))), 'image/jpeg', quality);
  });
  return { data: bytesToBase64Url(new Uint8Array(await blob.arrayBuffer())), mime: blob.type };
}

/** The reverse of {@link photoToEmbedData}: turn an embed link's photo data back into a file `PhotoSession.load` accepts. */
export function embedDataToFile(photo: Pick<EmbedPhoto, 'data' | 'mime'>): File {
  const mime = photo.mime.split(';')[0].trim().toLowerCase() || 'image/jpeg';
  if (!EMBED_FILE_MIMES.includes(mime)) throw new PhotoReadError('Could not read the embedded photo.');
  return new File([base64UrlToBytes(photo.data)], 'embed.jpg', { type: mime });
}
