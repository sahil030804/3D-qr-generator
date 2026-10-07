import { boxBlur } from './imageOps';

export interface ReliefOptions {
  /** Tallest point of the relief, in voxels. */
  maxHeight: number;
  /** Depth curve: above 1 flattens the background and sharpens the subject. */
  gamma: number;
  /** Blur radius (in voxels) applied twice to remove depth-map noise. */
  smoothing: number;
  /** Fraction of the picture width over which the relief fades to zero at the edges. */
  edgeTaper: number;
  /** How strongly slopes darken or brighten in the baked lighting. */
  exaggeration: number;
}

export const DEFAULT_RELIEF: ReliefOptions = { maxHeight: 44, gamma: 1, smoothing: 2, edgeTaper: 0.14, exaggeration: 1.3 };

const smoothstep = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** Turn a 0..1 depth map into voxel heights: smoothed, shaped and faded toward the borders. */
export function shapeHeights(depth: Float32Array, size: number, options: ReliefOptions = DEFAULT_RELIEF): Float32Array {
  const smooth = boxBlur(boxBlur(depth, size, options.smoothing), size, options.smoothing);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const edge = Math.min(x, size - 1 - x, y, size - 1 - y) / size;
      const window = options.edgeTaper > 0 ? smoothstep(edge / options.edgeTaper) : 1;
      heights[y * size + x] = Math.pow(Math.min(1, Math.max(0, smooth[y * size + x])), options.gamma) * options.maxHeight * window;
    }
  }
  return heights;
}

/**
 * Baked relief lighting: how much light each column's surface catches from the sun, as a multiplier
 * for its color (about 0.5 in shadow, 1 on flat ground, up to 1.35 on slopes facing the light).
 */
export function hillshade(heights: Float32Array, size: number, sun: readonly [number, number, number], exaggeration: number): Float32Array {
  const shade = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xl = Math.max(0, x - 1), xr = Math.min(size - 1, x + 1);
      const yu = Math.max(0, y - 1), yd = Math.min(size - 1, y + 1);
      const gx = ((heights[y * size + xr] - heights[y * size + xl]) / (xr - xl || 1)) * exaggeration;
      const gz = ((heights[yd * size + x] - heights[yu * size + x]) / (yd - yu || 1)) * exaggeration;
      const length = Math.hypot(gx, 1, gz);
      const lambert = Math.max(0, (-gx / length) * sun[0] + (1 / length) * sun[1] + (-gz / length) * sun[2]);
      shade[y * size + x] = Math.min(1.35, Math.max(0.5, 0.45 + 0.65 * (lambert / sun[1])));
    }
  }
  return shade;
}
