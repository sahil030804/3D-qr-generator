import { fillBox, fillCapsule, fillCylinderX, fillCylinderY, fillCylinderZ, fillEllipsoid, fillLathe } from '../voxel/shapes';
import { materialPalette } from './kit';
import type { ObjectVariant, VoxelObject } from './types';

type Grid = Parameters<VoxelObject['build']>[0];
type Pal = Parameters<VoxelObject['build']>[1];
type V3 = [number, number, number];

/** Natural tone of a named material. */
function tone(palette: Pal, name: string): number {
  return palette.tone(palette.id(name), 'mid');
}

/**
 * Box turned by `angle` (radians) about the vertical axis through (cx, cz), covering voxel layers y0..y1-1.
 * `choose(lx, ly, lz)` gets local coordinates (ly counts voxel layers from y0) and returns a material or 0.
 */
function fillTurned(
  grid: Grid, cx: number, cz: number, y0: number, y1: number, hx: number, hz: number, angle: number,
  choose: (lx: number, ly: number, lz: number) => number,
): void {
  const r = Math.hypot(hx, hz) + 1;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let y = Math.max(0, y0); y < Math.min(grid.height, y1); y++) {
    for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x + 0.5 - cx;
        const dz = z + 0.5 - cz;
        const lx = dx * cos + dz * sin;
        const lz = -dx * sin + dz * cos;
        if (Math.abs(lx) > hx || Math.abs(lz) > hz) continue;
        const m = choose(lx, y - y0, lz);
        if (m) grid.set(x, y, z, m);
      }
    }
  }
}

/** World offset of a local (lx, lz) point in a frame turned by `angle` (inverse of `fillTurned`). */
function turned(lx: number, lz: number, angle: number): [number, number] {
  return [lx * Math.cos(angle) - lz * Math.sin(angle), lx * Math.sin(angle) + lz * Math.cos(angle)];
}

/**
 * Rod from a to b. `choose(t, h, v)` gets the distance t along the axis and the offsets h (horizontal, across the
 * rod) and v (perpendicular, pointing up) of each voxel center within `rMax` of the axis.
 */
function fillRod(grid: Grid, a: V3, b: V3, rMax: number, choose: (t: number, h: number, v: number) => number): void {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...d);
  d[0] /= len; d[1] /= len; d[2] /= len;
  const n = Math.hypot(d[0], d[2]) || 1;
  const e1: V3 = [-d[2] / n, 0, d[0] / n];
  const e2: V3 = [e1[1] * d[2] - e1[2] * d[1], e1[2] * d[0] - e1[0] * d[2], e1[0] * d[1] - e1[1] * d[0]];
  const lo = [0, 1, 2].map((i) => Math.floor(Math.min(a[i], b[i]) - rMax - 1));
  const hi = [0, 1, 2].map((i) => Math.ceil(Math.max(a[i], b[i]) + rMax + 1));
  for (let y = Math.max(0, lo[1]); y <= Math.min(grid.height - 1, hi[1]); y++) {
    for (let z = lo[2]; z <= hi[2]; z++) {
      for (let x = lo[0]; x <= hi[0]; x++) {
        const p = [x + 0.5 - a[0], y + 0.5 - a[1], z + 0.5 - a[2]];
        const t = p[0] * d[0] + p[1] * d[1] + p[2] * d[2];
        if (t < 0 || t > len) continue;
        const h = p[0] * e1[0] + p[2] * e1[2];
        const v = p[0] * e2[0] + p[1] * e2[1] + p[2] * e2[2];
        if (h * h + v * v > rMax * rMax) continue;
        const m = choose(t, h, v);
        if (m) grid.set(x, y, z, m);
      }
    }
  }
}

interface BookSpec {
  cx: number;
  cz: number;
  /** Bottom voxel layer. */
  y: number;
  /** Spine length, depth (spine to fore-edge) and thickness, in voxels. */
  L: number;
  W: number;
  T: number;
  angle: number;
  /** Which local z side the spine is on. */
  spine: 1 | -1;
  cover: number;
  band: number;
  paper: number;
}

/** Hardcover book lying flat: boards overhang the page block by one voxel on three sides, banded spine. */
function book(grid: Grid, b: BookSpec): void {
  const T = Math.max(3, Math.round(b.T));
  fillTurned(grid, b.cx, b.cz, b.y, b.y + T, b.L / 2, b.W / 2, b.angle, (lx, ly, lz) => {
    const q = b.W / 2 - b.spine * lz;
    if (q < 1) {
      const fromEnd = b.L / 2 - Math.abs(lx);
      return (fromEnd > b.L * 0.1 && fromEnd < b.L * 0.1 + 1) || (fromEnd > b.L * 0.16 && fromEnd < b.L * 0.16 + 1) ? b.band : b.cover;
    }
    if (ly === 0 || ly === T - 1) return b.cover;
    return Math.abs(lx) <= b.L / 2 - 1 && q <= b.W - 1 ? b.paper : 0;
  });
}

interface PencilMaterials {
  paint: number;
  wood: number;
  lead: number;
  ferrule: number;
  ring: number;
  eraser: number;
  stamp?: number;
}

/**
 * Hexagonal wood-cased pencil from its sharpened tip to its eraser end, flat faces up and down. `ap` is half the
 * width across flats and `k` the voxels per cm for the cone, ferrule and eraser lengths.
 */
function drawPencil(grid: Grid, tip: V3, back: V3, ap: number, k: number, m: PencilMaterials): void {
  const R = ap / Math.cos(Math.PI / 6);
  const L = Math.hypot(back[0] - tip[0], back[1] - tip[1], back[2] - tip[2]);
  const cone = 2.4 * k;
  const lead = Math.max(0.6, 0.16 * k);
  const eraserStart = L - 0.9 * k;
  const ferruleStart = eraserStart - 1.5 * k;
  fillRod(grid, tip, back, R + 0.5, (t, h, v) => {
    const radial = Math.hypot(h, v);
    if (t >= ferruleStart) {
      if (t >= eraserStart) {
        const cap = L - t < ap * 0.6 ? Math.sqrt(Math.max(0, 1 - Math.pow(1 - (L - t) / (ap * 0.6), 2))) : 1;
        return radial <= ap * 0.95 * Math.max(0.55, cap) ? m.eraser : 0;
      }
      if (radial > R * 0.97) return 0;
      const s = (t - ferruleStart) / (eraserStart - ferruleStart);
      return (s > 0.18 && s < 0.28) || (s > 0.72 && s < 0.82) ? m.ring : m.ferrule;
    }
    const hexD = Math.max(Math.abs(v), (Math.sqrt(3) / 2) * Math.abs(h) + 0.5 * Math.abs(v));
    if (hexD > ap) return 0;
    if (t < cone) {
      const rc = (R * 1.02 * t) / cone;
      if (radial > rc) return 0;
      if (rc <= lead + 0.35) return m.lead;
      if (radial > rc - 1) return m.wood;
    }
    if (m.stamp && v > ap - 1 && Math.abs(h) < 0.6) {
      const s = (t - cone) / (ferruleStart - cone);
      if (s > 0.62 && s < 0.9 && Math.floor(t / Math.max(1, 0.18 * k)) % 3 !== 0) return m.stamp;
    }
    return m.paint;
  });
}

/* ----------------------------------------------------------------------------------------------------------- */

const CAP_COLORS: Record<string, string> = { black: '#1c1d22', blue: '#1f3d86', purple: '#4c2a82' };
const GRAD_VARIANTS: ObjectVariant[] = [
  { id: 'black', name: 'Classic black', color: '#1c1d22' },
  { id: 'blue', name: 'Royal blue', color: '#1f3d86' },
  { id: 'purple', name: 'Royal purple', color: '#4c2a82' },
];
export const gradCap: VoxelObject = {
  id: 'grad-cap',
  name: 'Graduation Cap',
  description: 'A mortarboard resting on two books beside a ribboned diploma.',
  category: 'education',
  variants: GRAD_VARIANTS,
  createPalette(variantId) {
    return materialPalette('education', {
      cap: CAP_COLORS[variantId] ?? CAP_COLORS.black,
      tassel: '#d6a636',
      bookA: '#2f4b3a',
      bookB: '#7a2430',
      paper: '#ece3c8',
      band: '#c9a24a',
      diploma: '#f1ead6',
      ribbon: '#b0222c',
    });
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    const k = 1.3 * u; // voxels per cm: the 24 cm board spans ~31u
    const paper = tone(palette, 'paper');
    const band = tone(palette, 'band');
    const cap = tone(palette, 'cap');
    const tassel = tone(palette, 'tassel');

    // Two hardcover books: 28 x 21 x 4 cm under 25 x 19 x 3 cm.
    const bx = c - 1 * u;
    const bz = c - 3 * u;
    const lowT = Math.round(4 * k);
    const topT = Math.round(3 * k);
    book(grid, { cx: bx, cz: bz, y: g, L: 28 * k, W: 21 * k, T: lowT, angle: 0.1, spine: 1, cover: tone(palette, 'bookA'), band, paper });
    book(grid, { cx: bx + 0.8 * u, cz: bz - 0.4 * u, y: g + lowT, L: 25 * k, W: 19 * k, T: topT, angle: -0.08, spine: 1, cover: tone(palette, 'bookB'), band, paper });

    // Skull cap (18 cm across, 9 cm deep) sitting on the top book, square 24 cm board on it.
    const capY = g + lowT + topT;
    const capCx = bx + 0.8 * u;
    const capCz = bz - 0.4 * u;
    const capH = Math.round(7.5 * k);
    fillLathe(grid, capCx, capCz, capY, capY + capH, (t) => 9.3 * k * (1 - 0.1 * t), () => cap);
    const boardY = capY + capH;
    const boardT = Math.max(1, Math.round(0.8 * k));
    const angle = 0.42;
    const half = 12 * k;
    fillTurned(grid, capCx, capCz, boardY, boardY + boardT, half, half, angle, () => cap);
    const topY = boardY + boardT;
    fillCylinderY(grid, capCx, capCz, topY, topY + Math.max(1, 0.6 * k), 1.1 * k, () => cap);

    // Tassel cord runs from the button over the board to the edge, then hangs straight down.
    const [ex, ez] = turned(-4 * k, half - 0.4 * u, angle);
    const [ox, oz] = turned(-4 * k, half + 0.9 * u, angle);
    fillCapsule(grid, capCx, topY + 0.5, capCz, capCx + ex, topY + 0.5, capCz + ez, 0.55 * u, 0.55 * u, () => tassel);
    const hx = capCx + ox;
    const hz = capCz + oz;
    const knotY = boardY - 4 * k;
    fillCapsule(grid, capCx + ex, topY + 0.5, capCz + ez, hx, boardY, hz, 0.55 * u, 0.55 * u, () => tassel);
    fillCapsule(grid, hx, boardY, hz, hx, knotY, hz, 0.55 * u, 0.55 * u, () => tassel);
    fillEllipsoid(grid, hx, knotY, hz, 1.1 * k, 1.1 * k, 1.1 * k, () => tassel);
    fillLathe(grid, hx, hz, knotY - 8 * k, knotY, (t) => (1.05 + (1 - t) * 0.5) * k, () => tassel);

    // Rolled diploma (28 cm long, 4.4 cm across) tied with a ribbon, lying in front.
    const dz = c + 18.5 * u;
    const dr = 2.2 * k;
    const dy = g + dr;
    fillCylinderX(grid, dy, dz, c - 14 * k, c + 14 * k, dr, () => tone(palette, 'diploma'), 0.7 * k);
    const ribbon = tone(palette, 'ribbon');
    fillCylinderX(grid, dy, dz, c - 0.8 * k, c + 0.8 * k, dr + 0.5, () => ribbon);
    fillEllipsoid(grid, c - 1.6 * k, dy + dr + 0.4 * k, dz, 1.3 * k, 0.7 * k, 0.9 * k, () => ribbon);
    fillEllipsoid(grid, c + 1.6 * k, dy + dr + 0.4 * k, dz, 1.3 * k, 0.7 * k, 0.9 * k, () => ribbon);
    fillBox(grid, c - 1.4 * k, g, dz + dr, c - 0.4 * k, g + 1, dz + dr + 4 * k, () => ribbon);
    fillBox(grid, c + 0.6 * k, g, dz + dr, c + 1.6 * k, g + 1, dz + dr + 3 * k, () => ribbon);
  },
};

/* ----------------------------------------------------------------------------------------------------------- */

const BOOK_SETS: Record<string, string[]> = {
  red: ['#8b2332', '#24395e', '#cdb68c', '#a8343a', '#3e5c43'],
  blue: ['#23407a', '#8b2332', '#cdb68c', '#2f5ea0', '#4a3a2c'],
  green: ['#2f5a3c', '#7a2a2a', '#cdb68c', '#3f7350', '#24395e'],
};
const BOOK_VARIANTS: ObjectVariant[] = [
  { id: 'red', name: 'Classic red', color: '#8b2332' },
  { id: 'blue', name: 'Study blue', color: '#23407a' },
  { id: 'green', name: 'Library green', color: '#2f5a3c' },
];
export const bookStack: VoxelObject = {
  id: 'book-stack',
  name: 'Books',
  description: 'A stack of hardcover books with an apple and a pencil on top.',
  category: 'education',
  variants: BOOK_VARIANTS,
  createPalette(variantId) {
    const set = BOOK_SETS[variantId] ?? BOOK_SETS.red;
    return materialPalette('education', {
      book0: set[0], book1: set[1], book2: set[2], book3: set[3], book4: set[4],
      paper: '#ece3c8',
      band: '#c9a24a',
      apple: '#b3242c',
      stem: '#5a3d22',
      leaf: '#4f8a34',
      paint: '#f2b81a',
      wood: '#e2b47e',
      lead: '#3b3c40',
      ferrule: '#c3c7cc',
      ring: '#8f949b',
      eraser: '#e7939b',
    });
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    const k = 1.5 * u; // voxels per cm: the 31 cm atlas spans ~46u
    const paper = tone(palette, 'paper');
    const band = tone(palette, 'band');
    // Real sizes in cm (length x depth x thickness), largest at the bottom, each nudged and turned a little.
    const books: [number, number, number, number, number, 1 | -1][] = [
      [31, 23, 3.5, 0.04, 0, 1],
      [27.5, 20.5, 4.5, -0.12, 0.6, 1],
      [25, 18, 2.6, 0.16, -0.8, -1],
      [23, 16.5, 3.8, -0.04, 0.4, 1],
      [20.5, 14, 2.6, 0.22, -0.4, 1],
    ];
    let y = g;
    let top = { cx: c, cz: c, angle: 0, L: 0, W: 0 };
    books.forEach(([L, W, T, angle, shift, spine], i) => {
      const cx = c + shift * u;
      const cz = c + (i % 2 ? -0.5 : 0.5) * u;
      const t = Math.round(T * k);
      book(grid, { cx, cz, y, L: L * k, W: W * k, T: t, angle, spine, cover: tone(palette, `book${i}`), band, paper });
      y += t;
      top = { cx, cz, angle, L: L * k, W: W * k };
    });

    // Apple (8 cm wide, 7 cm tall) on the top book: dimpled top and base, stem and one leaf.
    const [ax, az] = turned(top.L * 0.18, -top.W * 0.08, top.angle);
    const appleX = top.cx + ax;
    const appleZ = top.cz + az;
    const ah = 7 * k;
    fillLathe(grid, appleX, appleZ, y, y + ah, (t) => {
      const r = 4 * k * Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.52) / 0.62, 2)));
      return t > 0.9 ? [r, 1.3 * k] : r;
    }, () => tone(palette, 'apple'));
    fillCapsule(grid, appleX, y + ah - 1.4 * k, appleZ, appleX + 0.4 * k, y + ah + 1.6 * k, appleZ, 0.5 * u, 0.5 * u, () => tone(palette, 'stem'));
    fillEllipsoid(grid, appleX + 1.6 * k, y + ah + 0.6 * k, appleZ + 0.4 * k, 1.8 * k, 0.45 * k + 0.5, 0.9 * k, () => tone(palette, 'leaf'));

    // A real-size pencil (17.5 cm, 7 mm across flats) lying flat on the top book.
    const ap = Math.max(1, 0.36 * k);
    const [p0x, p0z] = turned(-top.L * 0.42, top.W * 0.3, top.angle + 0.08);
    const [p1x, p1z] = turned(top.L * 0.42, top.W * 0.3, top.angle + 0.08);
    drawPencil(grid, [top.cx + p0x, y + ap, top.cz + p0z], [top.cx + p1x, y + ap, top.cz + p1z], ap, k, {
      paint: tone(palette, 'paint'), wood: tone(palette, 'wood'), lead: tone(palette, 'lead'),
      ferrule: tone(palette, 'ferrule'), ring: tone(palette, 'ring'), eraser: tone(palette, 'eraser'),
    });
  },
};

/* ----------------------------------------------------------------------------------------------------------- */

const SCHOOL_WALLS: Record<string, { wall: string; quoin: string }> = {
  brick: { wall: '#9a4232', quoin: '#d9cdb2' },
  cream: { wall: '#d2bf93', quoin: '#efe8d8' },
  blue: { wall: '#4f6d8f', quoin: '#e9e6dd' },
};
const SCHOOL_VARIANTS: ObjectVariant[] = [
  { id: 'brick', name: 'Red brick', color: '#9a4232' },
  { id: 'cream', name: 'Sandstone', color: '#d2bf93' },
  { id: 'blue', name: 'Painted blue', color: '#4f6d8f' },
];
export const school: VoxelObject = {
  id: 'school',
  name: 'School',
  description: 'A two-storey schoolhouse with a bell cupola, clock and flagpole.',
  category: 'education',
  variants: SCHOOL_VARIANTS,
  createPalette(variantId) {
    const w = SCHOOL_WALLS[variantId] ?? SCHOOL_WALLS.brick;
    return materialPalette('education', {
      wall: w.wall,
      quoin: w.quoin,
      trim: '#efece4',
      stone: '#8e8a83',
      roof: '#474c55',
      ridge: '#35393f',
      glass: '#34495c',
      lit: { hex: '#ffd789', glow: true },
      door: '#2f4a3c',
      bell: '#a87b3c',
      gold: '#d4a73a',
      clock: '#f4f1e6',
      hands: '#1d1e22',
      pole: '#c9ccd1',
      flag: '#8a2433',
      flagBand: '#e3b844',
      shrub: '#3f6b35',
      chimney: '#8a3b2d',
      paving: '#b9b2a4',
    });
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    const k = 2.3 * u; // voxels per metre: the 20 m front spans 46u
    const R = Math.round;
    const wall = tone(palette, 'wall');
    const quoin = tone(palette, 'quoin');
    const trim = tone(palette, 'trim');
    const stone = tone(palette, 'stone');
    const roof = tone(palette, 'roof');
    const ridge = tone(palette, 'ridge');
    const glass = tone(palette, 'glass');
    const lit = tone(palette, 'lit');
    const pitch = 0.7; // 35 degree roof
    const oh = Math.max(1, R(0.4 * k));
    const roofT = 1.3;

    // Main block 20 x 9 m, two 3.5 m storeys on a 0.9 m stone base. Front faces +z.
    const X0 = R(c - 23 * u);
    const X1 = R(c + 23 * u);
    const Z0 = R(c - 15 * u);
    const Z1 = R(c + 5.7 * u);
    const floorY = g + Math.max(2, R(0.9 * k));
    const storey = 3.5 * k;
    const E = floorY + R(2 * storey);

    const gable = (x0: number, x1: number, z0: number, z1: number, alongX: boolean): void => {
      const mid = alongX ? (z0 + z1) / 2 : (x0 + x1) / 2;
      const hw = alongX ? (z1 - z0) / 2 : (x1 - x0) / 2;
      fillBox(grid, x0 - (alongX ? oh : 0) - oh, E - 2, z0 - oh - (alongX ? 0 : oh), x1 + oh + (alongX ? oh : 0), grid.height - 1, z1 + oh, (x, y, z) => {
        const d = Math.abs((alongX ? z : x) + 0.5 - mid);
        const topY = E + (hw + oh - d) * pitch;
        const yc = y + 0.5;
        if (yc > topY) return 0;
        if (yc > topY - roofT) return d < 1 ? ridge : roof;
        const inside = x >= x0 && x < x1 && z >= z0 && z < z1;
        return inside ? wall : 0;
      });
    };

    // Stone base, then walls with quoin corners, a string course between floors and a cornice.
    fillBox(grid, X0 - 1, g, Z0 - 1, X1 + 1, floorY, Z1 + 1, () => stone);
    fillBox(grid, X0, floorY, Z0, X1, E, Z1, () => wall);
    gable(X0, X1, Z0, Z1, true);
    // Entrance pavilion 7 m wide, 2 m proud, with its own front-facing gable.
    const PX0 = R(c - 8 * u);
    const PX1 = R(c + 8 * u);
    const PZ1 = Z1 + R(2 * k);
    fillBox(grid, PX0 - 1, g, Z1, PX1 + 1, floorY, PZ1 + 1, () => stone);
    fillBox(grid, PX0, floorY, Z1 - 2, PX1, E, PZ1, () => wall);
    fillBox(grid, PX0 - oh, E - 2, R((Z0 + Z1) / 2), PX1 + oh, grid.height - 1, PZ1 + oh, (x, y, z) => {
      const d = Math.abs(x + 0.5 - (PX0 + PX1) / 2);
      const topY = E + ((PX1 - PX0) / 2 + oh - d) * pitch;
      const yc = y + 0.5;
      if (yc > topY) return 0;
      if (yc > topY - roofT) return d < 1 ? ridge : roof;
      return x >= PX0 && x < PX1 && z < PZ1 ? wall : 0;
    });

    const band = (y: number): void => {
      fillBox(grid, X0 - 1, y, Z0 - 1, X1 + 1, y + 1, Z1 + 1, () => trim);
      fillBox(grid, PX0 - 1, y, Z1, PX1 + 1, y + 1, PZ1 + 1, () => trim);
    };
    band(floorY + R(storey) - 1);
    band(E - 1);
    // Quoins: alternating long and short stones up every outside corner.
    const q = Math.max(1, R(0.5 * k));
    const quoins = (x: number, z: number, sx: number, sz: number): void => {
      for (let y = floorY; y < E - 1; y++) {
        const long = Math.floor((y - floorY) / q) % 2 === 0;
        const w = long ? Math.max(2, R(0.9 * k)) : Math.max(1, R(0.5 * k));
        for (let i = 0; i < w; i++) {
          grid.set(x + sx * i, y, z, quoin);
          grid.set(x, y, z + sz * i, quoin);
        }
      }
    };
    quoins(X0, Z0, 1, 1);
    quoins(X1 - 1, Z0, -1, 1);
    quoins(X0, Z1 - 1, 1, -1);
    quoins(X1 - 1, Z1 - 1, -1, -1);
    quoins(PX0, PZ1 - 1, 1, -1);
    quoins(PX1 - 1, PZ1 - 1, -1, -1);

    // Tall sash windows (1.3 x 2.2 m) recessed one voxel, white frame and glazing bars, stone sill.
    const ww = Math.max(3, R(1.3 * k));
    const wh = Math.max(4, R(2.2 * k));
    const windowAt = (along: number, y0: number, face: 'x' | 'z', surface: number, out: 1 | -1, light: boolean, w = ww, h = wh): void => {
      const a0 = R(along - w / 2);
      const set = (a: number, y: number, depth: number, m: number): void => {
        if (face === 'z') grid.set(a, y, surface + depth * out, m);
        else grid.set(surface + depth * out, y, a, m);
      };
      const midA = a0 + Math.floor(w / 2);
      const barY = y0 + R(h * 0.55);
      for (let y = y0; y < y0 + h; y++) {
        for (let a = a0; a < a0 + w; a++) {
          const edge = a === a0 || a === a0 + w - 1 || y === y0 || y === y0 + h - 1;
          if (edge) {
            set(a, y, 0, trim);
          } else {
            set(a, y, 0, 0);
            set(a, y, -1, (w >= 5 && a === midA) || y === barY ? trim : light ? lit : glass);
          }
        }
      }
      for (let a = a0 - 1; a <= a0 + w; a++) set(a, y0 - 1, 1, stone);
      for (let a = a0; a < a0 + w; a++) set(a, y0 + h, 0, stone);
    };
    const sill1 = floorY + R(0.9 * k);
    const sill2 = floorY + R(storey + 0.9 * k);
    const frontWin = [-18.5, -12.5, 12.5, 18.5];
    frontWin.forEach((dx, i) => {
      windowAt(c + dx * u, sill1, 'z', Z1 - 1, 1, i === 1 || i === 2);
      windowAt(c + dx * u, sill2, 'z', Z1 - 1, 1, i === 0);
      windowAt(c + dx * u, sill1, 'z', Z0, -1, false);
      windowAt(c + dx * u, sill2, 'z', Z0, -1, i === 3);
    });
    windowAt(c, sill1, 'z', Z0, -1, false);
    windowAt(c, sill2, 'z', Z0, -1, false);
    windowAt(c, sill2, 'z', PZ1 - 1, 1, true, Math.max(5, R(1.8 * k)));
    for (const dz of [-4.5, 4.5]) {
      const wz = (Z0 + Z1) / 2 + dz * u;
      windowAt(wz, sill1, 'x', X0, -1, false);
      windowAt(wz, sill2, 'x', X0, -1, false);
      windowAt(wz, sill1, 'x', X1 - 1, 1, dz < 0);
      windowAt(wz, sill2, 'x', X1 - 1, 1, false);
    }

    // Panelled double door with a lit fanlight, two steps and wall lanterns either side.
    const dw = Math.max(4, R(1.8 * k));
    const dh = Math.max(5, R(2.7 * k));
    const d0 = R(c - dw / 2);
    for (let y = floorY; y < floorY + dh + 2; y++) {
      for (let x = d0 - 1; x <= d0 + dw; x++) {
        const frame = x === d0 - 1 || x === d0 + dw || y === floorY + dh + 1;
        if (frame) {
          grid.set(x, y, PZ1 - 1, trim);
          continue;
        }
        grid.set(x, y, PZ1 - 1, 0);
        const fan = y === floorY + dh;
        grid.set(x, y, PZ1 - 2, fan ? lit : tone(palette, 'door'));
      }
    }
    for (let y = floorY + 1; y < floorY + dh - 1; y++) grid.set(d0 + Math.floor(dw / 2), y, PZ1 - 2, trim);
    const stepD = Math.max(1, R(0.5 * k));
    const half = (floorY - g) / 2;
    fillBox(grid, d0 - 2, g, PZ1, d0 + dw + 2, g + Math.ceil(half), PZ1 + 2 * stepD + 1, () => stone);
    fillBox(grid, d0 - 2, g, PZ1, d0 + dw + 2, floorY, PZ1 + stepD + 1, () => stone);
    for (const sx of [-1, 1]) {
      const lx = R(c + sx * (dw / 2 + 1.6 * u));
      const ly = floorY + R(2.2 * k);
      grid.set(lx, ly - 1, PZ1, trim);
      fillBox(grid, lx - (u > 1.4 ? 1 : 0), ly, PZ1, lx + 1, ly + Math.max(2, R(0.6 * k)), PZ1 + 1 + (u > 1.4 ? 1 : 0), () => lit);
      grid.set(lx, ly + Math.max(2, R(0.6 * k)), PZ1, tone(palette, 'hands'));
    }

    // Two brick chimneys rising through the rear roof slope, with stone caps.
    for (const sx of [-1, 1]) {
      const chx = R(c + sx * 17 * u);
      const chz = R((Z0 + Z1) / 2 - 2.5 * u);
      const cw = Math.max(2, R(0.8 * k));
      const chTop = R(E + ((Z1 - Z0) / 2 + oh) * pitch + 1.2 * k);
      fillBox(grid, chx - cw, E, chz - cw, chx + cw, chTop, chz + cw, () => tone(palette, 'chimney'));
      fillBox(grid, chx - cw - 1, chTop, chz - cw - 1, chx + cw + 1, chTop + 1, chz + cw + 1, () => stone);
    }

    // Clock in the pavilion gable.
    const clockY = E + R(((PX1 - PX0) / 2 + oh) * pitch * 0.42);
    const cr = Math.max(2, 0.75 * k);
    fillCylinderZ(grid, c, clockY, PZ1 - 1, PZ1 + 1, cr + 0.7, () => trim);
    fillCylinderZ(grid, c, clockY, PZ1, PZ1 + 1, cr, () => tone(palette, 'clock'));
    fillBox(grid, c - 0.5, clockY, PZ1 + 1, c + 0.5, clockY + cr * 0.8, PZ1 + 2, () => tone(palette, 'hands'));
    fillBox(grid, c, clockY - 0.5, PZ1 + 1, c + cr * 0.6, clockY + 0.5, PZ1 + 2, () => tone(palette, 'hands'));

    // Bell cupola on the ridge: boarded base, open belfry with a bronze bell, pyramid roof and gilt finial.
    const zc = (Z0 + Z1) / 2;
    const ridgeY = E + ((Z1 - Z0) / 2 + oh) * pitch;
    const cb = Math.max(2, R(1.3 * k));
    const baseTop = R(ridgeY + 0.9 * k);
    fillBox(grid, R(c) - cb, E, R(zc) - cb, R(c) + cb, baseTop, R(zc) + cb, () => trim);
    fillBox(grid, R(c) - cb - 1, baseTop, R(zc) - cb - 1, R(c) + cb + 1, baseTop + 1, R(zc) + cb + 1, () => trim);
    const belTop = baseTop + 1 + Math.max(4, R(2.1 * k));
    for (const [px, pz] of [[-cb, -cb], [cb - 1, -cb], [-cb, cb - 1], [cb - 1, cb - 1]]) {
      fillBox(grid, R(c) + px, baseTop + 1, R(zc) + pz, R(c) + px + 1, belTop, R(zc) + pz + 1, () => trim);
    }
    const bellTop = belTop - 1;
    fillLathe(grid, R(c), R(zc), bellTop - Math.max(3, 1.4 * k), bellTop, (t) => (0.35 + 0.65 * Math.pow(1 - t, 1.6)) * Math.max(1.5, 0.75 * k), () => tone(palette, 'bell'));
    const roofH = Math.max(4, R(2 * k));
    for (let i = 0; i < roofH; i++) {
      const hs = (cb + 1) * (1 - i / roofH) + 0.5;
      fillBox(grid, R(c) - hs, belTop + i, R(zc) - hs, R(c) + hs, belTop + i + 1, R(zc) + hs, () => (i === 0 ? trim : roof));
    }
    fillCapsule(grid, R(c), belTop + roofH, R(zc), R(c), belTop + roofH + 1.6 * u, R(zc), 0.5, 0.5, () => tone(palette, 'gold'));
    fillEllipsoid(grid, R(c), belTop + roofH + 0.6 * u, R(zc), 0.9 * u, 0.9 * u, 0.9 * u, () => tone(palette, 'gold'));

    // Shrubs along the front, a paved path to the steps and a 9 m flagpole.
    const shrub = tone(palette, 'shrub');
    for (const dx of [-21.5, -15.5, -9.8, 9.8, 15.5, 21.5]) {
      const sz = Math.abs(dx) < 10 ? PZ1 + 1.6 * u : Z1 + 2 * u;
      if (Math.abs(dx) < 10 && Math.abs(dx) * u < (PX1 - PX0) / 2) continue;
      fillEllipsoid(grid, c + dx * u, g + 1.2 * u, sz, 2 * u, 2 * u, 1.6 * u, () => shrub);
    }
    fillBox(grid, d0 - 1, g, PZ1 + 2 * stepD + 1, d0 + dw + 1, g + 1, R(c + 27 * u), () => tone(palette, 'paving'));
    const fx = c - 19 * u;
    const fz = c + 16 * u;
    const poleTop = g + 9 * k;
    fillBox(grid, fx - 1.5 * u, g, fz - 1.5 * u, fx + 1.5 * u, g + 1, fz + 1.5 * u, () => stone);
    fillCylinderY(grid, fx, fz, g, poleTop, Math.max(0.6, 0.12 * k), () => tone(palette, 'pole'));
    fillEllipsoid(grid, fx, poleTop + 0.4 * u, fz, 0.8 * u, 0.8 * u, 0.8 * u, () => tone(palette, 'gold'));
    const flagW = 1.8 * k;
    const flagH = 1.2 * k;
    fillBox(grid, fx + 0.5, poleTop - flagH - 0.5 * u, fz - 0.5, fx + 0.5 + flagW, poleTop - 0.5 * u, fz + 0.5, (x, y) => {
      const s = (y + 0.5 - (poleTop - flagH - 0.5 * u)) / flagH;
      return s > 0.38 && s < 0.62 ? tone(palette, 'flagBand') : tone(palette, 'flag');
    });
  },
};

/* ----------------------------------------------------------------------------------------------------------- */

const PENCIL_PAINT: Record<string, string> = { yellow: '#f2b81a', orange: '#ec7a24', green: '#2f6b3d' };
const PENCIL_VARIANTS: ObjectVariant[] = [
  { id: 'yellow', name: 'Classic yellow', color: '#f2b81a' },
  { id: 'orange', name: 'Sunset orange', color: '#ec7a24' },
  { id: 'green', name: 'Forest green', color: '#2f6b3d' },
];
export const pencil: VoxelObject = {
  id: 'pencil',
  name: 'Pencil',
  description: 'A sharpened HB pencil propped on an eraser, with its sharpener and shavings.',
  category: 'education',
  variants: PENCIL_VARIANTS,
  createPalette(variantId) {
    return materialPalette('education', {
      paint: PENCIL_PAINT[variantId] ?? PENCIL_PAINT.yellow,
      wood: '#e2b47e',
      lead: '#3b3c40',
      ferrule: '#c3c7cc',
      ring: '#8f949b',
      eraser: '#e7939b',
      stamp: '#1f2a22',
      vinyl: '#f0efe8',
      sleeve: '#2c5ea6',
      metal: '#a6abb2',
      blade: '#dde1e6',
      screw: '#55595f',
    });
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    const k = 5 * u; // voxels per cm: the 7 mm pencil is 3.6u across flats
    const ap = 0.36 * k;
    const L = 11.5 * k; // a pencil sharpened down to 11.5 cm
    const R = ap / Math.cos(Math.PI / 6);

    // The pencil leans with its tip on the ground and its body on the near top edge of a 1.2 cm eraser block.
    const dir = [Math.cos(0.56), -Math.sin(0.56)];
    const tipXZ = [c - 23 * u, c + 15 * u];
    const blockH = Math.round(1.2 * k);
    const te = 0.58 * L;
    const cone = 2.4 * k;
    let phi = 0.15;
    let lift = 0;
    for (let i = 0; i < 8; i++) {
      // Lowest point of the cone/hex underside must clear the ground at the tip.
      lift = 0;
      for (let t = 0; t <= cone; t += 0.25) lift = Math.max(lift, ((R * 1.02 * t) / cone) * Math.cos(phi) - t * Math.sin(phi));
      phi = Math.asin(Math.min(0.6, (blockH + ap / Math.cos(phi) - lift) / te));
    }
    const tip: V3 = [tipXZ[0], g + lift, tipXZ[1]];
    const back: V3 = [tip[0] + dir[0] * L * Math.cos(phi), tip[1] + L * Math.sin(phi), tip[2] + dir[1] * L * Math.cos(phi)];

    // White vinyl eraser (6.5 x 2.3 x 1.2 cm) in a blue card sleeve, lying across the pencil.
    const edge = te * Math.cos(phi);
    const bw = 2.3 * k;
    const bl = 6.5 * k;
    const bcx = tip[0] + dir[0] * (edge + bw / 2);
    const bcz = tip[2] + dir[1] * (edge + bw / 2);
    const bAngle = Math.atan2(dir[1], dir[0]) + Math.PI / 2;
    const vinyl = tone(palette, 'vinyl');
    const sleeve = tone(palette, 'sleeve');
    fillTurned(grid, bcx, bcz, g, g + blockH, bl / 2, bw / 2, bAngle, (lx) => (Math.abs(lx) < bl * 0.2 ? sleeve : vinyl));
    fillTurned(grid, bcx, bcz, g, g + blockH + 1, bl * 0.2, bw / 2 + 0.8, bAngle, (lx, ly, lz) =>
      ly === blockH || Math.abs(lz) > bw / 2 ? sleeve : 0);

    drawPencil(grid, tip, back, ap, k, {
      paint: tone(palette, 'paint'), wood: tone(palette, 'wood'), lead: tone(palette, 'lead'),
      ferrule: tone(palette, 'ferrule'), ring: tone(palette, 'ring'), eraser: tone(palette, 'eraser'), stamp: tone(palette, 'stamp'),
    });

    // Metal sharpener (2.5 x 1.7 x 1.3 cm): conical hole in one end, blade screwed to the top.
    const sx = c + 6 * u;
    const sz = c + 17 * u;
    const sa = Math.PI / 2 - 0.55;
    const sl = 2.5 * k;
    const sw = 1.7 * k;
    const sh = Math.round(1.3 * k);
    const holeR = 0.42 * k;
    fillTurned(grid, sx, sz, g, g + sh, sl / 2, sw / 2, sa, (lx, ly, lz) => {
      const depth = sl / 2 - lx;
      const r = holeR * (1 - depth / (sl * 0.9));
      const bore = Math.hypot(ly + 0.5 - sh / 2, lz);
      if (r > 0 && bore < r) return 0;
      if (r > 0 && bore < r + 1.2) return tone(palette, 'screw');
      if (ly === sh - 1 && lz > -sw * 0.05 && lz < sw * 0.32 && Math.abs(lx + sl * 0.12) < sl * 0.3) {
        return Math.abs(lx + sl * 0.12) < 0.6 && lz > sw * 0.1 ? tone(palette, 'screw') : tone(palette, 'blade');
      }
      return tone(palette, 'metal');
    });
    fillTurned(grid, sx, sz, g + sh, g + sh + 1, sl * 0.45, sw * 0.4, sa, (lx, _ly, lz) => {
      const [ox, oz] = [lx + sl * 0.12, lz - sw * 0.13];
      return Math.abs(ox) < 0.8 && Math.abs(oz) < 0.8 ? tone(palette, 'screw') : 0;
    });

    // Two curled shavings: frilled wood rings with a painted rim, lying on the ground.
    const shaving = (x: number, z: number, r: number, phase: number): void => {
      fillBox(grid, x - r - 1, g, z - r - 1, x + r + 1, g + 2, z + r + 1, (px, py, pz) => {
        const dx = px + 0.5 - x;
        const dz = pz + 0.5 - z;
        const d = Math.hypot(dx, dz);
        const a = (Math.atan2(dz, dx) + phase + Math.PI * 4) % (Math.PI * 2);
        if (a > Math.PI * 1.55) return 0;
        const wave = r * (1 + 0.07 * Math.sin(a * 13)) * (0.75 + 0.25 * (a / (Math.PI * 1.55)));
        const outer = py === g ? wave : wave * 0.72;
        if (d > outer || d < r * 0.22) return 0;
        return d > outer - 0.8 ? tone(palette, 'paint') : tone(palette, 'wood');
      });
    };
    shaving(c + 16 * u, c + 22 * u, 1.1 * k, 0);
    shaving(c - 6 * u, c + 22.5 * u, 0.9 * k, 1.7);
  },
};

/* ----------------------------------------------------------------------------------------------------------- */

const GLYPHS: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
};

const BOARD_SLATE: Record<string, string> = { green: '#2c4a38', navy: '#27323e', teal: '#21504a' };
const BOARD_VARIANTS: ObjectVariant[] = [
  { id: 'green', name: 'Chalk green', color: '#2c4a38' },
  { id: 'navy', name: 'Slate black', color: '#27323e' },
  { id: 'teal', name: 'Lagoon teal', color: '#21504a' },
];
export const blackboard: VoxelObject = {
  id: 'blackboard',
  name: 'Blackboard',
  description: 'A rolling classroom chalkboard with chalk, a duster and a lesson on both sides.',
  category: 'education',
  variants: BOARD_VARIANTS,
  createPalette(variantId) {
    return materialPalette('education', {
      slate: BOARD_SLATE[variantId] ?? BOARD_SLATE.green,
      chalk: '#e4e7df',
      frame: '#b07a45',
      steel: '#5b6067',
      rubber: '#1f2023',
      stickWhite: '#f3f2ec',
      stickYellow: '#efd97c',
      felt: '#7b7e85',
      dusterWood: '#c89c66',
    });
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    const k = 0.33 * u; // voxels per cm: the 140 cm board spans ~46u
    const R = Math.round;
    const slate = tone(palette, 'slate');
    const chalk = tone(palette, 'chalk');
    const frame = tone(palette, 'frame');
    const steel = tone(palette, 'steel');

    // Board 140 x 95 cm, bottom edge 78 cm up, between two posts on castored T-feet. Front faces +z.
    const bx0 = R(c - 70 * k);
    const bx1 = R(c + 70 * k);
    const by0 = g + R(78 * k);
    const by1 = g + R(173 * k);
    const zc = R(c);
    const fw = Math.max(1, R(4.5 * k));
    const fd = Math.max(1, R(1.2 * k));
    // Two-voxel slate panel so the front and back can carry different writing.
    fillBox(grid, bx0, by0, zc - 1, bx1, by1, zc + 1, () => slate);
    fillBox(grid, bx0 - fw, by0 - fw, zc - 1 - fd, bx1 + fw, by1 + fw, zc + 1 + fd, (x, y) =>
      x < bx0 || x >= bx1 || y < by0 || y >= by1 ? frame : 0);

    // Posts (5 x 5 cm) with a top rail; pivot knobs hold the board at mid height.
    const ps = Math.max(1, R(5 * k));
    const footY = g + Math.max(2, R(9 * k));
    const postTop = g + R(180 * k);
    for (const side of [-1, 1]) {
      const px0 = side < 0 ? bx0 - fw - 1 - ps : bx1 + fw + 1;
      fillBox(grid, px0, footY, zc - Math.floor(ps / 2), px0 + ps, postTop, zc - Math.floor(ps / 2) + ps, () => steel);
      const pivotY = R((by0 + by1) / 2);
      fillBox(grid, side < 0 ? px0 + ps : bx1 + fw, pivotY - 1, zc - 1, side < 0 ? bx0 - fw : px0, pivotY + 1, zc + 1, () => steel);
      fillCylinderX(grid, pivotY, zc, side < 0 ? px0 - 1 : px0 + ps, side < 0 ? px0 : px0 + ps + 1, Math.max(1, 1.6 * k), () => tone(palette, 'rubber'));
      // T-foot 70 cm long with a caster at each end.
      const half = 35 * k;
      fillBox(grid, px0, footY - Math.max(1, R(4 * k)), zc - half, px0 + ps, footY, zc + half, () => steel);
      for (const end of [-1, 1]) {
        const wz = zc + end * (half - 2.5 * k);
        const wr = Math.max(1, 3 * k);
        fillBox(grid, px0, g + wr, wz - 0.5, px0 + ps, footY - 1, wz + 0.5, () => steel);
        fillCylinderX(grid, g + wr, wz, px0, px0 + ps, wr, () => tone(palette, 'rubber'));
      }
    }
    fillBox(grid, bx0 - fw - 1 - ps, postTop, zc - Math.floor(ps / 2), bx1 + fw + 1 + ps, postTop + ps, zc - Math.floor(ps / 2) + ps, () => steel);

    // Chalk tray along the front bottom edge with a lip, two sticks of chalk and a felt duster.
    const trayD = Math.max(2, R(7 * k));
    const ty = by0 - fw;
    fillBox(grid, bx0, ty - 1, zc + 1 + fd, bx1, ty, zc + 1 + fd + trayD, () => frame);
    fillBox(grid, bx0, ty, zc + fd + trayD, bx1, ty + 1, zc + 1 + fd + trayD, () => frame);
    const trayZ = zc + 1 + fd + trayD / 2;
    fillCapsule(grid, c - 30 * k, ty + 0.5, trayZ, c - 22 * k, ty + 0.5, trayZ - 0.3, 0.5, 0.5, () => tone(palette, 'stickWhite'));
    fillCapsule(grid, c - 18 * k, ty + 0.5, trayZ, c - 11 * k, ty + 0.5, trayZ + 0.3, 0.5, 0.5, () => tone(palette, 'stickYellow'));
    fillBox(grid, c + 18 * k, ty, trayZ - 2.5 * k, c + 31 * k, ty + 1, trayZ + 2.5 * k, () => tone(palette, 'felt'));
    fillBox(grid, c + 18 * k, ty + 1, trayZ - 2.5 * k, c + 31 * k, ty + 1 + Math.max(1, R(2 * k)), trayZ + 2.5 * k, () => tone(palette, 'dusterWood'));

    // Front lesson: "ABC" and "1+2=3" in chalk.
    const px = Math.max(1, 1.15 * u);
    const write = (text: string, left: number, top: number, z: number, mirror: boolean): void => {
      [...text].forEach((ch, i) => {
        const glyph = GLYPHS[ch];
        glyph.forEach((row, j) => {
          [...row].forEach((on, n) => {
            if (on !== '#') return;
            const col = i * 6 + n;
            const xa = mirror ? left - (col + 1) * px : left + col * px;
            fillBox(grid, R(xa), R(top - (j + 1) * px), z, R(xa + px), R(top - j * px), z + 1, () => chalk);
          });
        });
      });
    };
    const lineH = 7 * px;
    const innerTop = by1 - 3.5 * u;
    write('ABC', c - (3 * 6 - 1) * px / 2, innerTop, zc, false);
    write('1+2=3', c - (5 * 6 - 1) * px / 2, innerTop - lineH - 3 * u, zc, false);

    // Back lesson: a triangle inside a circle, drawn as chalk strokes on the rear face.
    const ccx = c;
    const ccy = (by0 + by1) / 2;
    const rad = (by1 - by0) * 0.36;
    const tri: [number, number][] = [0, 1, 2].map((i) => [ccx + rad * Math.cos(Math.PI / 2 + i * 2.094), ccy + rad * Math.sin(Math.PI / 2 + i * 2.094)]);
    const seg = (x: number, y: number, a: [number, number], b: [number, number]): number => {
      const abx = b[0] - a[0];
      const aby = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * abx + (y - a[1]) * aby) / (abx * abx + aby * aby)));
      return Math.hypot(x - a[0] - abx * t, y - a[1] - aby * t);
    };
    const stroke = Math.max(0.55, 0.3 * u);
    fillBox(grid, bx0, by0, zc - 1, bx1, by1, zc, (x, y) => {
      const p = [x + 0.5, y + 0.5];
      const onCircle = Math.abs(Math.hypot(p[0] - ccx, p[1] - ccy) - rad) < stroke;
      const onTri = [0, 1, 2].some((i) => seg(p[0], p[1], tri[i], tri[(i + 1) % 3]) < stroke);
      return onCircle || onTri ? chalk : 0;
    });
  },
};
