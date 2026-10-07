import type { VoxelGrid } from '../voxel/grid';
import type { Palette } from '../voxel/palette';
import { fillBox, fillCapsule, fillCylinderX, fillCylinderY, fillCylinderZ, fillEllipsoid, fillLathe, fillRoundedBox } from '../voxel/shapes';
import { materialPalette } from './kit';
import type { VoxelObject } from './types';

type Vec = [number, number, number];

/** Natural-tone material index by family name. */
function tone(palette: Palette, name: string): number {
  return palette.tone(palette.id(name), 'mid');
}

/** True inside a rectangle of half sizes (hx, hy) centered on the origin, with corners rounded by r. */
function inRoundRect(px: number, py: number, hx: number, hy: number, r: number): boolean {
  const ax = Math.abs(px);
  const ay = Math.abs(py);
  if (ax > hx || ay > hy) return false;
  const qx = ax - (hx - r);
  const qy = ay - (hy - r);
  return qx <= 0 || qy <= 0 || qx * qx + qy * qy <= r * r;
}

/**
 * Fill a box given in a rotated frame: origin `o` and unit axes a, b, n. `choose(p, q, r)` receives each voxel
 * center's local coordinates inside [p0, p1] x [q0, q1] x [r0, r1] and returns a material, or 0 to skip.
 */
function fillFrame(
  grid: VoxelGrid, o: Vec, a: Vec, b: Vec, n: Vec,
  [p0, p1, q0, q1, r0, r1]: [number, number, number, number, number, number],
  choose: (p: number, q: number, r: number) => number,
): void {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const p of [p0, p1]) for (const q of [q0, q1]) for (const r of [r0, r1]) {
    for (let i = 0; i < 3; i++) {
      const v = o[i] + a[i] * p + b[i] * q + n[i] * r;
      lo[i] = Math.min(lo[i], v);
      hi[i] = Math.max(hi[i], v);
    }
  }
  for (let y = Math.max(0, Math.floor(lo[1])); y <= Math.min(grid.height - 1, Math.ceil(hi[1])); y++) {
    for (let z = Math.max(0, Math.floor(lo[2])); z <= Math.min(grid.depth - 1, Math.ceil(hi[2])); z++) {
      for (let x = Math.max(0, Math.floor(lo[0])); x <= Math.min(grid.width - 1, Math.ceil(hi[0])); x++) {
        const dx = x + 0.5 - o[0];
        const dy = y + 0.5 - o[1];
        const dz = z + 0.5 - o[2];
        const p = dx * a[0] + dy * a[1] + dz * a[2];
        const q = dx * b[0] + dy * b[1] + dz * b[2];
        const r = dx * n[0] + dy * n[1] + dz * n[2];
        if (p < p0 || p > p1 || q < q0 || q > q1 || r < r0 || r > r1) continue;
        const m = choose(p, q, r);
        if (m) grid.set(x, y, z, m);
      }
    }
  }
}

const COMPUTER_SHELL: Record<string, string> = { blue: '#2d5d9f', graphite: '#34373c', silver: '#c9cdd2' };

export const computer: VoxelObject = {
  id: 'computer',
  name: 'Computer',
  description: 'An oak desk with a 24-inch monitor, tower, keyboard and office chair.',
  category: 'tech',
  variants: [
    { id: 'blue', name: 'Cobalt', color: '#2d5d9f' },
    { id: 'graphite', name: 'Graphite', color: '#34373c' },
    { id: 'silver', name: 'Silver', color: '#c9cdd2' },
  ],
  createPalette(variantId: string) {
    const light = variantId === 'silver';
    return materialPalette('tech', {
      shell: COMPUTER_SHELL[variantId] ?? COMPUTER_SHELL.blue,
      kbd: light ? '#d9dce0' : '#26282c',
      keys: light ? '#f4f5f6' : '#41444a',
      oak: '#c0915f',
      oakEdge: '#94683f',
      steel: '#2b2d31',
      bezel: '#121316',
      wallpaper: { hex: '#2f6db8', glow: true },
      wallpaper2: { hex: '#5b4fb0', glow: true },
      window: { hex: '#e9eef5', glow: true },
      titlebar: { hex: '#b9c3d1', glow: true },
      taskbar: { hex: '#1b2233', glow: true },
      led: { hex: '#7ff0ff', glow: true },
      mesh: '#1d1f23',
      fabric: '#2a2d33',
      plastic: '#18191c',
      ceramic: '#ece6da',
      coffee: '#3b2416',
      potting: '#3a2a1e',
      leaf: '#3f7f3a',
      leafEdge: '#b9b24a',
    });
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    // Real sizes in cm at 0.4u per cm: desk 120 x 60 x 75, 24" monitor 54 x 32, tower 20 x 45 x 45.
    const s = 0.4 * u;
    const X = (cm: number): number => c + cm * s;
    const Y = (cm: number): number => g + cm * s;
    const Z = (cm: number): number => c + cm * s;
    const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: number): void =>
      fillBox(grid, X(x0), Y(y0), Z(z0), X(x1), Y(y1), Z(z1), () => m);
    const SHELL = tone(palette, 'shell');
    const STEEL = tone(palette, 'steel');
    const OAK = tone(palette, 'oak');
    const OAK_EDGE = tone(palette, 'oakEdge');

    // Desk: T-leg steel frame (front at z = 0) and a 3 cm oak top with a darker edge band.
    for (const side of [-1, 1]) {
      const lx = side * 55;
      box(lx - 3, 0, -58, lx + 3, 4, -2, STEEL);
      box(lx - 3, 4, -33, lx + 3, 72, -27, STEEL);
      box(lx - 3, 68, -56, lx + 3, 72, -4, STEEL);
    }
    box(-52, 64, -52, 52, 70, -48, STEEL);
    fillBox(grid, X(-60), Y(72), Z(-60), X(60), Y(75), Z(0), (x, _y, z) =>
      x === Math.floor(X(-60)) || x === Math.ceil(X(60)) - 1 || z === Math.ceil(Z(0)) - 1 || z === Math.floor(Z(-60)) ? OAK_EDGE : OAK);

    // Monitor: stand base, neck, back housing and a thin-bezel panel facing the chair (+z).
    fillRoundedBox(grid, X(-12), Y(75), Z(-53), X(12), Y(76.6), Z(-35), 2 * s, () => SHELL);
    box(-3.5, 76, -50, 3.5, 104, -45.5, SHELL);
    fillRoundedBox(grid, X(-19), Y(90), Z(-46), X(19), Y(112), Z(-41), 2 * s, () => SHELL);
    const BEZEL = tone(palette, 'bezel');
    const WALL = tone(palette, 'wallpaper');
    const WALL2 = tone(palette, 'wallpaper2');
    const WIN = tone(palette, 'window');
    const TITLE = tone(palette, 'titlebar');
    const TASK = tone(palette, 'taskbar');
    const front = Z(-39);
    fillBox(grid, X(-27), Y(87), Z(-42), X(27), Y(119), front, (x, y, z) => {
      if (z + 1 < front) return BEZEL;
      const sx = (x + 0.5 - c) / s;
      const sy = (y + 0.5 - g) / s - 75;
      if (Math.abs(sx) > 26.2 || sy < 13.8 || sy > 43.4) return BEZEL;
      if (sy < 15.2) return TASK;
      if (sx > -19 && sx < 6 && sy > 20 && sy < 40) return sy > 37.6 ? TITLE : WIN;
      if (sx > 10 && sx < 22 && sy > 18 && sy < 30) return sy > 28 ? TITLE : WIN;
      return sy > 30 + 6 * Math.sin(sx * 0.12) ? WALL2 : WALL;
    });

    // Keyboard (44 x 14 cm, main block, arrows and numpad) and a mouse.
    const KBD = tone(palette, 'kbd');
    const KEYS = tone(palette, 'keys');
    box(-24, 75, -23, 20, 76.6, -9, KBD);
    for (const [k0, k1] of [[-23, 5.5], [7, 11], [12.5, 19]]) {
      fillBox(grid, X(k0), Y(76.6), Z(-22), X(k1), Y(78), Z(-10), () => KEYS);
    }
    fillEllipsoid(grid, X(30), Y(75), Z(-15), 3 * s, 1.8 * s + 0.5, 5.5 * s, () => KBD);

    // Tower PC on the floor under the right of the desk: mesh front, power LED, small feet.
    for (const fx of [32, 48]) for (const fz of [-53, -12]) box(fx - 1.5, 0, fz - 1.5, fx + 1.5, 1.5, fz + 1.5, STEEL);
    fillRoundedBox(grid, X(30), Y(1.5), Z(-55), X(50), Y(46), Z(-10), 1.2 * s, () => SHELL);
    box(32, 4, -10.5, 48, 40, -9.6, tone(palette, 'mesh'));
    box(38.5, 42, -10.5, 41.5, 44, -9.6, tone(palette, 'led'));

    // Coffee mug and a snake plant in a ceramic pot.
    const CERAMIC = tone(palette, 'ceramic');
    const mugR = 4 * s;
    fillLathe(grid, X(44), Z(-33), Y(75), Y(84.5), (t) => (t < 0.08 ? mugR : [mugR, mugR - 1.2]), () => CERAMIC);
    fillCylinderY(grid, X(44), Z(-33), Y(75), Y(83), mugR - 1, () => tone(palette, 'coffee'));
    fillCylinderZ(grid, X(44) + mugR + 0.4 * s, Y(80), Z(-33) - 0.6, Z(-33) + 0.6, 2.6 * s + 0.6, () => CERAMIC, 2.6 * s - 0.6);
    fillLathe(grid, X(-48), Z(-46), Y(75), Y(88), (t) => [(5 + 1.5 * t) * s, t > 0.85 ? (5 + 1.5 * t) * s - 1.2 : 0], () => CERAMIC);
    fillCylinderY(grid, X(-48), Z(-46), Y(75), Y(86.5), 5.6 * s, () => tone(palette, 'potting'));
    const LEAF = tone(palette, 'leaf');
    const LEAF_EDGE = tone(palette, 'leafEdge');
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4;
      const h = 30 + ((i * 7) % 5) * 3.5;
      const lean = 4 + (i % 3) * 2.5;
      fillCapsule(grid, X(-48), Y(86), Z(-46), X(-48 + Math.cos(a) * lean), Y(86 + h), Z(-46 + Math.sin(a) * lean),
        1.7 * s + 0.3, 0.4, (x, y, z) => ((x + y + z) % 5 === 0 ? LEAF_EDGE : LEAF));
    }

    // Office chair pulled up to the desk: five-star base on casters, gas lift, seat and mesh back.
    const FABRIC = tone(palette, 'fabric');
    const PLASTIC = tone(palette, 'plastic');
    const cx = -20;
    const cz = 32;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const tx = cx + Math.cos(a) * 30;
      const tz = cz + Math.sin(a) * 30;
      fillCapsule(grid, X(cx), Y(10), Z(cz), X(tx), Y(8), Z(tz), 2 * s + 0.3, 1.6 * s + 0.3, () => PLASTIC);
      fillEllipsoid(grid, X(tx), Y(3), Z(tz), 3 * s + 0.2, 3 * s, 3 * s + 0.2, () => PLASTIC);
    }
    fillCylinderY(grid, X(cx), Z(cz), Y(8), Y(44), 2.6 * s + 0.3, () => STEEL);
    box(cx - 10, 42, cz - 10, cx + 10, 46, cz + 10, PLASTIC);
    fillRoundedBox(grid, X(cx - 25), Y(45), Z(cz - 23), X(cx + 25), Y(53), Z(cz + 24), 3 * s, () => FABRIC);
    fillCapsule(grid, X(cx), Y(46), Z(cz + 20), X(cx), Y(64), Z(cz + 27), 2.4 * s, 2.4 * s, () => PLASTIC);
    const tilt = 0.17;
    fillFrame(grid, [X(cx), Y(58), Z(cz + 27)], [1, 0, 0], [0, Math.cos(tilt), Math.sin(tilt)], [0, -Math.sin(tilt), Math.cos(tilt)],
      [-23 * s, 23 * s, 0, 46 * s, -3 * s, 3 * s],
      (p, q) => (inRoundRect(p, q - 23 * s, 23 * s, 23 * s, 9 * s) ? FABRIC : 0));
    for (const side of [-1, 1]) {
      box(cx + side * 24 - 1.5, 50, cz + 4, cx + side * 24 + 1.5, 66, cz + 8, PLASTIC);
      box(cx + side * 24 - 3, 66, cz - 6, cx + side * 24 + 3, 69, cz + 12, PLASTIC);
    }
  },
};

const LAPTOP_SHELL: Record<string, string> = { blue: '#4a6c99', silver: '#cfd2d6', graphite: '#4b4e53' };

export const laptop: VoxelObject = {
  id: 'laptop',
  name: 'Laptop',
  description: 'An open 15-inch laptop with a lit display.',
  category: 'tech',
  variants: [
    { id: 'blue', name: 'Cobalt', color: '#4a6c99' },
    { id: 'silver', name: 'Silver', color: '#cfd2d6' },
    { id: 'graphite', name: 'Space gray', color: '#4b4e53' },
  ],
  createPalette(variantId: string) {
    const shell = LAPTOP_SHELL[variantId] ?? LAPTOP_SHELL.blue;
    return materialPalette('tech', {
      shell,
      pad: variantId === 'silver' ? '#bfc3c8' : variantId === 'graphite' ? '#5a5d62' : '#5a7aa6',
      keycap: '#141518',
      hinge: '#26282c',
      bezel: '#0e0f11',
      wallA: { hex: '#6f9fdc', glow: true },
      wallB: { hex: '#3d5f9e', glow: true },
      wallC: { hex: '#23365e', glow: true },
      window: { hex: '#eef1f5', glow: true },
      titlebar: { hex: '#c9ced6', glow: true },
      menubar: { hex: '#d9dde6', glow: true },
      dock: { hex: '#a7b4cc', glow: true },
    });
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    // 15-inch laptop: 35.7 x 24.6 x 1.6 cm base, lid opened to 110 degrees, at 1.2u per cm.
    const k = 1.2 * u;
    const W = 35.7 * k;
    const D = 24.6 * k;
    const T = 1.6 * k;
    const zFront = c + 19.5 * u;
    const zBack = zFront - D;
    const zMid = (zFront + zBack) / 2;
    const yTop = Math.ceil(g + T) - 1;
    const SHELL = tone(palette, 'shell');
    const PAD = tone(palette, 'pad');
    const KEY = tone(palette, 'keycap');
    const HINGE = tone(palette, 'hinge');

    // Key rows from the hinge side: a short function row, then five full rows; [height, stagger] in cm.
    const rows: [number, number][] = [[1.0, 0], [1.75, 0], [1.75, 0.6], [1.75, 0.9], [1.75, 1.3], [1.75, 0]];
    const keyAt = (lx: number, lz: number): boolean => {
      const kx = lx / k;
      let kz = lz / k - 2.2;
      if (Math.abs(kx) > 13.8 || kz < 0) return false;
      for (let i = 0; i < rows.length; i++) {
        const [h, stagger] = rows[i];
        if (kz < h + 0.35) {
          if (kz > h) return false;
          if (i === rows.length - 1 && Math.abs(kx) < 5) return Math.abs(kx) < 4.8;
          const f = (((kx + 13.8 + stagger) / 1.93) % 1 + 1) % 1;
          return f < 0.8;
        }
        kz -= h + 0.35;
      }
      return false;
    };

    fillBox(grid, c - W / 2, g, zBack, c + W / 2, g + T, zFront, (x, y, z) => {
      const lx = x + 0.5 - c;
      const lz = z + 0.5 - zMid;
      const inset = y === g ? 0.5 * k : 0;
      if (!inRoundRect(lx, lz, W / 2 - inset, D / 2 - inset, 1.0 * k)) return 0;
      if (y !== yTop) return SHELL;
      const fromBack = z + 0.5 - zBack;
      if (fromBack < 1.0 * k) return HINGE;
      if (keyAt(lx, fromBack)) return KEY;
      if (Math.abs(lx) < 7 * k && fromBack > D - 10.2 * k && fromBack < D - 1.5 * k) return PAD;
      return SHELL;
    });

    // Lid: 1 cm thick, tilted 20 degrees back, screen layer on the front face.
    const lean = (20 * Math.PI) / 180;
    const H = 24 * k;
    const Tl = Math.max(1.0 * k, 2.6);
    const up: Vec = [0, Math.cos(lean), -Math.sin(lean)];
    const face: Vec = [0, Math.sin(lean), Math.cos(lean)];
    const o: Vec = [c, g + T, zBack + Tl * Math.cos(lean) + 0.2 * k];
    const BEZEL = tone(palette, 'bezel');
    const WALL_A = tone(palette, 'wallA');
    const WALL_B = tone(palette, 'wallB');
    const WALL_C = tone(palette, 'wallC');
    const WIN = tone(palette, 'window');
    const TITLE = tone(palette, 'titlebar');
    const MENU = tone(palette, 'menubar');
    const DOCK = tone(palette, 'dock');
    fillFrame(grid, o, [1, 0, 0], up, face, [-W / 2, W / 2, 0, H, -Tl, 0], (p, q, r) => {
      if (!inRoundRect(p, q - H / 2, W / 2, H / 2, 1.0 * k)) return 0;
      if (r < -1.3) return SHELL;
      const sx = p / k;
      const sy = q / k;
      if (Math.abs(sx) > 17.2 || sy < 1.6 || sy > 23.3) return BEZEL;
      if (sy > 22.7) return MENU;
      if (Math.abs(sx) < 8 && sy > 2 && sy < 3.6) return DOCK;
      if (sx > -13 && sx < 4 && sy > 7 && sy < 20) return sy > 18.8 ? TITLE : WIN;
      // Sky over a far mountain ridge and a darker near ridge.
      const far = 13 + 3.5 * Math.abs(((sx + 20) / 9) % 2 - 1) + 1.5 * Math.sin(sx * 0.7);
      const near = 7 + 2.5 * Math.sin(sx * 0.22 + 1);
      return sy > far ? WALL_A : sy > near ? WALL_B : WALL_C;
    });
  },
};

const RACK_ACCENT: Record<string, string> = { green: '#1fa37a', blue: '#2f6fd1', graphite: '#8a9099' };

type RackUnit = 'ups' | 'storage' | 'server2' | 'server1' | 'switch' | 'patch' | 'cable' | 'blank' | 'empty';

const RACK_UNITS: Record<RackUnit, number> = { ups: 3, storage: 4, server2: 2, server1: 1, switch: 1, patch: 1, cable: 1, blank: 1, empty: 1 };

/** Bottom-to-top contents of the three cabinets, in rack units. */
const RACKS: RackUnit[][] = [
  ['ups', 'blank', 'storage', 'storage', 'blank', 'server2', 'server2', 'server2', 'server2', 'empty', 'empty', 'server1', 'server1', 'server1', 'server1', 'blank', 'blank', 'empty', 'empty', 'cable', 'switch', 'patch'],
  ['ups', 'server2', 'server2', 'server2', 'server2', 'server2', 'server2', 'blank', 'storage', 'server1', 'server1', 'server1', 'server1', 'server1', 'server1', 'empty', 'empty', 'blank', 'cable', 'switch', 'switch', 'patch'],
  ['ups', 'storage', 'storage', 'server2', 'server2', 'server2', 'blank', 'server1', 'server1', 'server1', 'server1', 'server1', 'server1', 'server1', 'server1', 'empty', 'empty', 'empty', 'empty', 'switch', 'patch'],
];

export const serverRack: VoxelObject = {
  id: 'server-rack',
  name: 'Server Racks',
  description: 'A row of three 42U cabinets full of servers, storage and switches.',
  category: 'tech',
  variants: [
    { id: 'green', name: 'Mint', color: '#1fa37a' },
    { id: 'blue', name: 'Cobalt', color: '#2f6fd1' },
    { id: 'graphite', name: 'Graphite', color: '#8a9099' },
  ],
  createPalette(variantId: string) {
    return materialPalette('tech', {
      cabinet: '#1f2125',
      frame: '#2c2f34',
      interior: '#0c0d0f',
      chassis: '#9aa0a8',
      caddy: '#3a3e45',
      face: '#c3c8ce',
      blank: '#17181b',
      port: '#07080a',
      accent: RACK_ACCENT[variantId] ?? RACK_ACCENT.green,
      ledGreen: { hex: '#46ff7a', glow: true },
      ledBlue: { hex: '#4aa8ff', glow: true },
      ledAmber: { hex: '#ffb020', glow: true },
      lcd: { hex: '#58b8ff', glow: true },
      cableBlue: '#2d6fd6',
      cableYellow: '#e8c22a',
    });
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    // 42U cabinet: 60 x 107 x 200 cm (W x D x H), 1U = 4.445 cm, at 0.28u per cm.
    const s = 0.28 * u;
    const U = 4.445;
    const firstU = 14;
    const m = (name: string): number => tone(palette, name);
    const CAB = m('cabinet');
    const FRAME = m('frame');
    const INTERIOR = m('interior');
    const CHASSIS = m('chassis');
    const CADDY = m('caddy');
    const FACE = m('face');
    const BLANK = m('blank');
    const PORT = m('port');
    const ACCENT = m('accent');
    const GREEN = m('ledGreen');
    const BLUE = m('ledBlue');
    const AMBER = m('ledAmber');
    const LCD = m('lcd');
    const CABLE_B = m('cableBlue');
    const CABLE_Y = m('cableYellow');

    /** Front-panel material of a device at fx (0..48 cm across the 19" panel), fy (cm from its bottom). */
    const device = (type: RackUnit, fx: number, fy: number, h: number, salt: number): number => {
      if (type === 'empty') return 0;
      if (type === 'blank') return BLANK;
      const ear = fx < 2 || fx > 46;
      if (type === 'switch' || type === 'patch') {
        if (ear) return BLANK;
        const port = fx > 6 && fx < 42 && fy > 1.2 && fy < 3.4 && Math.floor((fx - 6) / 1.5) % 2 === 0;
        if (port) {
          if (type === 'patch') return Math.floor((fx - 6) / 3) % 3 === 0 ? CABLE_Y : CABLE_B;
          return PORT;
        }
        if (type === 'switch' && fy >= 3.4 && fx > 6 && fx < 42 && Math.floor((fx - 6) / 3) % 3 !== (salt % 3)) return GREEN;
        return BLANK;
      }
      if (type === 'cable') return fy > 1.4 && fy < 3 && fx > 4 && fx < 44 ? INTERIOR : BLANK;
      if (type === 'ups') {
        if (fx > 30 && fx < 38 && fy > h - 5 && fy < h - 2) return LCD;
        if (fx > 40 && fx < 42 && fy > h - 4.5 && fy < h - 3) return GREEN;
        return fy > 2 && fy < h - 7 && Math.floor(fy / 1.4) % 2 === 0 && fx > 4 && fx < 44 ? INTERIOR : BLANK;
      }
      if (ear) return fx < 2 ? ACCENT : CHASSIS;
      if (type === 'storage') {
        // 3 x 4 grid of 3.5" carriers, each with an activity LED.
        const col = Math.floor((fx - 3) / 10.6);
        const row = Math.floor((fy - 0.6) / 5.5);
        const cx = fx - 3 - col * 10.6;
        const cy = fy - 0.6 - row * 5.5;
        if (col < 0 || col > 3 || row < 0 || row > 2) return FACE;
        if (cx > 10 || cy > 5) return CHASSIS;
        if (cx > 8.4 && cy > 3.2) return (col + row + salt) % 4 === 0 ? AMBER : GREEN;
        return CADDY;
      }
      // 1U and 2U servers: rows of 2.5" drive caddies, a status LED and the power button.
      if (fx > 41) {
        if (fy > h - 2.2 && fx < 43) return (salt % 5 === 0) ? BLUE : GREEN;
        return FACE;
      }
      if (fx < 5) return FACE;
      const bay = Math.floor((fx - 5) / 3);
      const bx = fx - 5 - bay * 3;
      const rowH = type === 'server2' ? h / 2 : h;
      const by = fy % rowH;
      if (bx > 2.4 || by < 0.6 || by > rowH - 0.5) return CHASSIS;
      return CADDY;
    };

    for (let i = 0; i < 3; i++) {
      const rx = c + (i - 1) * 60 * s;
      // Unit layout of this cabinet: [type, bottom cm, height cm].
      const units: [RackUnit, number, number][] = [];
      let at = firstU;
      for (const type of RACKS[i]) {
        const h = RACK_UNITS[type] * U;
        units.push([type, at, h]);
        at += h;
      }
      fillBox(grid, rx - 30 * s, g, c - 53.5 * s, rx + 30 * s, g + 200 * s, c + 53.5 * s, (x, y, z) => {
        const lx = (x + 0.5 - rx) / s;
        const ly = (y + 0.5 - g) / s;
        const lz = (z + 0.5 - c) / s;
        const ax = Math.abs(lx);
        // Recessed plinth with leveling feet.
        if (ly < 8) {
          if (ly < 2.5) return ax > 23 && ax < 28 && Math.abs(lz) > 44 && Math.abs(lz) < 50 ? FRAME : 0;
          return ax < 28.5 && Math.abs(lz) < 51 ? FRAME : 0;
        }
        if (ax > 28.6 || ly > 197) return CAB;
        // Rear door: perforated steel with a frame band and a handle.
        if (lz < -50) {
          if (ax > 26 || ly < 11 || ly > 194) return CAB;
          if (lx > 21 && lx < 23.5 && ly > 95 && ly < 115) return FRAME;
          return (x + y) % 2 === 0 ? INTERIOR : CAB;
        }
        // Front: frame posts and header proud of the equipment faces.
        if (lz > 50.5) {
          if (ly > 193 && ly < 196 && ax < 8) return ACCENT;
          if (ax > 24.2 || ly < firstU || ly > 192) return CAB;
          return 0;
        }
        if (lz < 48.5) return ax < 24 ? INTERIOR : CAB;
        if (ax > 24.2) return ax > 22.6 ? FRAME : 0;
        if (ly < firstU || ly > 192) return CAB;
        for (const [type, y0, h] of units) {
          if (ly >= y0 && ly < y0 + h) return device(type, lx + 24.2, ly - y0, h, Math.floor(y0) + i * 7) || INTERIOR;
        }
        return INTERIOR;
      });
      // Brushed cable entry slots in the roof.
      fillBox(grid, rx - 18 * s, g + 197 * s, c - 42 * s, rx + 18 * s, g + 200 * s, c - 34 * s, () => INTERIOR);
    }
  },
};

const PHONE_BACK: Record<string, string> = { blue: '#3f5f86', white: '#e7e5df', graphite: '#3a3b3e' };
const PHONE_FRAME: Record<string, string> = { blue: '#5d7086', white: '#d3d1cb', graphite: '#55575b' };

export const smartphone: VoxelObject = {
  id: 'smartphone',
  name: 'Smartphone',
  description: 'A smartphone resting in a walnut desk stand, home screen lit.',
  category: 'tech',
  variants: [
    { id: 'blue', name: 'Blue titanium', color: '#3f5f86' },
    { id: 'white', name: 'White titanium', color: '#e7e5df' },
    { id: 'graphite', name: 'Black titanium', color: '#3a3b3e' },
  ],
  createPalette(variantId: string) {
    return materialPalette('tech', {
      back: PHONE_BACK[variantId] ?? PHONE_BACK.blue,
      rim: PHONE_FRAME[variantId] ?? PHONE_FRAME.blue,
      blackGlass: '#0b0c0e',
      lens: '#1d2a3a',
      flash: '#f3ead2',
      walnut: '#6e4a2f',
      wallTop: { hex: '#3a4fb8', glow: true },
      wallBottom: { hex: '#8e47b0', glow: true },
      dockGlass: { hex: '#a9a6c9', glow: true },
      appGreen: { hex: '#34c759', glow: true },
      appBlue: { hex: '#1f8fff', glow: true },
      appWhite: { hex: '#f4f4f6', glow: true },
      appOrange: { hex: '#ff9500', glow: true },
      appRed: { hex: '#ff3b30', glow: true },
      appYellow: { hex: '#ffcc00', glow: true },
    });
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    // 6.1-inch phone: 14.66 x 7.06 x 0.83 cm, leaning 15 degrees back in a 8 x 7 x 2.4 cm walnut slot stand; 3.6u per cm.
    const k = 3.6 * u;
    const H = 14.66 * k;
    const W = 7.06 * k;
    const T = Math.max(0.83 * k, 2.4);
    const lean = (15 * Math.PI) / 180;
    const up: Vec = [0, Math.cos(lean), -Math.sin(lean)];
    const face: Vec = [0, Math.sin(lean), Math.cos(lean)];
    const slotFloor = g + 1.2 * k;
    const slotZ = c + 0.6 * k;
    // Origin: bottom center of the screen face, placed so the back bottom edge sits on the slot floor.
    const o: Vec = [c, slotFloor + T * Math.sin(lean), slotZ + T * Math.cos(lean) / 2];
    const m = (name: string): number => tone(palette, name);
    const WALNUT = m('walnut');

    // Stand: solid walnut block with a tilted slot the phone stands in.
    fillRoundedBox(grid, c - 4 * k, g, c - 4.2 * k, c + 4 * k, g + 2.4 * k, c + 2.8 * k, 0.4 * k, (x, y, z) => {
      const dx = x + 0.5 - o[0];
      const dy = y + 0.5 - o[1];
      const dz = z + 0.5 - o[2];
      const q = dy * up[1] + dz * up[2];
      const r = dy * face[1] + dz * face[2];
      return q > -0.4 && r > -T - 0.6 && r < 0.6 && Math.abs(dx) < W / 2 + 0.6 ? 0 : WALNUT;
    });

    const BACK = m('back');
    const RIM = m('rim');
    const BLACK = m('blackGlass');
    const LENS = m('lens');
    const FLASH = m('flash');
    const apps = ['appGreen', 'appBlue', 'appWhite', 'appOrange', 'appRed', 'appYellow'].map(m);
    const WALL_TOP = m('wallTop');
    const WALL_BOTTOM = m('wallBottom');
    const DOCK = m('dockGlass');
    const corner = 1.0 * k;
    const screen = (sx: number, sy: number): number => {
      // sx in [-3.53, 3.53] cm from center, sy in cm from the bottom edge.
      const ix = sx + 3.53;
      if (Math.abs(sx) < 1.1 && sy > 13.6 && sy < 14.25) return BLACK;
      if (sy > 0.95 && sy < 2.55 && Math.abs(sx) < 3.2) {
        const col = Math.floor((ix - 0.7) / 1.5);
        const fx = ix - 0.7 - col * 1.5;
        if (col >= 0 && col < 4 && fx < 1.05 && sy > 1.2 && sy < 2.3) return apps[col];
        return DOCK;
      }
      if (sy > 4 && sy < 12.9) {
        const col = Math.floor((ix - 0.7) / 1.5);
        const row = Math.floor((12.9 - sy) / 1.75);
        const fx = ix - 0.7 - col * 1.5;
        const fy = 12.9 - sy - row * 1.75;
        if (col >= 0 && col < 4 && row < 5 && fx < 1.05 && fy > 0.15 && fy < 1.2) return apps[(col * 2 + row * 3) % apps.length];
      }
      return sy > 7 + 1.2 * Math.sin(sx * 0.9) ? WALL_TOP : WALL_BOTTOM;
    };
    fillFrame(grid, o, [1, 0, 0], up, face, [-W / 2, W / 2, 0, H, -T, 0], (p, q, r) => {
      if (!inRoundRect(p, q - H / 2, W / 2, H / 2, corner)) return 0;
      const edge = !inRoundRect(p, q - H / 2, W / 2 - 0.9, H / 2 - 0.9, corner);
      if (r > -1.1) {
        if (edge) return RIM;
        if (!inRoundRect(p, q - H / 2, W / 2 - 0.15 * k - 0.9, H / 2 - 0.15 * k - 0.9, corner)) return BLACK;
        return screen(p / k, q / k);
      }
      if (r < -T + 1.1 && !edge) return BACK;
      return RIM;
    });
    // Camera plateau on the back (top left seen from behind) with three lenses and a flash.
    const bump = 3.6 * k;
    const bx = W / 2 - 0.45 * k - bump / 2;
    const by = H - 0.45 * k - bump / 2;
    fillFrame(grid, o, [1, 0, 0], up, face, [bx - bump / 2, bx + bump / 2, by - bump / 2, by + bump / 2, -T - 0.18 * k - 0.9, -T + 0.5], (p, q, r) => {
      if (!inRoundRect(p - bx, q - by, bump / 2, bump / 2, 0.8 * k)) return 0;
      const lenses: [number, number][] = [[-0.85, 0.85], [-0.85, -0.85], [0.85, 0]];
      for (const [lx, ly] of lenses) {
        const d = Math.hypot(p - bx - lx * k, q - by - ly * k);
        if (d < 0.72 * k) return d < 0.45 * k ? LENS : RIM;
      }
      if (Math.hypot(p - bx - 0.85 * k, q - by - 1.05 * k) < 0.28 * k) return FLASH;
      return BACK;
    });
    for (const [lx, ly] of [[-0.85, 0.85], [-0.85, -0.85], [0.85, 0]] as const) {
      fillFrame(grid, o, [1, 0, 0], up, face, [bx + lx * k - 0.72 * k, bx + lx * k + 0.72 * k, by + ly * k - 0.72 * k, by + ly * k + 0.72 * k, -T - 0.35 * k - 1.4, -T],
        (p, q) => {
          const d = Math.hypot(p - bx - lx * k, q - by - ly * k);
          return d < 0.72 * k ? (d < 0.45 * k ? LENS : RIM) : 0;
        });
    }
    // Side buttons: action and volume keys on the left, power on the right.
    const button = (side: number, q0: number, q1: number): void =>
      fillFrame(grid, o, [1, 0, 0], up, face, [side > 0 ? W / 2 - 0.5 : -W / 2 - 0.08 * k - 0.6, side > 0 ? W / 2 + 0.08 * k + 0.6 : -W / 2 + 0.5, q0 * k, q1 * k, -T * 0.75, -T * 0.25], () => RIM);
    button(-1, 11.6, 12.4);
    button(-1, 10.2, 11.2);
    button(-1, 8.9, 9.9);
    button(1, 9.4, 11.4);
  },
};

const ROBOT_PAINT: Record<string, string> = { orange: '#f2701c', blue: '#2b5fae', steel: '#c2c7cc' };

export const robot: VoxelObject = {
  id: 'robot',
  name: 'Robot Arm',
  description: 'A six-axis industrial robot lifting a carton off a conveyor.',
  category: 'tech',
  variants: [
    { id: 'orange', name: 'Industrial orange', color: '#f2701c' },
    { id: 'blue', name: 'Cobalt', color: '#2b5fae' },
    { id: 'steel', name: 'Cleanroom white', color: '#c2c7cc' },
  ],
  createPalette(variantId: string) {
    return materialPalette('tech', {
      paint: ROBOT_PAINT[variantId] ?? ROBOT_PAINT.orange,
      motor: '#3b3e43',
      joint: '#5d6269',
      plate: '#585d64',
      bolt: '#2a2c30',
      cable: '#1b1c1f',
      alu: '#b9bec4',
      belt: '#232427',
      cup: '#141517',
      carton: '#b98b58',
      tape: '#d8bb86',
      led: { hex: '#46ff7a', glow: true },
    });
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    // Mid-size six-axis robot (A2 at 67.5 cm, 68 cm link, 67 cm forearm) and a 60 cm conveyor, at 0.3u per cm.
    const s = 0.3 * u;
    const X = (cm: number): number => c + (cm - 45) * s;
    const Y = (cm: number): number => g + cm * s;
    const Z = (cm: number): number => c + cm * s;
    const m = (name: string): number => tone(palette, name);
    const PAINT = m('paint');
    const MOTOR = m('motor');
    const JOINT = m('joint');
    const ALU = m('alu');
    const paint = (): number => PAINT;

    // Floor plate bolted down, base casting and the turntable ring.
    fillBox(grid, X(-40), Y(0), Z(-40), X(40), Y(3), Z(40), () => m('plate'));
    for (const bx of [-33, 33]) for (const bz of [-33, 33]) fillCylinderY(grid, X(bx), Z(bz), Y(3), Y(5), 2.5 * s + 0.3, () => m('bolt'));
    fillRoundedBox(grid, X(-28), Y(3), Z(-28), X(28), Y(22), Z(28), 6 * s, paint);
    fillCylinderY(grid, X(0), Z(0), Y(22), Y(26), 23 * s, () => JOINT);
    // Rotating column carrying the shoulder, with the A1 motor at the back.
    fillLathe(grid, X(0), Z(0), Y(26), Y(44), (t) => (24 - 4 * t) * s, paint);
    fillRoundedBox(grid, X(-16), Y(36), Z(-20), X(36), Y(66), Z(20), 8 * s, paint);
    fillCylinderY(grid, X(-20), Z(-10), Y(30), Y(58), 7 * s, () => MOTOR);
    fillCylinderY(grid, X(-20), Z(-10), Y(58), Y(60), 5 * s, () => JOINT);

    // Shoulder A2 (horizontal axis along z) with its motor on the +z side.
    const A2: [number, number] = [26, 67.5];
    const E: [number, number] = [42.2, 133.5];
    const Wr: [number, number] = [105, 110];
    fillCylinderZ(grid, X(A2[0]), Y(A2[1]), Z(-22), Z(22), 21 * s, paint);
    fillCylinderZ(grid, X(A2[0]), Y(A2[1]), Z(22), Z(25), 15 * s, () => JOINT);
    fillCylinderZ(grid, X(A2[0]), Y(A2[1]), Z(25), Z(40), 9 * s, () => MOTOR);

    // Link arm A2 -> A3: rounded box tapering toward the elbow.
    const link = (a: [number, number], b: [number, number], w0: number, w1: number, depth: number): void => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      const along: Vec = [dx / len, dy / len, 0];
      const across: Vec = [-dy / len, dx / len, 0];
      fillFrame(grid, [X(a[0]), Y(a[1]), Z(0)], across, along, [0, 0, 1], [-w0 * s, w0 * s, 0, len * s, -depth * s, depth * s], (p, q, r) => {
        const half = (w0 + (w1 - w0) * (q / (len * s))) * s;
        return inRoundRect(p, r, half, depth * s, 5 * s) ? PAINT : 0;
      });
    };
    link(A2, E, 13, 10, 12);

    // Elbow A3 with its motor, then the forearm housing (wrist motors behind the elbow) and tube.
    fillCylinderZ(grid, X(E[0]), Y(E[1]), Z(-15), Z(15), 15 * s, paint);
    fillCylinderZ(grid, X(E[0]), Y(E[1]), Z(-26), Z(-15), 8 * s, () => MOTOR);
    const fx = (Wr[0] - E[0]) / 67;
    const fy = (Wr[1] - E[1]) / 67;
    const back: [number, number] = [E[0] - fx * 22, E[1] - fy * 22];
    const mid: [number, number] = [E[0] + fx * 16, E[1] + fy * 16];
    link(back, mid, 12, 12, 12);
    for (const [oy, oz] of [[5, -6], [5, 6], [-5, 0]] as const) {
      const p0: Vec = [X(back[0] + fy * oy), Y(back[1] - fx * oy), Z(oz)];
      fillCapsule(grid, p0[0], p0[1], p0[2], p0[0] - fx * 9 * s, p0[1] - fy * 9 * s, p0[2], 4.5 * s, 4.5 * s, () => MOTOR);
    }
    fillCapsule(grid, X(mid[0]), Y(mid[1]), Z(0), X(Wr[0] - fx * 8), Y(Wr[1] - fy * 8), Z(0), 10 * s, 7.5 * s, paint);
    // Wrist A5 and the A6 flange pointing straight down.
    fillCylinderZ(grid, X(Wr[0]), Y(Wr[1]), Z(-8.5), Z(8.5), 8.5 * s, paint);
    fillCylinderZ(grid, X(Wr[0]), Y(Wr[1]), Z(-10), Z(-8.5), 6 * s, () => JOINT);
    fillCylinderZ(grid, X(Wr[0]), Y(Wr[1]), Z(8.5), Z(10), 6 * s, () => JOINT);
    fillCylinderY(grid, X(Wr[0]), Z(0), Y(96), Y(104), 6 * s, paint);
    fillCylinderY(grid, X(Wr[0]), Z(0), Y(93), Y(96), 6.5 * s, () => JOINT);

    // Vacuum gripper holding a taped carton 6 cm above the belt.
    fillBox(grid, X(91), Y(90), Z(-14), X(119), Y(93), Z(14), () => ALU);
    for (const cx of [97, 113]) for (const cz of [-8, 8]) fillCylinderY(grid, X(cx), Z(cz), Y(86), Y(90), 3.5 * s + 0.2, () => m('cup'));
    const CARTON = m('carton');
    const TAPE = m('tape');
    const carton = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number): void =>
      fillBox(grid, X(x0), Y(y0), Z(z0), X(x1), Y(y1), Z(z1), (x, y, z) => {
        const top = y === Math.ceil(Y(y1)) - 1;
        const mid = Math.abs((z + 0.5 - Z((z0 + z1) / 2)) / s) < 3;
        return (top || x === Math.floor(X(x0)) || x === Math.ceil(X(x1)) - 1) && mid ? TAPE : CARTON;
      });
    carton(85, 125, -15, 15, 66, 86);

    // Belt conveyor: aluminium side rails, black belt over end rollers, braced legs. Belt top at 60 cm.
    const BELT = m('belt');
    fillBox(grid, X(83), Y(57), Z(-82), X(127), Y(60), Z(82), () => BELT);
    for (const ez of [-82, 82]) fillCylinderX(grid, Y(57), Z(ez), X(83), X(127), 3 * s + 0.3, () => BELT);
    for (const rx of [80, 127]) {
      fillBox(grid, X(rx), Y(52), Z(-86), X(rx + 3), Y(62), Z(86), () => ALU);
      for (const lz of [-70, 0, 70]) {
        fillBox(grid, X(rx), Y(0), Z(lz - 2.5), X(rx + 3), Y(52), Z(lz + 2.5), () => ALU);
        fillBox(grid, X(rx - 1), Y(0), Z(lz - 4), X(rx + 4), Y(1.5), Z(lz + 4), () => m('bolt'));
      }
    }
    for (const lz of [-70, 0, 70]) fillBox(grid, X(80), Y(14), Z(lz - 2), X(130), Y(18), Z(lz + 2), () => ALU);
    carton(87, 123, -66, -38, 60, 85);
    carton(90, 120, 40, 66, 60, 80);
    // Status lamp on the conveyor frame.
    fillCylinderY(grid, X(128.5), Z(-84), Y(62), Y(70), 1.4 * s + 0.3, () => ALU);
    fillCylinderY(grid, X(128.5), Z(-84), Y(70), Y(75), 2.2 * s + 0.3, () => m('led'));

    // Cable dress pack from the column up the link arm.
    const CABLE = m('cable');
    const p0: Vec = [-12, 58, 20];
    const p1: Vec = [-14, 112, 30];
    const p2: Vec = [36, 128, 17];
    let prev: Vec | null = null;
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const pt: Vec = [0, 1, 2].map((j) => (1 - t) * (1 - t) * p0[j] + 2 * (1 - t) * t * p1[j] + t * t * p2[j]) as Vec;
      if (prev) fillCapsule(grid, X(prev[0]), Y(prev[1]), Z(prev[2]), X(pt[0]), Y(pt[1]), Z(pt[2]), 2.6 * s + 0.2, 2.6 * s + 0.2, () => CABLE);
      prev = pt;
    }
  },
};
