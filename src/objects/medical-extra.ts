import type { VoxelGrid } from '../voxel/grid';
import { fbm3 } from '../voxel/noise';
import type { Palette } from '../voxel/palette';
import { fillBox } from '../voxel/shapes';
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
// Tooth: a molar at demo-model size, 11 mm across and 18 mm tall. The crown is a rounded block, wider than the
// neck below it, with a soft rounded top edge and a low, wavy chewing surface with four gentle cusps. The trunk
// splits a little above halfway down, through rounded arches, into four thick roots (two in front, two behind) that
// taper to rounded tips.
//
// The tooth is one smooth solid: every part is a signed distance in mm (negative inside), blended with a smooth
// minimum so the crown, trunk and roots flow into each other without creases.

const TOOTH_VARIANTS: ObjectVariant[] = [
  { id: 'natural', name: 'Natural white', color: '#f2f0eb' },
  { id: 'gold', name: 'Gold crown', color: '#d9a93a' },
  { id: 'porcelain', name: 'Porcelain white', color: '#f8f7f3' },
];

/** Crown and root colors: one natural white all over, or a gold crown on a natural root. */
const TOOTH_COLORS: Record<string, { crown: string; root: string }> = {
  natural: { crown: '#f2f0eb', root: '#f2f0eb' },
  gold: { crown: '#d9a93a', root: '#f2f0eb' },
  porcelain: { crown: '#f8f7f3', root: '#f8f7f3' },
};

/** Smooth minimum: like Math.min, with a rounded fillet of size r where the two shapes meet. */
const smin = (a: number, b: number, r: number): number => {
  const h = Math.max(r - Math.abs(a - b), 0) / r;
  return Math.min(a, b) - (h * h * r) / 4;
};
const smax = (a: number, b: number, r: number): number => -smin(-a, -b, r);

/** Catmull-Rom interpolation through [y, value] control points, for smooth side profiles. */
function spline(points: [number, number][], y: number): number {
  if (y <= points[0][0]) return points[0][1];
  const n = points.length - 1;
  if (y >= points[n][0]) return points[n][1];
  let i = 0;
  while (points[i + 1][0] < y) i++;
  const p0 = points[Math.max(0, i - 1)][1];
  const p1 = points[i][1];
  const p2 = points[i + 1][1];
  const p3 = points[Math.min(n, i + 2)][1];
  const t = (y - points[i][0]) / (points[i + 1][0] - points[i][0]);
  return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
}

/** Half-width of the trunk and crown in mm by height: nearly straight sides, slightly fuller at the crown. */
const TOOTH_WIDTH: [number, number][] = [[8, 4.3], [10, 4.45], [11.5, 4.6], [13, 5.25], [14.5, 5.6], [16, 5.5], [17, 5.1], [17.8, 4.6]];
/** Cusp tips near the four corners of the crown, where the rim rises highest. */
const CUSPS: [number, number][] = [[-3.1, 2.8], [3.1, 2.8], [-3.1, -2.8], [3.1, -2.8]];
/** The four roots, one under each corner, all the same size: [x, z] at the fork. */
const ROOTS: [number, number][] = [[-2.6, 2.4], [2.6, 2.4], [-2.6, -2.4], [2.6, -2.4]];

export const tooth: VoxelObject = {
  id: 'tooth',
  name: 'Tooth',
  description: 'A smooth molar: a rounded block crown with a soft wavy top, standing on four thick tapered roots.',
  category: 'medical',
  variants: TOOTH_VARIANTS,
  createPalette(variantId) {
    const v = TOOTH_COLORS[variantId] ?? TOOTH_COLORS.natural;
    return materialPalette('medical', { crown: v.crown, root: v.root });
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    const m = tones(palette);
    const k = 2.4 * u; // voxels per mm
    const CROWN = m('crown');
    const ROOT = m('root');
    const FORK = 9.5;

    /**
     * Height of the chewing surface: a shallow dish. It is lowest in the middle, rises into a rounded rim
     * around the edge and is highest at the four corner cusps, with gentle dips midway along each edge.
     */
    const table = (X: number, Z: number): number => {
      const rho = Math.min(1, ((Math.abs(X) / 5.5) ** 3.5 + (Math.abs(Z) / 5.1) ** 3.5) ** (1 / 3.5));
      let h = 16.9 + 0.5 * rho ** 2.5;
      for (const [cx, cz] of CUSPS) h += 0.35 * Math.exp(-((X - cx) ** 2 + (Z - cz) ** 2) / 4);
      return h;
    };

    /** Signed distance (mm, negative inside) to the whole tooth. */
    const dist = (X: number, Y: number, Z: number): number => {
      // Crown and trunk: rounded-box sections, a faint vertical groove down the middle of the front and back
      // faces where the lobes meet, capped by the chewing surface with a rounded top edge, flat at the fork.
      const W = spline(TOOTH_WIDTH, Y);
      const D = W * 0.93 - 0.25 * Math.exp(-(X * X) / 0.6) * Math.min(1, Math.max(0, (Y - 10) / 3));
      const rho = ((Math.abs(X) / W) ** 3.5 + (Math.abs(Z) / D) ** 3.5) ** (1 / 3.5);
      let body = smax((rho - 1) * Math.min(W, D), Y - table(X, Z), 1.4);
      body = Math.max(body, FORK - Y);
      // Roots: thick at the fork, tapering to rounded tips and splaying very slightly outward.
      let roots = Infinity;
      const a = 1 - Math.min(1, Math.max(0, Y / FORK));
      const r = 0.45 + 1.55 * (1 - a ** 1.05);
      for (const [fx, fz] of ROOTS) {
        const cx = fx * (1 + 0.1 * a);
        const cz = fz * (1 + 0.06 * a);
        const root = smax(Math.hypot(X - cx, Z - cz) - r, -Y, 0.6);
        roots = Math.min(roots, Math.max(root, Y - FORK - 2));
      }
      return smin(body, roots, 1.3);
    };

    sculpt(grid, c, g, c, k, -6.5, 0, -6.5, 6.5, 19, 6.5, (X, Y, Z) => {
      if (Y < 0 || dist(X, Y, Z) > 0) return 0;
      // The crown ends at a wavy line: higher on the side faces, lower on the front and back.
      return Y > 12.3 + 0.4 * Math.cos(2 * Math.atan2(Z, X)) ? CROWN : ROOT;
    });
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Brain: a life-size brain (16.5 cm long, 14 cm wide, 10 cm tall) resting on the bench, front facing +z. Two
// hemispheres form an egg shape, wider at the back, split down the middle by a deep longitudinal fissure. The
// surface is packed with winding gyri separated by narrow sulci, about 1 cm apart. Each side has a temporal lobe
// bulging low under the lateral fissure, and the ridged cerebellum is tucked under the back.

const BRAIN_VARIANTS: ObjectVariant[] = [
  { id: 'anatomical', name: 'Pink model', color: '#d99aa2' },
  { id: 'specimen', name: 'Preserved specimen', color: '#cdbba3' },
  { id: 'neuro-scan', name: 'Blue model', color: '#6aa7d8' },
];

const BRAIN_COLORS: Record<string, { cortex: string; sulcus: string; cerebellum: string }> = {
  anatomical: { cortex: '#d99aa2', sulcus: '#8e4a58', cerebellum: '#c98a94' },
  specimen: { cortex: '#cdbba3', sulcus: '#7f6a52', cerebellum: '#bea98e' },
  'neuro-scan': { cortex: '#6aa7d8', sulcus: '#2a5585', cerebellum: '#5c99cc' },
};

/** Unit directions and phases of the waves whose zero lines draw the gyri: a fixed, deterministic set. */
const GYRI_WAVES: [number, number, number, number][] = Array.from({ length: 7 }, (_, i) => {
  const yz = 1 - (2 * (i + 0.5)) / 7;
  const ring = Math.sqrt(1 - yz * yz);
  const a = i * 2.39996;
  return [ring * Math.cos(a), yz, ring * Math.sin(a), i * 1.7];
});

export const brain: VoxelObject = {
  id: 'brain',
  name: 'Brain',
  description: 'A life-size brain: two folded hemispheres split by a deep fissure, with the cerebellum under the back.',
  category: 'medical',
  variants: BRAIN_VARIANTS,
  createPalette(variantId) {
    const v = BRAIN_COLORS[variantId] ?? BRAIN_COLORS.anatomical;
    return materialPalette('medical', { cortex: v.cortex, sulcus: v.sulcus, cerebellum: v.cerebellum, folia: v.sulcus });
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    const m = tones(palette);
    const k = 2.7 * u; // voxels per cm
    const CORTEX = m('cortex');
    const SULCUS = m('sulcus');
    const CEREBELLUM = m('cerebellum');
    const FOLIA = m('folia');

    // Cerebellum: 10 cm wide, tucked under the back of the cerebrum, with fine horizontal folds.
    sculpt(grid, c, g, c, k, -5.5, 0, -8.8, 5.5, 4.6, -2, (X, Y, Z) => {
      if (Y < 0) return 0;
      const d = (Math.abs(X) / 5) ** 2.2 + (Math.abs(Y - 2.1) / 2.2) ** 2 + (Math.abs(Z + 5.6) / 3) ** 2.2;
      if (d > 1) return 0;
      const fold = Math.floor(Y / 0.4) % 2 === 0;
      if (fold && d > 0.86) return 0;
      return fold ? FOLIA : CEREBELLUM;
    });

    // Cerebrum.
    sculpt(grid, c, g, c, k, -7.5, 0, -8.8, 7.5, 10.5, 8.8, (X, Y, Z) => {
      if (Y < 0) return 0;
      const ax = Math.abs(X);
      const zn = Z / 8.25;
      // Egg outline from above: wider toward the back. Side profile: highest a little behind the middle,
      // the frontal pole rounder, the occipital pole lower.
      const halfW = 7 * (1 - 0.16 * Math.max(0, zn) ** 2) * (1 + 0.03 * Math.min(0, zn));
      const top = 10 - 1.6 * (zn + 0.15) ** 2;
      const bottom = 1.3 + 2.2 * Math.max(0, -zn - 0.35);
      const yc = (top + bottom) / 2;
      const ry = (top - bottom) / 2;
      // Temporal lobes bulge out low on each side, from the middle forward.
      const temporal = Math.exp(-(((Y - 2.6) / 1.8) ** 2)) * Math.exp(-(((Z - 1.5) / 3.5) ** 2));
      const rx = halfW + 0.5 * temporal;
      const d = (ax / rx) ** 2.6 + (Math.abs(Y - yc) / ry) ** 2.2 + Math.abs(zn) ** 2.6;
      // The underside between the temporal lobes is lifted, where the brainstem would leave.
      const lift = Math.max(0, 1 - ax / 2.5) * Math.exp(-((Z / 4) ** 2)) * 1.4;
      if (d > 1 || Y < lift) return 0;
      // Longitudinal fissure: a deep narrow cleft down the middle, closed only near the base.
      if (ax < 0.35) return Y > 2.5 ? 0 : SULCUS;
      const depth = (1 - d) * Math.min(rx, ry);
      // Lateral fissure: a deep groove rising backward from the temporal pole on each side.
      if (ax > 3.5 && Z > -3 && Z < 6 && Math.abs(Y - (4.2 + 0.28 * (6 - Z))) < 0.32 && depth < 1.2) return depth < 0.9 ? 0 : SULCUS;
      // Gyri: the zero lines of a sum of waves with a 2 cm wavelength running in many directions form an even,
      // winding labyrinth of narrow sulci about 1 cm apart; the voxels in them are cut away near the surface
      // and shaded dark deeper down.
      let wave = 0;
      for (const [dx, dy, dz, phase] of GYRI_WAVES) wave += Math.sin((X * dx + Y * dy + Z * dz) * Math.PI + phase);
      const sulcus = Math.abs(wave) < 0.75;
      if (sulcus && depth < 0.5) return 0;
      return sulcus && depth < 0.9 ? SULCUS : CORTEX;
    });
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Pill capsule: a size-00 gelatin capsule (23.3 mm long, 8.5 mm across) lying on the bench with two 10 mm
// scored tablets.

const PILL_VARIANTS: ObjectVariant[] = [
  { id: 'red-white', name: 'Red & white', color: '#c8202a' },
  { id: 'blue-white', name: 'Blue & white', color: '#2060c8' },
  { id: 'teal-gold', name: 'Teal & yellow', color: '#1a8a80' },
];

const CAPSULE_COLORS: Record<string, { cap: string; body: string }> = {
  'red-white': { cap: '#c8202a', body: '#f4f4f0' },
  'blue-white': { cap: '#2060c8', body: '#f4f4f0' },
  'teal-gold': { cap: '#1a8a80', body: '#f2c23a' },
};

export const pill: VoxelObject = {
  id: 'pill',
  name: 'Pill Capsule',
  description: 'A two-tone gelatin capsule lying beside two scored round tablets.',
  category: 'medical',
  variants: PILL_VARIANTS,
  createPalette(variantId) {
    const v = CAPSULE_COLORS[variantId] ?? CAPSULE_COLORS['red-white'];
    return materialPalette('medical', { cap: v.cap, body: v.body, tablet: '#f0efe9', score: '#c6c4bb' });
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    const m = tones(palette);
    const k = 1.8 * u; // voxels per mm
    const CAP = m('cap');
    const BODY = m('body');
    const TABLET = m('tablet');
    const SCORE = m('score');

    // The capsule lies at a slight angle: an 8.2 mm body with the 8.5 mm cap pushed over its open end.
    const cosA = Math.cos(0.35);
    const sinA = Math.sin(0.35);
    const bodyR = 4.1;
    const capR = bodyR + Math.max(0.2, 1 / k);
    sculpt(grid, c, g, c, k, -13, 0, -9, 13, 2 * capR + 1, 9, (X, Y, Z) => {
      if (Y < 0) return 0;
      const L = X * cosA + Z * sinA + 11.65;
      const r = Math.hypot(-X * sinA + Z * cosA, Y - bodyR);
      if (L < 0 || L > 23.3) return 0;
      if (L >= 11.6) return Math.hypot(r, Math.max(0, L - (23.3 - capR))) <= capR ? CAP : 0;
      return Math.hypot(r, Math.max(0, bodyR - L)) <= bodyR ? BODY : 0;
    });

    // Tablets: 10 mm across, 4 mm thick, domed on both faces, one with a break line across the top.
    const tablet = (tx: number, tz: number, scored: boolean): void => {
      sculpt(grid, c + tx * k, g, c + tz * k, k, -5.5, 0, -5.5, 5.5, 4.5, 5.5, (X, Y, Z) => {
        if (Y < 0) return 0;
        const r = Math.hypot(X, Z);
        if (r > 5) return 0;
        const dome = 1.2 * (1 - (r / 5) ** 2);
        if (Y < 1.2 - dome || Y > 2.8 + dome) return 0;
        return scored && Math.abs(Z) < 0.35 && Y > 2.8 + dome - 0.6 ? SCORE : TABLET;
      });
    };
    tablet(-7, 11, true);
    tablet(7, 13, false);
  },
};
