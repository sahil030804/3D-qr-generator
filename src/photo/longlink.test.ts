import { describe, expect, it } from 'vitest';
import { decodeWithZXing } from './decoder';
import { heuristicDepth } from './heuristicDepth';
import type { RGBA } from './imageOps';
import { buildPhotoModel, prepareCode } from './photoModel';
import { chooseLook } from './scanColors';

/** A tall, flat-colored poster like a screen-printed illustration. */
function poster(width: number, height: number): RGBA {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / width, v = y / height;
      let c = [244, 190, 170];                                       // pink paper
      if (Math.abs(u - 0.5) < 0.22 && v > 0.22 && v < 0.62) c = [190, 30, 40];   // red shirt
      if (Math.abs(u - 0.5) < 0.2 && v >= 0.62) c = [20, 40, 190];                // blue trousers
      if (v > 0.68 && Math.abs(u - 0.5) > 0.25) c = [20, 110, 60];                // green field
      if (u < 0.03 || u > 0.97) c = [200, 30, 30];                                // red border
      const o = (y * width + x) * 4;
      data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
    }
  }
  return { data, width, height };
}

describe('long links', () => {
  const links = [
    'https://rc.kandinsky.app/qa-a2a-old-1789728681697/artworks/934e5fa8-0b64-4e5e-81b7-33b8754170a0',
    'https://example.com/' + 'a-long-path/'.repeat(8) + 'end',
    'x'.repeat(120),
  ];
  const square = (() => { const p = poster(360, 500); const side = 360; const out = new Uint8ClampedArray(side * side * 4); out.set(p.data.subarray(70 * side * 4, (70 + side) * side * 4)); return { data: out, width: side, height: side } as RGBA; })();
  const depth = heuristicDepth(square);

  for (const link of links) {
    it(`builds and scans a code for a ${link.length}-character link`, { timeout: 180000 }, async () => {
      const code = prepareCode(link, square, depth);
      if (link.length <= 120) expect(code.modules).toBeLessThanOrEqual(65);
      const choice = await chooseLook(code.photo, code.modules, code.moduleVoxels, code.qr.matrix, link, decodeWithZXing);
      expect(choice.verified).toBe(true);
      // Fidelity degrades gently with length instead of failing: even at the limit most modules still follow the picture.
      const steerable = code.qr.steerable.reduce((sum, v) => sum + v, 0);
      expect(code.qr.deviations / steerable).toBeLessThan(0.3);
      const model = buildPhotoModel(code, choice.look);
      expect(model.palette.materials.length).toBeLessThan(256);
    });
  }
});
