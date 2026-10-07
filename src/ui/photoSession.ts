import type { DepthResult } from '../photo/depth';
import type { RGBA } from '../photo/imageOps';

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
