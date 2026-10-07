import { fbm3, hash3, mulberry32 } from '../voxel/noise';
import { Palette } from '../voxel/palette';
import { fillCapsule, fillEllipsoid } from '../voxel/shapes';
import { addGrass, addGroundFamilies, addStones, paletteSet, scatterFlakes } from './common';
import type { ObjectVariant, VoxelObject } from './types';

interface Colors {
  dark: string;
  mid: string;
  light: string;
  leaf: [string, string, string];
}

const COLORS: Record<string, Colors> = {
  blossom: { dark: '#8a2a52', mid: '#f2a6c1', light: '#ffeaf2', leaf: ['#2c5a30', '#5f9e48', '#a9d17c'] },
  lavender: { dark: '#4b2f86', mid: '#b9a2ea', light: '#f1ebff', leaf: ['#2c5a40', '#5f9e6a', '#a9d1a0'] },
  coral: { dark: '#9a2f2a', mid: '#f59a86', light: '#fff0e6', leaf: ['#355a2a', '#6c9e44', '#b5d17a'] },
  snow: { dark: '#4a5d78', mid: '#dbe6f2', light: '#ffffff', leaf: ['#2f5a4a', '#5f9e86', '#a9d1c4'] },
};

const VARIANTS: ObjectVariant[] = [
  { id: 'blossom', name: 'Blossom', color: '#f2a6c1' },
  { id: 'lavender', name: 'Lavender', color: '#b9a2ea' },
  { id: 'coral', name: 'Coral', color: '#f59a86' },
  { id: 'snow', name: 'Snow', color: '#dbe6f2' },
];

export const cherryTree: VoxelObject = {
  id: 'cherry-tree',
  name: 'Cherry Tree',
  description: 'A flowering cherry with paper lanterns.',
  variants: VARIANTS,
  createPalette(variantId) {
    const c = COLORS[variantId] ?? COLORS.blossom;
    const palette = new Palette();
    palette.addFamily('bark', '#2c1a10', '#5a3a27', '#b08d68');
    palette.addFamily('blossom', c.dark, c.mid, c.light);
    palette.addFamily('leaf', ...c.leaf);
    palette.addFamily('grass', '#2c5530', '#5f9a45', '#b6d98a');
    palette.addFamily('lantern', '#b8451c', '#ffb347', '#fff1c2', true);
    palette.addFamily('rope', '#2a1d14', '#4a3524', '#7a5c3c');
    const ground = addGroundFamilies(palette, {
      tileA: ['#4a3f48', '#a79ea4', '#f3ede6'],
      tileB: ['#3f4a45', '#a2aaa4', '#ebe8de'],
      accent: ['#2d5a3a', '#8fb98a', '#d3e8b8'],
    });
    return paletteSet(palette, ground);
  },
  build(grid, palette, { layout, seed, u, g }) {
    const rng = mulberry32(seed);
    const size = layout.size;
    const c = size / 2;
    const BARK = palette.id('bark');
    const BLOSSOM = palette.id('blossom');
    const LEAF = palette.id('leaf');
    const GRASS = palette.id('grass');
    const LANTERN = palette.id('lantern');
    const ROPE = palette.id('rope');

    const bark = (x: number, y: number, z: number): number =>
      palette.pick(BARK, fbm3(x * 0.7, y * 0.1, z * 0.7, seed + 1) * 0.8 + hash3(x, y, z, 4) * 0.2, 0.32, 0.9);

    // Trunk with a gentle S-curve and flared roots.
    const lean = (rng() - 0.5) * 3 * u;
    const t1 = { x: c + 1.4 * u + lean, y: g + 8 * u, z: c - 1.2 * u };
    const t2 = { x: c - 0.8 * u + lean * 1.3, y: g + 15 * u, z: c + 0.8 * u };
    const t3 = { x: c + 0.6 * u + lean * 1.5, y: g + 21 * u, z: c + 0.2 * u };
    fillCapsule(grid, c, g, c, t1.x, t1.y, t1.z, 4.6 * u, 3.7 * u, bark);
    fillCapsule(grid, t1.x, t1.y, t1.z, t2.x, t2.y, t2.z, 3.7 * u, 3 * u, bark);
    fillCapsule(grid, t2.x, t2.y, t2.z, t3.x, t3.y, t3.z, 3 * u, 2.4 * u, bark);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + rng() * 0.5;
      const reach = (6 + rng() * 3.5) * u;
      fillCapsule(grid, c, g + 3.2 * u, c, c + Math.cos(a) * reach, g + 0.3, c + Math.sin(a) * reach, 2.3 * u, 0.7 * u, bark);
    }

    // Limbs, each forking into twigs that end in blossom clusters.
    const tips: { x: number; y: number; z: number }[] = [];
    const limbCount = 7;
    for (let i = 0; i < limbCount; i++) {
      const a = (i / limbCount) * Math.PI * 2 + (rng() - 0.5) * 0.5;
      const reach = (10 + rng() * 6) * u;
      const startY = g + (15 + rng() * 6) * u;
      const endY = g + (26 + rng() * 7) * u;
      const base = { x: t3.x, y: startY, z: t3.z };
      const tip = { x: t3.x + Math.cos(a) * reach, y: endY, z: t3.z + Math.sin(a) * reach };
      fillCapsule(grid, base.x, base.y, base.z, tip.x, tip.y, tip.z, 2.2 * u, 1 * u, bark);
      tips.push(tip);
      for (let k = 0; k < 2; k++) {
        const f = 0.45 + rng() * 0.3;
        const fork = { x: base.x + (tip.x - base.x) * f, y: base.y + (tip.y - base.y) * f, z: base.z + (tip.z - base.z) * f };
        const b = a + (rng() - 0.5) * 1.6;
        const twig = { x: fork.x + Math.cos(b) * 5 * u, y: fork.y + (3 + rng() * 5) * u, z: fork.z + Math.sin(b) * 5 * u };
        fillCapsule(grid, fork.x, fork.y, fork.z, twig.x, twig.y, twig.z, 1.1 * u, 0.5 * u, bark);
        tips.push(twig);
      }
    }

    // Fluffy canopy from many small noise-eroded clusters. Petals speckle light and dark; a few leaves show through.
    const canopyBase = g + 20 * u;
    const centerY = g + 34 * u;
    const blossom = (x: number, y: number, z: number): number => {
      if (y < canopyBase + (hash3(x, 0, z, seed + 5) - 0.5) * 4 * u) return 0;
      const speckle = hash3(x, y, z, seed + 8);
      const n = fbm3(x * 0.28, y * 0.28, z * 0.28, seed + 3) * 0.62 + speckle * 0.38 + ((y - centerY) / (26 * u)) * 0.2;
      if (speckle > 0.965) return palette.pick(LEAF, hash3(x, y, z, 2), 0.3, 0.7);
      return palette.pick(BLOSSOM, n, 0.3, 0.7);
    };
    const wobble = (x: number, y: number, z: number): number => (fbm3(x * 0.34, y * 0.34, z * 0.34, seed + 9) - 0.5) * 1.15;
    const cluster = (x: number, y: number, z: number, r: number): void =>
      fillEllipsoid(grid, x, y, z, r * u, r * 0.78 * u, r * u, blossom, wobble);

    for (const tip of tips) {
      cluster(tip.x, tip.y + 3.5 * u, tip.z, 5.6 + rng() * 2.4);
      cluster(tip.x + (rng() - 0.5) * 5 * u, tip.y + 7 * u, tip.z + (rng() - 0.5) * 5 * u, 4.6 + rng() * 2);
    }
    for (let i = 0; i < 26; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.pow(rng(), 0.7) * 14 * u;
      cluster(t3.x + Math.cos(a) * r, centerY + (rng() - 0.35) * 11 * u, t3.z + Math.sin(a) * r, 5.2 + rng() * 3);
    }
    cluster(t3.x, centerY + 9 * u, t3.z, 9);

    // Paper lanterns hanging on cords, glowing at night.
    for (let i = 0; i < 6; i++) {
      const tip = tips[Math.floor(rng() * tips.length)];
      const lx = tip.x + (rng() - 0.5) * 6 * u;
      const lz = tip.z + (rng() - 0.5) * 6 * u;
      const top = tip.y - 0.5 * u;
      const cord = (3 + rng() * 3) * u;
      fillCapsule(grid, lx, top, lz, lx, top - cord, lz, 0.35 * u, 0.35 * u, () => palette.tone(ROPE, 'mid'));
      const cy = top - cord - 2 * u;
      fillEllipsoid(grid, lx, cy, lz, 1.7 * u, 2.2 * u, 1.7 * u, (x, y, z) => palette.pick(LANTERN, hash3(x, y, z, 5) * 0.5 + 0.35, 0.1, 0.9));
      fillEllipsoid(grid, lx, cy + 2.1 * u, lz, 1 * u, 0.5 * u, 1 * u, () => palette.tone(ROPE, 'dark'));
      fillEllipsoid(grid, lx, cy - 2.1 * u, lz, 0.9 * u, 0.5 * u, 0.9 * u, () => palette.tone(ROPE, 'dark'));
    }

    // Ground: fallen petals, grass tufts (thicker at the finder corners) and a few stones.
    scatterFlakes(grid, palette, { layout, seed, u, g }, BLOSSOM, 0.2, c, c, 24 * u, seed + 21);
    addGrass(grid, palette, { layout, seed, u, g }, { family: GRASS, density: 0.03, finderBoost: 0.28, maxHeight: Math.max(3, Math.round(3.4 * u)), seed: seed + 41 });
    addStones(grid, palette, { layout, seed, u, g }, palette.id('rock'), rng, 3);
  },
};
