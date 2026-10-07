import type { GroundFamilies } from '../voxel/ground';
import type { VoxelGrid } from '../voxel/grid';
import type { PlotLayout } from '../voxel/layout';
import type { Palette } from '../voxel/palette';

export interface ObjectVariant {
  id: string;
  name: string;
  /** CSS color for the picker dot. */
  color: string;
}

export interface ObjectContext {
  layout: PlotLayout;
  /** Deterministic seed derived from the input text. */
  seed: number;
  /** Object scale relative to the reference 74-voxel plot. */
  u: number;
  /** y of the plot surface; objects start here. */
  g: number;
}

export interface PaletteSet {
  palette: Palette;
  ground: GroundFamilies;
}

export interface VoxelObject {
  id: string;
  name: string;
  description: string;
  /** Category id from `src/objects/categories.ts`; drives the category → model dropdowns. */
  category: string;
  variants: ObjectVariant[];
  createPalette(variantId: string): PaletteSet;
  /** Add the object and its decorations above the plot surface. */
  build(grid: VoxelGrid, palette: Palette, context: ObjectContext): void;
}
