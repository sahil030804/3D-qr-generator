import type { VoxelGrid } from './grid';

/** Chooses the material for a voxel. Return 0 to leave the voxel untouched. */
export type Chooser = (x: number, y: number, z: number) => number;

export function constant(material: number): Chooser {
  return () => material;
}

function put(grid: VoxelGrid, x: number, y: number, z: number, choose: Chooser): void {
  const material = choose(x, y, z);
  if (material !== 0) grid.set(x, y, z, material);
}

/** Axis-aligned box covering [x0, x1) x [y0, y1) x [z0, z1). */
export function fillBox(
  grid: VoxelGrid,
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
  choose: Chooser,
): void {
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(grid.height, Math.ceil(y1)); y++) {
    for (let z = Math.max(0, Math.floor(z0)); z < Math.min(grid.depth, Math.ceil(z1)); z++) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(grid.width, Math.ceil(x1)); x++) put(grid, x, y, z, choose);
    }
  }
}

/**
 * Ellipsoid. `wobble(x, y, z)` returns an offset added to the squared normalized distance, which lets
 * callers erode the surface with noise for clumpy foliage.
 */
export function fillEllipsoid(
  grid: VoxelGrid,
  cx: number, cy: number, cz: number,
  rx: number, ry: number, rz: number,
  choose: Chooser,
  wobble?: (x: number, y: number, z: number) => number,
): void {
  const pad = wobble ? 1.5 : 1;
  for (let y = Math.max(0, Math.floor(cy - ry * pad)); y <= Math.min(grid.height - 1, Math.ceil(cy + ry * pad)); y++) {
    for (let z = Math.max(0, Math.floor(cz - rz * pad)); z <= Math.min(grid.depth - 1, Math.ceil(cz + rz * pad)); z++) {
      for (let x = Math.max(0, Math.floor(cx - rx * pad)); x <= Math.min(grid.width - 1, Math.ceil(cx + rx * pad)); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        const dz = (z + 0.5 - cz) / rz;
        const d = dx * dx + dy * dy + dz * dz + (wobble ? wobble(x, y, z) : 0);
        if (d <= 1) put(grid, x, y, z, choose);
      }
    }
  }
}

/** Vertical cylinder from y0 (inclusive) to y1 (exclusive). */
export function fillCylinderY(
  grid: VoxelGrid,
  cx: number, cz: number,
  y0: number, y1: number,
  radius: number,
  choose: Chooser,
): void {
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(grid.height, Math.ceil(y1)); y++) {
    for (let z = Math.floor(cz - radius); z <= Math.ceil(cz + radius); z++) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
        const dx = x + 0.5 - cx;
        const dz = z + 0.5 - cz;
        if (dx * dx + dz * dz <= radius * radius) put(grid, x, y, z, choose);
      }
    }
  }
}

/** Tapered capsule between two points: radius r0 at a, r1 at b. */
export function fillCapsule(
  grid: VoxelGrid,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  r0: number, r1: number,
  choose: Chooser,
): void {
  const pad = Math.max(r0, r1) + 1;
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const lenSq = abx * abx + aby * aby + abz * abz || 1;
  for (let y = Math.max(0, Math.floor(Math.min(ay, by) - pad)); y <= Math.min(grid.height - 1, Math.ceil(Math.max(ay, by) + pad)); y++) {
    for (let z = Math.max(0, Math.floor(Math.min(az, bz) - pad)); z <= Math.min(grid.depth - 1, Math.ceil(Math.max(az, bz) + pad)); z++) {
      for (let x = Math.max(0, Math.floor(Math.min(ax, bx) - pad)); x <= Math.min(grid.width - 1, Math.ceil(Math.max(ax, bx) + pad)); x++) {
        const px = x + 0.5 - ax;
        const py = y + 0.5 - ay;
        const pz = z + 0.5 - az;
        const t = Math.max(0, Math.min(1, (px * abx + py * aby + pz * abz) / lenSq));
        const dx = px - abx * t;
        const dy = py - aby * t;
        const dz = pz - abz * t;
        const r = r0 + (r1 - r0) * t;
        if (dx * dx + dy * dy + dz * dz <= r * r) put(grid, x, y, z, choose);
      }
    }
  }
}
