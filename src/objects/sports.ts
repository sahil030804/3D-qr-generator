import { hash3 } from '../voxel/noise';
import { fillBox, fillCapsule, fillCylinderY, fillLathe, fillRoundedBox, type Chooser } from '../voxel/shapes';
import { materialPalette, solid } from './kit';
import type { ObjectVariant, VoxelObject } from './types';

type Grid = Parameters<VoxelObject['build']>[0];
type V3 = [number, number, number];

/** Piecewise-linear lookup in an [x, y] table sorted by x. */
function lerpTable(table: [number, number][], v: number): number {
  if (v <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i];
    if (v > x1) continue;
    const [x0, y0] = table[i - 1];
    return x1 === x0 ? y1 : y0 + ((y1 - y0) * (v - x0)) / (x1 - x0);
  }
  return table[table.length - 1][1];
}

/** Flat square patch of surface (turf, court, pitch, gym floor) around (c, c) with rounded corners. */
function fillPatch(grid: Grid, c: number, y0: number, y1: number, half: number, round: number, choose: Chooser): void {
  fillBox(grid, c - half, y0, c - half, c + half, y1, c + half, (x, y, z) => {
    const qx = Math.max(0, Math.abs(x + 0.5 - c) - (half - round));
    const qz = Math.max(0, Math.abs(z + 0.5 - c) - (half - round));
    return qx * qx + qz * qz <= round * round ? choose(x, y, z) : 0;
  });
}

/**
 * Sphere painted by surface direction: `paint(dir, depth)` gets the unit direction of the voxel from the center
 * and its depth below the surface in voxels. Return 0 to leave a groove (ball seams).
 */
function fillPatternedSphere(grid: Grid, cx: number, cy: number, cz: number, r: number, paint: (d: V3, depth: number) => number): void {
  fillBox(grid, cx - r, cy - r, cz - r, cx + r, cy + r, cz + r, (x, y, z) => {
    const dx = x + 0.5 - cx;
    const dy = y + 0.5 - cy;
    const dz = z + 0.5 - cz;
    const len = Math.hypot(dx, dy, dz);
    if (len > r) return 0;
    if (len < 1e-6) return paint([0, 1, 0], r);
    return paint([dx / len, dy / len, dz / len], r - len);
  });
}

function rotate(v: V3, yaw: number, pitch: number): V3 {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x = v[0] * cy - v[2] * sy;
  const z = v[0] * sy + v[2] * cy;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return [x, v[1] * cp - z * sp, v[1] * sp + z * cp];
}

const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};

/**
 * Panels of the classic 32-panel ball (a truncated icosahedron): 12 pentagons centered on the icosahedron
 * vertices and 20 hexagons on its faces. `d` is each face's distance from the center (edge length 2/3), so a
 * ray from the center leaves through the face with the largest dot(dir, n) / d.
 */
const BALL_PANELS: { n: V3; d: number; pentagon: boolean }[] = (() => {
  const phi = (1 + Math.sqrt(5)) / 2;
  const ico: V3[] = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) ico.push([0, a, b * phi], [a, b * phi, 0], [b * phi, 0, a]);
  const panels: { n: V3; d: number; pentagon: boolean }[] = ico.map((v) => ({ n: unit(v), d: 1.5516, pentagon: true }));
  const near = (a: V3, b: V3): boolean => Math.abs((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2 - 4) < 1e-6;
  for (let i = 0; i < 12; i++) {
    for (let j = i + 1; j < 12; j++) {
      for (let k = j + 1; k < 12; k++) {
        if (!near(ico[i], ico[j]) || !near(ico[j], ico[k]) || !near(ico[i], ico[k])) continue;
        panels.push({ n: unit([ico[i][0] + ico[j][0] + ico[k][0], ico[i][1] + ico[j][1] + ico[k][1], ico[i][2] + ico[j][2] + ico[k][2]]), d: 1.5115, pentagon: false });
      }
    }
  }
  return panels;
})();

const FOOTBALL_PANELS: Record<string, string> = { white: '#1c1d21', green: '#1f7a3a', blue: '#22448a' };
const FOOTBALL_VARIANTS: ObjectVariant[] = [
  { id: 'white', name: 'Classic black & white', color: '#eceef2' },
  { id: 'green', name: 'Green panels', color: '#1f7a3a' },
  { id: 'blue', name: 'Navy panels', color: '#22448a' },
];
export const football: VoxelObject = {
  id: 'football',
  name: 'Football',
  description: 'A 32-panel match ball on the centre spot of a mown pitch.',
  category: 'sports',
  variants: FOOTBALL_VARIANTS,
  createPalette(variantId) {
    return materialPalette('sports', {
      hexPanel: '#f1f1ec',
      pentPanel: FOOTBALL_PANELS[variantId] ?? FOOTBALL_PANELS.white,
      seam: '#8f918c',
      turf: '#3d7432',
      grass: '#4b8a3a',
      grassTip: '#6aa64c',
      chalk: '#e7ebe1',
      chalkTip: '#f4f6f0',
    });
  },
  build(grid, palette, { layout, seed, u, g }) {
    const c = layout.size / 2;
    const k = 1.55 * u; // voxels per cm: the 22 cm ball is 34 voxels-units across
    const HEX = solid(palette, palette.id('hexPanel'));
    const PENT = solid(palette, palette.id('pentPanel'));
    const SEAM = solid(palette, palette.id('seam'));
    const TURF = solid(palette, palette.id('turf'));
    const GRASS = solid(palette, palette.id('grass'));
    const TIP = solid(palette, palette.id('grassTip'));
    const CHALK = solid(palette, palette.id('chalk'));
    const CHALK_TIP = solid(palette, palette.id('chalkTip'));

    // Rootzone slab and 1.5-3 cm blades of mown grass. The halfway line is 10 cm of chalk across the pitch.
    const half = 26 * u;
    const top = g + Math.max(1, Math.round(u));
    const onLine = (z: number): boolean => Math.abs(z + 0.5 - c) <= 5 * k;
    fillPatch(grid, c, g, top, half, 3 * u, (_x, _y, z) => (onLine(z) ? CHALK() : TURF()));
    fillPatch(grid, c, top, top + 1, half - 0.5 * u, 3 * u, (x, _y, z) => {
      if (hash3(x, 3, z, seed) > 0.5) return 0;
      const h = Math.round((1.5 + hash3(x, 4, z, seed) * 1.5) * k);
      for (let t = 0; t < h; t++) {
        const tip = t >= h - Math.max(1, Math.round(0.6 * k));
        grid.set(x, top + t, z, onLine(z) ? (tip ? CHALK_TIP() : CHALK()) : tip ? TIP() : GRASS());
      }
      return 0;
    });

    // The ball settles 1 cm into the grass on the centre spot. Seams are stitched grooves between panels.
    const R = 11 * k;
    const by = top + 1 * k + R;
    const seamWidth = 0.28 / R;
    fillPatternedSphere(grid, c, by, c, R, (d, depth) => {
      if (depth > 2.5) return HEX();
      const p = rotate(d, 0.35, 0.2);
      let best = -1;
      let s1 = -Infinity;
      let s2 = -Infinity;
      for (let i = 0; i < BALL_PANELS.length; i++) {
        const s = dot(p, BALL_PANELS[i].n) / BALL_PANELS[i].d;
        if (s > s1) {
          s2 = s1;
          s1 = s;
          best = i;
        } else if (s > s2) s2 = s;
      }
      if (s1 - s2 < seamWidth) return depth < 0.8 ? 0 : SEAM();
      return BALL_PANELS[best].pentagon ? PENT() : HEX();
    });
  },
};

const DUMBBELL_HEADS: Record<string, string> = { gray: '#55595f', red: '#b3282d', blue: '#2a56a8' };
const DUMBBELL_VARIANTS: ObjectVariant[] = [
  { id: 'gray', name: 'Cast iron', color: '#55595f' },
  { id: 'red', name: 'Red rubber', color: '#b3282d' },
  { id: 'blue', name: 'Blue rubber', color: '#2a56a8' },
];
export const dumbbell: VoxelObject = {
  id: 'dumbbell',
  name: 'Dumbbell',
  description: 'A pair of 20 kg hex dumbbells on a rubber gym floor, one stood on end.',
  category: 'sports',
  variants: DUMBBELL_VARIANTS,
  createPalette(variantId) {
    return materialPalette('sports', {
      head: DUMBBELL_HEADS[variantId] ?? DUMBBELL_HEADS.gray,
      chrome: '#d0d4da',
      knurl: '#9aa0a8',
      cap: '#b9bec5',
      floor: '#2e3034',
    });
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    const k = 1.3 * u; // voxels per cm
    const HEAD = solid(palette, palette.id('head'));
    const CHROME = solid(palette, palette.id('chrome'));
    const KNURL = solid(palette, palette.id('knurl'));
    const CAP = solid(palette, palette.id('cap'));
    const FLOOR = solid(palette, palette.id('floor'));

    // 15 mm interlocking rubber gym floor.
    const top = g + Math.max(1, Math.round(1.5 * k));
    fillPatch(grid, c, g, top, 26.5 * u, 1.5 * u, FLOOR);

    // 20 kg hex dumbbell: 14.5 cm across the flats, 9.5 cm heads, 13.5 cm grip of 3.4 cm with a knurled middle,
    // steel neck collars and flush steel end caps.
    const a = 7.25 * k;
    const corner = (a * 2) / Math.sqrt(3);
    const headL = 9.5 * k;
    const gripHalf = 6.75 * k;
    const end = gripHalf + headL;
    const sample = (s: number, p: number, q: number): number => {
      const as = Math.abs(s);
      const r = Math.hypot(p, q);
      if (as > end) return 0;
      if (as <= gripHalf) {
        if (as > gripHalf - 1 * k) return r <= 2.4 * k ? CHROME() : 0;
        if (r > 1.7 * k) return 0;
        return as < gripHalf - 2.5 * k ? KNURL() : CHROME();
      }
      // Hex head with chamfered rims (flats perpendicular to p).
      const dEnd = Math.min(as - gripHalf, end - as);
      const ap = a - Math.max(0, 0.6 * k - dEnd);
      if (Math.abs(p) > ap || Math.abs(p) * 0.5 + Math.abs(q) * (Math.sqrt(3) / 2) > ap) return 0;
      return end - as < Math.max(1, 0.4 * k) && r <= 4 * k ? CAP() : HEAD();
    };

    // One lies along X on a flat face, its twin stands upright on an end cap.
    const lx = c - 3 * u;
    const ly = top + a;
    const lz = c + 9.5 * u;
    fillBox(grid, lx - end, top, lz - corner, lx + end, ly + a, lz + corner, (x, y, z) => sample(x + 0.5 - lx, y + 0.5 - ly, z + 0.5 - lz));
    const sx = c + 12 * u;
    const sy = top + end;
    const sz = c - 14 * u;
    fillBox(grid, sx - a, top, sz - corner, sx + a, top + 2 * end, sz + corner, (x, y, z) => sample(y + 0.5 - sy, x + 0.5 - sx, z + 0.5 - sz));
  },
};

const TROPHY_METALS: Record<string, { metal: string; deep: string; plate: string }> = {
  gold: { metal: '#d9a92a', deep: '#a8801c', plate: '#c8a24a' },
  silver: { metal: '#c4c9d0', deep: '#949ba5', plate: '#d6d9de' },
  bronze: { metal: '#b4703c', deep: '#8a5228', plate: '#c8a24a' },
};
const TROPHY_VARIANTS: ObjectVariant[] = [
  { id: 'gold', name: 'Champion gold', color: '#d9a92a' },
  { id: 'silver', name: 'Sterling silver', color: '#c4c9d0' },
  { id: 'bronze', name: 'Bronze', color: '#b4703c' },
];
/** Cup outline as [height above the plinth, radius] in cm: foot, stem with a knot, bowl, lip, domed lid. */
const TROPHY_PROFILE: [number, number][] = [
  [0, 9], [1.2, 9], [1.6, 8.4], [3, 7], [5, 4], [6, 2.4], [11, 2], [11.6, 2.4], [12.4, 3.4], [14, 3.6], [15, 2.2],
  [17, 2.2], [18, 4.5], [20, 7.5], [23, 10], [27, 12.2], [31, 13.4], [35, 14], [36.8, 14], [37, 14.6], [38, 14.6],
  [38.2, 14], [39, 13.5], [40.5, 11.5], [42, 8], [43, 4], [43.6, 1.3], [46, 1.3],
];
export const trophy: VoxelObject = {
  id: 'trophy',
  name: 'Trophy',
  description: 'A lidded two-handled cup on an ebony plinth with an engraved plate.',
  category: 'sports',
  variants: TROPHY_VARIANTS,
  createPalette(variantId) {
    const m = TROPHY_METALS[variantId] ?? TROPHY_METALS.gold;
    return materialPalette('sports', { metal: m.metal, metalDeep: m.deep, plate: m.plate, ebony: '#1d1a19' });
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    const k = 0.9 * u; // voxels per cm: the whole trophy stands 64 cm tall
    const METAL = solid(palette, palette.id('metal'));
    const DEEP = solid(palette, palette.id('metalDeep'));
    const PLATE = solid(palette, palette.id('plate'));
    const EBONY = solid(palette, palette.id('ebony'));

    // Two-tier ebony plinth, 28 cm square and 13 cm tall.
    fillRoundedBox(grid, c - 14 * k, g, c - 14 * k, c + 14 * k, g + 9 * k, c + 14 * k, 0.8 * k, EBONY);
    fillRoundedBox(grid, c - 11.5 * k, g + 8 * k, c - 11.5 * k, c + 11.5 * k, g + 13 * k, c + 11.5 * k, 0.8 * k, EBONY);
    // Engraved plate on the front face: 16 x 4 cm with two lines of lettering.
    const face = c + 14 * k;
    const lip = Math.max(1, 0.4 * k);
    fillBox(grid, c - 8 * k, g + 2.5 * k, face - 0.5, c + 8 * k, g + 6.5 * k, face + lip, (x, y) => {
      const ly = (y + 0.5 - g) / k;
      const lx = Math.abs(x + 0.5 - c) / k;
      const letters = (Math.abs(ly - 5.2) < 0.45 && lx < 5.5) || (Math.abs(ly - 3.8) < 0.45 && lx < 3.8);
      return letters ? DEEP() : PLATE();
    });

    // The cup: foot, stem and knot, bowl with a rolled lip band, domed lid and a ball finial.
    const base = g + 13 * k;
    fillLathe(grid, c, c, base, base + 46 * k, (t) => lerpTable(TROPHY_PROFILE, t * 46) * k, (_x, y) => {
      const h = (y + 0.5 - base) / k;
      return (h >= 36.8 && h < 38.2) || (h >= 11.6 && h < 15) || h < 1.6 ? DEEP() : METAL();
    });
    fillLathe(grid, c, c, base + 45.5 * k, base + 50 * k, (t) => Math.sqrt(Math.max(0, 1 - (t * 2 - 1) ** 2)) * 2.2 * k, METAL);

    // Ear handles: cubic curves from under the lip, out and back into the lower bowl.
    for (const s of [-1, 1] as const) {
      const pts: [number, number][] = [[13.4, 34], [25, 38], [24, 21], [9.6, 21]];
      let prev: [number, number] | null = null;
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const m = 1 - t;
        const px = m * m * m * pts[0][0] + 3 * m * m * t * pts[1][0] + 3 * m * t * t * pts[2][0] + t * t * t * pts[3][0];
        const py = m * m * m * pts[0][1] + 3 * m * m * t * pts[1][1] + 3 * m * t * t * pts[2][1] + t * t * t * pts[3][1];
        const cur: [number, number] = [c + s * px * k, base + py * k];
        if (prev) fillCapsule(grid, prev[0], prev[1], c, cur[0], cur[1], c, 1.1 * k, 1.1 * k, METAL);
        prev = cur;
      }
    }
  },
};

const TENNIS_LOOKS: Record<string, { court: string; frame: string; grip: string; line: string }> = {
  green: { court: '#4f8a3c', frame: '#22262b', grip: '#ecebe6', line: '#f1f2ec' },
  yellow: { court: '#3a66a5', frame: '#e1cf35', grip: '#24262a', line: '#f1f2ec' },
  orange: { court: '#c4643c', frame: '#e0662a', grip: '#ecebe6', line: '#f3eee6' },
};
const TENNIS_VARIANTS: ObjectVariant[] = [
  { id: 'green', name: 'Grass court', color: '#4f8a3c' },
  { id: 'yellow', name: 'Hard court', color: '#3a66a5' },
  { id: 'orange', name: 'Clay court', color: '#c4643c' },
];
/** Points along the seam of a tennis ball (a + b = 1 keeps the curve on the unit sphere). */
const TENNIS_SEAM: V3[] = Array.from({ length: 160 }, (_, i) => {
  const t = (i / 160) * Math.PI * 2;
  const a = 0.68;
  const b = 0.32;
  return [a * Math.cos(t) + b * Math.cos(3 * t), a * Math.sin(t) - b * Math.sin(3 * t), 2 * Math.sqrt(a * b) * Math.sin(2 * t)];
});
export const tennis: VoxelObject = {
  id: 'tennis',
  name: 'Tennis',
  description: 'A strung racket, balls and a ball tube on the baseline of a court.',
  category: 'sports',
  variants: TENNIS_VARIANTS,
  createPalette(variantId) {
    const look = TENNIS_LOOKS[variantId] ?? TENNIS_LOOKS.green;
    return materialPalette('sports', {
      court: look.court,
      line: look.line,
      frame: look.frame,
      grip: look.grip,
      bumper: '#17181b',
      strings: '#e9e5d6',
      felt: '#d9ec3c',
      seam: '#f4f4ec',
      tube: '#eef0f2',
      lid: '#2a2c30',
    });
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    const k = 0.78 * u; // voxels per cm: the 68.5 cm racket spans the plot
    const COURT = solid(palette, palette.id('court'));
    const LINE = solid(palette, palette.id('line'));
    const FRAME = solid(palette, palette.id('frame'));
    const GRIP = solid(palette, palette.id('grip'));
    const BUMPER = solid(palette, palette.id('bumper'));
    const STRINGS = solid(palette, palette.id('strings'));
    const FELT = solid(palette, palette.id('felt'));
    const SEAM = solid(palette, palette.id('seam'));
    const TUBE = solid(palette, palette.id('tube'));
    const LID = solid(palette, palette.id('lid'));

    // Court surface with a 5 cm baseline and the 10 cm centre mark running into the court.
    const top = g + Math.max(1, Math.round(u));
    const baseZ = c - 1 * u;
    const markX = c - 12 * u;
    fillPatch(grid, c, g, top, 26.5 * u, 2 * u, (x, _y, z) => {
      const pz = z + 0.5;
      const onBase = Math.abs(pz - baseZ) <= 2.5 * k;
      const onMark = Math.abs(x + 0.5 - markX) <= 2.5 * k && pz <= baseZ && pz >= baseZ - 12.5 * k;
      return onBase || onMark ? LINE() : COURT();
    });

    // Racket lying flat along X: 68.5 cm long, 33 x 25 cm oval head, 2.4 cm deep beam, open throat,
    // octagonal 3.2 cm grip with a butt cap. Strings run 16 x 19 at mid-depth.
    const butt = c - 26.7 * u;
    const rz = c + 9 * u;
    const headS = 52;
    const A = 16.5;
    const B = 12.5;
    const beam = 1.4;
    const stringY = top + Math.round(1.1 * k);
    const ell = (ds: number, dw: number, ea: number, eb: number): number => (ds / ea) ** 2 + (dw / eb) ** 2;
    fillBox(grid, butt, top, rz - B * k - 1, butt + 68.5 * k + 1, top + 3.3 * k, rz + B * k + 1, (x, y, z) => {
      const s = (x + 0.5 - butt) / k;
      const w = (z + 0.5 - rz) / k;
      const h = (y + 0.5 - top) / k;
      const ds = s - headS;
      // Hoop, with a black bumper guard over the tip.
      if (h <= 2.4 && ell(ds, w, A, B) <= 1 && ell(ds, w, A - beam, B - beam) > 1) return ds > A - 3.5 && ell(ds, w, A - beam * 0.5, B - beam * 0.5) > 1 ? BUMPER() : FRAME();
      // String bed.
      if (y === stringY && ell(ds, w, A - beam, B - beam) <= 1) {
        const mainSp = (2 * (B - beam)) / 16;
        const crossSp = (2 * (A - beam)) / 19;
        const qm = w / mainSp - 0.5;
        const qc = ds / crossSp;
        const tol = 0.5 / k;
        return Math.abs(qm - Math.round(qm)) * mainSp < tol || Math.abs(qc - Math.round(qc)) * crossSp < tol ? STRINGS() : 0;
      }
      // Throat arms from the shaft (s = 25) to the hoop at 5 and 7 o'clock.
      if (h <= 2.4 && s >= 24 && s <= 39) {
        const f = (s - 25) / 14;
        const armW = 1.2 + Math.max(0, f) * 6.2;
        if (Math.abs(Math.abs(w) - armW) <= 0.8 && ell(ds, w, A - beam, B - beam) > 1) return FRAME();
      }
      // Shaft, grip and butt cap: octagonal section resting on the court.
      const hc = h - 1.6;
      const oct = (apo: number): boolean => Math.abs(w) <= apo && Math.abs(hc) <= apo && Math.abs(w) + Math.abs(hc) <= apo * 1.414 * 0.95;
      if (s >= 0 && s < 1.2) return oct(1.75) ? BUMPER() : 0;
      if (s >= 1.2 && s < 21) return oct(1.6) ? GRIP() : 0;
      if (s >= 21 && s < 26) return oct(1.5 - (s - 21) * 0.06) ? FRAME() : 0;
      return 0;
    });

    // 6.7 cm optic-yellow balls with their curved seam, resting on the court.
    const R = 3.35 * k;
    const ball = (bx: number, bz: number, yaw: number, pitch: number): void => {
      fillPatternedSphere(grid, bx, top + R, bz, R, (d, depth) => {
        // Below ~4 voxels of radius the seam would swamp the ball, so small balls stay plain felt.
        if (depth > 1.5 || R < 4) return FELT();
        const p = rotate(d, yaw, pitch);
        let best = Infinity;
        for (const q of TENNIS_SEAM) best = Math.min(best, (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2);
        return Math.sqrt(best) * R < Math.max(0.55, 0.3 * k) ? SEAM() : FELT();
      });
    };
    ball(butt + headS * k, rz - (B + 3.35) * k, 0.4, 1.1);
    ball(c + 2 * u, c - 13 * u, 1.7, 0.3);
    ball(c - 6.5 * u, c - 17 * u, 2.6, 2.2);

    // Ball tube standing upright: 7.6 cm wide, 24 cm tall, black lid, with a printed band in the racket color.
    const tx = c + 15 * u;
    const tz = c - 16 * u;
    fillCylinderY(grid, tx, tz, top, top + 22.8 * k, 3.8 * k, (_x, y) => {
      const h = (y + 0.5 - top) / k;
      return h > 8 && h < 15 ? FRAME() : TUBE();
    });
    fillCylinderY(grid, tx, tz, top + 22.8 * k, top + 24 * k, 4 * k, LID);
  },
};

const CRICKET_LOOKS: Record<string, { stumps: string; grip: string; ball: string; stitch: string }> = {
  cream: { stumps: '#e6d5ae', grip: '#7a2030', ball: '#9e1c1f', stitch: '#efe6d2' },
  red: { stumps: '#c03a3a', grip: '#202225', ball: '#eceae2', stitch: '#4a6a4a' },
  green: { stumps: '#2f8a4a', grip: '#2f8a4a', ball: '#9e1c1f', stitch: '#efe6d2' },
};
const CRICKET_VARIANTS: ObjectVariant[] = [
  { id: 'cream', name: 'Natural ash', color: '#e6d5ae' },
  { id: 'red', name: 'Cherry red', color: '#c03a3a' },
  { id: 'green', name: 'Outfield green', color: '#2f8a4a' },
];
export const cricket: VoxelObject = {
  id: 'cricket',
  name: 'Cricket Set',
  description: 'Stumps and bails on the crease with a willow bat leaning on them and a leather ball.',
  category: 'sports',
  variants: CRICKET_VARIANTS,
  createPalette(variantId) {
    const look = CRICKET_LOOKS[variantId] ?? CRICKET_LOOKS.cream;
    return materialPalette('sports', {
      pitch: '#cbbb8c',
      crease: '#f2f0e8',
      stumps: look.stumps,
      willow: '#e3cf9c',
      cane: '#b8925a',
      grip: look.grip,
      sticker: '#1d3f8a',
      ball: look.ball,
      stitch: look.stitch,
    });
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    const k = 0.66 * u; // voxels per cm: the 71 cm stumps stand 47 units tall
    const PITCH = solid(palette, palette.id('pitch'));
    const CREASE = solid(palette, palette.id('crease'));
    const STUMPS = solid(palette, palette.id('stumps'));
    const WILLOW = solid(palette, palette.id('willow'));
    const CANE = solid(palette, palette.id('cane'));
    const GRIP = solid(palette, palette.id('grip'));
    const STICKER = solid(palette, palette.id('sticker'));
    const BALL = solid(palette, palette.id('ball'));
    const STITCH = solid(palette, palette.id('stitch'));

    // Rolled pitch with the 5 cm bowling crease running through the stumps.
    const top = g + Math.max(1, Math.round(u));
    const sz = c - 8 * u;
    fillPatch(grid, c, g, top, 26.5 * u, 2 * u, (_x, _y, z) => (Math.abs(z + 0.5 - sz) <= 2.5 * k ? CREASE() : PITCH()));

    // Three 3.7 cm stumps, 71.1 cm tall with domed tops, 22.86 cm across the outside.
    const stumpR = 1.85 * k;
    const stumpH = 71.1;
    for (const off of [-9.53, 0, 9.53]) {
      fillLathe(grid, c + off * k, sz, top, top + stumpH * k, (t) => {
        const h = t * stumpH;
        return h > stumpH - 1 ? stumpR * Math.sqrt(Math.max(0.2, 1 - (h - (stumpH - 1)) ** 2)) : stumpR;
      }, STUMPS);
    }
    // Two 10.95 cm bails in the grooves: a fat barrel between thin spigots, sitting 1.27 cm proud.
    const bailY = top + (stumpH + 0.45) * k;
    for (const [x0, x1] of [[-10.9, -0.1], [0.1, 10.9]]) {
      fillBox(grid, c + x0 * k, bailY - 1 * k, sz - 1 * k, c + x1 * k, bailY + 1 * k, sz + 1 * k, (x, y, z) => {
        const lx = (x + 0.5 - c) / k;
        const mid = (x0 + x1) / 2;
        const r = Math.max(Math.abs(lx - mid) < 2.7 ? 0.82 : 0.5, 0.55 / k);
        return Math.hypot((y + 0.5 - bailY) / k, (z + 0.5 - sz) / k) <= r ? STUMPS() : 0;
      });
    }

    // Bat leaning on the middle stump: its handle rests on the bails, its back toe edge on the pitch.
    // Blade 56 x 10.8 cm with a flat face and a spine up to 6.5 cm deep; 40.5 cm cane handle with a rubber grip.
    const theta = (66 * Math.PI) / 180;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const face = 2.2;
    const depthAt = (s: number, w: number): number => {
      const spine = lerpTable([[0, 3.8], [8, 5.8], [20, 6.5], [40, 5.8], [53, 5], [58, 3.4]], s);
      return 3.6 + (spine - 3.6) * Math.max(0, 1 - (w / 5.4) ** 2);
    };
    const handleR = 1.75;
    // Contact: the handle's back touches the front-top of the bails at (y = 72.4, z = +0.8) cm from the stumps base.
    const py = stumpH + 1.27 + handleR * cos;
    const pz = 0.8 + handleR * sin;
    const oy = (depthAt(0, 0) - face) * cos;
    const sc = (py - oy) / sin;
    const oz = pz + sc * cos;
    fillBox(grid, c - 6 * k, top, sz - 8 * k, c + 6 * k, top + 92 * k, sz + (oz + 6) * k, (x, y, z) => {
      const dy = (y + 0.5 - top) / k - oy;
      const dz = (z + 0.5 - sz) / k - oz;
      const s = dy * sin - dz * cos;
      const n = dy * cos + dz * sin;
      const w = (x + 0.5 - c) / k;
      if (s < 0 || s > 96.5) return 0;
      if (s <= 58) {
        // Blade, narrowing through the shoulders into the handle; rounded toe corners.
        const halfW = s < 53 ? 5.4 : 5.4 - ((s - 53) / 5) * 3.7;
        const toe = s < 1.5 ? 1.5 - Math.sqrt(Math.max(0, 1.5 ** 2 - (1.5 - s) ** 2)) : 0;
        if (Math.abs(w) > halfW - (Math.abs(w) > halfW - 1.5 ? toe : 0)) return 0;
        if (n > face || n < face - depthAt(s, w)) return 0;
        if (s > 34 && s < 46 && Math.abs(w) < 4.2 && n > face - 0.6 / k - 0.1) return STICKER();
        return WILLOW();
      }
      const r = Math.hypot(w, n);
      if (s < 62) return r <= 1.6 ? CANE() : 0;
      if (s > 95) return r <= handleR * Math.sqrt(Math.max(0, 1 - ((s - 95) / 1.5) ** 2)) ? GRIP() : 0;
      return r <= handleR ? GRIP() : 0;
    });

    // 7.2 cm leather ball with its raised stitched seam, resting on the pitch in front.
    const R = 3.6 * k;
    const seamN = unit([0.25, 0.3, 1]);
    fillPatternedSphere(grid, c + 13 * u, top + R, c + 15 * u, R, (d) => (Math.abs(dot(d, seamN)) < 0.16 ? STITCH() : BALL()));
  },
};
