import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { buildFrame, chooseVersion, dataCodewords, encodeQArt, rsParity } from './qart';
import { EC_BLOCKS_L } from './qrTables';

const encoder = new TextEncoder();

/** A picture-like target: a dark disc with a ring, so there are big flat regions and edges. */
function discTarget(size: number): { target: Uint8Array; cost: Float32Array } {
  const target = new Uint8Array(size * size);
  const cost = new Float32Array(size * size);
  const c = size / 2;
  for (let r = 0; r < size; r++) {
    for (let col = 0; col < size; col++) {
      const d = Math.hypot(r - c, col - c) / size;
      target[r * size + col] = d < 0.2 || (d > 0.32 && d < 0.4) ? 1 : 0;
      cost[r * size + col] = Math.abs(((d * 7) % 1) - 0.5) + 0.05;
    }
  }
  return { target, cost };
}

function decode(matrix: Uint8Array, size: number, scale = 6): string | null {
  const side = (size + 8) * scale;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!matrix[r * size + c]) continue;
      for (let y = 0; y < scale; y++) {
        for (let x = 0; x < scale; x++) {
          const o = (((r + 4) * scale + y) * side + (c + 4) * scale + x) * 4;
          data[o] = data[o + 1] = data[o + 2] = 0;
        }
      }
    }
  }
  return jsQR(data, side, side)?.data ?? null;
}

describe('QR frame', () => {
  it('has exactly as many data cells as the final message has bits', () => {
    for (const version of [7, 12, 14, 18, 22, 30]) {
      const blocks = EC_BLOCKS_L[version];
      const codewords = blocks.reduce((s, g) => s + g.blocks * g.total, 0);
      const remainder = version >= 21 && version <= 27 ? 4 : version >= 14 && version <= 34 && !(version >= 21 && version <= 27) ? 3 : version >= 2 && version <= 6 ? 7 : 0;
      expect(buildFrame(version).positions.length, `v${version}`).toBe(codewords * 8 + remainder);
    }
  });

  it('puts the three finder patterns and the dark module in place', () => {
    const { kind, size } = buildFrame(14);
    expect(kind[0]).toBe(1);
    expect(kind[3 * size + 3]).toBe(1);
    expect(kind[1 * size + 1]).toBe(0); // light ring
    expect(kind[2 * size + 2]).toBe(1); // solid centre
    expect(kind[(size - 8) * size + 8]).toBe(1);
    expect(kind[size - 1]).toBe(1);
  });
});

describe('Reed-Solomon', () => {
  it('is linear, which the steering relies on', () => {
    const a = Uint8Array.from({ length: 40 }, (_, i) => (i * 37 + 11) & 255);
    const b = Uint8Array.from({ length: 40 }, (_, i) => (i * 91 + 5) & 255);
    const x = a.map((v, i) => v ^ b[i]);
    const pa = rsParity(a, 18), pb = rsParity(b, 18), px = rsParity(x, 18);
    expect(Array.from(px)).toEqual(Array.from(pa.map((v, i) => v ^ pb[i])));
  });
});

describe('QArt encoder', () => {
  for (const version of [12, 14, 18, 22]) {
    it(`produces a code that decodes (version ${version})`, () => {
      const size = 17 + 4 * version;
      const { target, cost } = discTarget(size);
      const text = 'https://example.com/portrait';
      const result = encodeQArt(encoder.encode(text), version, { target, cost });
      expect(decode(result.matrix, size)).toBe(text);
    });
  }

  it('decodes with other masks too', () => {
    const size = 17 + 4 * 14;
    const { target, cost } = discTarget(size);
    for (const mask of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const result = encodeQArt(encoder.encode('mask test'), 14, { target, cost, mask });
      expect(decode(result.matrix, size), `mask ${mask}`).toBe('mask test');
    }
  });

  it('keeps non-ASCII text intact', () => {
    const size = 17 + 4 * 14;
    const { target, cost } = discTarget(size);
    const text = 'https://example.com/café?x=✓';
    expect(decode(encodeQArt(encoder.encode(text), 14, { target, cost }).matrix, size)).toBe(text);
  });

  it('follows the picture: most steerable modules match the target', () => {
    const size = 17 + 4 * 14;
    const { target, cost } = discTarget(size);
    const result = encodeQArt(encoder.encode('https://example.com/portrait'), 14, { target, cost });
    const steerable = result.steerable.reduce((s, v) => s + v, 0);
    expect(result.deviations / steerable).toBeLessThan(0.18);
  });

  it('deviates in the cheap places, not the costly ones', () => {
    const size = 17 + 4 * 14;
    const { target, cost } = discTarget(size);
    const result = encodeQArt(encoder.encode('https://example.com/portrait'), 14, { target, cost });
    let wrongCost = 0, wrongCount = 0, allCost = 0, all = 0;
    for (let i = 0; i < size * size; i++) {
      if (!result.steerable[i]) continue;
      all++; allCost += cost[i];
      if (result.matrix[i] !== target[i]) { wrongCount++; wrongCost += cost[i]; }
    }
    expect(wrongCost / wrongCount).toBeLessThan(allCost / all);
  });

  it('is deterministic', () => {
    const size = 17 + 4 * 14;
    const { target, cost } = discTarget(size);
    const a = encodeQArt(encoder.encode('same'), 14, { target, cost });
    const b = encodeQArt(encoder.encode('same'), 14, { target, cost });
    expect(Array.from(a.matrix)).toEqual(Array.from(b.matrix));
  });
});

describe('version choice', () => {
  it('picks a small code, but one with room to steer', () => {
    const v = chooseVersion(28)!;
    expect(v).toBeLessThanOrEqual(9);
    expect(dataCodewords(v) - 28 - 3).toBeGreaterThanOrEqual(130);
    expect(dataCodewords(v - 1) - 28 - 3).toBeLessThan(130);
  });
  it('keeps even a 95-character link under 61 modules, where phone scanners stay reliable', () => {
    expect(17 + 4 * chooseVersion(95)!).toBeLessThanOrEqual(61);
  });
  it('grows for longer payloads and refuses absurd ones', () => {
    expect(chooseVersion(200)!).toBeGreaterThan(chooseVersion(20)!);
    expect(chooseVersion(5000)).toBeNull();
  });
});
