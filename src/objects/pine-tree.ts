import { fbm3, hash3, mulberry32, valueNoise3 } from '../voxel/noise';
import { Palette } from '../voxel/palette';
import { fillBox, fillCapsule } from '../voxel/shapes';
import { addGrass, addGroundFamilies, addStones, paletteSet, scatterFlakes } from './common';
import type { ObjectVariant, VoxelObject } from './types';

interface Colors {
  needle: [string, string, string];
  tile: [string, string, string];
}

const COLORS: Record<string, Colors> = {
  evergreen: { needle: ['#12351d', '#2a6a3a', '#9fcf8d'], tile: ['#2d3b36', '#9aa8a0', '#e6efe9'] },
  frost: { needle: ['#1d3f52', '#4f8a9c', '#eaf6ff'], tile: ['#2b3a47', '#a1b0bd', '#eef4fa'] },
  larch: { needle: ['#6b3a0e', '#d08a1f', '#ffe39a'], tile: ['#4a3a2a', '#b3a58f', '#f5ecd9'] },
};

const VARIANTS: ObjectVariant[] = [
  { id: 'evergreen', name: 'Evergreen', color: '#2a6a3a' },
  { id: 'frost', name: 'Frost', color: '#9ccbe0' },
  { id: 'larch', name: 'Larch', color: '#d08a1f' },
];

export const pineTree: VoxelObject = {
  id: 'pine-tree',
  name: 'Pine Tree',
  description: 'A tall evergreen strung with fairy lights.',
  variants: VARIANTS,
  createPalette(variantId) {
    const c = COLORS[variantId] ?? COLORS.evergreen;
    const palette = new Palette();
    palette.addFamily('needle', ...c.needle);
    palette.addFamily('bark', '#2a1a10', '#523626', '#a98660');
    palette.addFamily('grass', '#26502e', '#4f8a43', '#b6d98a');
    palette.addFamily('light', '#c47a1c', '#ffd27a', '#fff6d6', true);
    palette.addFamily('berry', '#6a1020', '#c8283c', '#ff8a96');
    const ground = addGroundFamilies(palette, {
      tileA: [c.tile[0], c.tile[1], c.tile[2]],
      tileB: ['#34413a', '#a3b0a8', '#dde8e0'],
      accent: ['#1d4a5e', '#8fb7c8', '#cfe6ef'],
    });
    return paletteSet(palette, ground);
  },
  build(grid, palette, { layout, seed, u, g }) {
    const rng = mulberry32(seed);
    const c = layout.size / 2;
    const NEEDLE = palette.id('needle');
    const BARK = palette.id('bark');
    const LIGHT = palette.id('light');
    const BERRY = palette.id('berry');

    const bark = (x: number, y: number, z: number): number =>
      palette.pick(BARK, fbm3(x * 0.8, y * 0.1, z * 0.8, seed + 1) * 0.8 + hash3(x, y, z, 4) * 0.2, 0.32, 0.9);
    fillCapsule(grid, c, g, c, c, g + 52 * u, c, 3.2 * u, 0.9 * u, bark);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + rng();
      fillCapsule(grid, c, g + 3 * u, c, c + Math.cos(a) * 6 * u, g + 0.3, c + Math.sin(a) * 6 * u, 1.9 * u, 0.7 * u, bark);
    }

    // Drooping tiers of jagged bough fans with gaps, narrowing toward the top.
    const tiers = 11;
    const lights: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < tiers; i++) {
      const k = i / (tiers - 1);
      const baseY = g + (6 + i * 4.4) * u;
      const radius = (18 - i * 1.5) * u;
      const reach = Math.ceil(radius * 1.35);
      for (let z = Math.floor(c - reach); z <= Math.ceil(c + reach); z++) {
        for (let x = Math.floor(c - reach); x <= Math.ceil(c + reach); x++) {
          const dx = x + 0.5 - c;
          const dz = z + 0.5 - c;
          const d = Math.hypot(dx, dz);
          const ang = Math.atan2(dz, dx);
          const fan = valueNoise3(Math.cos(ang) * 3.4 + i * 9, Math.sin(ang) * 3.4, i * 2.7, seed + 4);
          const limit = radius * (0.72 + fan * 0.5);
          if (d > limit || d < 1.2 * u) continue;
          const t = d / limit;
          if (t > 0.45 && hash3(x, i, z, seed + 12) > 0.93 - (1 - t) * 0.3) continue;
          const surface = baseY + 4.6 * u * (1 - t) - 2.6 * u * t * t;
          const thickness = (1.8 + 1.4 * (1 - t)) * u;
          for (let y = Math.floor(surface - thickness); y <= Math.floor(surface); y++) {
            const n = fbm3(x * 0.4, y * 0.4, z * 0.4, seed + 6) * 0.7 + hash3(x, y, z, seed + 2) * 0.3 + t * 0.06 - k * 0.04;
            grid.set(x, y, z, palette.pick(NEEDLE, n, 0.34, 0.76));
          }
          if (t > 0.55 && t < 0.97 && hash3(x, i, z, seed + 31) > 0.985) lights.push({ x, y: Math.floor(surface) + 1, z });
        }
      }
    }
    for (const l of lights) grid.set(l.x, l.y, l.z, palette.tone(LIGHT, 'mid'));

    // Crown with a glowing star.
    const topY = g + (6 + tiers * 4.4) * u;
    fillCapsule(grid, c, topY - 5 * u, c, c, topY + 4 * u, c, 1.8 * u, 0.35 * u, (x, y, z) => palette.pick(NEEDLE, fbm3(x * 0.4, y * 0.4, z * 0.4, seed), 0.3, 0.7));
    const s = Math.max(1, Math.round(0.9 * u));
    const sy = Math.round(topY + 4 * u);
    fillBox(grid, c - s * 2, sy, c - s / 2, c + s * 2, sy + s, c + s / 2, () => palette.tone(LIGHT, 'light'));
    fillBox(grid, c - s / 2, sy - s, c - s / 2, c + s / 2, sy + s * 2, c + s / 2, () => palette.tone(LIGHT, 'light'));

    // Fallen needles, ferns, a few berries and boulders.
    scatterFlakes(grid, palette, { layout, seed, u, g }, NEEDLE, 0.22, c, c, 24 * u, seed + 21);
    addGrass(grid, palette, { layout, seed, u, g }, { family: palette.id('grass'), density: 0.025, finderBoost: 0.3, maxHeight: Math.max(3, Math.round(3.6 * u)), seed: seed + 41 });
    for (let i = 0; i < 7; i++) {
      const a = rng() * Math.PI * 2;
      const r = (9 + rng() * 14) * u;
      const x = Math.round(c + Math.cos(a) * r);
      const z = Math.round(c + Math.sin(a) * r);
      if (grid.get(x, g, z) === 0) grid.set(x, g, z, palette.tone(BERRY, 'mid'));
    }
    addStones(grid, palette, { layout, seed, u, g }, palette.id('rock'), rng, 3);
  },
};
