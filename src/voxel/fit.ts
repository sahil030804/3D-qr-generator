import type { QRData } from '../core/qr/QRGenerator';
import type { VoxelGrid } from './grid';
import { isDarkAt, type PlotLayout } from './layout';
import { luminance, type Palette } from './palette';

/**
 * For every column, the material its top voxel takes in the scan view: the dark or light tone of its own
 * family, chosen by the QR module underneath. The shape never changes. Entries are 0 for voxels that keep
 * their natural color. Same indexing as `grid.cells`.
 */
export function computeFit(grid: VoxelGrid, palette: Palette, qr: QRData, layout: PlotLayout): Uint8Array {
  const fit = new Uint8Array(grid.cells.length);
  for (let z = 0; z < grid.depth; z++) {
    for (let x = 0; x < grid.width; x++) {
      const y = grid.topY(x, z);
      if (y < 0) continue;
      const index = grid.index(x, y, z);
      const material = palette.materials[grid.cells[index]];
      if (material.family < 0) continue;
      fit[index] = palette.tone(material.family, isDarkAt(qr, layout, x, z) ? 'dark' : 'light');
    }
  }
  return fit;
}

/** Straight-down luminance map (0..255), one value per voxel column, as the scan view shows it. */
export function projectTop(grid: VoxelGrid, palette: Palette, fit: Uint8Array): Uint8Array {
  const out = new Uint8Array(grid.width * grid.depth);
  for (let z = 0; z < grid.depth; z++) {
    for (let x = 0; x < grid.width; x++) {
      const y = grid.topY(x, z);
      if (y < 0) {
        out[z * grid.width + x] = 255;
        continue;
      }
      const index = grid.index(x, y, z);
      const m = palette.materials[fit[index] || grid.cells[index]];
      out[z * grid.width + x] = Math.round(luminance(m.r, m.g, m.b));
    }
  }
  return out;
}
