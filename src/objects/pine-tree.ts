import { fbm3, hash3, mulberry32, valueNoise3 } from '../voxel/noise';
import { Palette } from '../voxel/palette';
import { fillBox, fillCapsule, fillEllipsoid, fillLathe, type Chooser } from '../voxel/shapes';
import { addNatural, scatterLitter } from './cherry-tree';
import { addGrass, addGroundFamilies, addStones, paletteSet } from './common';
import type { ObjectVariant, VoxelObject } from './types';

/**
 * Conifer modeled on an open-grown spruce at roughly 1u = 30 cm: about 17 m tall and 8 m across, a straight
 * trunk with a root flare, whorls of branches every ~70 cm that sag and turn up at the tips, and flat needle
 * sprays that are dark inside and fresh green at the tips.
 */
interface Colors {
  /** Needle tones: shaded underside, natural, sunlit top, new growth at the tips. */
  needles: [string, string, string, string];
  tile: [string, string, string];
  /** Width of a branch's needle spray relative to its length (larch is airier than spruce). */
  spray: number;
  /** Main branches per whorl (larch is sparser). */
  branches: number;
  snow: boolean;
}

const COLORS: Record<string, Colors> = {
  evergreen: { needles: ['#1f3d27', '#2c5534', '#3d6c3f', '#6a9a4a'], tile: ['#2d3b36', '#9aa8a0', '#e6efe9'], spray: 0.34, branches: 6, snow: false },
  frost: { needles: ['#2c4850', '#466c74', '#628a90', '#86aaa8'], tile: ['#2b3a47', '#a1b0bd', '#eef4fa'], spray: 0.34, branches: 6, snow: true },
  larch: { needles: ['#8a5a1e', '#bf8630', '#dcaa48', '#ecc664'], tile: ['#4a3a2a', '#b3a58f', '#f5ecd9'], spray: 0.24, branches: 4, snow: false },
};

/** Variant settings for each palette, since `build` only receives the palette. */
const SETTINGS = new WeakMap<Palette, Colors>();

const VARIANTS: ObjectVariant[] = [
  { id: 'evergreen', name: 'Norway spruce', color: '#2c5534' },
  { id: 'frost', name: 'Snowy blue spruce', color: '#9ccbe0' },
  { id: 'larch', name: 'Autumn larch', color: '#bf8630' },
];

export const pineTree: VoxelObject = {
  id: 'pine-tree',
  name: 'Pine Tree',
  description: 'A tall evergreen strung with fairy lights.',
  category: 'nature',
  variants: VARIANTS,
  createPalette(variantId) {
    const c = COLORS[variantId] ?? COLORS.evergreen;
    const palette = new Palette();
    SETTINGS.set(palette, c);
    addNatural(palette, 'needleShade', c.needles[0]);
    addNatural(palette, 'needle', c.needles[1]);
    addNatural(palette, 'needleSun', c.needles[2]);
    addNatural(palette, 'needleTip', c.needles[3]);
    if (c.snow) addNatural(palette, 'snow', '#f1f5f9');
    addNatural(palette, 'bark', '#5a4535');
    addNatural(palette, 'barkDeep', '#45342a');
    addNatural(palette, 'litter', '#7b5a3a');
    addNatural(palette, 'litterPale', '#957250');
    addNatural(palette, 'cone', '#6b4a2c');
    palette.addFamily('grass', '#26502e', '#4f8a43', '#b6d98a');
    addNatural(palette, 'bulb', '#ffd27a', true);
    addNatural(palette, 'star', '#ffd54a', true);
    const ground = addGroundFamilies(palette, {
      tileA: [c.tile[0], c.tile[1], c.tile[2]],
      tileB: ['#34413a', '#a3b0a8', '#dde8e0'],
      accent: ['#1d4a5e', '#8fb7c8', '#cfe6ef'],
    });
    return paletteSet(palette, ground);
  },
  build(grid, palette, ctx) {
    const { layout, seed, u, g } = ctx;
    const rng = mulberry32(seed);
    const c = layout.size / 2;
    const mid = (name: string): number => palette.tone(palette.id(name), 'mid');
    const SHADE = mid('needleShade');
    const NEEDLE = mid('needle');
    const SUN = mid('needleSun');
    const TIP = mid('needleTip');
    const BARK = mid('bark');
    const BARK_DEEP = mid('barkDeep');
    const BULB = mid('bulb');
    const STAR = mid('star');
    const settings = SETTINGS.get(palette) ?? COLORS.evergreen;

    const crownBase = g + 6.5 * u;
    const topY = g + 56 * u;
    const R0 = 13 * u;
    const radiusAt = (y: number): number => {
      const f = Math.min(1, Math.max(0, (y - crownBase) / (topY - crownBase)));
      return R0 * Math.pow(1 - f, 0.92) + 0.6 * u;
    };

    // Straight trunk tapering to the leader, with a lobed root flare. Spruce bark is grey-brown with long plates.
    const bark: Chooser = (x, y, z) => (fbm3((x / u) * 0.6, (y / u) * 0.15, (z / u) * 0.6, seed + 1) > 0.56 ? BARK_DEEP : BARK);
    fillLathe(grid, c, c, g, topY - 1 * u, (t) => 0.35 * u + 1.55 * u * (1 - t), bark);
    const lobe = rng() * Math.PI * 2;
    fillBox(grid, c - 5 * u, g, c - 5 * u, c + 5 * u, g + 3 * u, c + 5 * u, (x, y, z) => {
      const dx = x + 0.5 - c;
      const dz = z + 0.5 - c;
      const h = y + 0.5 - g;
      const lobes = Math.pow(Math.max(0, Math.cos(5 * Math.atan2(dz, dx) + lobe)), 2);
      const r = 1.9 * u + 1.6 * u * Math.exp(-h / (0.9 * u)) * (0.4 + 0.6 * lobes);
      return dx * dx + dz * dz <= r * r ? bark(x, y, z) : 0;
    });

    // Whorls of branches. Each branch sags and turns up at the tip and carries a flat spray of needles whose
    // edges hang a little lower than its spine. Interwhorl shoots fill the gaps.
    const golden = Math.PI * (3 - Math.sqrt(5));
    let az = rng() * Math.PI * 2;
    let branchId = 0;
    const sprayBranch = (yb: number, angle: number, L: number): void => {
      const id = branchId++;
      const k = (yb - crownBase) / (topY - crownBase);
      const slope = -0.05 + 0.32 * k;
      const droop = 0.32 * (1 - k) + 0.06;
      const yAt = (t: number): number => yb + L * (slope * t - droop * t * t + 0.14 * Math.pow(t, 4));
      const tx = Math.cos(angle);
      const tz = Math.sin(angle);
      const W = Math.max(1.2 * u, settings.spray * L);
      // Width profile sampled once per branch: widest past the middle, frond-like wobble along the length.
      const widths = new Float32Array(33);
      for (let i = 0; i <= 32; i++) {
        const t = i / 32;
        widths[i] = W * Math.sin(Math.PI * Math.min(1, t * 0.85 + 0.12)) * (0.75 + 0.4 * valueNoise3(t * L / u * 0.45, id, 0, seed + 7));
      }
      const thickAt = (t: number): number => 1.1 * u + 0.7 * u * (1 - t);
      // Woody spine, visible from below.
      fillCapsule(grid, c, yb, c, c + tx * L * 0.65, yAt(0.65), c + tz * L * 0.65, 0.6 * u, 0.35 * u, bark);
      const x0 = Math.floor(Math.min(c, c + tx * L) - W - 1);
      const x1 = Math.ceil(Math.max(c, c + tx * L) + W + 1);
      const z0 = Math.floor(Math.min(c, c + tz * L) - W - 1);
      const z1 = Math.ceil(Math.max(c, c + tz * L) + W + 1);
      const y0 = Math.floor(Math.min(yb, yAt(1), yAt(0.6)) - 3 * u - W * 0.45);
      const y1 = Math.ceil(Math.max(yb, yAt(1)) + 3 * u);
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          for (let x = x0; x <= x1; x++) {
            const rx = x + 0.5 - c;
            const rz = z + 0.5 - c;
            const t = (rx * tx + rz * tz) / L;
            if (t < 0.04 || t > 1.04) continue;
            const tc = Math.min(1, t);
            const side = -rx * tz + rz * tx;
            const w = widths[Math.round(tc * 32)];
            const v = y + 0.5 - yAt(tc) + (0.45 * side * side) / W;
            const th = thickAt(tc);
            const tipRound = t > 0.94 ? (t - 0.94) * 14 : 0;
            const e = (side / w) ** 2 + (v / th) ** 2 + tipRound;
            if (e > 1.45) continue;
            if (e > 1 + (fbm3((x / u) * 0.7, (y / u) * 0.7, (z / u) * 0.7, seed + 6) - 0.5) * 0.9) continue;
            let material: number;
            if (t > 0.86 && v > -0.3 * th) material = TIP;
            else {
              const light = 0.5 + (v / th) * 0.4 + (t - 0.55) * 0.5 + (fbm3((x / u) * 0.3, (y / u) * 0.3, (z / u) * 0.3, seed + 4) - 0.5) * 0.6;
              material = light < 0.36 ? SHADE : light > 0.7 ? SUN : NEEDLE;
            }
            grid.set(x, y, z, material);
          }
        }
      }
    };
    const whorlGap = 2.4 * u;
    for (let yb = crownBase; yb < topY - 3 * u; yb += whorlGap) {
      const count = settings.branches + Math.floor(rng() * 2) - 1;
      const R = radiusAt(yb);
      for (let i = 0; i < count; i++) {
        sprayBranch(yb, az + (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.5, R * (0.75 + rng() * 0.4));
      }
      for (let i = 0; i < 2; i++) sprayBranch(yb + whorlGap / 2, az + rng() * Math.PI * 2, radiusAt(yb + whorlGap / 2) * 0.7);
      az += golden;
    }
    // Leader shoot.
    fillEllipsoid(grid, c, topY - 2.5 * u, c, 1.3 * u, 3 * u, 1.3 * u, (_x, y) => (y > topY - 2 * u ? TIP : NEEDLE));

    // Snow settles on every upward-facing needle surface, in drifts.
    if (settings.snow) {
      const SNOW = mid('snow');
      const snowable = new Set([SHADE, NEEDLE, SUN, TIP]);
      const r = Math.ceil(R0 + 4 * u);
      for (let y = Math.floor(topY + 1 * u); y >= Math.floor(crownBase - 4 * u); y--) {
        for (let z = Math.floor(c - r); z <= Math.ceil(c + r); z++) {
          for (let x = Math.floor(c - r); x <= Math.ceil(c + r); x++) {
            if (!snowable.has(grid.get(x, y, z)) || grid.solid(x, y + 1, z)) continue;
            if (fbm3((x / u) * 0.35, (y / u) * 0.35, (z / u) * 0.35, seed + 13) > 0.36) grid.set(x, y, z, SNOW);
          }
        }
      }
    }

    // Fairy lights spiral up the outside of the crown: each bulb sits just outside the outermost needles.
    const turns = 6;
    const lightBottom = crownBase + 1.5 * u;
    const lightTop = topY - 6 * u;
    const start = rng() * Math.PI * 2;
    const end = start + turns * Math.PI * 2;
    for (let theta = start; theta < end;) {
      const y = Math.round(lightBottom + ((theta - start) / (end - start)) * (lightTop - lightBottom));
      const R = radiusAt(y);
      const dx = Math.cos(theta);
      const dz = Math.sin(theta);
      let prev: [number, number] | null = null;
      for (let r = R + 4 * u; r > 1; r -= 0.5) {
        const x = Math.floor(c + dx * r);
        const z = Math.floor(c + dz * r);
        if (grid.solid(x, y, z)) {
          if (prev) grid.set(prev[0], y, prev[1], BULB);
          break;
        }
        prev = [x, z];
      }
      theta += (2.3 * u) / Math.max(R, 2 * u);
    }

    // Tree-top star: two crossed five-point stars so it reads from every side.
    const starR = 2.4 * u;
    const sy = topY + starR * 0.9;
    const inStar = (a: number, b: number): boolean => {
      const r = Math.hypot(a, b);
      const ang = Math.atan2(b, a) + Math.PI / 2;
      const f = Math.abs(((ang / (Math.PI * 2 / 5)) % 1 + 1) % 1 - 0.5) * 2;
      return r <= starR * (0.45 + 0.55 * f);
    };
    const half = Math.max(0.5, 0.45 * u);
    fillBox(grid, c - starR, sy - starR, c - starR, c + starR, sy + starR, c + starR, (x, y, z) => {
      const ax = x + 0.5 - c;
      const ay = y + 0.5 - sy;
      const az2 = z + 0.5 - c;
      return (Math.abs(az2) <= half && inStar(ax, ay)) || (Math.abs(ax) <= half && inStar(az2, ay)) ? STAR : 0;
    });
    fillCapsule(grid, c, topY - 1 * u, c, c, sy - starR * 0.6, c, 0.4 * u, 0.4 * u, () => NEEDLE);

    // Ground: needle litter under the crown, a few fallen cones, short grass and boulders.
    scatterLitter(grid, ctx, [mid('litter'), mid('litterPale')], 0.24, c, c, 16 * u, seed + 21);
    const CONE = mid('cone');
    const coneLength = Math.max(2, Math.round(0.9 * u));
    for (let i = 0; i < 8; i++) {
      const a = rng() * Math.PI * 2;
      const r = (5 + rng() * 12) * u;
      const x = Math.floor(c + Math.cos(a) * r);
      const z = Math.floor(c + Math.sin(a) * r);
      const alongX = hash3(x, 0, z, seed) < 0.5;
      const cells: [number, number][] = [];
      for (let k = 0; k < coneLength; k++) cells.push(alongX ? [x + k, z] : [x, z + k]);
      if (cells.some(([cx, cz]) => grid.solid(cx, g, cz) || !grid.solid(cx, g - 1, cz))) continue;
      for (const [cx, cz] of cells) grid.set(cx, g, cz, CONE);
    }
    addGrass(grid, palette, ctx, { family: palette.id('grass'), density: 0.025, finderBoost: 0.3, maxHeight: Math.max(2, Math.round(1.6 * u)), seed: seed + 41 });
    addStones(grid, palette, ctx, palette.id('rock'), rng, 3);
  },
};
