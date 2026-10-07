import type { VoxelGrid } from '../voxel/grid';
import { fbm3, hash3 } from '../voxel/noise';
import type { Palette } from '../voxel/palette';
import { fillBox, fillCapsule, fillLathe } from '../voxel/shapes';
import { materialPalette } from './kit';
import type { ObjectVariant, VoxelObject } from './types';

/** Natural-tone material index for a named family. */
function tones(palette: Palette): (name: string) => number {
  return (name) => palette.tone(palette.id(name), 'mid');
}

/**
 * Sculpt in real units: every voxel near the box [x0, x1] x [y0, y1] x [z0, z1] (units around the origin
 * (ox, oy, oz), k voxels per unit) asks `at(X, Y, Z)` for its material, measured at the voxel center.
 */
function sculpt(
  grid: VoxelGrid, ox: number, oy: number, oz: number, k: number,
  x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
  at: (X: number, Y: number, Z: number) => number,
): void {
  fillBox(grid, ox + x0 * k - 1, oy + y0 * k - 1, oz + z0 * k - 1, ox + x1 * k + 1, oy + y1 * k + 1, oz + z1 * k + 1,
    (x, y, z) => at((x + 0.5 - ox) / k, (y + 0.5 - oy) / k, (z + 0.5 - oz) / k));
}

// ---------------------------------------------------------------------------------------------------------------
// Masala dosa: a crisp dosa rolled into a 30 cm tube around its potato masala, served on a 40 x 28 cm banana
// leaf with coconut chutney and sambar in two steel katoris.

const DOSA_VARIANTS: ObjectVariant[] = [
  { id: 'ghee-roast', name: 'Ghee roast', color: '#c98a3a' },
  { id: 'mysore', name: 'Mysore masala', color: '#b8692a' },
  { id: 'rava', name: 'Rava dosa', color: '#d9a44a' },
];

const DOSA_COLORS: Record<string, { crust: string; toasted: string; pale: string; filling: string }> = {
  'ghee-roast': { crust: '#c98a3a', toasted: '#8a5520', pale: '#e8c070', filling: '#e3b23e' },
  mysore: { crust: '#b8692a', toasted: '#7a3a12', pale: '#dba860', filling: '#d9802e' },
  rava: { crust: '#d9a44a', toasted: '#9a6a28', pale: '#f0d090', filling: '#e3b23e' },
};

export const dosa: VoxelObject = {
  id: 'dosa',
  name: 'Masala Dosa',
  description: 'A long golden rolled dosa on a banana leaf, with coconut chutney and sambar in steel bowls.',
  category: 'food',
  variants: DOSA_VARIANTS,
  createPalette(variantId) {
    const v = DOSA_COLORS[variantId] ?? DOSA_COLORS['ghee-roast'];
    const set = materialPalette('food', {
      crust: v.crust, toasted: v.toasted, pale: v.pale, filling: v.filling,
      steel: '#c9ced3', chutney: '#f3f1e8', mustard: '#2b2420', sambar: '#c4542b', veg: '#e4a33a',
    });
    // The leaf lies under three quarters of the code, so its scan tones are set by hand to sit close to the
    // tiles' own: the derived deep green reads too dark next to the finder squares and breaks decoding.
    set.palette.addFamily('leaf', '#2a4a22', '#3f8f2e', '#e6f2e0');
    set.palette.addFamily('vein', '#243f1e', '#2f7322', '#e2eedc');
    set.palette.addFamily('rib', '#334d1c', '#9fc23a', '#f0f6dc');
    return set;
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    const m = tones(palette);
    const k = 1.4 * u; // voxels per cm
    const CRUST = m('crust');
    const TOASTED = m('toasted');
    const PALE = m('pale');
    const FILLING = m('filling');
    const LEAF = m('leaf');
    const VEIN = m('vein');
    const RIB = m('rib');
    const STEEL = m('steel');

    // Banana leaf: a 40 x 28 cm piece with a raised midrib and fine lateral veins; the long edges wave a little.
    sculpt(grid, c, g, c, k, -20.5, 0, -14.5, 20.5, 1.2, 14.5, (X, Y, Z) => {
      if (Y < 0 || Math.abs(X) > 20 || Math.abs(Z) > 14 - 0.4 * Math.abs(Math.sin(X * 0.9))) return 0;
      const rib = Math.abs(Z) < 0.6;
      if (Y >= 0.6) return rib && Y < 1.1 ? RIB : 0;
      if (rib) return RIB;
      const vein = (((X + 0.35 * Math.abs(Z)) % 1.8) + 1.8) % 1.8 < 0.25;
      return vein ? VEIN : LEAF;
    });
    const leafTop = g + 0.6 * k;

    // The dosa: a thin crepe rolled into a long tube, 30 cm long and 5.5 cm across, resting on the leaf and
    // slightly flattened by its own weight. The roll is hollow with open ends; the potato masala fills only the
    // middle. The outer edge of the crepe lies along the top as a thin flap. Outside is golden with darker
    // roasted patches from the tawa; the inside face is pale.
    const R = 2.75;
    const layer = Math.max(0.3, 1.1 / k);
    const turn = 0.12;
    const cosT = Math.cos(turn);
    const sinT = Math.sin(turn);
    sculpt(grid, c, leafTop, c, k, -16, 0, -6, 16, 2 * R + 0.6, 9, (X, Y, Z) => {
      if (Y < 0) return 0;
      const L = X * cosT + Z * sinT;
      const W = -X * sinT + Z * cosT - 2;
      if (Math.abs(L) > 15) return 0;
      // The ends narrow a little where the crepe thins out.
      const end = Math.max(0, Math.abs(L) - 12) / 3;
      const r = R * (1 - 0.18 * end * end);
      const cy = r * 0.88;
      const p = Math.hypot(W / r, (Y - cy) / (r * 0.88));
      const radial = (1 - p) * r;
      // Seam flap: the free edge of the crepe, one extra layer over the upper front of the roll.
      const ang = Math.atan2(Y - cy, W);
      const flap = ang > 0.25 && ang < 1.05 ? layer : 0;
      if (radial < -flap) return 0;
      const n = fbm3(L * 1.3, Y * 1.3, W * 1.3, 3);
      const outside = n > 0.64 ? TOASTED : n < 0.27 ? PALE : CRUST;
      if (radial < layer) return outside;
      if (radial < 2 * layer) return PALE;
      return Math.abs(L) < 9 ? FILLING : 0;
    });

    // Two stainless katoris, 8 cm across and 4 cm tall, filled to 3.2 cm: coconut chutney with mustard seeds
    // on the left, sambar with vegetable pieces on the right.
    const wall = Math.max(0.3, 1 / k);
    const bowl = (bx: number, bz: number, FILL: number, BITS: number, chance: number, seed: number): void => {
      const x = c + bx * k;
      const z = c + bz * k;
      fillLathe(grid, x, z, leafTop, leafTop + 4 * k, (t) => [(3.5 + 0.5 * t) * k, t < 0.1 ? 0 : (3.5 + 0.5 * t - wall) * k], () => STEEL);
      const surface = leafTop + 3.2 * k;
      fillLathe(grid, x, z, leafTop + 0.4 * k, surface, (t) => (3.5 + 0.5 * (0.1 + 0.7 * t) - wall) * k, (vx, vy, vz) => {
        if (vy < surface - 1) return FILL;
        return hash3(Math.floor(vx / 2), 0, Math.floor(vz / 2), seed) > chance ? BITS : FILL;
      });
    };
    bowl(-9, -9.5, m('chutney'), m('mustard'), 0.86, 19);
    bowl(9, -9.5, m('sambar'), m('veg'), 0.8, 33);
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Vada pav: a ladi pav (8 x 8 x 5.5 cm) split and hinged at the back, a 6 cm batata vada pressed in, dry garlic
// chutney and green chutney, and a fried green chili, all on a sheet of paper.

const VADAPAV_VARIANTS: ObjectVariant[] = [
  { id: 'mumbai-classic', name: 'Mumbai classic', color: '#d9a63a' },
  { id: 'kolhapuri', name: 'Extra spicy', color: '#7a160e' },
  { id: 'cheese', name: 'Cheese pav', color: '#f0c23a' },
];

const VADA_COLORS: Record<string, { besan: string; crust: string; chutney: string }> = {
  'mumbai-classic': { besan: '#d9a63a', crust: '#b5712c', chutney: '#9c2a1a' },
  kolhapuri: { besan: '#d29a2e', crust: '#a86526', chutney: '#7a160e' },
  cheese: { besan: '#dcac44', crust: '#bd7a34', chutney: '#f0c23a' },
};

export const vadaPav: VoxelObject = {
  id: 'vada-pav',
  name: 'Vada Pav',
  description: 'A split pav with a batata vada pressed inside, garlic and green chutney, and a fried green chili.',
  category: 'food',
  variants: VADAPAV_VARIANTS,
  createPalette(variantId) {
    const v = VADA_COLORS[variantId] ?? VADA_COLORS['mumbai-classic'];
    return materialPalette('food', {
      paper: '#d9d2c2', crust: v.crust, side: '#efdcb8', crumb: '#f5e8cc',
      besan: v.besan, fried: '#a8701e', chutney: v.chutney, green: '#3d7a2a',
      chili: '#4e9a3a', blister: '#2d5e22', stem: '#3b6b2a',
    });
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    const m = tones(palette);
    const k = 3.2 * u; // voxels per cm
    const CRUST = m('crust');
    const SIDE = m('side');
    const CRUMB = m('crumb');
    const BESAN = m('besan');
    const FRIED = m('fried');
    const CHUTNEY = m('chutney');
    const GREEN = m('green');
    const CHILI = m('chili');
    const BLISTER = m('blister');

    // A 16 x 16 cm sheet of paper, laid down at a slight angle.
    const paperVox = Math.max(1, Math.round(0.3 * k));
    const PAPER = m('paper');
    sculpt(grid, c, g, c, k, -8.5, 0, -8.5, 8.5, paperVox / k, 8.5, (X, Y, Z) => {
      if (Y < 0 || Y >= paperVox / k) return 0;
      const ca = Math.cos(0.12);
      const sa = Math.sin(0.12);
      return Math.abs(X * ca + Z * sa) <= 8 && Math.abs(-X * sa + Z * ca) <= 8 ? PAPER : 0;
    });
    const b = g + paperVox;

    // Ladi pav: a soft cushion-shaped roll. Only the top is browned; the sides were torn from the slab and stay
    // pale. It is cut through at 2.4 cm, leaving a hinge along the back edge.
    const pav = (X: number, Z: number): number => (Math.abs(X) / 4) ** 3 + (Math.abs(Z) / 4) ** 3;
    const face = Math.max(0.3, 1 / k);
    sculpt(grid, c, b, c, k, -4.5, 0, -4.5, 4.5, 2.6, 4.5, (X, Y, Z) => {
      if (Y < 0 || Y >= 2.4) return 0;
      const d = pav(X, Z);
      if (d > 1 || (Y < 0.5 && d > 1 - (0.5 - Y) * 0.6)) return 0;
      if (Y < 0.3) return CRUST;
      return d > 0.82 ? SIDE : CRUMB;
    });

    // Batata vada: a 6.4 cm potato fritter in gram-flour batter, pressed flat (3 cm thick) into the pav and
    // peeking out at the front.
    const vx = 0.3;
    const vz = 1.0;
    const vy = 2.4 + 1.3;
    sculpt(grid, c, b, c, k, -3.2, 2.3, -2.5, 3.8, 5.4, 4.6, (X, Y, Z) => {
      const wobble = 0.08 * Math.sin(X * 2.3 + Z * 1.7) + 0.06 * Math.cos(Y * 3.1 + X);
      const d = ((X - vx) / 3.2) ** 2 + ((Y - vy) / 1.5) ** 2 + ((Z - vz) / 3.2) ** 2 + wobble;
      if (d > 1) return 0;
      return fbm3(X * 0.9, Y * 0.9, Z * 0.9, 21) > 0.58 ? FRIED : BESAN;
    });

    // Dry garlic chutney sprinkled over the cut face around the vada.
    sculpt(grid, c, b, c, k, -4, 2.4, -4, 4, 2.4 + face, 4, (X, Y, Z) => {
      if (Y < 2.4 || Y >= 2.4 + face || pav(X, Z) > 0.8) return 0;
      if (((X - vx) / 3.2) ** 2 + ((Z - vz) / 3.2) ** 2 < 0.9) return 0;
      return hash3(Math.floor(X * 3), 0, Math.floor(Z * 3), 55) > 0.45 ? CHUTNEY : 0;
    });

    // The top half swings up on its hinge and is pressed down onto the soft vada, sinking about 8 mm into it:
    // find the smallest opening that leaves no more than that.
    let theta = 0.3;
    const clears = (t: number): boolean => {
      const s = Math.sin(t);
      const co = Math.cos(t);
      for (let i = 0; i < 300; i++) {
        const a = i * 2.39996;
        const yy = 1 - 2 * ((i + 0.5) / 300);
        const rr = Math.sqrt(1 - yy * yy) * 1.08;
        const py = vy + 1.5 * yy * 1.08;
        const pz = vz + 3.2 * rr * Math.sin(a);
        if (-(pz + 4) * s + (py - 2.4) * co > 0.8) return false;
      }
      return true;
    };
    while (theta < 1.4 && !clears(theta)) theta += 0.02;
    const s = Math.sin(theta);
    const co = Math.cos(theta);
    sculpt(grid, c, b, c, k, -4.5, 2.2, -4.6, 4.5, 11.5, 5.5, (X, Y, Z) => {
      const zl = (Z + 4) * co + (Y - 2.4) * s - 4;
      const yl = -(Z + 4) * s + (Y - 2.4) * co;
      if (yl < 0) return 0;
      const d = pav(X, zl);
      if (d > 1) return 0;
      const topH = 3.1 - 1.7 * d ** 2;
      if (yl > topH) return 0;
      if (yl < face + 0.25 && ((X - 0.5) / 2.4) ** 2 + ((zl + 0.3) / 1.7) ** 2 < 1) return GREEN;
      if (yl < face) return hash3(Math.floor(X * 3), 1, Math.floor(zl * 3), 56) > 0.7 ? CHUTNEY : CRUMB;
      if (yl > topH - 0.35) return CRUST;
      return SIDE;
    });

    // Fried green chili, 7 cm long, lying beside the pav with its stem toward the back.
    const chiliR = (t: number): number => 0.6 * (1 - 0.75 * t * t);
    const at = (t: number): [number, number, number] =>
      [c + (6.3 + 0.9 * Math.sin(t * Math.PI)) * k, b + (0.62 - 0.1 * t) * k, c + (-3.3 + 7 * t) * k];
    for (let i = 1; i <= 10; i++) {
      const [ax, ay, az] = at((i - 1) / 10);
      const [bx, by, bz] = at(i / 10);
      fillCapsule(grid, ax, ay, az, bx, by, bz, chiliR((i - 1) / 10) * k, chiliR(i / 10) * k,
        (x, y, z) => (hash3(x, y, z, 77) > 0.8 ? BLISTER : CHILI));
    }
    const [sx, sy, sz] = at(0);
    fillCapsule(grid, sx, sy, sz, sx - 0.3 * k, sy + 0.3 * k, sz - 1.6 * k, 0.22 * k, 0.18 * k, () => m('stem'));
  },
};
