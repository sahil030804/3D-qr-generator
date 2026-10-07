import { fbm3, hash3, mulberry32 } from '../voxel/noise';
import { Palette } from '../voxel/palette';
import type { VoxelGrid } from '../voxel/grid';
import { inRim } from '../voxel/layout';
import { fillCapsule, fillLathe, type Chooser } from '../voxel/shapes';
import { addGrass, addGroundFamilies, addStones, paletteSet } from './common';
import { CATEGORY_GROUND } from './kit';
import type { ObjectContext, ObjectVariant, VoxelObject } from './types';

/** Single-hue family: exact hex as the mid tone, dark/light derived wide enough (gap ≥85) to stay scannable on top. */
function addNatural(palette: Palette, name: string, hex: string): number {
  const v = parseInt(hex.replace('#', ''), 16);
  const cl = (n: number): number => Math.max(0, Math.min(255, n));
  const shift = (amt: number): string => {
    const r = cl((v >> 16 & 255) + amt);
    const g = cl((v >> 8 & 255) + amt);
    const b = cl((v & 255) + amt);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  };
  return palette.addFamily(name, shift(-100), hex, shift(80));
}

/** Scatter single-voxel flakes from a material list on the free surface, denser near (cx, cz). */
function scatterLitter(
  grid: VoxelGrid, ctx: ObjectContext, mats: number[],
  chance: number, cx: number, cz: number, radius: number, seed: number,
): void {
  const { size } = ctx.layout;
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      if (inRim(ctx.layout, x, z) || grid.get(x, ctx.g, z) !== 0) continue;
      const r = Math.hypot(x - cx, z - cz);
      const p = chance * Math.exp(-((r / radius) ** 2));
      if (hash3(x, 5, z, seed) < p) grid.set(x, ctx.g, z, mats[Math.floor(hash3(x, 6, z, seed) * mats.length) % mats.length]);
    }
  }
}

/**
 * Potted tulips at roughly 1u = 1 cm: a 20 cm terracotta pot with a rolled rim on its saucer, and nine tulips on
 * 26-33 cm stems, each with a 6.5 cm cup of six petals and two broad grey-green leaves arching out of the soil.
 */
interface Colors {
  /** Petal tones: base, natural, sunlit rim, inner face, and the blotch at the heart of the cup. */
  shade: string;
  petal: string;
  light: string;
  inner: string;
  heart: string;
}

const COLORS: Record<string, Colors> = {
  pink: { shade: '#d95886', petal: '#ef7aa1', light: '#f7a9c4', inner: '#fbc6d8', heart: '#e6c24a' },
  red: { shade: '#a8141f', petal: '#d0202e', light: '#e8474f', inner: '#e85a5f', heart: '#1f1a14' },
  white: { shade: '#dfe3c8', petal: '#f3f0e6', light: '#ffffff', inner: '#fbf8ef', heart: '#d9c04a' },
};

const VARIANTS: ObjectVariant[] = [
  { id: 'pink', name: 'Pink tulips', color: '#ef7aa1' },
  { id: 'red', name: 'Red tulips', color: '#d0202e' },
  { id: 'white', name: 'White tulips', color: '#f3f0e6' },
];

interface Point {
  x: number;
  y: number;
  z: number;
}

export const flower: VoxelObject = {
  id: 'flower',
  name: 'Flower',
  description: 'Potted tulips in a terracotta pot.',
  category: 'nature',
  variants: VARIANTS,
  createPalette(variantId) {
    const c = COLORS[variantId] ?? COLORS.pink;
    const palette = new Palette();
    addNatural(palette, 'petalShade', c.shade);
    addNatural(palette, 'petal', c.petal);
    addNatural(palette, 'petalLight', c.light);
    addNatural(palette, 'petalInner', c.inner);
    addNatural(palette, 'heart', c.heart);
    addNatural(palette, 'stem', '#6f9a55');
    addNatural(palette, 'leaf', '#62875a');
    addNatural(palette, 'leafPale', '#7d9f6e');
    addNatural(palette, 'terracotta', '#b9653d');
    addNatural(palette, 'terracottaDeep', '#a4552f');
    addNatural(palette, 'soil', '#3d2b1f');
    addNatural(palette, 'soilDeep', '#2e2018');
    palette.addFamily('grass', '#2c5530', '#5f9a45', '#b6d98a');
    return paletteSet(palette, addGroundFamilies(palette, CATEGORY_GROUND.nature));
  },
  build(grid, palette, ctx) {
    const { layout, seed, u, g } = ctx;
    const rng = mulberry32(seed);
    const c = layout.size / 2;
    const mid = (name: string): number => palette.tone(palette.id(name), 'mid');
    const SHADE = mid('petalShade');
    const PETAL = mid('petal');
    const LIGHT = mid('petalLight');
    const INNER = mid('petalInner');
    const HEART = mid('heart');
    const STEM = mid('stem');
    const LEAF = mid('leaf');
    const LEAF_PALE = mid('leafPale');
    const TERRACOTTA = mid('terracotta');
    const TERRACOTTA_DEEP = mid('terracottaDeep');
    const SOIL = mid('soil');
    const SOIL_DEEP = mid('soilDeep');

    // Fired clay mottles in soft patches.
    const clay: Chooser = (x, y, z) => (fbm3((x / u) * 0.18, (y / u) * 0.18, (z / u) * 0.18, seed + 2) > 0.58 ? TERRACOTTA_DEEP : TERRACOTTA);

    // Saucer: a 2 cm dish with a raised lip; the pot stands on its floor.
    fillLathe(grid, c, c, g, g + 2 * u, (t) => (t < 0.5 ? 13.6 * u + t * 2 * u : [15 * u, 13.4 * u]), clay);

    // Pot: tapered body, a rolled rim band, 1.3 cm walls and soil 2 cm below the rim.
    const potBottom = g + 1 * u;
    const potTop = g + 21 * u;
    const rimBottom = potTop - 3.5 * u;
    const soilTop = potTop - 2 * u;
    const bodyR = (y: number): number => 10.8 * u + ((y - potBottom) / (potTop - potBottom)) * 3.2 * u;
    fillLathe(grid, c, c, potBottom, potTop, (_t, y) => {
      const yc = y + 0.5;
      const outer = yc >= rimBottom ? bodyR(rimBottom) + 1.3 * u : bodyR(yc);
      if (yc < soilTop) return outer;
      return [outer, bodyR(yc) - 1.3 * u];
    }, clay);
    fillLathe(grid, c, c, soilTop - 1.5 * u, soilTop, (t) => bodyR(soilTop) - 1.2 * u - (1 - t) * 0.5 * u, (x, y, z) =>
      fbm3((x / u) * 0.4, (y / u) * 0.4, (z / u) * 0.4, seed + 5) > 0.55 ? SOIL_DEEP : SOIL);

    // Bulb positions: one in the middle, a ring of five and an outer ring of three.
    const bulbs: { x: number; z: number; ring: number }[] = [{ x: c, z: c, ring: 0 }];
    const a0 = rng() * Math.PI * 2;
    for (let i = 0; i < 5; i++) {
      const a = a0 + (i / 5) * Math.PI * 2 + (rng() - 0.5) * 0.3;
      bulbs.push({ x: c + Math.cos(a) * 5 * u, z: c + Math.sin(a) * 5 * u, ring: 1 });
    }
    for (let i = 0; i < 3; i++) {
      const a = a0 + Math.PI / 5 + (i / 3) * Math.PI * 2 + (rng() - 0.5) * 0.3;
      bulbs.push({ x: c + Math.cos(a) * 9 * u, z: c + Math.sin(a) * 9 * u, ring: 2 });
    }

    // Leaves first, so stems and flowers win where they cross. Each leaf is a broad blade rising from the soil and
    // arching outward, widest in its lower third, cupped along the midrib.
    const stemR = Math.max(0.75, 0.6 * u);
    const leafHalf = Math.max(0.5, 0.5 * u);
    for (const bulb of bulbs) {
      const out = bulb.ring === 0 ? rng() * Math.PI * 2 : Math.atan2(bulb.z - c, bulb.x - c);
      for (let k = 0; k < 2; k++) {
        const dir = out + (k === 0 ? -1 : 1) * (0.35 + rng() * 0.5);
        const L = (17 + rng() * 6) * u;
        const W = (2.1 + rng() * 0.6) * u;
        const dx = Math.cos(dir);
        const dz = Math.sin(dir);
        const steps = Math.ceil(L / (0.25 * u));
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const reach = L * 0.42 * t * t + L * 0.06 * t;
          const lift = L * 0.8 * Math.sin(t * Math.PI * 0.55) - L * 0.1 * t * t * t;
          const p: Point = { x: bulb.x + dx * reach, y: soilTop + lift, z: bulb.z + dz * reach };
          const hw = W * Math.pow(Math.sin(Math.PI * Math.min(1, Math.pow(t, 0.75))), 0.7);
          const curl = hw * 0.3;
          const sx = -dz * hw;
          const sz = dx * hw;
          const material = fbm3(p.x / u * 0.3, p.y / u * 0.3, p.z / u * 0.3, seed + 8) > 0.55 ? LEAF_PALE : LEAF;
          fillCapsule(grid, p.x - sx, p.y + curl, p.z - sz, p.x, p.y, p.z, leafHalf, leafHalf, () => material);
          fillCapsule(grid, p.x, p.y, p.z, p.x + sx, p.y + curl, p.z + sz, leafHalf, leafHalf, () => material);
        }
      }
    }

    // Stems lean gently outward from the middle; each ends in an upright cup of six petals, open at the top to
    // show the coloured heart.
    for (const bulb of bulbs) {
      const out = bulb.ring === 0 ? rng() * Math.PI * 2 : Math.atan2(bulb.z - c, bulb.x - c);
      const lean = (0.8 + bulb.ring * 2.2 + rng()) * u;
      const height = (33 - bulb.ring * 3 - rng() * 3) * u;
      const top: Point = { x: bulb.x + Math.cos(out) * lean, y: soilTop + height, z: bulb.z + Math.sin(out) * lean };
      const segments = 6;
      let prev: Point = { x: bulb.x, y: soilTop - 1 * u, z: bulb.z };
      for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        const bend = t * t;
        const p: Point = { x: bulb.x + (top.x - bulb.x) * bend, y: soilTop - 1 * u + (top.y - soilTop + 1 * u) * t, z: bulb.z + (top.z - bulb.z) * bend };
        fillCapsule(grid, prev.x, prev.y, prev.z, p.x, p.y, p.z, stemR, stemR, () => STEM);
        prev = p;
      }

      const R = 2.9 * u;
      const H = 6.5 * u;
      const hb = top.y - 0.5 * u;
      const twist = rng() * Math.PI * 2;
      const wall = Math.max(1, 0.8 * u);
      fillLathe(grid, top.x, top.z, hb, hb + H, (t) => {
        const r = t < 0.3 ? R * Math.sqrt(1 - Math.pow((0.3 - t) / 0.3, 2)) : R * (1 - 0.16 * Math.pow((t - 0.3) / 0.7, 1.5));
        return t > 0.55 ? [r, r - wall] : r;
      }, (x, y, z) => {
        const t = (y + 0.5 - hb) / H;
        const dx = x + 0.5 - top.x;
        const dz = z + 0.5 - top.z;
        const d = Math.hypot(dx, dz);
        // Petal tips are rounded; the notches between them dip to 80 % of the cup height.
        const phase = (((Math.atan2(dz, dx) + twist) / (Math.PI / 3)) % 1 + 1) % 1;
        const tipHeight = 0.8 + 0.2 * Math.sqrt(Math.max(0, 1 - Math.pow((phase - 0.5) * 2, 2)));
        if (t > tipHeight) return 0;
        if (t > 0.5 && t <= 0.56 && d < R - wall) return HEART;
        if (t > 0.55 && d < R - wall * 0.5) return INNER;
        return t < 0.22 ? SHADE : t > 0.72 ? LIGHT : PETAL;
      });
    }

    // A couple of dropped petals on the ground, grass in the joints and finder corners, and a few stones.
    scatterLitter(grid, ctx, [PETAL, LIGHT], 0.05, c, c, 20 * u, seed + 21);
    addGrass(grid, palette, ctx, { family: palette.id('grass'), density: 0.03, finderBoost: 0.25, maxHeight: Math.max(2, Math.round(2.2 * u)), seed: seed + 41 });
    addStones(grid, palette, ctx, palette.id('rock'), rng, 2);
  },
};
