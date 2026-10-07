import { describe, expect, it } from 'vitest';
import { decodeWithZXing } from './decoder';
import { heuristicDepth } from './heuristicDepth';
import { boxBlur, cropSquare, resizePlane, resizeRGBA, type RGBA } from './imageOps';
import { buildPhotoModel, prepareCode } from './photoModel';
import { medianCut, PaletteLookup } from './quantize';
import { hillshade, shapeHeights } from './relief';
import { chooseLook, fitScanColors, flatScanImage, SCAN_LOOKS, simulateCamera } from './scanColors';

/** A portrait-like picture: gray backdrop, skin-colored face, dark hair, white collar. */
function portrait(size: number): RGBA {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size - 0.5;
      const v = y / size - 0.5;
      let color = [128, 130, 140];
      const face = (u * u) / 0.07 + ((v + 0.02) * (v + 0.02)) / 0.11;
      if (face < 1) color = [226, 178, 150];
      if (face < 1 && v < -0.12) color = [40, 28, 24];                 // hair
      if (face < 1 && Math.abs(u) < 0.12 && Math.abs(v + 0.02) < 0.03) color = [60, 40, 36]; // eyes line
      if (v > 0.3) color = [240, 240, 245];                            // collar
      const o = (y * size + x) * 4;
      data[o] = color[0]; data[o + 1] = color[1]; data[o + 2] = color[2]; data[o + 3] = 255;
    }
  }
  return { data, width: size, height: size };
}

describe('image helpers', () => {
  it('resizes planes without changing their average', () => {
    const src = Float32Array.from({ length: 64 * 64 }, (_, i) => (i % 64) / 63);
    const out = resizePlane(src, 64, 64, 20, 20);
    const mean = (a: Float32Array): number => a.reduce((s, v) => s + v, 0) / a.length;
    expect(mean(out)).toBeCloseTo(mean(src), 2);
  });

  it('center-crops to a square and flattens alpha onto white', () => {
    const wide: RGBA = { data: new Uint8ClampedArray(8 * 4 * 4).fill(10), width: 8, height: 4 };
    const square = cropSquare(wide);
    expect([square.width, square.height]).toEqual([4, 4]);
    const clear: RGBA = { data: new Uint8ClampedArray([0, 0, 0, 0]), width: 1, height: 1 };
    expect(Array.from(resizeRGBA(clear, 1, 1).data)).toEqual([255, 255, 255, 255]);
  });

  it('blurs without changing flat areas', () => {
    const flat = new Float32Array(16 * 16).fill(0.4);
    expect(Math.max(...boxBlur(flat, 16, 3))).toBeCloseTo(0.4, 5);
  });
});

describe('quantizer', () => {
  it('returns at most k colors and finds the nearest one', () => {
    const rgb = new Uint8ClampedArray(300 * 3);
    for (let i = 0; i < 300; i++) { rgb[i * 3] = i < 150 ? 250 : 5; rgb[i * 3 + 1] = i < 150 ? 10 : 20; rgb[i * 3 + 2] = 10; }
    const colors = medianCut(rgb, 2);
    expect(colors.length).toBe(2);
    const lookup = new PaletteLookup(colors);
    const red = lookup.nearest(245, 12, 8);
    expect(colors[red][0]).toBeGreaterThan(200);
  });
});

describe('relief', () => {
  it('fades to flat at the picture edges and keeps the middle tall', () => {
    const size = 64;
    const depth = new Float32Array(size * size).fill(1);
    const h = shapeHeights(depth, size, { maxHeight: 40, gamma: 1, smoothing: 1, edgeTaper: 0.2, exaggeration: 1 });
    expect(h[0]).toBe(0);
    expect(h[32 * size + 32]).toBeCloseTo(40, 0);
  });

  it('lights slopes that face the sun brighter than ones that face away', () => {
    const size = 32;
    const ramp = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) ramp[y * size + x] = x * 0.5; // rises toward +x
    const toward = hillshade(ramp, size, [0.6, 0.7, 0.2], 1)[16 * size + 16];   // sun on the low (-x) side? no: +x slope faces -x
    const away = hillshade(ramp, size, [-0.6, 0.7, 0.2], 1)[16 * size + 16];
    expect(away).toBeGreaterThan(toward);
    const flat = hillshade(new Float32Array(size * size), size, [0.3, 0.8, 0.5], 1)[16 * size + 16];
    expect(flat).toBeCloseTo(1.1, 1);
  });
});

describe('built-in depth', () => {
  it('raises the subject above the background', () => {
    const image = portrait(160);
    const depth = heuristicDepth(image);
    expect(depth[80 * 160 + 80]).toBeGreaterThan(0.5);
    expect(depth[5 * 160 + 5]).toBeLessThan(0.15);
    expect(Math.max(...depth)).toBeLessThanOrEqual(1);
  });
});

describe('scan colors', () => {
  const modules = 73;
  const MV = 5;
  const S = modules * MV;

  it('leaves a pixel alone when the photo already has the right tone', () => {
    const photo = portrait(S);
    const matrix = new Uint8Array(modules * modules);               // all light
    const fitted = fitScanColors(photo, modules, MV, matrix, SCAN_LOOKS.soft);
    // The white collar is brighter than the light threshold, so a light module there needs no change.
    const x = Math.floor(S / 2);
    const y = Math.floor(S * 0.88);
    const o = (y * S + x) * 4;
    expect(Math.floor(y / MV)).toBeGreaterThan(8);
    expect(Array.from(fitted.data.slice(o, o + 3))).toEqual(Array.from(photo.data.slice(o, o + 3)));
  });

  it('pulls a mismatched pixel toward the code tone and keeps its hue', () => {
    const photo = portrait(S);
    const matrix = new Uint8Array(modules * modules).fill(1);       // all dark
    const fitted = fitScanColors(photo, modules, MV, matrix, SCAN_LOOKS.soft);
    const o = ((S / 2 | 0) * S + (S / 2 | 0)) * 4;
    const before = 0.2126 * photo.data[o] + 0.7152 * photo.data[o + 1] + 0.0722 * photo.data[o + 2];
    const after = 0.2126 * fitted.data[o] + 0.7152 * fitted.data[o + 1] + 0.0722 * fitted.data[o + 2];
    expect(after).toBeLessThanOrEqual(Math.max(before, 0));
    expect(fitted.data[o]).toBeGreaterThanOrEqual(fitted.data[o + 2]); // still warm, not gray
  });
});

describe('photo code end to end', () => {
  const text = 'https://example.com/portrait';
  const image = portrait(256);
  const depth = heuristicDepth(image);

  it('encodes a real, valid QR whose pattern follows the picture', () => {
    const code = prepareCode(text, image, depth);
    expect(code.modules).toBe(17 + 4 * code.version);
    const steerable = code.qr.steerable.reduce((s, v) => s + v, 0);
    expect(code.qr.deviations / steerable).toBeLessThan(0.22);
  });

  it('decodes in the plain flat scan view and through simulated camera blur', { timeout: 120000 }, async () => {
    const code = prepareCode(text, image, depth);
    const result = await chooseLook(code.photo, code.modules, code.moduleVoxels, code.qr.matrix, text, decodeWithZXing);
    expect(result.verified).toBe(true);
    const flat = flatScanImage(fitScanColors(code.photo, code.modules, code.moduleVoxels, code.qr.matrix, SCAN_LOOKS[result.look]), code.moduleVoxels);
    expect(await decodeWithZXing(flat)).toBe(text);
    expect(await decodeWithZXing(simulateCamera(flat, 400, 1))).toBe(text);
  });

  it('builds a voxel model with a bounded palette and a recolor for every column', { timeout: 120000 }, () => {
    const code = prepareCode(text, image, depth);
    const model = buildPhotoModel(code, 'soft');
    expect(model.palette.materials.length).toBeLessThan(256);
    let recolored = 0;
    for (const v of model.fit) if (v) recolored++;
    expect(recolored).toBe(code.size * code.size);
    expect(model.grid.maxY()).toBeLessThan(model.grid.height - 1);
    // The relief rises above the plot somewhere (the face), and stays at plot height at the edge.
    const mid = model.layout.qrOrigin + code.size / 2 | 0;
    expect(model.grid.topY(mid, mid)).toBeGreaterThan(model.layout.base + 5);
    expect(model.grid.topY(model.layout.qrOrigin, model.layout.qrOrigin)).toBeLessThanOrEqual(model.layout.base + 1);
  });

  it('is deterministic', () => {
    const a = prepareCode(text, image, depth);
    const b = prepareCode(text, image, depth);
    expect(Array.from(a.qr.matrix)).toEqual(Array.from(b.qr.matrix));
  });

  it('rejects text that cannot fit', () => {
    expect(() => prepareCode('x'.repeat(5000), image, depth)).toThrow();
    expect(() => prepareCode('   ', image, depth)).toThrow();
  });
});
