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

/**
 * Horizontal cylinder along Z from z0 (inclusive) to z1 (exclusive): a vertical disc facing ±Z, e.g. a wheel on a
 * vehicle that runs along X. A positive `inner` radius leaves the core empty (a ring, such as a tire).
 */
export function fillCylinderZ(
  grid: VoxelGrid,
  cx: number, cy: number,
  z0: number, z1: number,
  radius: number,
  choose: Chooser,
  inner = 0,
): void {
  for (let z = Math.max(0, Math.floor(z0)); z < Math.min(grid.depth, Math.ceil(z1)); z++) {
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const d = dx * dx + dy * dy;
        if (d <= radius * radius && d >= inner * inner) put(grid, x, y, z, choose);
      }
    }
  }
}

/** Horizontal cylinder along X from x0 (inclusive) to x1 (exclusive), optionally hollow like `fillCylinderZ`. */
export function fillCylinderX(
  grid: VoxelGrid,
  cy: number, cz: number,
  x0: number, x1: number,
  radius: number,
  choose: Chooser,
  inner = 0,
): void {
  for (let x = Math.max(0, Math.floor(x0)); x < Math.min(grid.width, Math.ceil(x1)); x++) {
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
      for (let z = Math.floor(cz - radius); z <= Math.ceil(cz + radius); z++) {
        const dz = z + 0.5 - cz;
        const dy = y + 0.5 - cy;
        const d = dz * dz + dy * dy;
        if (d <= radius * radius && d >= inner * inner) put(grid, x, y, z, choose);
      }
    }
  }
}

/**
 * Solid of revolution around a vertical axis, from y0 (inclusive) to y1 (exclusive). `profile(t)` gets the
 * normalized height t in [0, 1] of each voxel layer and returns the outer radius, or [outer, inner] for a hollow
 * wall (cups, vases, rings). Return 0 to skip a layer.
 */
export function fillLathe(
  grid: VoxelGrid,
  cx: number, cz: number,
  y0: number, y1: number,
  profile: (t: number, y: number) => number | [number, number],
  choose: Chooser,
): void {
  const span = Math.max(1e-6, y1 - y0);
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(grid.height, Math.ceil(y1)); y++) {
    const t = Math.min(1, Math.max(0, (y + 0.5 - y0) / span));
    const p = profile(t, y);
    const [outer, inner] = typeof p === 'number' ? [p, 0] : p;
    if (outer <= 0) continue;
    for (let z = Math.floor(cz - outer); z <= Math.ceil(cz + outer); z++) {
      for (let x = Math.floor(cx - outer); x <= Math.ceil(cx + outer); x++) {
        const dx = x + 0.5 - cx;
        const dz = z + 0.5 - cz;
        const d = dx * dx + dz * dz;
        if (d <= outer * outer && d >= inner * inner) put(grid, x, y, z, choose);
      }
    }
  }
}

/** Box covering [x0, x1) x [y0, y1) x [z0, z1) with every edge and corner rounded by `radius`. */
export function fillRoundedBox(
  grid: VoxelGrid,
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
  radius: number,
  choose: Chooser,
): void {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const cz = (z0 + z1) / 2;
  const r = Math.min(radius, (x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2);
  const hx = (x1 - x0) / 2 - r;
  const hy = (y1 - y0) / 2 - r;
  const hz = (z1 - z0) / 2 - r;
  fillBox(grid, x0, y0, z0, x1, y1, z1, (x, y, z) => {
    const qx = Math.max(0, Math.abs(x + 0.5 - cx) - hx);
    const qy = Math.max(0, Math.abs(y + 0.5 - cy) - hy);
    const qz = Math.max(0, Math.abs(z + 0.5 - cz) - hz);
    return qx * qx + qy * qy + qz * qz <= r * r ? choose(x, y, z) : 0;
  });
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
