import type { GroundFamilies } from '../voxel/ground';
import type { VoxelGrid } from '../voxel/grid';
import { inRim, isFinderAt } from '../voxel/layout';
import { hash3 } from '../voxel/noise';
import { Palette } from '../voxel/palette';
import { fillEllipsoid } from '../voxel/shapes';
import type { ObjectContext, PaletteSet } from './types';

/** Colors every object shares for the plot underneath. */
export interface GroundTheme {
  tileA: [string, string, string];
  tileB: [string, string, string];
  accent: [string, string, string];
  stone?: [string, string, string];
}

/** Register the plot families on a palette and return their ids. */
export function addGroundFamilies(palette: Palette, theme: GroundTheme): GroundFamilies {
  const stone = theme.stone ?? ['#6a665f', '#a39d92', '#d9d3c7'];
  return {
    tileA: palette.addFamily('tileA', ...theme.tileA),
    tileB: palette.addFamily('tileB', ...theme.tileB),
    accent: palette.addFamily('accent', ...theme.accent),
    stone: palette.addFamily('stone', ...stone),
    soil: palette.addFamily('soil', '#3a2a1d', '#6a4a32', '#b08a63'),
    rock: palette.addFamily('rock', '#3b3b40', '#8a8a94', '#d4d4dc'),
  };
}

export function paletteSet(palette: Palette, ground: GroundFamilies): PaletteSet {
  return { palette, ground };
}

/** Free surface column at the plot level, away from the rim. */
function isFree(grid: VoxelGrid, ctx: ObjectContext, x: number, z: number): boolean {
  return !inRim(ctx.layout, x, z) && grid.get(x, ctx.g, z) === 0;
}

export interface GrassOptions {
  family: number;
  /** Probability per column away from the finder squares. */
  density: number;
  /** Extra probability inside the finder squares. */
  finderBoost: number;
  /** Tallest blade in voxels. */
  maxHeight: number;
  seed: number;
}

/** Thin blades of grass, 1 voxel wide, leaning slightly. They count as part of the object. */
export function addGrass(grid: VoxelGrid, palette: Palette, ctx: ObjectContext, opts: GrassOptions): void {
  const { size } = ctx.layout;
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      if (!isFree(grid, ctx, x, z)) continue;
      const chance = opts.density + (isFinderAt(ctx.layout, x, z) ? opts.finderBoost : 0);
      if (hash3(x, 1, z, opts.seed) >= chance) continue;
      const height = 1 + Math.floor(hash3(x, 2, z, opts.seed) * opts.maxHeight);
      const leanX = (hash3(x, 3, z, opts.seed) - 0.5) * 1.6;
      const leanZ = (hash3(x, 4, z, opts.seed) - 0.5) * 1.6;
      for (let t = 0; t < height; t++) {
        const k = height > 1 ? t / (height - 1) : 0;
        const tone = palette.pick(opts.family, hash3(x, t, z, opts.seed + 7) * 0.5 + k * 0.5, 0.25, 0.8);
        grid.set(x + Math.round(leanX * k), ctx.g + t, z + Math.round(leanZ * k), tone);
      }
    }
  }
}

/** Scatter single-voxel flakes (petals, needles) on the free surface, denser near (cx, cz). */
export function scatterFlakes(
  grid: VoxelGrid, palette: Palette, ctx: ObjectContext,
  family: number, chance: number, cx: number, cz: number, radius: number, seed: number,
): void {
  const { size } = ctx.layout;
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      if (!isFree(grid, ctx, x, z)) continue;
      const r = Math.hypot(x - cx, z - cz);
      const p = chance * Math.exp(-Math.pow(r / radius, 2));
      if (hash3(x, 5, z, seed) < p) grid.set(x, ctx.g, z, palette.pick(family, hash3(x, 6, z, seed), 0.2, 0.55));
    }
  }
}

/** Small boulders near the plot edge, kept off the finder squares so the corners stay readable. */
export function addStones(grid: VoxelGrid, palette: Palette, ctx: ObjectContext, family: number, rng: () => number, count: number): void {
  const { size } = ctx.layout;
  const c = size / 2;
  let placed = 0;
  for (let attempt = 0; attempt < count * 8 && placed < count; attempt++) {
    const a = rng() * Math.PI * 2;
    const r = size * (0.28 + rng() * 0.12);
    const x = c + Math.cos(a) * r;
    const z = c + Math.sin(a) * r;
    if (isFinderAt(ctx.layout, Math.round(x), Math.round(z))) continue;
    const rx = (1.8 + rng() * 1.6) * ctx.u;
    fillEllipsoid(grid, x, ctx.g + 0.3 * ctx.u, z, rx, (1.3 + rng()) * ctx.u, rx * (0.8 + rng() * 0.4),
      (px, py, pz) => palette.pick(family, hash3(px, py, pz, 31), 0.3, 0.75));
    placed++;
  }
}
