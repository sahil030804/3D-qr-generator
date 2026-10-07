import type { VoxelGrid } from '../voxel/grid';

/** Piecewise-linear interpolation through [x, y] keypoints sorted by x; clamps outside the range. */
export function curve(points: [number, number][]): (x: number) => number {
  return (x) => {
    if (x <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      const [x1, y1] = points[i];
      if (x <= x1) {
        const [x0, y0] = points[i - 1];
        return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
      }
    }
    return points[points.length - 1][1];
  };
}

export interface WheelMaterials {
  tire: number;
  rim: number;
  /** Gaps between spokes, brake disc and the inside of the barrel. */
  dark: number;
}

/**
 * Road wheel on an axle along Z (the vehicle runs along X): a tire with rounded shoulders, and an alloy rim on the
 * outer face with `spokes` spokes, recessed a little behind the sidewall. `outer` is the z of the outer face and
 * `inward` is -1 or +1, the direction towards the vehicle's centerline. All sizes are in voxels.
 */
export function wheelZ(
  grid: VoxelGrid, mats: WheelMaterials,
  cx: number, cy: number, outer: number, inward: 1 | -1,
  radius: number, width: number, rimRadius: number, spokes = 5,
): void {
  const zA = inward > 0 ? outer : outer - width;
  const zB = inward > 0 ? outer + width : outer;
  const shoulder = Math.min(radius * 0.18, width * 0.35);
  const recess = Math.max(0.6, width * 0.18);
  for (let z = Math.floor(zA); z < Math.ceil(zB); z++) {
    const depth = inward > 0 ? z + 0.5 - outer : outer - (z + 0.5);
    const fromFace = Math.min(depth, width - depth);
    const rTire = radius - Math.max(0, shoulder - fromFace) * 0.8;
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const d = Math.hypot(dx, dy);
        if (d > rTire) continue;
        let mat: number;
        if (d > rimRadius) mat = mats.tire;
        else if (depth < recess) continue;
        else if (depth < recess + 1.2) {
          const a = Math.atan2(dy, dx) * spokes / (Math.PI * 2);
          const off = Math.abs(a - Math.round(a));
          const hub = d < rimRadius * 0.28;
          const lip = d > rimRadius - 0.9;
          mat = hub || lip || off < 0.16 + 0.1 * (1 - d / rimRadius) ? mats.rim : mats.dark;
        } else mat = mats.dark;
        grid.set(x, y, z, mat);
      }
    }
  }
}

/**
 * Copy every voxel of `src` into `dst`, tilted sideways by `angle` radians about the X-axis line (y = pivotY,
 * z = pivotZ) — e.g. a parked bicycle leaning onto its kickstand. Positive angles lean the top towards -Z.
 */
export function stampLeanX(dst: VoxelGrid, src: VoxelGrid, pivotY: number, pivotZ: number, angle: number): void {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let y = 0; y < dst.height; y++) {
    for (let z = 0; z < dst.depth; z++) {
      const wy = y + 0.5 - pivotY;
      const wz = z + 0.5 - pivotZ;
      const ly = -wz * sin + wy * cos;
      const lz = wz * cos + wy * sin;
      const sy = Math.floor(ly + pivotY);
      const sz = Math.floor(lz + pivotZ);
      if (sy < 0 || sz < 0 || sy >= src.height || sz >= src.depth) continue;
      for (let x = 0; x < dst.width; x++) {
        const m = src.get(x, sy, sz);
        if (m) dst.set(x, y, z, m);
      }
    }
  }
}
