import type { QRData } from '../core/qr/QRGenerator';
import { VoxelGrid } from './grid';
import { gridHeightFor, inRim, isDarkAt, isFinderAt, moduleAt, type PlotLayout } from './layout';
import { hash3 } from './noise';
import { luminance, type Palette } from './palette';

export interface GroundFamilies {
  /** Two tile families that alternate for subtle variety. */
  tileA: number;
  tileB: number;
  /** Tiles inside the three finder squares. */
  accent: number;
  /** Raised rim. */
  stone: number;
  soil: number;
  rock: number;
}

export interface Ground {
  grid: VoxelGrid;
  /** Material of the top tile of every column (size x size). */
  tiles: Uint8Array;
}

/**
 * Lay the plot: rock and soil layers, tiles forming the QR (dark tiles sit one voxel lower so the
 * pattern reads in 3D), a finder accent and a raised stone rim.
 */
export function createGround(layout: PlotLayout, palette: Palette, fam: GroundFamilies, qr: QRData, seed: number): Ground {
  const { size, base, M } = layout;
  const grid = new VoxelGrid(size, gridHeightFor(layout), size);
  const tiles = new Uint8Array(size * size);
  const rockTop = Math.max(1, Math.floor(M / 2));

  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const rim = inRim(layout, x, z);
      const m = moduleAt(layout, x, z);
      let tileMaterial = 0;
      let dark = false;
      if (!rim) {
        dark = isDarkAt(qr, layout, x, z);
        const family = isFinderAt(layout, x, z)
          ? fam.accent
          : hash3(m ? m.column : -1, 0, m ? m.row : -1, seed + 11) < 0.5 ? fam.tileA : fam.tileB;
        tileMaterial = palette.tone(family, dark ? 'dark' : 'light');
      }

      for (let y = 0; y < base; y++) {
        const n = hash3(x, y, z, seed);
        let material: number;
        if (rim) {
          material = y < rockTop ? palette.pick(fam.rock, n, 0.3, 0.8) : palette.pick(fam.stone, n, 0.1, 0.45);
        } else if (y < rockTop) {
          material = palette.pick(fam.rock, n, 0.3, 0.8);
        } else if (y < base - 2) {
          material = palette.pick(fam.soil, n, 0.2, 0.85);
        } else if (y === base - 2) {
          material = tileMaterial;
        } else {
          material = dark ? 0 : tileMaterial;
        }
        if (material) grid.set(x, y, z, material);
      }
      if (rim) {
        for (let y = base; y < base + layout.rimHeight; y++) grid.set(x, y, z, palette.pick(fam.stone, hash3(x, y, z, seed + 3), 0.08, 0.4));
        tiles[z * size + x] = grid.get(x, base + layout.rimHeight - 1, z);
      } else {
        tiles[z * size + x] = tileMaterial;
      }
    }
  }
  return { grid, tiles };
}

/** Luminance (0..255) of the top tile in every column, as the flat top view shows it. */
export function projectTiles(tiles: Uint8Array, palette: Palette): Uint8Array {
  const out = new Uint8Array(tiles.length);
  for (let i = 0; i < tiles.length; i++) {
    const m = palette.materials[tiles[i]];
    out[i] = Math.round(luminance(m.r, m.g, m.b));
  }
  return out;
}

/** True for voxels that belong to the plot rather than the object standing on it. */
export function isGroundVoxel(layout: PlotLayout, x: number, y: number, z: number): boolean {
  return y < layout.base || inRim(layout, x, z);
}
