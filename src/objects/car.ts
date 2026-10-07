import { fbm3, hash3, mulberry32 } from '../voxel/noise';
import { Palette } from '../voxel/palette';
import { fillCapsule, fillCylinderY, fillEllipsoid } from '../voxel/shapes';
import { addGroundFamilies, addStones, paletteSet } from './common';
import type { ObjectVariant, VoxelObject } from './types';

const PAINTS: Record<string, [string, string, string]> = {
  red: ['#5a0b12', '#c8232c', '#ffb9b0'],
  blue: ['#0f2a5a', '#2563c8', '#a9c8ff'],
  yellow: ['#6a4a00', '#f2b705', '#fff0a0'],
  white: ['#5b6270', '#eceef2', '#ffffff'],
};

const VARIANTS: ObjectVariant[] = [
  { id: 'red', name: 'Racing red', color: '#c8232c' },
  { id: 'blue', name: 'Cobalt', color: '#2563c8' },
  { id: 'yellow', name: 'Sun yellow', color: '#f2b705' },
  { id: 'white', name: 'Pearl', color: '#eceef2' },
];

export const car: VoxelObject = {
  id: 'car',
  name: 'Sports Car',
  description: 'A coupe on a lamp-lit plaza.',
  variants: VARIANTS,
  createPalette(variantId) {
    const palette = new Palette();
    palette.addFamily('paint', ...(PAINTS[variantId] ?? PAINTS.red));
    palette.addFamily('trim', '#0f1013', '#2a2d33', '#6a6e77');
    palette.addFamily('chrome', '#4a5260', '#aab3bf', '#eef2f6');
    palette.addFamily('glass', '#0e1722', '#2b4b66', '#a8d0ea');
    palette.addFamily('tire', '#0b0b0d', '#17181b', '#26282c');
    palette.addFamily('lamp', '#9a7a20', '#fff1b0', '#ffffff', true);
    palette.addFamily('tail', '#7a0a14', '#ff2a36', '#ff9a9a', true);
    palette.addFamily('cone', '#6a2a0c', '#ff7a1a', '#ffe0c0');
    const ground = addGroundFamilies(palette, {
      tileA: ['#2a2d34', '#8a8f98', '#cfd3da'],
      tileB: ['#30343c', '#868b94', '#c4c8d0'],
      accent: ['#8a4b0c', '#e0a050', '#ffe0a8'],
    });
    return paletteSet(palette, ground);
  },
  build(grid, palette, { layout, seed, u, g }) {
    const size = layout.size;
    const c = size / 2;
    const PAINT = palette.id('paint');
    const TRIM = palette.id('trim');
    const CHROME = palette.id('chrome');
    const GLASS = palette.id('glass');
    const TIRE = palette.id('tire');
    const LAMP = palette.id('lamp');
    const TAIL = palette.id('tail');
    const CONE = palette.id('cone');

    const L = 48 * u;
    const hw = 12 * u;
    const x0 = c - L / 2;
    const wheelY = 5.2 * u;
    const wheelR = 5.2 * u;
    const archR = 6.4 * u;
    const wheelXs = [0.2 * L, 0.8 * L];
    const roofH = 18.6 * u;

    const beltAt = (t: number): number => (t > 0.68 ? 10.6 * u - ((t - 0.68) / 0.32) * 2.4 * u : 10.6 * u);
    const roofAt = (t: number): number => {
      if (t < 0.3 || t > 0.68) return -1;
      if (t < 0.4) return beltAt(t) + ((t - 0.3) / 0.1) * (roofH - beltAt(t));
      if (t < 0.56) return roofH;
      return roofH - ((t - 0.56) / 0.12) * (roofH - beltAt(t));
    };
    const cabinHalf = (ly: number, belt: number): number => 9.8 * u - (ly - belt) * 0.28;
    const between = (v: number, a: number, b: number): boolean => v >= a && v < b;
    const paint = (x: number, y: number, z: number): number => palette.pick(PAINT, 0.5 + (hash3(x, y, z, seed) - 0.5) * 0.1, 0.1, 0.9);

    for (let y = g; y < Math.min(grid.height, g + Math.ceil(roofH + 3 * u)); y++) {
      for (let z = Math.floor(c - hw - 2); z <= Math.ceil(c + hw + 2); z++) {
        for (let x = Math.floor(x0 - 2); x <= Math.ceil(x0 + L + 2); x++) {
          const lx = x + 0.5 - x0;
          const lz = Math.abs(z + 0.5 - c);
          const ly = y + 0.5 - g;
          const t = lx / L;
          const belt = beltAt(t);
          let mat = 0;

          // Wheel assemblies and arches take priority over the body shell.
          let handled = false;
          for (const wx of wheelXs) {
            const d = Math.hypot(lx - wx, ly - wheelY);
            if (lz < hw - 5.6 * u || d > archR || ly >= belt - 1.8 * u) continue;
            handled = true;
            if (d <= wheelR && between(lz, hw - 5 * u, hw - 1.3 * u)) {
              if (d <= wheelR * 0.62 && lz >= hw - 2.1 * u) {
                const spoke = Math.floor(Math.atan2(ly - wheelY, lx - wx) / (Math.PI / 5)) & 1;
                mat = d <= 1.3 * u ? palette.tone(TRIM, 'dark') : palette.tone(CHROME, spoke ? 'light' : 'mid');
              } else {
                mat = palette.pick(TIRE, hash3(x, y, z, seed), 0.3, 0.9);
              }
            } else if (lz <= hw - 4.4 * u) {
              mat = palette.tone(TRIM, 'dark');
            }
            break;
          }
          if (handled) {
            if (mat) grid.set(x, y, z, mat);
            continue;
          }

          // Lower body shell with tapered ends and rolled shoulders.
          let half = hw;
          if (ly < 3.4 * u) half -= (3.4 * u - ly) * 0.6;
          if (ly > belt - 1.4 * u) half -= (ly - (belt - 1.4 * u)) * 0.9;
          const edge = Math.min(lx, L - lx);
          if (edge < 3.6 * u) half -= (3.6 * u - edge) * 0.6;

          if (ly >= 2.2 * u && ly < belt && lz <= half) {
            mat = paint(x, y, z);
            if (ly < 3.4 * u) mat = palette.tone(TRIM, 'dark');
            else if (ly < 4.4 * u) mat = palette.tone(TRIM, 'mid');
            if ((lx < 2 * u || lx > L - 2.2 * u) && between(ly, 3.4 * u, 6.2 * u)) {
              mat = between(ly, 4.6 * u, 5.4 * u) ? palette.tone(CHROME, 'mid') : palette.tone(TRIM, 'mid');
            }
            if (lz >= half - 0.9 * u && between(ly, 4.6 * u, belt - 1.2 * u)) {
              if (Math.abs(t - 0.345) < 0.008 || Math.abs(t - 0.62) < 0.008) mat = palette.tone(TRIM, 'dark');
              if (between(t, 0.5, 0.54) && between(ly, 8.4 * u, 9 * u)) mat = palette.tone(CHROME, 'mid');
            }
            if (lx >= L - 1.6 * u) {
              if (lz < 5.2 * u && between(ly, 4.6 * u, 8 * u)) {
                mat = between(ly, 6.2 * u, 7 * u) ? palette.tone(CHROME, 'mid') : palette.tone(TRIM, 'dark');
              }
              if (between(lz, 5.8 * u, 10.4 * u) && between(ly, 6 * u, 8.4 * u)) mat = palette.tone(LAMP, 'mid');
            }
            if (lx <= 1.6 * u && between(lz, 4.6 * u, 10.6 * u) && between(ly, 6.4 * u, 8.8 * u)) mat = palette.tone(TAIL, 'mid');
          } else {
            const roof = roofAt(t);
            const half2 = cabinHalf(ly, belt);
            if (roof > 0 && ly >= belt && ly < roof && lz <= half2) {
              mat = paint(x, y, z);
              const glass = palette.pick(GLASS, fbm3(x * 0.25, y * 0.25, z * 0.25, seed + 2) + (ly / roofH) * 0.2, 0.38, 0.78);
              const sideWindow = lz >= half2 - 1.4 * u && ly >= belt + 1.1 * u && ly < roof - 1.3 * u
                && (between(t, 0.335, 0.515) || between(t, 0.545, 0.655));
              const screen = ly >= roof - 1.5 * u && lz <= half2 - 1 * u && (between(t, 0.56, 0.68) || between(t, 0.3, 0.4));
              if (sideWindow || screen) mat = glass;
            } else if (roof > 0 && ly >= roof && ly < roof + 0.95 * u && between(t, 0.42, 0.55) && between(lz, 7.2 * u, 8.2 * u)) {
              mat = palette.tone(CHROME, 'mid');
            } else if (between(lx, 0.635 * L, 0.635 * L + 2.2 * u) && between(ly, 10.6 * u, 12.4 * u) && between(lz, 9.4 * u, 11.8 * u)) {
              mat = palette.tone(PAINT, 'mid');
            }
          }
          if (mat) grid.set(x, y, z, mat);
        }
      }
    }

    // Traffic cones and a street lamp, kept clear of the finder squares.
    for (const [sx, sz] of [[28, 24], [31, 6]]) {
      const cx = c + sx * u;
      const cz = c + sz * u;
      for (let k = 0; k < 4; k++) {
        fillCylinderY(grid, cx, cz, g + k * 0.9 * u, g + (k + 1) * 0.9 * u, (1.8 - k * 0.38) * u, () => palette.tone(CONE, k === 1 ? 'light' : 'mid'));
      }
      fillCylinderY(grid, cx, cz, g, g + 0.5 * u + 0.5, 2.3 * u, () => palette.tone(TRIM, 'mid'));
    }
    const lampX = c + 27 * u;
    const lampZ = c + 31 * u;
    fillCapsule(grid, lampX, g, lampZ, lampX, g + 30 * u, lampZ, 0.9 * u, 0.7 * u, () => palette.tone(TRIM, 'mid'));
    fillCapsule(grid, lampX, g + 30 * u, lampZ, lampX - 6 * u, g + 31.5 * u, lampZ - 3 * u, 0.7 * u, 0.6 * u, () => palette.tone(TRIM, 'mid'));
    fillEllipsoid(grid, lampX - 6 * u, g + 30.2 * u, lampZ - 3 * u, 1.9 * u, 0.9 * u, 1.9 * u, () => palette.tone(LAMP, 'mid'));
    addStones(grid, palette, { layout, seed, u, g }, palette.id('rock'), mulberry32(seed), 2);
  },
};
