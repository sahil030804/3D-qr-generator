import { isGroundVoxel } from '../voxel/ground';
import type { VoxelModel } from '../voxel/buildModel';
import type { VoxelGrid } from '../voxel/grid';
import { hash3 } from '../voxel/noise';
import type { SceneBounds } from './camera';
import { SUN_DIR } from './light';

/** Bytes per vertex: float32 x3 position, rgb + ao, normal index + shadow + height/radius + flags, scan-view rgb. */
export const VERTEX_STRIDE = 24;
export const FLAG_GROUND = 128;
export const FLAG_EMISSIVE = 64;
export const FLAG_RANDOM_MASK = 15;

export interface Mesh {
  vertices: ArrayBuffer;
  vertexCount: number;
  /** Two triangles per face. */
  indices: Uint32Array;
  faceCount: number;
  bounds: SceneBounds;
}

/** Normal index -> [axis, sign]. Order must match the normal table in the shader. */
const FACES: [number, number][] = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]];
const AO_LEVELS = [0.5, 0.68, 0.84, 1];

/** Two sun directions a hair apart, for soft shadow edges. */
const SUN_SAMPLES: [number, number, number][] = [-0.07, 0.07].map((angle) => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [SUN_DIR[0] * cos + SUN_DIR[2] * sin, SUN_DIR[1], -SUN_DIR[0] * sin + SUN_DIR[2] * cos] as [number, number, number];
});

function shadowAt(grid: VoxelGrid, x: number, y: number, z: number, normal: [number, number, number]): number {
  if (normal[0] * SUN_DIR[0] + normal[1] * SUN_DIR[1] + normal[2] * SUN_DIR[2] <= 0) return 0;
  let blocked = 0;
  for (const dir of SUN_SAMPLES) {
    let px = x + normal[0] * 0.7;
    let py = y + normal[1] * 0.7;
    let pz = z + normal[2] * 0.7;
    const steps = Math.ceil((grid.height - py) / dir[1]) + 1;
    for (let step = 0; step < steps; step++) {
      px += dir[0];
      py += dir[1];
      pz += dir[2];
      if (px < 0 || pz < 0 || px >= grid.width || pz >= grid.depth || py >= grid.height) break;
      if (grid.solid(Math.floor(px), Math.floor(py), Math.floor(pz))) {
        blocked++;
        break;
      }
    }
  }
  return blocked / SUN_SAMPLES.length;
}

/**
 * Turn a model into one indexed triangle mesh of exposed faces, with per-vertex ambient occlusion,
 * baked sun shadow and small per-voxel color jitter. Faces carry flags for the shader: plot (ground),
 * emissive and a per-voxel random number.
 */
export function buildMesh(model: VoxelModel): Mesh {
  const { grid, palette, layout } = model;
  const { width, height, depth } = grid;
  const dirs = FACES.map(([axis, sign]) => {
    const d = [0, 0, 0];
    d[axis] = sign;
    return d;
  });

  let faceCount = 0;
  for (let y = 0; y < height; y++) {
    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width; x++) {
        if (!grid.solid(x, y, z)) continue;
        for (let f = 0; f < 6; f++) {
          if (f === 3) continue;
          if (!grid.solid(x + dirs[f][0], y + dirs[f][1], z + dirs[f][2])) faceCount++;
        }
      }
    }
  }

  const buffer = new ArrayBuffer(faceCount * 4 * VERTEX_STRIDE);
  const floats = new Float32Array(buffer);
  const bytes = new Uint8Array(buffer);
  const indices = new Uint32Array(faceCount * 6);
  const maxY = Math.max(layout.base + 1, grid.maxY() + 1);
  const objectSpan = Math.max(1, maxY - layout.base);
  const half = layout.size / 2;
  const maxRadius = half * Math.SQRT2;

  let face = 0;
  const ao = [0, 0, 0, 0];
  for (let y = 0; y < height; y++) {
    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width; x++) {
        const index = grid.get(x, y, z);
        if (index === 0) continue;
        const material = palette.materials[index];
        const ground = isGroundVoxel(layout, x, y, z);
        const amount = ground ? 0.05 : 0.12;
        const jitter = 1 + (hash3(x, y, z, 77) - 0.5) * amount;
        const r = Math.min(255, Math.round(material.r * jitter));
        const g = Math.min(255, Math.round(material.g * jitter));
        const b = Math.min(255, Math.round(material.b * jitter));
        // Color this voxel takes in the scan view (its own family's dark or light tone for column tops).
        const fitted = model.fit[grid.index(x, y, z)];
        const alt = fitted ? palette.materials[fitted] : material;
        const ar = Math.min(255, Math.round(alt.r * jitter));
        const ag = Math.min(255, Math.round(alt.g * jitter));
        const ab = Math.min(255, Math.round(alt.b * jitter));
        const random = Math.floor(hash3(x, y, z, 5) * 16) & FLAG_RANDOM_MASK;
        const flags = (ground ? FLAG_GROUND : 0) | (material.emissive ? FLAG_EMISSIVE : 0) | random;
        // Ground voxels carry their distance from the plot center; objects carry height above the plot.
        const spanByte = ground
          ? Math.min(255, Math.floor((Math.hypot(x + 0.5 - half, z + 0.5 - half) / maxRadius) * 255))
          : Math.min(255, Math.max(0, Math.floor(((y - layout.base) / objectSpan) * 255)));

        for (let f = 0; f < 6; f++) {
          if (f === 3) continue;
          const [axis, sign] = FACES[f];
          const nx = x + dirs[f][0];
          const ny = y + dirs[f][1];
          const nz = z + dirs[f][2];
          if (grid.solid(nx, ny, nz)) continue;

          const u = (axis + 1) % 3;
          const v = (axis + 2) % 3;
          const p = [x, y, z];
          const normal: [number, number, number] = [dirs[f][0], dirs[f][1], dirs[f][2]];
          const shadow = Math.round(shadowAt(grid, x + 0.5 + normal[0] * 0.5, y + 0.5 + normal[1] * 0.5, z + 0.5 + normal[2] * 0.5, normal) * 255);
          const front = [nx, ny, nz];

          for (let corner = 0; corner < 4; corner++) {
            const iu = corner === 1 || corner === 2 ? 1 : 0;
            const iv = corner >= 2 ? 1 : 0;
            const du = iu ? 1 : -1;
            const dv = iv ? 1 : -1;
            const at = (a: number, b2: number): boolean => {
              const q = [front[0], front[1], front[2]];
              q[u] += a;
              q[v] += b2;
              return grid.solid(q[0], q[1], q[2]);
            };
            const side1 = at(du, 0);
            const side2 = at(0, dv);
            const level = side1 && side2 ? 0 : 3 - (Number(side1) + Number(side2) + Number(at(du, dv)));
            ao[corner] = level;

            const pos = [p[0], p[1], p[2]];
            pos[axis] += sign > 0 ? 1 : 0;
            pos[u] += iu;
            pos[v] += iv;
            const vertex = face * 4 + corner;
            const fo = vertex * (VERTEX_STRIDE / 4);
            floats[fo] = pos[0];
            floats[fo + 1] = pos[1];
            floats[fo + 2] = pos[2];
            const bo = vertex * VERTEX_STRIDE + 12;
            bytes[bo] = r;
            bytes[bo + 1] = g;
            bytes[bo + 2] = b;
            bytes[bo + 3] = Math.round(AO_LEVELS[level] * 255);
            bytes[bo + 4] = f;
            bytes[bo + 5] = shadow;
            bytes[bo + 6] = spanByte;
            bytes[bo + 7] = flags;
            bytes[bo + 8] = ar;
            bytes[bo + 9] = ag;
            bytes[bo + 10] = ab;
            bytes[bo + 11] = 255;
          }

          const base = face * 4;
          const io = face * 6;
          if (ao[0] + ao[2] < ao[1] + ao[3]) {
            indices.set([base + 1, base + 2, base + 3, base + 1, base + 3, base], io);
          } else {
            indices.set([base, base + 1, base + 2, base, base + 2, base + 3], io);
          }
          face++;
        }
      }
    }
  }

  return {
    vertices: buffer,
    vertexCount: faceCount * 4,
    indices,
    faceCount,
    bounds: { size: width, height: maxY, focusY: layout.base + objectSpan * 0.4, moduleVoxels: layout.M },
  };
}
