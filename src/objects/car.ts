import { fillBox, fillCylinderX, fillCylinderY, fillRoundedBox } from '../voxel/shapes';
import { materialPalette, solid } from './kit';
import type { ObjectVariant, VoxelObject } from './types';
import { curve, wheelZ } from './vehicle-parts';

const PAINTS: Record<string, string> = {
  red: '#b5121b',
  blue: '#1f4fa8',
  yellow: '#f0b400',
  white: '#e9ebef',
};

const VARIANTS: ObjectVariant[] = [
  { id: 'red', name: 'Racing red', color: PAINTS.red },
  { id: 'blue', name: 'Cobalt', color: PAINTS.blue },
  { id: 'yellow', name: 'Sun yellow', color: PAINTS.yellow },
  { id: 'white', name: 'Pearl', color: PAINTS.white },
];

// Fastback sports coupe, in meters: 4.50 long, 1.85 wide, 1.30 tall, 2.65 wheelbase, 0.68 wheels.
const LENGTH = 4.5;
const HALF_WIDTH = 0.925;
const AXLES = [0.95, 3.6];
const WHEEL_R = 0.34;
/** Top of the body shell (deck, fenders, hood) along the car, rear (0) to nose (4.5). */
const BELT = curve([[0, 0.5], [0.08, 0.78], [0.35, 0.86], [1.0, 0.9], [3.2, 0.9], [3.9, 0.8], [4.35, 0.7], [4.5, 0.5]]);
/** Underside of the body: bumpers curl up at both ends. */
const SILL = curve([[0, 0.34], [0.25, 0.2], [4.15, 0.16], [4.5, 0.3]]);
/** Roofline over the cabin: fastback rear glass, flat roof, raked windshield. 0 = no cabin. */
const ROOF = curve([[0.95, 0.9], [1.95, 1.27], [2.55, 1.3], [3.25, 0.9]]);
const CABIN = [1.0, 3.22];

export const car: VoxelObject = {
  id: 'car',
  name: 'Sports Car',
  description: 'A fastback coupe on a lamp-lit plaza.',
  category: 'vehicles',
  variants: VARIANTS,
  createPalette(variantId) {
    return materialPalette('vehicles', {
      paint: PAINTS[variantId] ?? PAINTS.red,
      trim: '#16171a',
      rubber: '#1b1c1f',
      alloy: '#b9c0c9',
      chrome: '#d9dee5',
      glass: '#24384a',
      cabin: '#0d1013',
      lamp: { hex: '#fff3c8', glow: true },
      tail: { hex: '#e3101f', glow: true },
      amber: { hex: '#ff9a1a', glow: true },
      plate: '#f2f2ee',
      cone: '#ff6a10',
      reflect: '#f4f4f4',
      pole: '#2b2e33',
    });
  },
  build(grid, palette, { layout, u, g }) {
    const c = layout.size / 2;
    const k = 10.6 * u;
    const m = (name: string): number => palette.tone(palette.id(name), 'mid');
    const PAINT = m('paint');
    const TRIM = m('trim');
    const GLASS = m('glass');
    const CABIN_DARK = m('cabin');
    const LAMP = m('lamp');
    const TAIL = m('tail');
    const AMBER = m('amber');
    const CHROME = m('chrome');
    const PLATE = m('plate');
    const x0 = c - (LENGTH * k) / 2;
    const between = (v: number, a: number, b: number): boolean => v >= a && v < b;

    for (let y = g; y < g + Math.ceil(1.4 * k); y++) {
      for (let z = Math.floor(c - HALF_WIDTH * k - 2); z <= Math.ceil(c + HALF_WIDTH * k + 2); z++) {
        for (let x = Math.floor(x0 - 1); x <= Math.ceil(x0 + LENGTH * k + 1); x++) {
          const mx = (x + 0.5 - x0) / k;
          const my = (y + 0.5 - g) / k;
          const mz = Math.abs(z + 0.5 - c) / k;
          if (mx < 0 || mx > LENGTH) continue;

          // Wheel wells: leave room for the wheels, with a dark liner deep inside.
          const arch = AXLES.some((ax) => Math.hypot(mx - ax, my - WHEEL_R) < WHEEL_R + 0.07 && mz > 0.5);
          if (arch) continue;

          const belt = BELT(mx);
          const sill = SILL(mx);
          // Plan view: rounded corners; section: tucked under, rolled shoulders.
          const end = Math.min(mx, LENGTH - mx);
          const R = 0.45;
          let half = HALF_WIDTH - (end < R ? R - Math.sqrt(R * R - (R - end) * (R - end)) : 0);
          if (my < 0.32) half -= (0.32 - my) * 0.6;
          if (my > belt - 0.14) half -= (my - (belt - 0.14)) * 1.3;

          let mat = 0;
          if (my >= sill && my < belt && mz <= half) {
            mat = PAINT;
            const skin = mz > half - 0.06;
            // Lower valance, rear diffuser and side sills in black trim.
            if (my < sill + 0.07) mat = TRIM;
            if (mx > 4.36 && between(my, 0.22, 0.43) && mz < 0.62) mat = TRIM;
            if (mx > 4.3 && between(my, 0.6, 0.7) && between(mz, 0.42, 0.8)) mat = LAMP;
            if (mx > 4.4 && between(my, 0.3, 0.36) && between(mz, 0.66, 0.78)) mat = AMBER;
            if (mx < 0.1 && between(my, 0.68, 0.76) && mz < 0.84) mat = TAIL;
            if (mx < 0.12 && between(my, 0.42, 0.55) && mz < 0.26) mat = PLATE;
            if (mx < 0.3 && my < 0.3 && mz < 0.75) mat = TRIM;
            // Door shut lines, door handle and side intake ahead of the rear wheel.
            if (skin && between(my, 0.3, belt - 0.04)) {
              if (Math.abs(mx - 1.62) < 0.025 || Math.abs(mx - 2.98) < 0.025) mat = TRIM;
              if (between(mx, 1.72, 1.86) && between(my, 0.78, 0.82)) mat = CHROME;
              if (between(mx, 1.35, 1.55) && between(my, 0.42, 0.6)) mat = TRIM;
            }
          } else if (between(mx, CABIN[0], CABIN[1]) && my >= belt && my < ROOF(mx)) {
            const roof = ROOF(mx);
            const cabinHalf = 0.74 - (my - belt) * 0.42 - Math.max(0, mx - 2.95) * 0.5;
            if (mz > cabinHalf) continue;
            mat = PAINT;
            const sideGlass = mz > cabinHalf - 0.06 && between(my, belt + 0.04, roof - 0.07)
              && between(mx, 1.35, 3.0) && Math.abs(mx - 2.1) > 0.04;
            const sloped = my > roof - 0.09 && mz < cabinHalf - 0.07;
            const windshield = sloped && mx > 2.6;
            const rearGlass = sloped && mx < 1.92 && mx > 1.08;
            if (sideGlass || windshield || rearGlass) mat = GLASS;
            if (mz < cabinHalf - 0.12 && my < roof - 0.12) mat = CABIN_DARK;
          }
          if (mat) grid.set(x, y, z, mat);
        }
      }
    }

    // Wheel-well liners, then the wheels: 0.68 m tires on 19" five-spoke alloys.
    const wheelMats = { tire: m('rubber'), rim: m('alloy'), dark: TRIM };
    for (const ax of AXLES) {
      const wx = x0 + ax * k;
      for (const s of [-1, 1] as const) {
        fillCylinderZ2(grid, wx, g + WHEEL_R * k, c + s * 0.52 * k, c + s * 0.58 * k, (WHEEL_R + 0.07) * k, TRIM);
        wheelZ(grid, wheelMats, wx, g + WHEEL_R * k, c + s * 0.9 * k, s > 0 ? -1 : 1, WHEEL_R * k, 0.25 * k, 0.24 * k);
      }
    }
    // Side mirrors on the doors, twin exhaust tips under the diffuser.
    for (const s of [-1, 1] as const) {
      const zIn = c + s * 0.68 * k;
      const zOut = c + s * 0.98 * k;
      fillRoundedBox(grid, x0 + 3.0 * k, g + 0.93 * k, Math.min(zIn, zOut), x0 + 3.16 * k, g + 1.05 * k, Math.max(zIn, zOut), 0.04 * k, () => PAINT);
      fillCylinderX(grid, g + 0.24 * k, c + s * 0.48 * k, x0 - 0.05 * k, x0 + 0.2 * k, 0.05 * k + 0.5, () => CHROME);
    }

    // Two traffic cones and a street lamp at the edge of the plaza.
    const CONE = m('cone');
    const REFLECT = m('reflect');
    for (const [sx, sz] of [[28, 22], [30, 9]]) {
      const cx = c + sx * u;
      const cz = c + sz * u;
      fillBox(grid, cx - 2.2 * u, g, cz - 2.2 * u, cx + 2.2 * u, g + 0.6 * u, cz + 2.2 * u, () => TRIM);
      const h = 7.4 * u;
      for (let y = Math.floor(g + 0.6 * u); y < g + h; y++) {
        const t = (y + 0.5 - g) / h;
        const band = between(t, 0.45, 0.62);
        fillCylinderY(grid, cx, cz, y, y + 1, (1.7 - t * 1.25) * u, () => (band ? REFLECT : CONE));
      }
    }
    const POLE = m('pole');
    const lampX = c + 27 * u;
    const lampZ = c + 30 * u;
    fillCylinderY(grid, lampX, lampZ, g, g + 1.5 * u, 1.6 * u, () => POLE);
    fillCylinderY(grid, lampX, lampZ, g, g + 42 * u, 0.75 * u, () => POLE);
    fillBox(grid, lampX - 7 * u, g + 41 * u, lampZ - 0.6 * u, lampX + 0.5 * u, g + 42.2 * u, lampZ + 0.6 * u, () => POLE);
    fillRoundedBox(grid, lampX - 9 * u, g + 40.2 * u, lampZ - 1.6 * u, lampX - 4.5 * u, g + 42.2 * u, lampZ + 1.6 * u, 0.5 * u, () => POLE);
    fillBox(grid, lampX - 8.6 * u, g + 39.8 * u, lampZ - 1.2 * u, lampX - 4.9 * u, g + 40.6 * u, lampZ + 1.2 * u, () => LAMP);
  },
};

/** Thin vertical ring along Z between two z values (either order). */
function fillCylinderZ2(grid: Parameters<VoxelObject['build']>[0], cx: number, cy: number, za: number, zb: number, r: number, mat: number): void {
  const z0 = Math.min(za, zb);
  const z1 = Math.max(za, zb);
  for (let z = Math.floor(z0); z < Math.ceil(z1); z++) {
    for (let y = Math.floor(cy); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r && grid.get(x, y, z) === 0) grid.set(x, y, z, mat);
      }
    }
  }
}
