/** Median-cut color quantizer with a fast cached nearest-color lookup. */

export type Color = [number, number, number];

/** `rgb` is packed r,g,b triples. Returns up to `k` representative colors. */
export function medianCut(rgb: Uint8ClampedArray | Uint8Array, k: number, stride = 1): Color[] {
  const total = Math.floor(rgb.length / 3);
  const count = Math.ceil(total / stride);
  const index = new Uint32Array(count);
  for (let i = 0; i < count; i++) index[i] = i * stride;

  interface Box { start: number; end: number }
  const boxes: Box[] = [{ start: 0, end: count }];
  const channelRange = (box: Box): { channel: number; range: number } => {
    const min = [255, 255, 255];
    const max = [0, 0, 0];
    for (let i = box.start; i < box.end; i++) {
      const o = index[i] * 3;
      for (let c = 0; c < 3; c++) {
        const v = rgb[o + c];
        if (v < min[c]) min[c] = v;
        if (v > max[c]) max[c] = v;
      }
    }
    let channel = 0;
    let range = -1;
    for (let c = 0; c < 3; c++) if (max[c] - min[c] > range) { range = max[c] - min[c]; channel = c; }
    return { channel, range };
  };

  while (boxes.length < k) {
    let best = -1;
    let bestScore = 0;
    let bestChannel = 0;
    for (let b = 0; b < boxes.length; b++) {
      const size = boxes[b].end - boxes[b].start;
      if (size < 2) continue;
      const { channel, range } = channelRange(boxes[b]);
      const score = range * Math.sqrt(size);
      if (score > bestScore) { bestScore = score; best = b; bestChannel = channel; }
    }
    if (best < 0) break;
    const box = boxes[best];
    const slice = index.subarray(box.start, box.end);
    slice.sort((a, c) => rgb[a * 3 + bestChannel] - rgb[c * 3 + bestChannel]);
    const mid = box.start + ((box.end - box.start) >> 1);
    boxes.splice(best, 1, { start: box.start, end: mid }, { start: mid, end: box.end });
  }

  return boxes.map((box) => {
    const sum = [0, 0, 0];
    for (let i = box.start; i < box.end; i++) for (let c = 0; c < 3; c++) sum[c] += rgb[index[i] * 3 + c];
    const n = Math.max(1, box.end - box.start);
    return [Math.round(sum[0] / n), Math.round(sum[1] / n), Math.round(sum[2] / n)] as Color;
  });
}

/** Nearest palette entry for any color, cached on a 5-bit-per-channel grid. */
export class PaletteLookup {
  private readonly cache = new Int16Array(32768).fill(-1);
  constructor(private readonly colors: Color[]) {}

  nearest(r: number, g: number, b: number): number {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const hit = this.cache[key];
    if (hit >= 0) return hit;
    // Evaluate at the bucket centre so the answer is the same for every color in the bucket.
    const cr = (r & ~7) + 4;
    const cg = (g & ~7) + 4;
    const cb = (b & ~7) + 4;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < this.colors.length; i++) {
      const c = this.colors[i];
      const d = (c[0] - cr) ** 2 + (c[1] - cg) ** 2 + (c[2] - cb) ** 2;
      if (d < bestDist) { bestDist = d; best = i; }
    }
    this.cache[key] = best;
    return best;
  }
}
