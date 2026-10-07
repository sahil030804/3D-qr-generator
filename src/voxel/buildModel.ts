import type { QRData } from '../core/qr/QRGenerator';
import { getObject, getVariantId } from '../objects';
import type { VoxelObject } from '../objects/types';
import { computeFit } from './fit';
import { createGround } from './ground';
import type { VoxelGrid } from './grid';
import { chooseModuleVoxels, createLayout, type PlotLayout } from './layout';
import { hashString } from './noise';
import type { Palette } from './palette';

export interface VoxelModel {
  grid: VoxelGrid;
  palette: Palette;
  layout: PlotLayout;
  /** Top tile material of every column (the plot only). */
  tiles: Uint8Array;
  /** Material each column's top voxel takes in the scan view; 0 = natural color. */
  fit: Uint8Array;
  object: VoxelObject;
  variantId: string;
}

export interface BuildOptions {
  objectId: string;
  variantId?: string;
  /** Use coarse voxels for the software renderer. */
  compat?: boolean;
}

/** Build the plot with the QR in its tiles, stand the object on it, and prepare the scan-view colors. */
export function buildModel(qr: QRData, options: BuildOptions): VoxelModel {
  const object = getObject(options.objectId);
  const variantId = getVariantId(object, options.variantId);
  const layout = createLayout(qr.size, chooseModuleVoxels(qr.size, options.compat ?? false));
  const seed = hashString(qr.content);
  const { palette, ground: families } = object.createPalette(variantId);
  const { grid, tiles } = createGround(layout, palette, families, qr, seed);

  object.build(grid, palette, { layout, seed, u: layout.scale, g: layout.base });

  // Where an object foot overhangs a recessed (dark) tile, fill the gap with the tile material.
  for (let z = 0; z < layout.size; z++) {
    for (let x = 0; x < layout.size; x++) {
      if (grid.get(x, layout.base, z) !== 0 && grid.get(x, layout.base - 1, z) === 0) {
        grid.set(x, layout.base - 1, z, tiles[z * layout.size + x]);
      }
    }
  }
  const fit = computeFit(grid, palette, qr, layout);
  return { grid, palette, layout, tiles, fit, object, variantId };
}
