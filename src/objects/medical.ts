import type { VoxelGrid } from '../voxel/grid';
import { hash3 } from '../voxel/noise';
import type { Palette } from '../voxel/palette';
import { fillBox, fillCapsule, fillCylinderX, fillCylinderY, fillCylinderZ, fillEllipsoid, fillLathe, fillRoundedBox } from '../voxel/shapes';
import { materialPalette, solid } from './kit';
import type { VoxelObject } from './types';

/** Fill a bounding box voxel by voxel; `classify` gets the voxel center and returns a material or 0. */
function sculpt(
  grid: VoxelGrid,
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
  classify: (px: number, py: number, pz: number) => number,
): void {
  fillBox(grid, x0, y0, z0, x1, y1, z1, (x, y, z) => classify(x + 0.5, y + 0.5, z + 0.5));
}

/** Material ids by name, drawn with their natural tone. */
function mids<K extends string>(palette: Palette, names: readonly K[]): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const name of names) out[name] = palette.tone(palette.id(name), 'mid');
  return out;
}

const KIT_COLORS: Record<string, { shell: string; cross: string }> = {
  white: { shell: '#eef0ee', cross: '#d0202c' },
  red: { shell: '#c8202a', cross: '#f4f4f2' },
  teal: { shell: '#0f8a5f', cross: '#f4f4f2' },
};

export const firstAid: VoxelObject = {
  id: 'first-aid',
  name: 'First-Aid Kit',
  description: 'A hard-shell first-aid case with snap latches and a folding handle.',
  category: 'medical',
  variants: [
    { id: 'white', name: 'Clinic white', color: '#eef0ee' },
    { id: 'red', name: 'Rescue red', color: '#c8202a' },
    { id: 'teal', name: 'Safety green', color: '#0f8a5f' },
  ],
  createPalette(v) {
    const kit = KIT_COLORS[v] ?? KIT_COLORS.white;
    return materialPalette('medical', {
      shell: kit.shell, cross: kit.cross, latch: '#a3a8ad', handle: '#2b2e33', rubber: '#1d1e21', seam: '#4d5157',
    });
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    const m = mids(palette, ['shell', 'cross', 'latch', 'handle', 'rubber', 'seam'] as const);
    // A 40 x 22 x 24 cm ABS case, 1.2u per cm.
    const k = 1.2 * u;
    const X = (cm: number): number => c + cm * k;
    const Y = (cm: number): number => g + cm * k;
    const skin = 1.2 / k;
    // ISO first-aid cross: equal arms, each a third of the overall size.
    const cross = (a: number, b: number, size: number): boolean =>
      (Math.abs(a) <= size / 2 && Math.abs(b) <= size / 6) || (Math.abs(a) <= size / 6 && Math.abs(b) <= size / 2);

    // Rubber feet under the four corners.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) fillBox(grid, X(sx * 17 - 1.5), Y(0), X(sz * 8 - 1.5), X(sx * 17 + 1.5), Y(1.2), X(sz * 8 + 1.5), solid(palette, palette.id('rubber')));
    }
    // Base tray with the printed cross on the front and back.
    fillRoundedBox(grid, X(-20), Y(1), X(-11), X(20), Y(16), X(11), 1.6 * k, (x, y, z) => {
      const lx = (x + 0.5 - c) / k;
      const ly = (y + 0.5 - g) / k;
      const lz = (z + 0.5 - c) / k;
      return Math.abs(lz) > 11 - skin && cross(lx, ly - 8.6, 11) ? m.cross : m.shell;
    });
    // Rubber gasket in the seam between tray and lid.
    fillBox(grid, X(-19.3), Y(15.8), X(-10.3), X(19.3), Y(16.8), X(10.3), () => m.seam);
    // Lid with a cross on top.
    fillRoundedBox(grid, X(-20), Y(16.6), X(-11), X(20), Y(24), X(11), 1.6 * k, (x, y, z) => {
      const lx = (x + 0.5 - c) / k;
      const ly = (y + 0.5 - g) / k;
      const lz = (z + 0.5 - c) / k;
      return ly > 24 - skin && cross(lx, lz, 12) ? m.cross : m.shell;
    });
    // Two snap latches across the seam on the front, hinge barrel on the back.
    for (const sx of [-12.5, 12.5]) {
      fillRoundedBox(grid, X(sx - 2.2), Y(12.6), X(10.4), X(sx + 2.2), Y(19.4), X(12.2), 0.6 * k, () => m.latch);
      fillBox(grid, X(sx - 1.4), Y(13.4), X(11.6), X(sx + 1.4), Y(14.6), X(12.6), () => m.seam);
    }
    fillCylinderX(grid, Y(16.3), X(-11.2), X(-16), X(16), 1.1 * k, () => m.latch);
    // Folding carry handle, raised: pivot blocks, arms and a grip.
    for (const sx of [-9.5, 9.5]) {
      fillRoundedBox(grid, X(sx - 1.6), Y(23.4), X(-2), X(sx + 1.6), Y(25.6), X(2), 0.6 * k, () => m.handle);
      fillCapsule(grid, X(sx), Y(25), c, X(sx * 0.92), Y(28.6), c, 0.95 * k, 0.95 * k, () => m.handle);
    }
    fillCapsule(grid, X(-8.7), Y(28.6), c, X(8.7), Y(28.6), c, 1.15 * k, 1.15 * k, () => m.handle);
  },
};

const HOSPITAL_COLORS: Record<string, { wall: string; cladding: string; glass: string; frame: string }> = {
  white: { wall: '#e9ebed', cladding: '#a2acb6', glass: '#4f6c86', frame: '#858e97' },
  blue: { wall: '#e9ebed', cladding: '#2a5fae', glass: '#4a6c92', frame: '#7d8895' },
  teal: { wall: '#e8ecea', cladding: '#1b8a83', glass: '#4b7a7e', frame: '#7c8d8a' },
};

export const hospital: VoxelObject = {
  id: 'hospital',
  name: 'Hospital',
  description: 'A hospital with a ward tower, rooftop helipad and a covered emergency entrance.',
  category: 'medical',
  variants: [
    { id: 'white', name: 'Clinic white', color: '#e9ebed' },
    { id: 'blue', name: 'Care blue', color: '#2a5fae' },
    { id: 'teal', name: 'Teal ward', color: '#1b8a83' },
  ],
  createPalette(v) {
    const h = HOSPITAL_COLORS[v] ?? HOSPITAL_COLORS.white;
    return materialPalette('medical', {
      wall: h.wall, cladding: h.cladding, glass: h.glass, frame: h.frame,
      lit: { hex: '#ffd88c', glow: true },
      sign: { hex: '#e3202c', glow: true },
      pad: '#4a4f55', marking: '#f2f2ef', padLight: { hex: '#8cff9a', glow: true },
      roof: '#9a9ea3', plant: '#b9bec4', panel: '#f6f6f3',
    });
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    const m = mids(palette, ['wall', 'cladding', 'glass', 'frame', 'lit', 'sign', 'pad', 'marking', 'padLight', 'roof', 'plant', 'panel'] as const);
    // 1u = 1 m: a 50 x 30 m site, two-storey podium and a seven-storey ward tower.
    const X = (mtr: number): number => Math.round(c + mtr * u);
    const Y = (mtr: number): number => Math.round(g + mtr * u);
    const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: number): void =>
      fillBox(grid, X(x0), Y(y0), X(z0), X(x1), Y(y1), X(z1), () => mat);

    interface Facade { x0: number; x1: number; z0: number; z1: number; y0: number; floors: number; floorH: number; sill: number; win: number; bay: number }
    /** Clad a block (metres) and cut recessed curtain-wall windows into its four faces, some lit. */
    const block = (f: Facade, faces = [true, true, true, true]): void => {
      const x0 = X(f.x0), x1 = X(f.x1), z0 = X(f.z0), z1 = X(f.z1), y0 = Y(f.y0);
      const y1 = Y(f.y0 + f.floors * f.floorH);
      fillBox(grid, x0, y0, z0, x1, y1, z1, () => m.wall);
      fillBox(grid, x0 + 1, y1 - 1, z0 + 1, x1 - 1, y1, z1 - 1, () => m.roof);
      const mullion = Math.max(1, Math.round(0.5 * u));
      const corner = Math.max(1, Math.round(0.8 * u));
      // Each face: outer voxel line, inward step and the run along the face.
      const sides: { len: number; at: (a: number, depth: number) => [number, number] }[] = [
        { len: x1 - x0, at: (a, d) => [x0 + a, z1 - 1 - d] },
        { len: x1 - x0, at: (a, d) => [x1 - 1 - a, z0 + d] },
        { len: z1 - z0, at: (a, d) => [x1 - 1 - d, z0 + a] },
        { len: z1 - z0, at: (a, d) => [x0 + d, z1 - 1 - a] },
      ];
      sides.forEach((side, s) => {
        if (!faces[s]) return;
        const bayV = f.bay * u;
        for (let y = y0; y < y1; y++) {
          const fy = (y + 0.5 - y0) / u;
          const floor = Math.floor(fy / f.floorH);
          const within = fy - floor * f.floorH;
          if (within < f.sill || within >= f.sill + f.win) continue;
          for (let a = corner; a < side.len - corner; a++) {
            const run = a - corner;
            const bay = Math.floor(run / bayV);
            const [ox, oz] = side.at(a, 0);
            if (run - bay * bayV < mullion) {
              grid.set(ox, y, oz, m.frame);
              continue;
            }
            const [ix, iz] = side.at(a, 1);
            grid.set(ox, y, oz, 0);
            grid.set(ix, y, iz, hash3(bay, floor, s, 17) < 0.36 ? m.lit : m.glass);
          }
        }
      });
    };

    // Podium: outpatients and emergency, 2 floors of 4.5 m.
    block({ x0: -25, x1: 25, z0: -15, z1: 8, y0: 0, floors: 2, floorH: 4.5, sill: 1.1, win: 2.4, bay: 3 });
    // Parapet around the podium roof.
    for (const [a0, a1, b0, b1] of [[-25, 25, 7.2, 8], [-25, 25, -15, -14.2], [-25, -24.2, -15, 8], [24.2, 25, -15, 8]]) box(a0, 9, b0, a1, 9.9, b1, m.wall);
    // Accent band at the podium floor line.
    box(-25.3, 4.3, -15.3, 25.3, 4.9, 8.3, m.cladding);

    // Ward tower: 7 floors of 3.8 m with ribbon windows.
    const towerTop = 9 + 7 * 3.8;
    block({ x0: -19, x1: 13, z0: -13, z1: 1, y0: 9, floors: 7, floorH: 3.8, sill: 1.0, win: 2.2, bay: 2.6 });
    for (const [a0, a1, b0, b1] of [[-19, 13, 0.2, 1], [-19, 13, -13, -12.2], [-19, -18.2, -13, 1], [12.2, 13, -13, 1]]) box(a0, towerTop, b0, a1, towerTop + 1, b1, m.wall);
    // Stair and lift core, clad in the accent color, rising above the roof.
    box(13, 9, -11, 19, towerTop + 3.4, -1, m.cladding);
    box(12.6, towerTop + 3.4, -11.4, 19.4, towerTop + 4, -0.6, m.frame);
    // Illuminated hospital cross on the core, facing the street and the side.
    const crossY = towerTop - 3;
    const crossAt = (a: number, b: number): boolean => (Math.abs(a) <= 2 && Math.abs(b) <= 0.7) || (Math.abs(a) <= 0.7 && Math.abs(b) <= 2);
    box(13.6, crossY - 2.7, -1, 18.4, crossY + 2.7, -0.4, m.panel);
    sculpt(grid, X(13.6), Y(crossY - 2.6), X(-0.6), X(18.4), Y(crossY + 2.6), X(-0.4) + 1, (px, py) => (crossAt((px - c) / u - 16, (py - g) / u - crossY) ? m.sign : 0));
    box(19, crossY - 2.7, -8.4, 19.6, crossY + 2.7, -3.6, m.panel);
    sculpt(grid, X(19.4), Y(crossY - 2.6), X(-8.4), X(19.6) + 1, Y(crossY + 2.6), X(-3.6), (_px, py, pz) => (crossAt((pz - c) / u + 6, (py - g) / u - crossY) ? m.sign : 0));

    // Rooftop plant room with louvres.
    sculpt(grid, X(3), Y(towerTop), X(-11.5), X(11), Y(towerTop + 3.6), X(-5), (_px, py) => (Math.floor((py - g) / u / 0.6) % 2 ? m.plant : m.frame));
    // Helipad deck on short steel posts: dark deck, white ring and "H", green edge lights.
    const padX = -9;
    const padZ = -6;
    const padR = 6.4;
    const deckY = towerTop + 1.4;
    for (const [px, pz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) fillCylinderY(grid, X(padX + px), X(padZ + pz), Y(towerTop), Y(deckY), 0.5 * u, () => m.frame);
    fillCylinderY(grid, X(padX), X(padZ), Y(deckY), Y(deckY + 1), padR * u, (x, y, z) => {
      const lx = (x + 0.5 - c) / u - padX;
      const lz = (z + 0.5 - c) / u - padZ;
      if (y < Y(deckY + 1) - 1) return m.pad;
      const r = Math.hypot(lx, lz);
      if (r > padR - 1.3 && r < padR - 0.6) return m.marking;
      const h = (Math.abs(lx) <= 2.4 && Math.abs(lx) >= 1.5 && Math.abs(lz) <= 2.6) || (Math.abs(lx) < 1.5 && Math.abs(lz) <= 0.45);
      return h ? m.marking : m.pad;
    });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const lx = padX + Math.cos(a) * (padR - 0.3);
      const lz = padZ + Math.sin(a) * (padR - 0.3);
      box(lx - 0.35, deckY + 1, lz - 0.35, lx + 0.35, deckY + 1.5, lz + 0.35, m.padLight);
    }

    // Emergency entrance: glazed lobby, a canopy on two columns and a lit sign above.
    sculpt(grid, X(-8), Y(0), X(7), X(8), Y(4.2), X(8), (px) => {
      const run = (px - c) / u + 8;
      return run % 4 < 0.5 ? m.frame : m.glass;
    });
    box(-8, 0, 6, 8, 4.2, 7, m.lit);
    box(-9.5, 4.4, 8, 9.5, 5.2, 15, m.cladding);
    box(-9.5, 5.2, 14.4, 9.5, 5.5, 15, m.frame);
    for (const sx of [-8.5, 8.5]) fillCylinderY(grid, X(sx), X(14), Y(0), Y(4.4), 0.45 * u, () => m.frame);
    box(-7, 5.6, 8, 7, 8.4, 8.6, m.panel);
    sculpt(grid, X(-7), Y(5.6), X(8.4), X(7), Y(8.4), X(8.6) + 1, (px, py) => {
      const lx = (px - c) / u;
      const ly = (py - g) / u - 7;
      if (crossAt((lx + 5) * 0.62, ly * 0.62)) return m.sign;
      // A row of letters, suggested by short red strokes.
      return lx > -2.6 && lx < 6.2 && Math.abs(ly) < 0.6 && (lx + 2.6) % 1.1 < 0.8 ? m.sign : 0;
    });
  },
};

const AMBULANCE_COLORS: Record<string, { body: string; stripe: string; star: string }> = {
  white: { body: '#f2f3f1', stripe: '#d3202a', star: '#1f5fbf' },
  red: { body: '#c41e26', stripe: '#f4f4f2', star: '#1f5fbf' },
  blue: { body: '#f2f3f1', stripe: '#1f5fbf', star: '#1f5fbf' },
};

export const ambulance: VoxelObject = {
  id: 'ambulance',
  name: 'Ambulance',
  description: 'A Type III box ambulance with light bar, chevrons and the Star of Life.',
  category: 'medical',
  variants: [
    { id: 'white', name: 'Rescue white', color: '#f2f3f1' },
    { id: 'red', name: 'Fire red', color: '#c41e26' },
    { id: 'blue', name: 'Paramedic blue', color: '#1f5fbf' },
  ],
  createPalette(v) {
    const a = AMBULANCE_COLORS[v] ?? AMBULANCE_COLORS.white;
    return materialPalette('medical', {
      body: a.body, stripe: a.stripe, star: a.star, white: '#f4f4f2', chevron: '#d8e81c',
      glass: '#1e2a36', tire: '#1b1c1f', rim: '#b9bec4', hub: '#5c6168', frame: '#26282c', grille: '#34373c', chrome: '#c9ced4', seam: '#7d838a',
      lamp: { hex: '#fff6d8', glow: true }, amber: { hex: '#ffa21a', glow: true },
      beacon: { hex: '#ff2630', glow: true }, tail: { hex: '#e0141e', glow: true },
    });
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    const m = mids(palette, ['body', 'stripe', 'star', 'white', 'chevron', 'glass', 'tire', 'rim', 'hub', 'frame', 'grille', 'chrome', 'seam', 'lamp', 'amber', 'beacon', 'tail'] as const);
    // Ford E-450 cutaway with a 14 ft module: 6.9 m long, 2.4 m wide, 2.9 m tall; 7u per metre.
    const k = 7 * u;
    const vs = 1 / k;
    const skin = 1.5 * vs;
    const R = 0.4;
    const FRONT_AXLE = 2.6;
    const REAR_AXLE = -1.4;
    const between = (v: number, a: number, b: number): boolean => v >= a && v < b;
    const wsX = (Y: number): number => 2.45 - (Y - 1.36) * 0.62;
    // Axle x, inner and outer tire face: single front tires, rear duals.
    const WHEELS = [[FRONT_AXLE, 0.74, 0.98], [REAR_AXLE, 0.6, 1.1]];

    const classify = (X: number, Y: number, Zs: number): number => {
      const Z = Math.abs(Zs);
      // Wheels, with the contact patch on the plot.
      for (const [ax, zin, zout] of WHEELS) {
        const d = Math.sqrt((X - ax) ** 2 + (Y - R) ** 2);
        if (d <= R && Z >= zin && Z <= zout) {
          if (d < 0.25 && Z > zout - skin) return d < 0.09 ? m.hub : m.rim;
          return m.tire;
        }
        if (d < 0.5 && Y < 1.0 && Z > 0.55) return 0;
        if (d < 0.5 && Y < 1.0) return m.frame;
      }
      // Ladder frame and running gear under the body.
      if (between(Y, 0.3, 0.62) && Z < 0.45 && between(X, -3.1, 3.1)) return m.frame;
      if (X >= 0.95) {
        // Cab: bumper, hood, windshield, doors and roof light bar.
        if (between(X, 3.26, 3.48) && between(Y, 0.36, 0.62) && Z <= (X > 3.4 ? 0.9 : 1.0)) return m.chrome;
        let half = 1.0;
        if (X > 3.05) half -= ((X - 3.05) / 0.33) ** 2 * 0.14;
        if (Y > 1.36) half -= (Y - 1.36) * 0.1;
        let top: number;
        if (X >= 2.45) top = 1.36 - (X - 2.45) * 0.15 - Math.max(0, X - 3.15) * 0.9;
        else top = X <= wsX(Math.min(2.24, Math.max(1.36, Y))) ? 2.24 : 1.36;
        if (Y <= 2.24 && Y > 1.36 && X > wsX(Y)) top = -1;
        const lightBar = between(X, 1.25, 1.72) && between(Y, 2.24, 2.42) && Z <= 0.86;
        if (lightBar) return Z < 0.22 ? m.lamp : m.beacon;
        if (X > 3.38 || Y < 0.45 || Y >= top || Z > half) {
          // Door mirrors on short arms.
          if (between(X, 2.05, 2.3) && between(Y, 1.5, 1.98) && between(Z, 1.0, 1.2)) return m.frame;
          return 0;
        }
        const front = X > 3.38 - (Z > 0.86 ? 0.12 : 0) - skin;
        if (front && Z < 0.42 && between(Y, 0.66, 1.14)) return Math.floor(Y / 0.1) % 2 ? m.chrome : m.grille;
        if (X > 3.2 && between(Z, 0.5, 0.9) && between(Y, 0.86, 1.12)) return m.lamp;
        if (X > 3.2 && between(Z, 0.5, 0.9) && between(Y, 0.74, 0.86)) return m.amber;
        if (Y > 1.42 && Y < 2.16 && Z < half - 0.1 && X > wsX(Y) - skin) return m.glass;
        if (Z > half - skin && between(Y, 1.45, 2.12) && between(X, 1.3, wsX(Y) - 0.1)) return m.glass;
        if (Z > half - skin && between(Y, 1.08, 1.3)) return m.stripe;
        if (Z > half - skin && Math.abs(X - 1.3) < vs * 0.6 && between(Y, 0.6, 2.2)) return m.seam;
        return m.body;
      }
      // Patient module.
      if (between(X, -3.6, -3.4) && between(Y, 0.42, 0.58) && Z <= 1.0) return m.seam;
      if (X < -3.4 || Y < 0.6 || Y >= 2.9 || Z > 1.2) {
        if (between(X, -0.9, 0.3) && between(Y, 2.9, 3.08) && Z < 0.62) return m.seam;
        return 0;
      }
      if (Y > 2.8 && Z > 1.1 && (Y - 2.8) ** 2 + (Z - 1.1) ** 2 > 0.01) return 0;
      const rear = X < -3.4 + skin;
      const frontFace = X > 0.95 - skin && Y > 2.24;
      const side = Z > 1.2 - skin;
      const upperLight = between(Y, 2.46, 2.74);
      if (rear) {
        if (upperLight && Z > 0.82) return m.beacon;
        if (upperLight && Z < 0.25) return m.amber;
        if (between(Z, 0.92, 1.16) && between(Y, 0.72, 1.5)) return Y < 0.95 ? m.lamp : Y < 1.2 ? m.amber : m.tail;
        if (Math.abs(Zs) < vs * 0.6 && between(Y, 0.66, 2.62)) return m.seam;
        if (between(Z, 0.18, 0.78) && between(Y, 1.78, 2.34)) return m.glass;
        // NFPA rear chevrons: alternating red and fluorescent yellow-green.
        if (Z < 0.86 && between(Y, 0.7, 1.56)) return Math.floor((Y - Z * 0.9) / 0.2) % 2 ? m.stripe : m.chevron;
        return m.body;
      }
      if (frontFace) {
        if (upperLight && Z > 0.82) return m.beacon;
        if (upperLight && Z < 0.3) return m.lamp;
        return m.body;
      }
      if (side) {
        if (upperLight && (between(X, 0.48, 0.86) || between(X, -3.34, -2.96))) return m.beacon;
        if (between(Y, 1.08, 1.3) || between(Y, 1.38, 1.52) || between(Y, 2.58, 2.7)) return m.stripe;
        // Star of Life: three crossed bars with a white rod, on a white border.
        const dx = X + 1.55;
        const dy = Y - 1.98;
        if (dx * dx + dy * dy < 0.66 * 0.66) {
          let starBar = false;
          let border = false;
          for (const a of [Math.PI / 2, Math.PI / 6, -Math.PI / 6]) {
            const along = Math.abs(dx * Math.cos(a) + dy * Math.sin(a));
            const across = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a));
            if (along <= 0.52 && across <= 0.13) starBar = true;
            if (along <= 0.6 && across <= 0.2) border = true;
          }
          if (starBar) return Math.abs(dx) < 0.045 + vs * 0.5 && Math.abs(dy) < 0.4 ? m.white : m.star;
          if (border) return m.white;
        }
        if (Zs > 0) {
          // Curbside entry door with a window.
          if (between(X, -0.45, 0.75) && between(Y, 0.66, 2.56)) {
            if (between(X, -0.25, 0.55) && between(Y, 1.76, 2.3)) return m.glass;
            if (X < -0.45 + vs || X > 0.75 - vs || Y > 2.56 - vs) return m.seam;
          }
        } else if (between(Y, 0.66, 2.5)) {
          // Street-side equipment compartments.
          for (const sx of [-2.9, -1.95, -0.85, 0.1]) if (Math.abs(X - sx) < vs * 0.6) return m.seam;
        }
      }
      return m.body;
    };

    const L = 3.62 * k;
    sculpt(grid, c - L, g, c - 1.25 * k, c + L, g + 3.12 * k, c + 1.25 * k, (px, py, pz) => classify((px - c) / k, (py - g) / k, (pz - c) / k));
  },
};

const NEEDLE_GAUGES: Record<string, string> = {
  cream: '#eadcb4',
  blue: '#1f5fbf',
  green: '#1e7a3c',
};

export const syringe: VoxelObject = {
  id: 'syringe',
  name: 'Syringe',
  description: 'A 20 ml syringe with a vial and its needle cap, laid on the bench.',
  category: 'medical',
  variants: [
    { id: 'cream', name: '19G cream', color: '#eadcb4' },
    { id: 'blue', name: '23G blue', color: '#1f5fbf' },
    { id: 'green', name: '21G green', color: '#1e7a3c' },
  ],
  createPalette(v) {
    return materialPalette('medical', {
      clear: '#dfe8ec', plunger: '#f4f5f3', stopper: '#2c2e33', liquid: '#a9d3e6', print: '#23262b',
      hub: NEEDLE_GAUGES[v] ?? NEEDLE_GAUGES.cream, steel: '#c3c8ce', glass: '#d6e6ec', crimp: '#b4b9bf', label: '#f6f6f2', labelBand: '#2b6fd0',
    });
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    const m = mids(palette, ['clear', 'plunger', 'stopper', 'liquid', 'print', 'hub', 'steel', 'glass', 'crimp', 'label', 'labelBand'] as const);
    // 20 ml syringe (barrel 2 cm across, 23.2 cm tip to thumb rest with the needle), 2.2u per cm.
    const k = 2.2 * u;
    const vs = 1 / k;
    const thin = Math.max(0.16, 0.55 * vs);
    const sx0 = c - 11.6 * k;
    const sz = c + 1 * k;
    // It rests on the finger flange (1.35 cm half-height) and the front of the barrel (1 cm radius).
    const axisY = (s: number): number => 1.35 - (s - 7.35) * (0.35 / 9.65);

    const classify = (s: number, p: number, q: number): number => {
      const r = Math.hypot(p, q);
      if (s < 0) return 0;
      if (s < 0.3) return r <= 1.15 ? m.plunger : 0;
      if (s < 7) return (Math.abs(p) <= 0.75 && Math.abs(q) <= thin) || (Math.abs(q) <= 0.75 && Math.abs(p) <= thin) ? m.plunger : 0;
      if (s < 7.35) return (p / 2.4) ** 2 + (q / 1.35) ** 2 <= 1 ? m.clear : 0;
      if (s < 17) {
        if (r > 1) return 0;
        // Printed scale on the upper side: a tick every 2 ml, longer every 10 ml.
        const ml = (s - 9.8) / 0.352;
        if (r > 1 - 1.2 * vs && ml > -0.2 && ml < 20.2) {
          const tick = Math.abs(ml - Math.round(ml / 2) * 2) * 0.352 < 0.5 * vs;
          const major = Math.round(ml) % 10 === 0;
          if (tick && q > (major ? 0.1 : 0.55)) return m.print;
        }
        if (s < 9) return m.clear;
        if (s < 9.8) return m.stopper;
        return m.liquid;
      }
      if (s < 17.6) return r <= 1 - ((s - 17) / 0.6) * 0.65 ? m.clear : 0;
      if (s < 18) return r <= 0.3 ? m.clear : 0;
      if (s < 19.5) return r <= 0.52 - ((s - 18) / 1.5) * 0.17 ? m.hub : 0;
      if (s < 23.2) return r <= Math.max(0.05, 0.55 * vs) * (s > 22.6 ? 0.8 : 1) ? m.steel : 0;
      return 0;
    };
    sculpt(grid, sx0, g, sz - 2.6 * k, sx0 + 23.3 * k, g + 3.2 * k, sz + 2.6 * k, (px, py, pz) => {
      const s = (px - sx0) / k;
      return classify(s, (pz - sz) / k, (py - g) / k - axisY(s));
    });

    // The needle's protective cap, pulled off and lying beside it.
    fillCapsule(grid, sx0 + 15.5 * k, g + 0.45 * k, sz + 3.4 * k, sx0 + 20 * k, g + 0.45 * k, sz + 4.6 * k, 0.45 * k, 0.4 * k, () => m.hub);

    // 10 ml vial standing behind: glass, label, aluminium crimp and a flip-off cap.
    const vx = sx0 + 4.5 * k;
    const vz = sz - 6 * k;
    const vialRadius = (h: number): number => {
      if (h < 4.2) return h < 0.2 ? 1.1 : 1.2;
      if (h < 4.7) return 1.2 - ((h - 4.2) / 0.5) * 0.55;
      if (h < 5) return 0.65;
      return h < 5.55 ? 0.74 : 0.78;
    };
    fillLathe(grid, vx, vz, g, g + 6 * k, (t) => vialRadius(t * 6) * k, (x, y, z) => {
      const h = (y + 0.5 - g) / k;
      if (h >= 5.55) return m.hub;
      if (h >= 5) return m.crimp;
      if (h >= 1 && h < 3.1) {
        const a = Math.atan2(z + 0.5 - vz, x + 0.5 - vx);
        if (h > 2.45 && h < 2.75 && Math.cos(a - 0.4) > -0.6) return m.labelBand;
        return Math.cos(a - 0.4) > -0.6 ? m.label : m.liquid;
      }
      return h < 3.4 ? m.liquid : m.glass;
    });
  },
};

const HEART_COLORS: Record<string, string> = {
  red: '#c81e2c',
  pink: '#ef8fb0',
  purple: '#7b3fc4',
};

export const heart: VoxelObject = {
  id: 'heart',
  name: 'Heart',
  description: 'A lacquered heart sculpture on a granite drum, with a stethoscope draped over it.',
  category: 'medical',
  variants: [
    { id: 'red', name: 'Crimson', color: '#c81e2c' },
    { id: 'pink', name: 'Rose pink', color: '#ef8fb0' },
    { id: 'purple', name: 'Violet', color: '#7b3fc4' },
  ],
  createPalette(v) {
    return materialPalette('medical', {
      heart: HEART_COLORS[v] ?? HEART_COLORS.red, granite: '#3d4046', plinthTop: '#55595f', brass: '#c9a24a',
      tubing: '#1d1f23', steel: '#c4c9cf', diaphragm: '#e9ecef',
    });
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    const m = mids(palette, ['heart', 'granite', 'plinthTop', 'brass', 'tubing', 'steel', 'diaphragm'] as const);
    // Granite drum 20u across and 5u tall; the heart's point is set 2.6u into it.
    const baseH = 5 * u;
    fillCylinderY(grid, c, c, g, g + baseH - 0.6 * u, 10 * u, () => m.granite);
    fillCylinderY(grid, c, c, g + baseH - 0.6 * u, g + baseH, 9.6 * u, () => m.plinthTop);
    // Brass plaque on the front of the drum.
    sculpt(grid, c - 3.4 * u, g + 1.4 * u, c + 9 * u, c + 3.4 * u, g + 3.6 * u, c + 10.6 * u, (px, _py, pz) => {
      const r = Math.hypot(px - c, pz - c);
      return r > 10 * u - 1 && r < 10 * u + 0.8 ? m.brass : 0;
    });
    // Taubin's heart surface: (x² + 9/4·d² + h² − 1)³ − x²·h³ − 9/80·d²·h³ ≤ 0, 2.27 wide and 2.23 tall.
    const S = 19 * u;
    const yc = g + baseH - 2.6 * u + 0.995 * S;
    sculpt(grid, c - 1.15 * S, g + baseH - 2.6 * u, c - 0.68 * S, c + 1.15 * S, yc + 1.25 * S, c + 0.68 * S, (px, py, pz) => {
      const x = (px - c) / S;
      const h = (py - yc) / S;
      const d = (pz - c) / S;
      const f = (x * x + 2.25 * d * d + h * h - 1) ** 3 - x * x * h ** 3 - 0.1125 * d * d * h ** 3;
      return f <= 0 ? m.heart : 0;
    });

    // A stethoscope hung over the dip between the lobes: chest piece hanging in front, binaurals down the back.
    const inside = (x: number, h: number, d: number): boolean =>
      (x * x + 2.25 * d * d + h * h - 1) ** 3 - x * x * h ** 3 - 0.1125 * d * d * h ** 3 <= 0;
    /** Depth of the heart surface at (x, h), in heart units. */
    const depthAt = (x: number, h: number): number => {
      if (!inside(x, h, 0)) return 0;
      let lo = 0;
      let hi = 0.7;
      for (let i = 0; i < 20; i++) {
        const mid = (lo + hi) / 2;
        if (inside(x, h, mid)) lo = mid;
        else hi = mid;
      }
      return lo;
    };
    const tube = 0.8 * u;
    const at = (x: number, h: number, d: number): [number, number, number] => [c + x * S, yc + h * S, c + d * S];
    const strand = (points: [number, number, number][], radius: number, mat: number): void => {
      for (let i = 1; i < points.length; i++) {
        const [a, b] = [points[i - 1], points[i]];
        fillCapsule(grid, a[0], a[1], a[2], b[0], b[1], b[2], radius, radius, () => mat);
      }
    };
    const lie = (x: number, h: number, side: number, r: number): [number, number, number] =>
      at(x, h, side * (depthAt(x, h) + r / S));
    const front: [number, number, number][] = [at(0, 0.998 + tube / S, 0)];
    for (let h = 0.95; h >= 0; h -= 0.05) front.push(lie(0, h, 1, tube));
    const hangD = depthAt(0, 0) + tube / S;
    const pieceTop = -0.42;
    front.push(at(0, pieceTop, hangD));
    strand(front, tube, m.tubing);
    // Chest piece: steel stem and a diaphragm disc facing out.
    const [px, py, pz] = at(0, pieceTop, hangD);
    const discR = 2.6 * u;
    fillCapsule(grid, px, py, pz, px, py - 1.6 * u, pz, 0.6 * u, 0.6 * u, () => m.steel);
    fillCylinderZ(grid, px, py - 1.6 * u - discR, pz - 0.8 * u, pz + 0.7 * u, discR, () => m.steel);
    fillCylinderZ(grid, px, py - 1.6 * u - discR, pz + 0.7 * u, pz + 1.1 * u, discR - 0.6 * u, () => m.diaphragm);
    const back: [number, number, number][] = [at(0, 0.998 + tube / S, 0)];
    for (let h = 0.95; h >= 0.6; h -= 0.05) back.push(lie(0, h, -1, tube));
    strand(back, tube, m.tubing);
    // Y-piece, then two spring-steel binaurals ending in ear tips.
    const yoke = lie(0, 0.58, -1, tube);
    fillEllipsoid(grid, yoke[0], yoke[1], yoke[2], 1.1 * u, 1.3 * u, 1.1 * u, () => m.tubing);
    for (const sx of [-1, 1]) {
      const metal = 0.5 * u;
      const arm: [number, number, number][] = [yoke];
      for (let h = 0.5; h >= -0.02; h -= 0.06) arm.push(lie(sx * (0.08 + (0.5 - h) * 0.5), h, -1, metal));
      strand(arm, metal, m.steel);
      const tip = arm[arm.length - 1];
      fillEllipsoid(grid, tip[0], tip[1] - 0.6 * u, tip[2], 1 * u, 1.1 * u, 1 * u, () => m.tubing);
    }
  },
};
