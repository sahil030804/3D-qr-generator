import type { VoxelGrid } from '../voxel/grid';
import { fbm3 } from '../voxel/noise';
import type { Palette } from '../voxel/palette';
import { fillBox, fillCapsule, fillCylinderY, fillEllipsoid } from '../voxel/shapes';
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

/** Solid of revolution in real units around the vertical axis through (cx, cz): `at(r, h, a)` gets radius, height and angle. */
function revolve(
  grid: VoxelGrid, cx: number, gy: number, cz: number, k: number,
  rMax: number, h0: number, h1: number,
  at: (r: number, h: number, a: number) => number,
): void {
  sculpt(grid, cx, gy, cz, k, -rMax, h0, -rMax, rMax, h1, rMax, (X, Y, Z) => (Y < h0 || Y > h1 ? 0 : at(Math.hypot(X, Z), Y, Math.atan2(Z, X))));
}

/** Center of the voxel containing v, so tiny parts always hit at least one voxel. */
const snap = (v: number): number => Math.floor(v) + 0.5;

// ---------------------------------------------------------------------------------------------------------------
// Coffee cup: a 180 ml cappuccino cup (9.5 cm rim, 7.5 cm tall) on a 15.5 cm saucer with a teaspoon.

const CUP_GLAZE: Record<string, string> = { white: '#f2f0eb', red: '#b5242d', brown: '#6b4431' };
const COFFEE_VARIANTS: ObjectVariant[] = [
  { id: 'white', name: 'Porcelain white', color: '#f2f0eb' },
  { id: 'red', name: 'Glazed red', color: '#b5242d' },
  { id: 'brown', name: 'Stoneware brown', color: '#6b4431' },
];

export const coffeeCup: VoxelObject = {
  id: 'coffee-cup',
  name: 'Coffee Cup',
  description: 'A cappuccino with latte art in a cup and saucer.',
  category: 'food',
  variants: COFFEE_VARIANTS,
  createPalette(variantId) {
    return materialPalette('food', {
      glaze: CUP_GLAZE[variantId] ?? CUP_GLAZE.white,
      porcelain: '#f6f4ef',
      bisque: '#d8d0c0',
      coffee: '#3b2414',
      crema: '#a8703f',
      cremaRim: '#7a4a26',
      foam: '#f1e6d2',
      steel: '#c4c8ce',
    });
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    const m = tones(palette);
    const GLAZE = m('glaze');
    const PORCELAIN = m('porcelain');
    const BISQUE = m('bisque');
    const k = 3.2 * u; // voxels per cm

    // Saucer: 2 cm tall on an unglazed foot ring; the well the cup stands in is 0.9 cm up.
    const saucerTop = (r: number): number => (r < 3.3 ? 0.9 : r < 7.0 ? 0.9 + ((r - 3.3) / 3.7) * 1.1 : 2.0);
    const saucerUnder = (h: number): number => (h < 1.6 ? 3.5 + ((h - 0.4) / 1.2) * 4.25 : 7.75);
    revolve(grid, c, g, c, k, 7.8, 0, 2.05, (r, h) => {
      if (h < 0.4) return r >= 2.6 && r <= 3.3 ? BISQUE : 0;
      return r <= saucerUnder(h) && h <= saucerTop(r) ? GLAZE : 0;
    });

    // Cup: tulip profile from a 5 cm foot to the 9.5 cm rim, 4.2 mm wall, coffee 8 mm below the rim.
    const cupY = g + 0.9 * k;
    const wall = 0.42;
    const fill = 6.7;
    const outer = (hb: number): number => 2.55 + 2.2 * (1 - Math.pow(1 - Math.min(1, Math.max(0, (hb - 0.45) / 7.05)), 2.2));
    const crema = outer(fill) - wall;
    revolve(grid, c, cupY, c, k, 4.8, 0, 7.5, (r, hb, a) => {
      if (hb < 0.45) return r >= 2.0 && r <= 2.5 ? BISQUE : 0;
      const R = outer(hb);
      if (r > R) return 0;
      if (hb > 1.2 && r < R - wall) {
        if (hb > fill) return 0;
        if (hb + 1 / k <= fill) return m('coffee');
        // Latte art: a white heart on crema with a darker rim, upright for someone sitting at +z.
        const n = r / crema;
        if (n > 0.86) return m('cremaRim');
        const hx = n * Math.cos(a) * 1.9;
        const hy = -n * Math.sin(a) * 1.9 + 0.2;
        const heart = Math.pow(hx * hx + hy * hy - 1, 3) - hx * hx * hy * hy * hy;
        return heart <= 0 ? m('foam') : m('crema');
      }
      return r > R - wall / 2 || hb < 1.2 ? GLAZE : PORCELAIN;
    });

    // Ear-shaped handle on +x, a flattened oval loop joining the wall near the rim and low on the body.
    sculpt(grid, c, cupY, c, k, 2.5, 1.8, -0.6, 7.4, 6.8, 0.6, (X, Y, Z) => {
      if (X < outer(Y) - 0.3) return 0;
      const q = Math.hypot((X - 5.0) / 1.75, (Y - 4.3) / 1.75);
      const d = (q - 1) * 1.75;
      return (d / 0.36) ** 2 + (Z / 0.45) ** 2 <= 1 ? GLAZE : 0;
    });

    // Teaspoon resting on the saucer in front of the cup, bowl toward the handle.
    const spoonZ = 5.6;
    const thick = Math.max(0.3, 1.05 / k);
    sculpt(grid, c, g, c, k, -5.4, 0.9, spoonZ - 1.3, 5.4, 2.6, spoonZ + 1.3, (X, Y, Z) => {
      // A rigid spoon rests on the slope; it does not climb the last step of the rim.
      const base = saucerTop(Math.min(6.9, Math.hypot(X, Z)));
      if (Y < base || Y > base + thick) return 0;
      const p = Z - spoonZ;
      if (((X - 3.4) / 1.85) ** 2 + (p / 1.15) ** 2 <= 1) return m('steel');
      if (X < -5.25 || X > 1.8) return 0;
      const w = 0.22 + 0.28 * Math.pow((1.8 - X) / 7.05, 1.5);
      if (X < -4.9 && ((X + 4.9) / 0.35) ** 2 + (p / w) ** 2 > 1) return 0;
      return Math.abs(p) <= w ? m('steel') : 0;
    });
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Restaurant: a two-storey corner bistro, 8 m wide and 5.4 m deep, with a terrace in front.

interface BistroColors { wall: string; quoin: string; frame: string; awning: string }
const BISTRO_COLORS: Record<string, BistroColors> = {
  red: { wall: '#9b3b2c', quoin: '#d9cfbe', frame: '#22302a', awning: '#b5222c' },
  cream: { wall: '#d6c19b', quoin: '#b39b74', frame: '#263a56', awning: '#284e80' },
  teal: { wall: '#ebe2d1', quoin: '#cbbfa8', frame: '#1c6a66', awning: '#1b7d77' },
};
const RESTAURANT_VARIANTS: ObjectVariant[] = [
  { id: 'red', name: 'Brick red', color: '#9b3b2c' },
  { id: 'cream', name: 'Sandstone', color: '#d6c19b' },
  { id: 'teal', name: 'Bistro teal', color: '#1c6a66' },
];

/** 3x5 pixel letters for the fascia sign. */
const FONT: Record<string, string[]> = {
  B: ['110', '101', '110', '101', '110'],
  I: ['111', '010', '010', '010', '111'],
  S: ['011', '100', '010', '001', '110'],
  T: ['111', '010', '010', '010', '010'],
  R: ['110', '101', '110', '101', '101'],
  O: ['010', '101', '101', '101', '010'],
};

type Face = 'front' | 'back' | 'east' | 'west';

export const restaurant: VoxelObject = {
  id: 'restaurant',
  name: 'Restaurant',
  description: 'A corner bistro with a striped awning and terrace tables.',
  category: 'food',
  variants: RESTAURANT_VARIANTS,
  createPalette(variantId) {
    const v = BISTRO_COLORS[variantId] ?? BISTRO_COLORS.red;
    return materialPalette('food', {
      wall: v.wall,
      quoin: v.quoin,
      frame: v.frame,
      awning: v.awning,
      stripe: '#f1ebdd',
      trim: '#ece6da',
      glass: '#3b5263',
      lit: { hex: '#f3c47c', glow: true },
      sign: '#1d2124',
      neon: { hex: '#fff1cf', glow: true },
      metal: '#34373c',
      steel: '#9aa1a8',
      roof: '#6f6b66',
      marble: '#e6e2da',
      rattan: '#a8783f',
      planter: '#5c636b',
      shrub: '#3f7a3a',
      chalk: '#2b302d',
      wood: '#8a6240',
      brass: '#c9a24a',
    });
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    const m = tones(palette);
    const k = 5 * u; // voxels per metre
    const W = 4;
    const D = 5.4;
    const zOff = 1.2; // centres building plus terrace on the plot
    const vx = (X: number): number => c + X * k;
    const vy = (Y: number): number => g + Y * k;
    const vz = (Z: number): number => c + (Z + zOff) * k;
    const span = (a: number, b: number): [number, number] => {
      const lo = Math.round(Math.min(a, b));
      return [lo, Math.max(lo + 1, Math.round(Math.max(a, b)))];
    };
    /** Integer voxel box; material 0 carves. */
    const cells = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, material: number): void => {
      for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) grid.set(x, y, z, material);
    };
    /** Box in metres, snapped to whole voxels and never thinner than one. */
    const box = (X0: number, Y0: number, Z0: number, X1: number, Y1: number, Z1: number, material: number): void => {
      const [x0, x1] = span(vx(X0), vx(X1));
      const [y0, y1] = span(vy(Y0), vy(Y1));
      const [z0, z1] = span(vz(Z0), vz(Z1));
      cells(x0, x1, y0, y1, z0, z1, material);
    };

    const zF = Math.round(vz(0));
    const zB = Math.round(vz(-D));
    const xE = Math.round(vx(W));
    const xW = Math.round(vx(-W));
    /**
     * Box on a facade: `a` runs along the wall in metres (X on front/back, Z on the sides), layers count whole voxels
     * outward from the wall face (-1 is the wall's outer skin, 0 the first voxel in front of it).
     */
    const fbox = (face: Face, a0: number, a1: number, Y0: number, Y1: number, l0: number, l1: number, material: number): void => {
      const [y0, y1] = span(vy(Y0), vy(Y1));
      if (face === 'front' || face === 'back') {
        const [x0, x1] = span(vx(a0), vx(a1));
        if (face === 'front') cells(x0, x1, y0, y1, zF + l0, zF + l1, material);
        else cells(x0, x1, y0, y1, zB - l1, zB - l0, material);
      } else {
        const [z0, z1] = span(vz(a0), vz(a1));
        if (face === 'east') cells(xE + l0, xE + l1, y0, y1, z0, z1, material);
        else cells(xW - l1, xW - l0, y0, y1, z0, z1, material);
      }
    };
    /** A band wrapping all four walls, `out` voxels proud of them. */
    const band = (Y0: number, Y1: number, out: number, material: number): void => {
      const [y0, y1] = span(vy(Y0), vy(Y1));
      cells(xW - out, xE + out, y0, y1, zB - out, zF + out, material);
    };

    const WALL = m('wall');
    const QUOIN = m('quoin');
    const FRAME = m('frame');
    const TRIM = m('trim');
    const LIT = m('lit');
    const METAL = m('metal');
    const STEEL = m('steel');

    // Masonry shell: ground floor 3.6 m, upper floor to the 6.6 m roof.
    const yRoof = Math.round(vy(6.6));
    cells(xW, xE, g, yRoof, zB, zF, WALL);
    // Quoins: alternating long and short dressed stones up every corner.
    for (let i = 0; i * 0.36 < 6.2; i++) {
      const Y0 = 0.3 + i * 0.36;
      const Y1 = Math.min(6.25, Y0 + 0.36);
      const len = i % 2 ? 0.32 : 0.56;
      fbox('front', -W, -W + len, Y0, Y1, -1, 0, QUOIN);
      fbox('front', W - len, W, Y0, Y1, -1, 0, QUOIN);
      fbox('back', -W, -W + len, Y0, Y1, -1, 0, QUOIN);
      fbox('back', W - len, W, Y0, Y1, -1, 0, QUOIN);
      fbox('east', -len, 0, Y0, Y1, -1, 0, QUOIN);
      fbox('west', -len, 0, Y0, Y1, -1, 0, QUOIN);
      fbox('east', -D, -D + len, Y0, Y1, -1, 0, QUOIN);
      fbox('west', -D, -D + len, Y0, Y1, -1, 0, QUOIN);
    }
    band(0, 0.3, 1, QUOIN); // base course (also the door step)
    band(3.62, 3.74, 1, QUOIN); // string course between floors
    band(6.25, 6.6, 1, QUOIN); // cornice
    // Parapet with coping around a flat membrane roof.
    const yPar = Math.round(vy(7.0));
    const pt = Math.max(1, Math.round(0.25 * k));
    cells(xW, xE, yRoof, yPar, zB, zB + pt, WALL);
    cells(xW, xE, yRoof, yPar, zF - pt, zF, WALL);
    cells(xW, xW + pt, yRoof, yPar, zB, zF, WALL);
    cells(xE - pt, xE, yRoof, yPar, zB, zF, WALL);
    cells(xW - 1, xE + 1, yPar, yPar + 1, zB - 1, zB + pt + 1, QUOIN);
    cells(xW - 1, xE + 1, yPar, yPar + 1, zF - pt - 1, zF + 1, QUOIN);
    cells(xW - 1, xW + pt + 1, yPar, yPar + 1, zB - 1, zF + 1, QUOIN);
    cells(xE - pt - 1, xE + 1, yPar, yPar + 1, zB - 1, zF + 1, QUOIN);
    cells(xW + pt, xE - pt, yRoof, yRoof + 1, zB + pt, zF - pt, m('roof'));

    // Shopfront: painted timber pilasters, stall riser, lit plate glass with mullions and a transom bar.
    fbox('front', -W, -3.65, 0, 3.0, -1, 1, FRAME);
    fbox('front', 3.65, W, 0, 3.0, -1, 1, FRAME);
    fbox('front', -3.65, 3.65, 0, 0.55, -1, 1, FRAME);
    fbox('front', -3.65, -0.7, 0.55, 3.0, -1, 0, LIT);
    fbox('front', 0.7, 3.65, 0.55, 3.0, -1, 0, LIT);
    fbox('front', -3.65, 3.65, 2.66, 2.78, -1, 1, FRAME);
    for (const a of [-2.2, 2.2]) fbox('front', a - 0.05, a + 0.05, 0.55, 3.0, -1, 1, FRAME);
    for (const a of [-0.76, 0.62]) fbox('front', a, a + 0.14, 0, 3.0, -1, 1, FRAME);
    // Recessed glazed door with brass handle.
    fbox('front', -0.62, 0.62, 0.3, 2.66, -1, 0, 0);
    fbox('front', -0.62, 0.62, 0, 2.66, -2, -1, FRAME);
    fbox('front', -0.5, 0.5, 0.95, 2.5, -2, -1, LIT);
    fbox('front', 0.32, 0.42, 1.0, 1.12, -1, 0, m('brass'));

    // Fascia sign with lit letters; a plain lit strip when the grid is too coarse for lettering.
    fbox('front', -W, W, 3.0, 3.6, -1, 1, m('sign'));
    const [fy0, fy1] = span(vy(3.0), vy(3.6));
    const text = 'BISTRO';
    if (fy1 - fy0 >= 6) {
      const x0 = Math.round(c) - Math.floor((text.length * 4 - 1) / 2);
      const top = Math.floor((fy0 + fy1) / 2) + 2;
      for (let i = 0; i < text.length; i++) {
        FONT[text[i]].forEach((row, r) => {
          for (let col = 0; col < 3; col++) if (row[col] === '1') grid.set(x0 + i * 4 + col, top - r, zF, m('neon'));
        });
      }
    } else {
      fbox('front', -1.6, 1.6, 3.25, 3.35, 0, 1, m('neon'));
    }
    // Gooseneck lamps lighting the sign.
    const reach = Math.max(2, Math.round(0.42 * k));
    for (const a of [-2.6, 0, 2.6]) {
      fbox('front', a - 0.03, a + 0.03, 3.9, 3.98, 0, reach, METAL);
      fbox('front', a - 0.1, a + 0.1, 3.76, 3.9, reach - 1, reach + 1, METAL);
      fbox('front', a - 0.06, a + 0.06, 3.7, 3.76, reach - 1, reach + 1, m('neon'));
    }

    // Upper-floor sash windows with white surrounds and sills; one apartment has its light on.
    const window = (face: Face, a: number, lit: boolean): void => {
      fbox(face, a - 0.55, a + 0.55, 4.2, 5.8, -1, 0, lit ? LIT : m('glass'));
      fbox(face, a - 0.04, a + 0.04, 4.2, 5.8, -1, 0, TRIM);
      fbox(face, a - 0.55, a + 0.55, 5.28, 5.36, -1, 0, TRIM);
      fbox(face, a - 0.68, a + 0.68, 5.8, 5.95, -1, 1, TRIM);
      fbox(face, a - 0.68, a - 0.55, 4.2, 5.8, -1, 1, TRIM);
      fbox(face, a + 0.55, a + 0.68, 4.2, 5.8, -1, 1, TRIM);
      fbox(face, a - 0.75, a + 0.75, 4.06, 4.2, -1, 2, TRIM);
    };
    window('front', -2.6, false);
    window('front', 0, false);
    window('front', 2.6, true);
    for (const face of ['east', 'west'] as const) {
      window(face, -1.5, false);
      window(face, -3.9, face === 'west');
      // Shop window wrapping the corner on the ground floor.
      fbox(face, -3.4, -0.8, 0.6, 2.7, -1, 0, LIT);
      fbox(face, -2.18, -2.02, 0.6, 2.7, -1, 1, FRAME);
      fbox(face, -3.5, -0.7, 2.7, 2.82, -1, 1, FRAME);
      fbox(face, -3.5, -0.7, 0.48, 0.6, -1, 1, FRAME);
      fbox(face, -3.5, -3.4, 0.6, 2.7, -1, 1, FRAME);
      fbox(face, -0.8, -0.7, 0.6, 2.7, -1, 1, FRAME);
    }
    window('back', -2.0, false);
    window('back', 2.0, false);
    fbox('back', 1.4, 2.4, 0.3, 2.2, -1, 0, FRAME);

    // Folding-arm awning: striped canvas sloping 1.5 m out from under the fascia, scalloped valance, steel arms.
    const depth = Math.max(3, Math.round(1.5 * k));
    const slope = 0.42;
    const thick = 1.3 / k;
    const [ax0, ax1] = span(vx(-3.62), vx(3.62));
    const [ay0, ay1] = span(vy(1.9), vy(3.0));
    fillBox(grid, ax0, ay0, zF, ax1, ay1, zF + depth, (x, y, z) => {
      const X = (x + 0.5 - c) / k;
      const Y = (y + 0.5 - g) / k;
      const Zm = (z + 0.5 - zF) / k;
      const top = 2.98 - Zm * slope;
      const s = (X + 3.62) / 0.362;
      const color = Math.floor(s) % 2 ? m('stripe') : m('awning');
      if (Y <= top && Y > top - thick) return color;
      if (z === zF + depth - 1 && Y <= top) {
        const bottom = top - 0.16 - 0.1 * Math.sin(Math.PI * (s - Math.floor(s)));
        return Y >= bottom ? color : 0;
      }
      return 0;
    });
    const edgeY = 2.98 - ((depth - 1) / k) * slope;
    for (const side of [-1, 1]) {
      fillCapsule(grid, vx(side * 3.35), vy(2.0), zF + 0.5, vx(side * 3.2), vy(edgeY - 0.06), zF + depth - 1.5,
        Math.max(0.6, 0.03 * k), Math.max(0.6, 0.03 * k), () => METAL);
    }

    // Terrace: two marble bistro tables, each with a pair of rattan chairs, plus box planters and a menu board.
    const post = (X: number, Z: number, Y0: number, Y1: number, material: number): void => {
      const x = Math.floor(vx(X));
      const z = Math.floor(vz(Z));
      const [y0, y1] = span(vy(Y0), vy(Y1));
      cells(x, x + 1, y0, y1, z, z + 1, material);
    };
    const chair = (X: number, Z: number, facing: number): void => {
      box(X - 0.21, 0.42, Z - 0.21, X + 0.21, 0.47, Z + 0.21, m('rattan'));
      for (const dx of [-0.17, 0.17]) for (const dz of [-0.17, 0.17]) post(X + dx, Z + dz, 0, 0.42, METAL);
      const bx = X - facing * 0.19;
      post(bx, Z - 0.17, 0.47, 0.88, METAL);
      post(bx, Z + 0.17, 0.47, 0.88, METAL);
      box(bx - 0.03, 0.72, Z - 0.2, bx + 0.03, 0.88, Z + 0.2, m('rattan'));
    };
    for (const tx of [-2.1, 2.1]) {
      const tz = 2.35;
      const cx = snap(vx(tx));
      const cz = snap(vz(tz));
      const [ty0, ty1] = span(vy(0.72), vy(0.76));
      fillCylinderY(grid, cx, cz, g, g + 1, Math.max(0.6, 0.2 * k), () => METAL);
      fillCylinderY(grid, cx, cz, g, ty0, Math.max(0.6, 0.035 * k), () => METAL);
      fillCylinderY(grid, cx, cz, ty0, ty1, 0.34 * k, () => m('marble'));
      chair(tx - 0.62, tz, 1);
      chair(tx + 0.62, tz, -1);
    }
    for (const px of [-3.75, 3.75]) {
      box(px - 0.27, 0, 0.12, px + 0.27, 0.5, 0.62, m('planter'));
      fillEllipsoid(grid, vx(px), vy(0.82), vz(0.37), 0.3 * k, 0.38 * k, 0.27 * k, () => m('shrub'));
    }
    // A-frame chalkboard: two boards leaning together at the top.
    const bx = -1.3;
    const bz = 1.0;
    sculpt(grid, c, g, vz(0), k, bx - 0.3, 0, bz - 0.3, bx + 0.3, 0.86, bz + 0.3, (X, Y, Z) => {
      if (Y < 0 || Y > 0.85 || Math.abs(X - bx) > 0.26) return 0;
      const lean = 0.22 * (1 - Y / 0.85);
      if (Math.abs(Z - (bz + lean)) > 0.6 / k && Math.abs(Z - (bz - lean)) > 0.6 / k) return 0;
      return Math.abs(X - bx) <= 0.19 && Y >= 0.12 && Y <= 0.76 ? m('chalk') : m('wood');
    });

    // Rooftop plant: kitchen extract fan, condenser unit and a chimney stack.
    box(-3.0, 6.6, -4.6, -2.2, 7.15, -3.8, STEEL);
    fillCylinderY(grid, vx(-2.6), vz(-4.2), vy(7.15), vy(7.42), 0.3 * k, () => STEEL);
    fillCylinderY(grid, vx(-2.6), vz(-4.2), vy(7.42), vy(7.52), 0.5 * k, () => STEEL);
    box(0.5, 6.6, -4.9, 2.3, 7.45, -3.7, STEEL);
    fillCylinderY(grid, vx(1.4), vz(-4.3), vy(7.45), vy(7.45) + 1, 0.4 * k, () => METAL);
    box(3.0, 6.6, -5.3, 3.6, 7.9, -4.7, WALL);
    box(2.95, 7.9, -5.35, 3.65, 8.0, -4.65, QUOIN);
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Burger: an 11 cm cheeseburger, 9.8 cm tall, on a 15.4 cm edge-glued wooden board.

interface BunColors { crust: string; crumb: string; seed: string; cheese: string; sauce: string }
const BUN_COLORS: Record<string, BunColors> = {
  gold: { crust: '#c98634', crumb: '#f2d9a2', seed: '#f5e8c8', cheese: '#f2a92c', sauce: '#efe2b8' },
  brown: { crust: '#7d5130', crumb: '#d4b383', seed: '#d9c296', cheese: '#f2d580', sauce: '#d8a240' },
  orange: { crust: '#c9692a', crumb: '#f1c78c', seed: '#2c2622', cheese: '#ea8a1e', sauce: '#d4582a' },
};
const BURGER_VARIANTS: ObjectVariant[] = [
  { id: 'gold', name: 'Brioche bun', color: '#c98634' },
  { id: 'brown', name: 'Wholegrain', color: '#7d5130' },
  { id: 'orange', name: 'Smoky chipotle', color: '#c9692a' },
];

export const burger: VoxelObject = {
  id: 'burger',
  name: 'Burger',
  description: 'A sesame-bun cheeseburger on a wooden board.',
  category: 'food',
  variants: BURGER_VARIANTS,
  createPalette(variantId) {
    const v = BUN_COLORS[variantId] ?? BUN_COLORS.gold;
    return materialPalette('food', {
      crust: v.crust,
      crumb: v.crumb,
      seed: v.seed,
      cheese: v.cheese,
      sauce: v.sauce,
      patty: '#5b3622',
      sear: '#3a2215',
      tomato: '#c8302a',
      flesh: '#e2513f',
      lettuce: '#6fb83a',
      lettuceTip: '#9bd157',
      wood: '#b5824f',
      wood2: '#a2703e',
    });
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    const m = tones(palette);
    const k = 3.2 * u; // voxels per cm
    const CRUST = m('crust');
    const CRUMB = m('crumb');

    // Board: edge-glued planks with a chamfered top edge.
    revolve(grid, c, g, c, k, 7.8, 0, 1.6, (r, h, a) => {
      if (r > 7.7 - Math.max(0, h - 1.2) * 1.2) return 0;
      return Math.floor((r * Math.cos(a) + 7.7) / 2.2) % 2 ? m('wood2') : m('wood');
    });
    const b = g + 1.6 * k;

    // Heel: 2.2 cm with a rounded underside; the pale cut face shows as a band at the top edge.
    revolve(grid, c, b, c, k, 5.5, 0, 2.2, (r, h) => {
      const R = h < 0.6 ? 4.75 + Math.sqrt(Math.max(0, 0.36 - (0.6 - h) ** 2)) : 5.35;
      return r > R ? 0 : h > 1.8 ? CRUMB : CRUST;
    });
    // Patty: 1.7 cm, hand-pressed (slightly irregular, wider than the bun) with a seared crust.
    const pattyR = (a: number): number => 5.75 + 0.2 * Math.sin(3 * a + 1) + 0.12 * Math.sin(7 * a + 2);
    revolve(grid, c, b, c, k, 6.2, 2.15, 3.85, (r, h, a) => {
      const hh = h - 2.15;
      const edge = Math.min(hh, 1.7 - hh);
      const R = pattyR(a) - (edge < 0.45 ? 0.45 - Math.sqrt(Math.max(0, 0.2025 - (0.45 - edge) ** 2)) : 0);
      if (r > R) return 0;
      return fbm3(r * Math.cos(a) * 0.9, h * 1.6, r * Math.sin(a) * 0.9, 9) > 0.56 ? m('sear') : m('patty');
    });
    // Cheese: a 9.4 cm square slice whose corners melt down over the patty edge.
    const turn = 0.35;
    const drape = 2.6;
    sculpt(grid, c, b, c, k, -6.4, 2.2, -6.4, 6.4, 4.2, 6.4, (X, Y, Z) => {
      const p = Math.abs(X * Math.cos(turn) + Z * Math.sin(turn));
      const q = Math.abs(-X * Math.sin(turn) + Z * Math.cos(turn));
      if (p > 4.7 || q > 4.7 || Math.max(0, p - 4.2) ** 2 + Math.max(0, q - 4.2) ** 2 > 0.25) return 0;
      const r = Math.hypot(X, Z);
      const rim = pattyR(Math.atan2(Z, X)) - 0.25;
      if (r > rim + 0.55) return 0;
      const over = Math.max(0, r - rim);
      const base = 3.85 - over * drape;
      const below = over > 0 ? drape / k : 0;
      return Y >= base - below && Y <= base + 0.3 ? m('cheese') : 0;
    });
    // Two tomato slices, offset so their red skin peeks out between cheese and lettuce.
    for (const s of [-1, 1]) {
      const tx = s * 2.1 * Math.cos(0.9);
      const tz = s * 2.1 * Math.sin(0.9);
      sculpt(grid, c, b, c, k, tx - 3.7, 4.15, tz - 3.7, tx + 3.7, 4.75, tz + 3.7, (X, Y, Z) => {
        if (Y < 4.15 || Y > 4.75) return 0;
        const d = Math.hypot(X - tx, Z - tz);
        return d > 3.6 ? 0 : d > 3.25 ? m('tomato') : m('flesh');
      });
    }
    // Lettuce: a frilly leaf that waves and droops past the bun.
    revolve(grid, c, b, c, k, 6.5, 4.0, 5.5, (r, h, a) => {
      const edge = 5.7 + 0.45 * Math.abs(Math.sin(5 * a)) + 0.18 * Math.sin(11 * a + 1);
      if (r > edge) return 0;
      const wave = r > 4 ? 0.3 * Math.sin(7 * a) * ((r - 4) / 1.75) : 0;
      const droop = r > 5.3 ? (r - 5.3) * 0.8 : 0;
      const base = 4.75 + wave - droop;
      return h >= base - 1.2 / k && h <= base + 0.4 ? (r > 5.5 ? m('lettuceTip') : m('lettuce')) : 0;
    });
    // Sauce under the crown, with a few drips over the lettuce.
    revolve(grid, c, b, c, k, 5.7, 5.1, 5.4, (r, h, a) => (r <= 5.2 + 0.15 * Math.sin(6 * a) ? m('sauce') : 0));
    for (const a of [0.7, 2.5, 4.6]) {
      fillCapsule(grid, c + Math.cos(a) * 5.3 * k, b + 5.2 * k, c + Math.sin(a) * 5.3 * k,
        c + Math.cos(a) * 5.7 * k, b + 4.55 * k, c + Math.sin(a) * 5.7 * k, 0.24 * k, 0.2 * k, () => m('sauce'));
    }
    // Crown: 4.45 cm dome, 11.1 cm across, pale where it was cut.
    const H = 4.45;
    const R = 5.55;
    const dome = (hh: number): number => R * Math.pow(Math.max(0, 1 - Math.pow(hh / H, 2.4)), 1 / 2.4);
    revolve(grid, c, b, c, k, R + 0.1, 5.35, 5.35 + H, (r, h) => {
      const hh = h - 5.35;
      const round = hh < 0.45 ? 0.45 - Math.sqrt(Math.max(0, 0.2025 - (0.45 - hh) ** 2)) : 0;
      if (r > dome(hh) - round) return 0;
      return hh < 0.4 ? CRUMB : CRUST;
    });
    // Sesame seeds on a sunflower spiral, set into the top of the dome.
    const SEED = m('seed');
    const n = 70;
    for (let i = 0; i < n; i++) {
      const rho = R * 0.9 * Math.sqrt((i + 0.5) / n);
      const t = i * 2.39996;
      const x = Math.floor(c + Math.cos(t) * rho * k);
      const z = Math.floor(c + Math.sin(t) * rho * k);
      const y = grid.topY(x, z);
      if (y < 0) continue;
      const long = Math.max(0.6, 0.22 * k);
      const short = Math.max(0.5, 0.13 * k);
      fillEllipsoid(grid, x + 0.5, y + 0.5, z + 0.5, i % 2 ? long : short, short, i % 2 ? short : long, () => SEED);
    }
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Cake: a 20 cm and 13 cm two-tier cake on a 26 cm pedestal stand, with candles and berries.

interface CakeColors { frosting: string; piping: string; stripe: string }
const CAKE_COLORS: Record<string, CakeColors> = {
  pink: { frosting: '#f4aac3', piping: '#fff4f7', stripe: '#e64a7b' },
  cream: { frosting: '#f3e2c0', piping: '#7a4a2a', stripe: '#4c8fd6' },
  purple: { frosting: '#b58ad8', piping: '#f7f0fc', stripe: '#f2b705' },
};
const CAKE_VARIANTS: ObjectVariant[] = [
  { id: 'pink', name: 'Strawberry pink', color: '#f4aac3' },
  { id: 'cream', name: 'Vanilla cream', color: '#f3e2c0' },
  { id: 'purple', name: 'Berry purple', color: '#b58ad8' },
];

export const cake: VoxelObject = {
  id: 'cake',
  name: 'Cake',
  description: 'A two-tier celebration cake with candles on a cake stand.',
  category: 'food',
  variants: CAKE_VARIANTS,
  createPalette(variantId) {
    const v = CAKE_COLORS[variantId] ?? CAKE_COLORS.pink;
    return materialPalette('food', {
      frosting: v.frosting,
      piping: v.piping,
      stripe: v.stripe,
      stand: '#eceef2',
      board: '#cfa64c',
      candle: '#f8f5ee',
      wick: '#2b2420',
      flame: { hex: '#ffb44a', glow: true },
      raspberry: '#c42a40',
      blueberry: '#3d4382',
      strawberry: '#d8283a',
      leaf: '#3f8f3a',
    });
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    const m = tones(palette);
    const k = 1.85 * u; // voxels per cm
    const FROSTING = m('frosting');
    const PIPING = m('piping');

    // Pedestal stand: 14 cm foot, slim stem flaring into a 26 cm plate with a raised lip.
    revolve(grid, c, g, c, k, 13.1, 0, 7.2, (r, h) => {
      if (h < 6.0) {
        const R = h < 0.35 ? 7.0 : 1.45 + 5.4 * Math.exp(-(h - 0.35) * 2.4) + 2.6 * Math.exp(-(6.0 - h) * 2.2);
        return r <= R ? m('stand') : 0;
      }
      if (h < 6.8) return r <= 13 ? m('stand') : 0;
      return r <= 13 && r >= 12.3 ? m('stand') : 0;
    });
    // Gold cake board, then the tiers.
    revolve(grid, c, g, c, k, 10.6, 6.8, 7.1, (r) => (r <= 10.5 ? m('board') : 0));
    const tier = (R: number, h0: number, h1: number): void => {
      revolve(grid, c, g, c, k, R, h0, h1, (r, h) => {
        const top = h1 - h;
        const round = top < 0.35 ? 0.35 - Math.sqrt(Math.max(0, 0.1225 - (0.35 - top) ** 2)) : 0;
        return r <= R - round ? FROSTING : 0;
      });
      // Piped shell borders at the base and around the top edge.
      const ring = (rho: number, h: number, size: number): void => {
        const n = Math.round((2 * Math.PI * rho) / (size * 1.8));
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          fillEllipsoid(grid, c + Math.cos(a) * rho * k, g + h * k, c + Math.sin(a) * rho * k,
            size * k, size * 0.8 * k, size * k, () => PIPING);
        }
      };
      ring(R + 0.1, h0 + 0.55, 0.72);
      ring(R - 0.5, h1 + 0.2, 0.55);
    };
    tier(10, 7.1, 17.1);
    tier(6.6, 17.1, 25.1);

    // Raspberries and blueberries around the ledge between the tiers.
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.2;
      const big = i % 2 === 0;
      const r = big ? 0.85 : 0.6;
      fillEllipsoid(grid, c + Math.cos(a) * 8.0 * k, g + (17.1 + r * 0.85) * k, c + Math.sin(a) * 8.0 * k,
        r * k, r * k, r * k, () => (big ? m('raspberry') : m('blueberry')));
    }
    // Three strawberries, tip up on their leafy calyx, in the middle of the top tier.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const sx = c + Math.cos(a) * 1.45 * k;
      const sz = c + Math.sin(a) * 1.45 * k;
      revolve(grid, sx, g, sz, k, 1.5, 25.1, 27.8, (r, h, ang) => {
        const t = (h - 25.1) / 2.6;
        if (t < 0.1) return r <= 1.0 + 0.45 * Math.abs(Math.cos(2.5 * ang)) ? m('leaf') : 0;
        return r <= 1.3 * Math.pow(Math.max(0, 1 - t), 0.75) * Math.min(1, (t + 0.08) * 4) ? m('strawberry') : 0;
      });
    }
    // Five spiral-striped candles with wicks and flames.
    const wick = Math.max(1, Math.round(0.4 * k));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const cx = snap(c + Math.cos(a) * 3.9 * k);
      const cz = snap(c + Math.sin(a) * 3.9 * k);
      const y0 = Math.round(g + 25.1 * k);
      const y1 = Math.round(g + 30.1 * k);
      fillCylinderY(grid, cx, cz, y0, y1, Math.max(0.6, 0.35 * k), (x, y, z) =>
        Math.floor((y - g) / k * 2.2 + Math.atan2(z + 0.5 - cz, x + 0.5 - cx) / Math.PI) % 2 ? m('stripe') : m('candle'));
      fillCylinderY(grid, cx, cz, y1, y1 + wick, 0.6, () => m('wick'));
      const fy = y1 + wick + Math.max(0.8, 0.55 * k);
      fillEllipsoid(grid, cx, fy, cz, Math.max(0.6, 0.3 * k), Math.max(1.2, 0.7 * k), Math.max(0.6, 0.3 * k), () => m('flame'));
    }
  },
};
