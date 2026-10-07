import { QUIET_ZONE_MODULES, type QRData } from '../core/qr/QRGenerator';

/** Stone rim around the plot, in modules. */
export const RIM_MODULES = 1;
/** Modules between the plot edge and the first QR module. */
export const QR_OFFSET_MODULES = RIM_MODULES + QUIET_ZONE_MODULES;

export interface PlotLayout {
  /** Voxels per QR module along each axis. */
  M: number;
  /** QR module count (without quiet zone). */
  modules: number;
  /** Plot width and depth in voxels. */
  size: number;
  /** y of the walkable surface: light tiles end at y = base - 1. */
  base: number;
  /** Voxels from the plot edge to the first QR module. */
  qrOrigin: number;
  /** Rim width in voxels. */
  rim: number;
  /** Rim height above the surface in voxels. */
  rimHeight: number;
  /** Object scale relative to the reference 74-voxel plot. */
  scale: number;
}

/** Higher detail for short codes on capable devices; always coarse in compatibility mode. */
export function chooseModuleVoxels(modules: number, compat: boolean): number {
  if (compat) return 2;
  if (modules <= 33) return 4;
  if (modules <= 49) return 3;
  return 2;
}

export function createLayout(modules: number, M: number): PlotLayout {
  const size = (modules + QR_OFFSET_MODULES * 2) * M;
  return {
    M,
    modules,
    size,
    base: 2 * M,
    qrOrigin: QR_OFFSET_MODULES * M,
    rim: RIM_MODULES * M,
    rimHeight: Math.max(1, Math.round(M / 2)),
    scale: size / 74,
  };
}

/** Total grid height, leaving room for the tallest object. */
export function gridHeightFor(layout: PlotLayout): number {
  return layout.base + Math.ceil(72 * layout.scale);
}

export function inRim(layout: PlotLayout, x: number, z: number): boolean {
  const edge = layout.size - layout.rim;
  return x < layout.rim || z < layout.rim || x >= edge || z >= edge;
}

/** QR module coordinates under a voxel column, or null outside the code. */
export function moduleAt(layout: PlotLayout, x: number, z: number): { row: number; column: number } | null {
  const column = Math.floor((x - layout.qrOrigin) / layout.M);
  const row = Math.floor((z - layout.qrOrigin) / layout.M);
  if (x < layout.qrOrigin || z < layout.qrOrigin || column >= layout.modules || row >= layout.modules) return null;
  return { row, column };
}

/** True when the module under voxel column (x, z) is dark. Anything outside the code is light. */
export function isDarkAt(qr: QRData, layout: PlotLayout, x: number, z: number): boolean {
  const m = moduleAt(layout, x, z);
  return m ? qr.matrix[m.row][m.column] : false;
}

/** True inside the three 7x7 finder squares. */
export function isFinderAt(layout: PlotLayout, x: number, z: number): boolean {
  const m = moduleAt(layout, x, z);
  if (!m) return false;
  const n = layout.modules;
  const near = (v: number): boolean => v < 7;
  const far = (v: number): boolean => v >= n - 7;
  return (near(m.row) && near(m.column)) || (near(m.row) && far(m.column)) || (far(m.row) && near(m.column));
}
