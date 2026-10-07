import { describe, it, expect } from 'vitest';
import { SeededRandom } from './SeededRandom';
import { Noise2D } from './NoiseSystem';

describe('SeededRandom', () => {
  it('same seed -> same sequence (deterministic scenes)', () => {
    const a = new SeededRandom(12345);
    const b = new SeededRandom(12345);
    for (let i = 0; i < 50; i++) expect(a.next()).toBe(b.next());
  });
  it('different seeds diverge', () => {
    const a = new SeededRandom(1);
    const b = new SeededRandom(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });
  it('hashSeed is stable for strings', () => {
    expect(SeededRandom.hashSeed('abc')).toBe(SeededRandom.hashSeed('abc'));
  });
});

describe('Noise2D', () => {
  it('fbm stays in [-1,1] and is deterministic', () => {
    const n = new Noise2D(99);
    for (let i = 0; i < 200; i++) {
      const v = n.fbm(i * 0.37, i * 0.11, 4);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
    const m = new Noise2D(99);
    expect(m.fbm(1.5, 2.5, 4)).toBe(n.fbm(1.5, 2.5, 4));
  });
});
