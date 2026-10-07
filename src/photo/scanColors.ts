import { gaussianBlurRGBA, luma, padWhite, resizeRGBA, type RGBA } from './imageOps';

export type LookName = 'soft' | 'firm' | 'max';

export interface ScanLook {
  /** Dark modules are darkened to at most this luminance, only where the photo is brighter. */
  dark: number;
  /** Light modules are lightened to at least this luminance, only where the photo is darker. */
  light: number;
  /** Width of the adjusted patch at the center of each module, as a fraction of the module. */
  patch: number;
  finderDark: number;
  finderLight: number;
}

/** From most photo-like to easiest to scan. */
export const SCAN_LOOKS: Record<LookName, ScanLook> = {
  soft: { dark: 60, light: 195, patch: 0.6, finderDark: 35, finderLight: 215 },
  firm: { dark: 45, light: 210, patch: 0.6, finderDark: 30, finderLight: 220 },
  max: { dark: 30, light: 225, patch: 0.8, finderDark: 25, finderLight: 230 },
};
export const LOOK_ORDER: LookName[] = ['soft', 'firm', 'max'];

/** Move a pixel to a target luminance while keeping its hue (scale down, or blend toward white). */
function toLuminance(r: number, g: number, b: number, target: number): [number, number, number] {
  const y = luma(r, g, b);
  if (y < 2) return [target, target, target];
  if (target <= y) {
    const f = target / y;
    return [r * f, g * f, b * f];
  }
  const t = (target - y) / (255 - y);
  return [r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t];
}

/**
 * The picture as the scan view shows it. Each module's center patch is nudged just far enough toward dark or
 * light for a camera to read it; where the photo already has the right tone nothing changes. The three finder
 * squares are made strong over their whole 8x8 area so the code is found reliably, even when tilted.
 */
export function fitScanColors(photo: RGBA, modules: number, moduleVoxels: number, matrix: Uint8Array, look: ScanLook): RGBA {
  const S = modules * moduleVoxels;
  if (photo.width !== S || photo.height !== S) throw new Error('Photo must be resampled to modules x moduleVoxels.');
  const out = new Uint8ClampedArray(photo.data.length);
  const patch = Math.max(1, Math.round(look.patch * moduleVoxels));
  const lo = Math.floor((moduleVoxels - patch) / 2);
  const n8 = modules - 8;
  for (let y = 0; y < S; y++) {
    const row = Math.floor(y / moduleVoxels);
    const ly = y % moduleVoxels;
    for (let x = 0; x < S; x++) {
      const col = Math.floor(x / moduleVoxels);
      const lx = x % moduleVoxels;
      const o = (y * S + x) * 4;
      const r = photo.data[o], g = photo.data[o + 1], b = photo.data[o + 2];
      const dark = matrix[row * modules + col] === 1;
      const inFinder = (row < 8 && col < 8) || (row < 8 && col >= n8) || (row >= n8 && col < 8);
      const inPatch = lx >= lo && lx < lo + patch && ly >= lo && ly < lo + patch;
      let result: [number, number, number] = [r, g, b];
      if (inFinder || inPatch) {
        const y0 = luma(r, g, b);
        const [limitDark, limitLight] = inFinder ? [look.finderDark, look.finderLight] : [look.dark, look.light];
        const target = dark ? Math.min(y0, limitDark) : Math.max(y0, limitLight);
        if (target !== y0) result = toLuminance(r, g, b, target);
      }
      out[o] = result[0];
      out[o + 1] = result[1];
      out[o + 2] = result[2];
      out[o + 3] = 255;
    }
  }
  return { data: out, width: S, height: S };
}

/** The flat top-down view with the 4-module white quiet zone a scanner expects. */
export function flatScanImage(fitted: RGBA, moduleVoxels: number): RGBA {
  return padWhite(fitted, 4 * moduleVoxels);
}

/** Imitate a phone camera pointed at a screen: shrink the image (code plus quiet zone) to `width` pixels and blur it. */
export function simulateCamera(flat: RGBA, width: number, sigma: number): RGBA {
  return gaussianBlurRGBA(resizeRGBA(flat, width, width), sigma);
}

/** Decode a flat scan image (injected so tests and the app can each bring their own decoder). */
export type Decoder = (image: RGBA) => Promise<string | null>;

// Width in pixels of the whole image (code plus quiet zone) and blur, from a small, soft shot to a comfortable one.
const CAMERA_TRIALS: [number, number][] = [[300, 1.1], [330, 0.8], [360, 1.1], [440, 0.9], [520, 0.7]];

/** The most photo-like look that still decodes both cleanly and through simulated camera blur. */
export async function chooseLook(
  photo: RGBA, modules: number, moduleVoxels: number, matrix: Uint8Array, expected: string, decode: Decoder,
  order: LookName[] = LOOK_ORDER,
): Promise<{ look: LookName; verified: boolean }> {
  for (const name of order) {
    const flat = flatScanImage(fitScanColors(photo, modules, moduleVoxels, matrix, SCAN_LOOKS[name]), moduleVoxels);
    if ((await decode(flat)) !== expected) continue;
    let ok = true;
    for (const [width, sigma] of CAMERA_TRIALS) {
      if ((await decode(simulateCamera(flat, width, sigma))) !== expected) { ok = false; break; }
    }
    if (ok) return { look: name, verified: true };
  }
  return { look: order[order.length - 1], verified: false };
}
