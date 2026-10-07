import type { QRField } from '../qr/QRField';
import type { SeededRandom } from './SeededRandom';

export type QualityLevel = 'preview' | 'high' | 'cinematic';

export interface GeneratorParams {
  seed: number;
  density: number; // 0..1 global density multiplier
  height: number; // 0..1 height multiplier
  variation: number; // 0..1 natural variation amount
  qrStrength: number; // 0..1 how strongly the QR field constrains growth
  flowerDensity: number; // 0..1
  foliageDensity: number; // 0..1
  sceneScale: number; // world size multiplier
  quality: QualityLevel;
}

export interface SceneGenerationContext {
  field: QRField;
  rng: SeededRandom;
  params: GeneratorParams;
  /** World size of the QR square (x/z extent). */
  worldSize: number;
}

export const QUALITY_BUDGET: Record<
  QualityLevel,
  { branchDepth: number; canopy: number; blossom: number; grass: number; shadow: number; pixelRatio: number }
> = {
  preview: { branchDepth: 3, canopy: 1200, blossom: 500, grass: 800, shadow: 1024, pixelRatio: 1 },
  high: { branchDepth: 3, canopy: 3000, blossom: 1200, grass: 2000, shadow: 2048, pixelRatio: 1.25 },
  cinematic: { branchDepth: 4, canopy: 6000, blossom: 2500, grass: 4500, shadow: 2048, pixelRatio: 2 },
};

export function qualityMultiplier(q: QualityLevel): number {
  return q === 'preview' ? 0.45 : q === 'high' ? 1 : 1.8;
}

export function defaultParams(partial: Partial<GeneratorParams> = {}): GeneratorParams {
  return {
    seed: 20260707,
    density: 0.85,
    height: 0.8,
    variation: 0.55,
    qrStrength: 0.85,
    flowerDensity: 0.8,
    foliageDensity: 0.9,
    sceneScale: 1,
    quality: 'high',
    ...partial,
  };
}

/** Blend a natural baseline with the QR field value using qrStrength. */
export function constrainByQR(natural: number, qr: number, qrStrength: number): number {
  const s = Math.min(1, Math.max(0, qrStrength));
  return natural * (1 - s) + qr * s;
}
