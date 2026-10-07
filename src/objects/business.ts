import type { VoxelGrid } from '../voxel/grid';
import { fbm3, hash3 } from '../voxel/noise';
import type { Palette } from '../voxel/palette';
import {
  fillBox, fillCapsule, fillCylinderY, fillCylinderZ, fillEllipsoid, fillLathe, fillRoundedBox, type Chooser,
} from '../voxel/shapes';
import { materialPalette } from './kit';
import type { VoxelObject } from './types';

/** Natural-tone material index by family name. */
function mid(palette: Palette, name: string): number {
  return palette.tone(palette.id(name), 'mid');
}

/** Flat slab in the X-Y plane, `z0`..`z1` thick, filled where `inside(px, py)` holds for the voxel center. */
function fillProfileZ(
  grid: VoxelGrid,
  x0: number, y0: number, x1: number, y1: number, z0: number, z1: number,
  inside: (px: number, py: number) => boolean,
  choose: Chooser,
): void {
  fillBox(grid, x0, y0, z0, x1, y1, z1, (x, y, z) => (inside(x + 0.5, y + 0.5) ? choose(x, y, z) : 0));
}

/** Distance from point p to segment ab in 2D. */
function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}

const TOWER_GLASS: Record<string, { glass: string; spandrel: string; mullion: string }> = {
  navy: { glass: '#4b76a6', spandrel: '#23364f', mullion: '#cfd4db' },
  gray: { glass: '#74808c', spandrel: '#353a41', mullion: '#25272b' },
  teal: { glass: '#3f8d8a', spandrel: '#1d4847', mullion: '#d6dbdf' },
};

/**
 * A 150 m curtain-wall office tower at 1u = 2.5 m: 40 x 35 m floor plate, 4 m floors, a setback at 100 m and a
 * louvred crown hiding the rooftop plant, on a two-storey stone lobby podium.
 */
export const officeTower: VoxelObject = {
  id: 'office-tower',
  name: 'Office Tower',
  description: 'A glass curtain-wall skyscraper on a stone lobby podium.',
  category: 'business',
  variants: [
    { id: 'navy', name: 'Blue glass', color: '#4b76a6' },
    { id: 'gray', name: 'Smoked glass', color: '#74808c' },
    { id: 'teal', name: 'Green glass', color: '#3f8d8a' },
  ],
  createPalette(variantId: string) {
    const finish = TOWER_GLASS[variantId] ?? TOWER_GLASS.navy;
    return materialPalette('business', {
      glass: finish.glass,
      spandrel: finish.spandrel,
      mullion: finish.mullion,
      lit: { hex: '#ffe2ad', glow: true },
      lobby: '#86a2b3',
      door: '#1c262e',
      stone: '#d6cdbb',
      roof: '#8e8c86',
      plant: '#b8bcc1',
      louvre: '#3a3e44',
      hedge: '#4b7a39',
      beacon: { hex: '#ff3b30', glow: true },
    });
  },
  build(grid, palette, { layout, seed, u, g }) {
    const c = layout.size / 2;
    const r = Math.round;
    const GLASS = mid(palette, 'glass');
    const SPANDREL = mid(palette, 'spandrel');
    const MULLION = mid(palette, 'mullion');
    const LIT = mid(palette, 'lit');
    const LOBBY = mid(palette, 'lobby');
    const DOOR = mid(palette, 'door');
    const STONE = mid(palette, 'stone');
    const ROOF = mid(palette, 'roof');
    const PLANT = mid(palette, 'plant');
    const LOUVRE = mid(palette, 'louvre');
    const HEDGE = mid(palette, 'hedge');

    // Podium: 75 x 60 m, 10 m tall — an 8 m glass lobby between stone piers under a stone fascia.
    const px0 = r(c - 15 * u), px1 = r(c + 15 * u), pz0 = r(c - 12 * u), pz1 = r(c + 12 * u);
    const podiumTop = r(g + 4 * u);
    const lobbyTop = r(g + 3.2 * u);
    const pier = Math.max(3, r(2.4 * u));
    fillBox(grid, px0, g, pz0, px1, podiumTop, pz1, (x, y, z) => {
      const ex = x === px0 || x === px1 - 1;
      const ez = z === pz0 || z === pz1 - 1;
      if (y === podiumTop - 1) return ex || ez ? STONE : ROOF;
      if (!ex && !ez) return STONE;
      if (y >= lobbyTop || (ex && ez)) return STONE;
      const along = ez ? x - px0 : z - pz0;
      if (along % pier === 0) return STONE;
      // Revolving doors in the middle of the front.
      if (z === pz1 - 1 && Math.abs(x + 0.5 - c) < 2.2 * u && y < g + 2.4 * u) return DOOR;
      return LOBBY;
    });
    // Planters along the podium roof edge.
    const hedge = (): number => HEDGE;
    const hy0 = podiumTop;
    const hy1 = podiumTop + Math.max(1, 1.1 * u);
    fillBox(grid, px0 + 1, hy0, pz1 - 1 - Math.max(1, u), px1 - 1, hy1, pz1 - 1, hedge);
    fillBox(grid, px0 + 1, hy0, pz0 + 1, px1 - 1, hy1, pz0 + 1 + Math.max(1, u), hedge);
    fillBox(grid, px0 + 1, hy0, pz0 + 1, px0 + 1 + Math.max(1, u), hy1, pz1 - 1, hedge);
    fillBox(grid, px1 - 1 - Math.max(1, u), hy0, pz0 + 1, px1 - 1, hy1, pz1 - 1, hedge);
    // Entrance canopy, carried on two steel columns at its outer edge.
    const canopyY = g + 2.6 * u;
    fillBox(grid, c - 5 * u, canopyY, pz1, c + 5 * u, canopyY + Math.max(1, 0.5 * u), pz1 + 3 * u, () => MULLION);
    for (const s of [-1, 1]) fillCylinderY(grid, c + s * 4.3 * u, pz1 + 2.4 * u, g, canopyY, Math.max(0.6, 0.5 * u), () => MULLION);

    // Shaft: vision glass between aluminium mullions every 5 m, opaque spandrel at each 4 m floor line.
    const zc = c - 1 * u;
    const floorVox = Math.max(2, r(1.6 * u));
    const bayVox = Math.max(3, r(2 * u));
    const sections = [
      { hx: 8, hz: 7, top: g + 40 * u },
      { hx: 6.8, hz: 5.8, top: g + 52 * u },
    ];
    let y0 = podiumTop;
    let x0 = 0, x1 = 0, z0 = 0, z1 = 0;
    sections.forEach((section, si) => {
      x0 = r(c - section.hx * u); x1 = r(c + section.hx * u);
      z0 = r(zc - section.hz * u); z1 = r(zc + section.hz * u);
      const y1 = r(section.top);
      fillBox(grid, x0, y0, z0, x1, y1, z1, (x, y, z) => {
        const ex = x === x0 || x === x1 - 1;
        const ez = z === z0 || z === z1 - 1;
        if (!ex && !ez) return y === y1 - 1 ? ROOF : SPANDREL;
        if (y === y1 - 1 || (ex && ez)) return MULLION;
        const floor = y - podiumTop;
        if (floor % floorVox === 0) return SPANDREL;
        const along = ez ? x - x0 : z - z0;
        if (along % bayVox === 0) return MULLION;
        const face = ez ? (z === z0 ? 0 : 1) : (x === x0 ? 2 : 3);
        // Some offices still have their lights on.
        return hash3(Math.floor(along / bayVox), Math.floor(floor / floorVox), face + si * 4, seed) < 0.16 ? LIT : GLASS;
      });
      y0 = y1;
    });

    // Crown: a louvred screen wall around the rooftop plant.
    const crownTop = r(g + 55.5 * u);
    const cx0 = x0 + 1, cx1 = x1 - 1, cz0 = z0 + 1, cz1 = z1 - 1;
    fillBox(grid, cx0, y0, cz0, cx1, crownTop, cz1, (x, y, z) => {
      const edge = x === cx0 || x === cx1 - 1 || z === cz0 || z === cz1 - 1;
      if (!edge) return 0;
      return y === crownTop - 1 || (y - y0) % 2 === 1 ? MULLION : LOUVRE;
    });
    // Plant: lift overrun and two cooling units with fan decks.
    const plant = (): number => PLANT;
    const coreTop = y0 + 3.6 * u;
    fillBox(grid, c - 2 * u, y0, zc - 3 * u, c + 2 * u, coreTop, zc + 0.5 * u, plant);
    for (const s of [-1, 1]) {
      const ux = c + s * 3.8 * u;
      fillBox(grid, ux - 1.3 * u, y0, zc - 3.6 * u, ux + 1.3 * u, y0 + 2.4 * u, zc + 3.6 * u, plant);
      for (const fz of [-1.8, 1.8]) fillCylinderY(grid, ux, zc + fz * u, y0 + 2.4 * u, y0 + 2.4 * u + 1, 0.95 * u, () => LOUVRE);
    }
    // Antenna mast with an aircraft warning light.
    const mastTop = g + 61 * u;
    fillCylinderY(grid, c, zc - 1.2 * u, coreTop, mastTop, Math.max(0.7, 0.55 * u), () => MULLION);
    fillEllipsoid(grid, c, mastTop, zc - 1.2 * u, Math.max(0.9, 0.8 * u), Math.max(0.9, 0.8 * u), Math.max(0.9, 0.8 * u), () => mid(palette, 'beacon'));
  },
};

const LEATHER: Record<string, { leather: string; thread: string; metal: string }> = {
  brown: { leather: '#6e4327', thread: '#e0c89a', metal: '#c9a548' },
  black: { leather: '#232326', thread: '#8d8d8d', metal: '#c3c8cf' },
  blue: { leather: '#1f3d70', thread: '#d9dde3', metal: '#c9a548' },
};

/**
 * A hard-sided leather attaché case at 1u = 1 cm: 45 x 33 x 11 cm, standing on four studs on its bottom edge,
 * with a metal valance at the lid seam, two latches either side of the handle and saddle-stitched faces.
 */
export const briefcase: VoxelObject = {
  id: 'briefcase',
  name: 'Briefcase',
  description: 'A leather attaché case with brass latches and a stitched face.',
  category: 'business',
  variants: [
    { id: 'brown', name: 'Saddle leather', color: '#6e4327' },
    { id: 'black', name: 'Black leather', color: '#232326' },
    { id: 'blue', name: 'Navy leather', color: '#1f3d70' },
  ],
  createPalette(variantId: string) {
    const finish = LEATHER[variantId] ?? LEATHER.brown;
    return materialPalette('business', { leather: finish.leather, thread: finish.thread, metal: finish.metal, rubber: '#1b1b1d' });
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    const LEATHER_M = mid(palette, 'leather');
    const THREAD = mid(palette, 'thread');
    const METAL = mid(palette, 'metal');
    const leather = (): number => LEATHER_M;
    const metal = (): number => METAL;

    const hx = 22.5 * u;
    const hz = 5.5 * u;
    const bottom = g + 1 * u;
    const top = g + 34 * u;
    // Shell with rounded corners and edges.
    fillRoundedBox(grid, c - hx, bottom, c - hz, c + hx, top, c + hz, 1.8 * u, leather);

    // Metal valance around the edge at the lid seam (lid is the front 4 cm).
    const seamZ = c + 1.5 * u;
    const grow = Math.max(0.6, 0.35 * u);
    const corner = 1.8 * u + grow;
    fillProfileZ(grid, c - hx - grow, bottom - grow, c + hx + grow, top + grow, seamZ - Math.max(0.5, 0.5 * u), seamZ + Math.max(0.5, 0.5 * u), (px, py) => {
      const qx = Math.max(0, Math.abs(px - c) - (hx + grow - corner));
      const qy = Math.max(0, Math.abs(py - (bottom + top) / 2) - ((top - bottom) / 2 + grow - corner));
      return qx * qx + qy * qy <= corner * corner;
    }, metal);

    // Saddle stitching inset 2 cm from the edge of both faces: dashed thread on the outermost voxels.
    const inset = 2 * u;
    const sx = hx - inset;
    const sy = (top - bottom) / 2 - inset;
    const yc = (bottom + top) / 2;
    const sr = 1.4 * u;
    for (let y = Math.floor(bottom); y < Math.ceil(top); y++) {
      for (let x = Math.floor(c - hx); x < Math.ceil(c + hx); x++) {
        const qx = Math.max(0, Math.abs(x + 0.5 - c) - (sx - sr));
        const qy = Math.max(0, Math.abs(y + 0.5 - yc) - (sy - sr));
        const onLine = Math.abs(Math.hypot(qx, qy) - sr) < 0.5;
        if (!onLine || (x + y) % 3 === 2) continue;
        for (const dir of [1, -1]) {
          let z = dir > 0 ? Math.ceil(c + hz) : Math.floor(c - hz);
          while (z !== Math.round(c) && !grid.solid(x, y, z)) z -= dir;
          if (grid.get(x, y, z) === LEATHER_M) grid.set(x, y, z, THREAD);
        }
      }
    }

    // Brass studs on the bottom edge carry the case.
    for (const fx of [-18, 18]) {
      for (const fz of [-3, 3]) fillCylinderY(grid, c + fx * u, c + fz * u, g, bottom + 0.5, Math.max(0.8, 1 * u), metal);
    }
    // Latches either side of the handle, straddling the seam on the top edge.
    for (const s of [-1, 1]) {
      const lx = c + s * 13 * u;
      fillRoundedBox(grid, lx - 2 * u, top - 0.6 * u, seamZ - 2.2 * u, lx + 2 * u, top + Math.max(1, 0.9 * u), seamZ + 2.2 * u, 0.5 * u, metal);
    }
    // Handle: rounded leather grip on two metal loops.
    const ringH = Math.max(1, 1.4 * u);
    for (const s of [-1, 1]) {
      fillBox(grid, c + s * 6.2 * u - 0.7 * u, top - 0.5, seamZ - 0.7 * u, c + s * 6.2 * u + 0.7 * u, top + ringH, seamZ + 0.7 * u, metal);
    }
    const hr = Math.max(0.8, 0.9 * u);
    const hy = top + ringH + 2.8 * u;
    fillCapsule(grid, c - 6.2 * u, top + ringH, seamZ, c - 4.6 * u, hy, seamZ, hr, hr, leather);
    fillCapsule(grid, c - 4.6 * u, hy, seamZ, c + 4.6 * u, hy, seamZ, hr * 1.15, hr * 1.15, leather);
    fillCapsule(grid, c + 4.6 * u, hy, seamZ, c + 6.2 * u, top + ringH, seamZ, hr, hr, leather);
  },
};

const BAG: Record<string, { cloth: string; inner: string; ink: string; rope: string; ropeShade: string }> = {
  green: { cloth: '#5f7b4b', inner: '#43573a', ink: '#efe9da', rope: '#c8a46c', ropeShade: '#9b7a4c' },
  gold: { cloth: '#b38f5c', inner: '#86683f', ink: '#2e5a33', rope: '#d9bf8a', ropeShade: '#a88d5c' },
  purple: { cloth: '#56296f', inner: '#3a1b4b', ink: '#e2bb4c', rope: '#e2bb4c', ropeShade: '#b08a2a' },
};

/** "$" glyph, 7 x 10 cells, top row first. */
const DOLLAR = [
  '...#...',
  '.#####.',
  '##.#.##',
  '##.#...',
  '.####..',
  '..####.',
  '...#.##',
  '##.#.##',
  '.#####.',
  '...#...',
];

/**
 * A full sack of coins at 1u = 1 cm: a 44 cm canvas bag slumped wide under its weight, gathered and tied at the
 * neck with a jute rope, with 40 mm gold coins stacked and spilled around it.
 */
export const moneyBag: VoxelObject = {
  id: 'money-bag',
  name: 'Money Bag',
  description: 'A tied canvas money sack with stacks of gold coins.',
  category: 'business',
  variants: [
    { id: 'green', name: 'Bank canvas', color: '#5f7b4b' },
    { id: 'gold', name: 'Burlap', color: '#b38f5c' },
    { id: 'purple', name: 'Velvet', color: '#56296f' },
  ],
  createPalette(variantId: string) {
    const finish = BAG[variantId] ?? BAG.green;
    return materialPalette('business', {
      cloth: finish.cloth, inner: finish.inner, ink: finish.ink, rope: finish.rope, ropeShade: finish.ropeShade,
      gold: '#e9b73a', goldEdge: '#b98a1e',
    });
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    const CLOTH = mid(palette, 'cloth');
    const INNER = mid(palette, 'inner');
    const INK = mid(palette, 'ink');
    const ROPE = mid(palette, 'rope');
    const ROPE_SHADE = mid(palette, 'ropeShade');
    const GOLD = mid(palette, 'gold');
    const GOLD_EDGE = mid(palette, 'goldEdge');

    const squash = 0.86;
    const neck = 4.6;
    // Radius (cm) of the bag at height h (cm) before folds; 0 above the frill.
    const radius = (h: number): number => {
      if (h < 11) return 19 * Math.sqrt(Math.max(0, 1 - ((11 - h) / 18) ** 2));
      if (h < 33) return neck + 14.4 * Math.cos(((h - 11) / 22) * Math.PI / 2) ** 1.3;
      if (h < 36.5) return neck;
      return neck + (h - 36.5) * 0.75;
    };
    const glyphCell = 1.45;
    const glyphTop = 22.5;
    for (let y = g; y < g + Math.ceil(45 * u); y++) {
      const h = (y + 0.5 - g) / u;
      const base = radius(h);
      for (let z = Math.floor(c - 20 * u); z <= Math.ceil(c + 20 * u); z++) {
        for (let x = Math.floor(c - 20 * u); x <= Math.ceil(c + 20 * u); x++) {
          const dx = (x + 0.5 - c) / u;
          const dz = (z + 0.5 - c) / u / squash;
          const d = Math.hypot(dx, dz);
          const a = Math.atan2(dz, dx);
          // Gathered creases running up into the neck, deeper pleats in the frill above the tie.
          const crease = h > 36.5 ? 0.18 * Math.sin(11 * a) : h > 22 ? Math.min(1, (h - 22) / 11) * 0.08 * Math.sin(9 * a + 0.6) : 0;
          const lumps = h < 33 ? (fbm3(dx * 0.16, h * 0.16, dz * 0.16, 5) - 0.5) * 0.09 : 0;
          const outer = base * (1 + crease + lumps);
          if (d > outer) continue;
          if (h > 36.5) {
            if (h > 41.5 + 2.2 * Math.sin(7 * a) + 0.8 * Math.sin(3 * a + 1)) continue;
            if (h > 38.5 && d < outer - 1.3) continue;
            grid.set(x, y, z, h > 38.5 && d < outer - 0.6 ? INNER : CLOTH);
            continue;
          }
          let material = CLOTH;
          // Printed "$" on the front, on the outermost layer of cloth.
          const front = (z + 0.5 - c) / u;
          const surfaceZ = squash * Math.sqrt(Math.max(0, outer * outer - dx * dx));
          if (front > 0 && (surfaceZ - front) * u < 1.6) {
            const col = Math.floor(dx / glyphCell + 3.5);
            const row = Math.floor((glyphTop - h) / glyphCell);
            if (row >= 0 && row < DOLLAR.length && col >= 0 && col < 7 && DOLLAR[row][col] === '#') material = INK;
          }
          grid.set(x, y, z, material);
        }
      }
    }

    // Jute rope tied around the gathered neck, twisted, with a knot and two loose ends hanging down the front.
    const ropeY = 34.8;
    const ropeR = neck + 1.1;
    fillBox(grid, c - 9 * u, g + 32 * u, c - 9 * u, c + 9 * u, g + 38 * u, c + 9 * u, (x, y, z) => {
      const dx = (x + 0.5 - c) / u;
      const dz = (z + 0.5 - c) / u / squash;
      const ring = Math.hypot(dx, dz) - ropeR;
      const dy = (y + 0.5 - g) / u - ropeY;
      if (ring * ring + dy * dy > 1.25 * 1.25) return 0;
      const twist = Math.floor(Math.atan2(dz, dx) * 6 + dy * 1.6);
      return twist % 2 === 0 ? ROPE : ROPE_SHADE;
    });
    const surfaceFront = (dx: number, h: number): number => c + (squash * Math.sqrt(Math.max(0, radius(h) ** 2 - dx * dx)) + 0.9) * u;
    const knotZ = surfaceFront(0, ropeY) + 0.4 * u;
    const rope = (): number => ROPE;
    fillEllipsoid(grid, c + 0.6 * u, g + ropeY * u, knotZ, 1.9 * u, 1.6 * u, 1.5 * u, rope);
    // Each loose end drapes down the cloth, following the surface.
    for (const [ex, endH] of [[-1.8, 27.5], [2.8, 26]]) {
      let px = c + 0.6 * u;
      let py = g + ropeY * u;
      let pz = knotZ;
      for (let h = ropeY - 1; h >= endH; h -= 1) {
        const t = (ropeY - h) / (ropeY - endH);
        const dx = 0.6 + (ex - 0.6) * t;
        const nz = surfaceFront(dx, h);
        fillCapsule(grid, px, py, pz, c + dx * u, g + h * u, nz, 0.95 * u, 0.95 * u, rope);
        px = c + dx * u; py = g + h * u; pz = nz;
      }
    }

    // Coin stacks: 40 mm coins, alternating face and rim tone so each coin reads, slightly out of line.
    const coinR = 2.3 * u;
    const stacks: [number, number, number][] = [[17, 16, 12], [23, 6, 7], [-18, 17, 9], [8, 22, 5], [-24, 3, 15]];
    stacks.forEach(([sx, sz, height], si) => {
      const coins = Math.max(2, Math.round(height * u));
      for (let i = 0; i < coins; i++) {
        const jx = (hash3(si, i, 0, 911) - 0.5) * 0.5 * u;
        const jz = (hash3(si, i, 1, 911) - 0.5) * 0.5 * u;
        const tone = i === coins - 1 || i % 2 === 0 ? GOLD : GOLD_EDGE;
        fillCylinderY(grid, c + sx * u + jx, c + sz * u + jz, g + i, g + i + 1, coinR, () => tone);
      }
    });
    // Loose coins lying flat where they fell, each resting on whatever is below it.
    const loose: [number, number][] = [[-4, 21], [0, 23.5], [2.5, 20.5], [-8.5, 22.5], [12, 24.3], [-1.5, 22.2], [-12, 20]];
    for (const [lx, lz] of loose) {
      const cx = c + lx * u;
      const cz = c + lz * u;
      let rest = g;
      for (let z = Math.floor(cz - coinR); z <= Math.ceil(cz + coinR); z++) {
        for (let x = Math.floor(cx - coinR); x <= Math.ceil(cx + coinR); x++) {
          if (Math.hypot(x + 0.5 - cx, z + 0.5 - cz) <= coinR) rest = Math.max(rest, grid.topY(x, z) + 1);
        }
      }
      fillCylinderY(grid, cx, cz, rest, rest + 1, coinR, () => GOLD);
    }
  },
};

const CART_PLASTIC: Record<string, string> = { blue: '#1f5fbf', red: '#c62828', teal: '#14857f' };

/**
 * A supermarket trolley at 1u = 2 cm: 96 cm long, 54 cm wide, handle at 100 cm. Zinc-plated wire basket tapered
 * for nesting, folding child-seat flap on the back gate, lower tray and four 125 mm swivel casters.
 */
export const shopCart: VoxelObject = {
  id: 'shop-cart',
  name: 'Shop Cart',
  description: 'A wire supermarket trolley loaded with groceries.',
  category: 'business',
  variants: [
    { id: 'blue', name: 'Blue trim', color: '#1f5fbf' },
    { id: 'red', name: 'Red trim', color: '#c62828' },
    { id: 'teal', name: 'Teal trim', color: '#14857f' },
  ],
  createPalette(variantId: string) {
    return materialPalette('business', {
      wire: '#c4c9d0',
      plastic: CART_PLASTIC[variantId] ?? CART_PLASTIC.blue,
      rubber: '#2b2d31',
      hub: '#8f959d',
      cereal: '#e8b42a', print: '#c33a2e',
      milk: '#f1f1ec', milkBand: '#2f6fc0',
      crust: '#b8743a', baguette: '#d39b52',
      bottle: '#2e6b3f', label: '#efe5cc', cap: '#b52a2a',
      apple: '#c0392b',
    });
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    const k = u / 2; // voxels per cm
    const ox = c + 3 * k;
    const X = (cm: number): number => ox + cm * k;
    const Y = (cm: number): number => g + cm * k;
    const Z = (cm: number): number => c + cm * k;
    const WIRE = mid(palette, 'wire');
    const PLASTIC = mid(palette, 'plastic');
    const wireM = (): number => WIRE;
    const plastic = (): number => PLASTIC;
    const wire = Math.max(2, 1.05 / k); // wire gauge in cm (at least one voxel)
    const tube = Math.max(1.25, 0.6 / k); // frame tube radius in cm

    // Basket: floor at 48 cm, rim at 88 cm, vertical back gate, front sloping out; 54 cm wide at the back, 44 at the front.
    const yb = 48, yt = 88, xb = -42, xFront = 44;
    const xf = (py: number): number => 26 + (py - yb) * (18 / 40);
    const hw = (px: number): number => 27 - 5 * (px - xb) / (xFront - xb);
    const on = (v: number, pitch: number, offset = 0): boolean => (((v - offset) % pitch) + pitch) % pitch < wire;
    fillBox(grid, X(xb - 1), Y(yb - 1), Z(-28), X(xFront + 1), Y(yt + 1), Z(28), (x, y, z) => {
      const px = (x + 0.5 - ox) / k;
      const py = (y + 0.5 - g) / k;
      const pz = (z + 0.5 - c) / k;
      if (py < yb || py > yt || px < xb || px > xf(py) || Math.abs(pz) > hw(px)) return 0;
      const dSide = hw(px) - Math.abs(pz);
      const dBack = px - xb;
      const dFront = (xf(py) - px) * 0.91;
      const dBottom = py - yb;
      const walls = [dSide, dBack, dFront, dBottom].filter((d) => d < wire).length;
      if (walls === 0) return 0;
      // Rolled top rim and the edges where panels meet are the heavy frame wires.
      if ((yt - py < tube * 2 && Math.min(dSide, dBack, dFront) < wire) || walls > 1) return WIRE;
      if (dBottom < wire) return on(pz, 6, 1) || on(px, 13, xb) ? WIRE : 0;
      if (dSide < wire) return on(px, 6, xb) || on(py, 13, yb) ? WIRE : 0;
      return on(pz, 6, 1) || on(py, 13, yb) ? WIRE : 0;
    });
    // Child seat flap folded flat against the inside of the back gate.
    fillRoundedBox(grid, X(xb) + wire * k, Y(62), Z(-15), X(xb) + wire * k + Math.max(1, 2 * k), Y(86), Z(15), 1.5 * k, plastic);
    // Bumper caps on the front corners of the rim.
    for (const s of [-1, 1]) {
      fillRoundedBox(grid, X(xFront - 5), Y(yt - 4), Z(s * hw(xFront) - 3), X(xFront + 1.5), Y(yt + 1.5), Z(s * hw(xFront) + 3), 1.2 * k, plastic);
    }

    // Chassis: rear legs rising into the handle, base rails, cross bars, front basket struts, lower tray.
    const R = tube * k;
    const railZ = (px: number): number => 22 - 5 * (px + 38) / 72;
    for (const s of [-1, 1]) {
      fillCapsule(grid, X(-38), Y(13), Z(s * 25), X(-50), Y(99), Z(s * 25), R, R, wireM);
      fillCapsule(grid, X(-38), Y(13), Z(s * railZ(-38)), X(34), Y(13), Z(s * railZ(34)), R, R, wireM);
      fillCapsule(grid, X(24), Y(13), Z(s * railZ(24)), X(24), Y(yb), Z(s * (hw(24) - 1)), R, R, wireM);
      fillCapsule(grid, X(xb), Y(86), Z(s * 25), X(-48.2), Y(86), Z(s * 25), R, R, wireM);
    }
    fillCapsule(grid, X(-38), Y(13), Z(-25), X(-38), Y(13), Z(25), R, R, wireM);
    fillCapsule(grid, X(34), Y(13), Z(-railZ(34)), X(34), Y(13), Z(railZ(34)), R, R, wireM);
    fillBox(grid, X(-36), Y(13) - wire * k / 2, Z(-22), X(32), Y(13) + wire * k / 2, Z(22), (x, y, z) => {
      const px = (x + 0.5 - ox) / k;
      const pz = (z + 0.5 - c) / k;
      if (Math.abs(pz) > railZ(px)) return 0;
      return on(pz, 6, 1) || on(px, 13, -36) ? WIRE : 0;
    });
    // Handle bar with a plastic grip.
    fillCapsule(grid, X(-50.5), Y(99.5), Z(-26), X(-50.5), Y(99.5), Z(26), R, R, wireM);
    fillCylinderZ(grid, X(-50.5), Y(99.5), Z(-21), Z(21), 2.2 * k, plastic);

    // 125 mm swivel casters: rubber tyre, grey hub, fork plates and a swivel plate under the rail.
    const RUBBER = mid(palette, 'rubber');
    const HUB = mid(palette, 'hub');
    const wheelR = 6.25;
    for (const [wx, wz] of [[-38, -22], [-38, 22], [34, -17], [34, 17]]) {
      const cx = X(wx);
      const cz = Z(wz);
      const half = 1.5 * k;
      fillCylinderZ(grid, cx, Y(wheelR), cz - half, cz + half, wheelR * k, () => RUBBER);
      fillCylinderZ(grid, cx, Y(wheelR), cz - half - 1, cz + half + 1, 2.4 * k, () => HUB);
      for (const s of [-1, 1]) {
        const fz = cz + s * (half + 1);
        fillBox(grid, cx - 2 * k, Y(wheelR), Math.min(fz, fz + s), cx + 2 * k, Y(12), Math.max(fz, fz + s), () => HUB);
      }
      fillBox(grid, cx - 3.5 * k, Y(11), cz - half - 2, cx + 3.5 * k, Y(13), cz + half + 2, () => HUB);
    }

    // Groceries standing on the basket floor.
    const floor = yb + wire;
    const m = (name: string): (() => number) => {
      const material = mid(palette, name);
      return () => material;
    };
    const CEREAL = mid(palette, 'cereal');
    const PRINT = mid(palette, 'print');
    fillBox(grid, X(-34), Y(floor), Z(-20), X(-14), Y(floor + 30), Z(-13), (x, y) => {
      const px = (x + 0.5 - ox) / k;
      const py = (y + 0.5 - g) / k;
      return px > -31 && px < -17 && py > floor + 12 && py < floor + 23 ? PRINT : CEREAL;
    });
    const MILK = mid(palette, 'milk');
    const BAND = mid(palette, 'milkBand');
    fillBox(grid, X(-9), Y(floor), Z(-21), X(1), Y(floor + 27), Z(-11), (x, y) => {
      const py = (y + 0.5 - g) / k;
      const px = (x + 0.5 - ox) / k;
      if (py > floor + 21 && Math.abs(px + 4) > 5 * (floor + 27 - py) / 6) return 0; // gable top
      return py > floor + 8 && py < floor + 15 ? BAND : MILK;
    });
    fillRoundedBox(grid, X(4), Y(floor), Z(-2), X(20), Y(floor + 11), Z(12), 3.5 * k, m('crust'));
    const BOTTLE = mid(palette, 'bottle');
    const LABEL = mid(palette, 'label');
    const bx = X(-29);
    const bz = Z(6);
    fillLathe(grid, bx, bz, Y(floor), Y(floor + 29), (t) => (t < 0.62 ? 3.8 * k : t < 0.8 ? (3.8 - (t - 0.62) / 0.18 * 2.4) * k : 1.4 * k), (x, y) => {
      const py = (y + 0.5 - g) / k - floor;
      return py > 6 && py < 14 ? LABEL : BOTTLE;
    });
    fillCylinderY(grid, bx, bz, Y(floor + 29), Y(floor + 31), Math.max(0.8, 1.6 * k), m('cap'));
    const apple = m('apple');
    const ar = 4;
    const apples: [number, number][] = [[8, -16], [16.5, -14], [11, -8.5]];
    for (const [ax, az] of apples) fillEllipsoid(grid, X(ax), Y(floor + ar), Z(az), ar * k, ar * k, ar * k, apple);
    fillEllipsoid(grid, X(11.8), Y(floor + ar + 6.3), Z(-12.8), ar * k, ar * k, ar * k, apple);
    // Baguette leaning from the floor onto the back gate rim.
    fillCapsule(grid, X(20), Y(floor + 3), Z(18), X(-47), Y(94.1), Z(18), 3 * k, 3 * k, m('baguette'));
  },
};

const CHART: Record<string, { bars: string[]; arrow: string }> = {
  green: { bars: ['#86c993', '#62b373', '#43a056', '#2c8a42', '#1d7033'], arrow: '#f0b232' },
  blue: { bars: ['#8fb4ea', '#6a97de', '#4a7bd0', '#3061b8', '#214a96'], arrow: '#f07a2e' },
  purple: { bars: ['#c3a6ea', '#a684de', '#8b63d0', '#7047b8', '#56329a'], arrow: '#f0b232' },
};

/**
 * A desk-sculpture bar chart at 1u = 1 cm: five acrylic bars rising 12 to 42 cm on a 48 x 24 cm slate base, with a
 * growth arrow fixed to the bar fronts and its head resting on the tallest bar.
 */
export const growthChart: VoxelObject = {
  id: 'growth-chart',
  name: 'Growth Chart',
  description: 'A 3D bar chart sculpture with a rising arrow.',
  category: 'business',
  variants: [
    { id: 'green', name: 'Green bars', color: '#43a056' },
    { id: 'blue', name: 'Blue bars', color: '#4a7bd0' },
    { id: 'purple', name: 'Purple bars', color: '#8b63d0' },
  ],
  createPalette(variantId: string) {
    const finish = CHART[variantId] ?? CHART.green;
    const [b0, b1, b2, b3, b4] = finish.bars;
    return materialPalette('business', { base: '#2d3036', edge: '#a8adb4', b0, b1, b2, b3, b4, arrow: finish.arrow });
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    const baseTop = g + 2.5 * u;
    fillRoundedBox(grid, c - 24 * u, g, c - 12 * u, c + 24 * u, baseTop, c + 12 * u, 0.8 * u, () => mid(palette, 'base'));
    // Brushed-metal axis line along the front of the base.
    fillBox(grid, c - 22 * u, baseTop - 0.5, c + 8.5 * u, c + 22 * u, baseTop + Math.max(0.6, 0.4 * u), c + 9.5 * u, () => mid(palette, 'edge'));

    const heights = [12, 18, 24, 32, 42];
    const barZ0 = c - 6 * u;
    const barZ1 = c + 4 * u;
    heights.forEach((h, i) => {
      const bx = c + (i - 2) * 9 * u;
      const material = mid(palette, `b${i}`);
      fillRoundedBox(grid, bx - 3 * u, baseTop - 1, barZ0, bx + 3 * u, baseTop + h * u, barZ1, 0.7 * u, () => material);
    });

    // Arrow: a 2.6 cm band, 2.4 cm deep, glued to the bar fronts; a dip at the third bar, head on the tallest.
    const pts: [number, number][] = [[-21, 8], [-9, 14], [0, 12], [9, 21], [18, 30], [20.4, 33.2]];
    const ARROW = mid(palette, 'arrow');
    const half = 1.3;
    const ex = pts[5][0] - pts[4][0];
    const ey = pts[5][1] - pts[4][1];
    const len = Math.hypot(ex, ey);
    const dx = ex / len;
    const dy = ey / len;
    const headLen = 7;
    const headHalf = 4;
    const [hx, hy] = pts[5];
    const inside = (px: number, py: number): boolean => {
      const lx = (px - c) / u;
      const ly = (py - baseTop) / u;
      for (let i = 0; i < pts.length - 1; i++) {
        if (segmentDistance(lx, ly, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) <= half) return true;
      }
      // Triangular head beyond the shaft end.
      const along = (lx - hx) * dx + (ly - hy) * dy;
      const across = Math.abs(-(lx - hx) * dy + (ly - hy) * dx);
      return along >= 0 && along <= headLen && across <= headHalf * (1 - along / headLen);
    };
    fillProfileZ(grid, c - 25 * u, baseTop, c + 27 * u, baseTop + 44 * u, barZ1, barZ1 + 2.4 * u, inside, () => ARROW);
  },
};
