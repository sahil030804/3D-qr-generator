import { boxBlur, luma, resizePlane, resizeRGBA, type RGBA } from './imageOps';

const WORK = 160;

/**
 * A model-free bas-relief: separate the subject from the background by color, round it into a dome and add a
 * little brightness detail. Much cruder than a depth network, but it needs no download and works offline.
 */
export function heuristicDepth(image: RGBA): Float32Array {
  const small = resizeRGBA(image, WORK, WORK);
  const n = WORK * WORK;

  // Background color = median of the border pixels.
  const border: number[][] = [[], [], []];
  for (let i = 0; i < WORK; i++) {
    for (const j of [0, 1, WORK - 2, WORK - 1]) {
      for (const idx of [j * WORK + i, i * WORK + j]) for (let c = 0; c < 3; c++) border[c].push(small.data[idx * 4 + c]);
    }
  }
  const bg = border.map((values) => values.sort((a, b) => a - b)[values.length >> 1]);

  const mask = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(small.data[i * 4] - bg[0], small.data[i * 4 + 1] - bg[1], small.data[i * 4 + 2] - bg[2]);
    mask[i] = Math.min(1, Math.max(0, (d - 18) / 40));
  }

  // Round the subject: repeated blurs of the mask give a smooth hill that is highest in the middle.
  let dome = boxBlur(mask, WORK, 3);
  for (let pass = 0; pass < 4; pass++) dome = boxBlur(dome, WORK, 5);

  let maxDome = 1e-6;
  for (let i = 0; i < n; i++) maxDome = Math.max(maxDome, dome[i]);
  const depth = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const y = luma(small.data[i * 4], small.data[i * 4 + 1], small.data[i * 4 + 2]) / 255;
    const hill = Math.pow(dome[i] / maxDome, 0.8) * mask[i];
    depth[i] = hill * (0.82 + 0.18 * y);
  }

  // Gently favor the middle of the frame, where the subject usually is.
  for (let y = 0; y < WORK; y++) {
    for (let x = 0; x < WORK; x++) {
      const dx = x / (WORK - 1) - 0.5;
      const dy = y / (WORK - 1) - 0.5;
      depth[y * WORK + x] *= 0.7 + 0.3 * Math.exp(-(dx * dx + dy * dy) / 0.18);
    }
  }
  let max = 1e-6;
  for (let i = 0; i < n; i++) max = Math.max(max, depth[i]);
  for (let i = 0; i < n; i++) depth[i] /= max;
  return resizePlane(depth, WORK, WORK, image.width, image.height);
}
