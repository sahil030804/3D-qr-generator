import { SUN_DIR } from '../render/light';
import { VoxelGrid } from '../voxel/grid';
import { createLayout, type PlotLayout } from '../voxel/layout';
import { Palette } from '../voxel/palette';
import { luma, resizePlane, resizeRGBA, type RGBA } from './imageOps';
import { medianCut, PaletteLookup } from './quantize';
import { chooseVersion, encodeQArt, type QArtResult } from './qart';
import { DEFAULT_RELIEF, hillshade, shapeHeights, type ReliefOptions } from './relief';
import { fitScanColors, SCAN_LOOKS, type LookName } from './scanColors';

export class PhotoError extends Error {}

/** Everything about the code and the resampled picture; independent of how strongly the code is drawn. */
export interface PhotoCode {
  text: string;
  version: number;
  /** QR modules per side. */
  modules: number;
  /** Voxels per module along each axis. */
  moduleVoxels: number;
  /** Picture size in voxels (modules * moduleVoxels). */
  size: number;
  photo: RGBA;
  depth: Float32Array;
  qr: QArtResult;
}

/** The model in the shape the mesher expects. */
export interface PhotoModel {
  grid: VoxelGrid;
  palette: Palette;
  layout: PlotLayout;
  tiles: Uint8Array;
  fit: Uint8Array;
  code: PhotoCode;
  look: LookName;
}

/** Luminance below which a module should be dark. Chosen so hair, eyes and shadows go dark and skin stays light. */
const SPLIT = 105;

/** Deterministic tie-breaker so equal-cost modules do not all deviate in one clump. */
function jitter(i: number): number {
  let h = Math.imul(i + 1, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

export function prepareCode(text: string, square: RGBA, depth: Float32Array): PhotoCode {
  const trimmed = text.trim();
  const payload = new TextEncoder().encode(trimmed);
  const version = chooseVersion(payload.length);
  if (!trimmed || version === null) throw new PhotoError('That text is too long for a photo code. Try a shorter link.');
  if (square.width !== square.height) throw new PhotoError('The photo must be square.');
  const modules = 17 + 4 * version;
  // Keep the picture around 350 voxels wide whatever the code size, so smaller codes get bigger, easier modules.
  const moduleVoxels = Math.min(8, Math.max(4, Math.round(350 / modules)));
  const size = modules * moduleVoxels;
  const photo = resizeRGBA(square, size, size);
  const depthS = resizePlane(depth, square.width, square.height, size, size);

  // What each module "wants" to be: the photo's own tone at module scale.
  const target = new Uint8Array(modules * modules);
  const cost = new Float32Array(modules * modules);
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      let sum = 0;
      for (let y = 0; y < moduleVoxels; y++) {
        for (let x = 0; x < moduleVoxels; x++) {
          const o = ((row * moduleVoxels + y) * size + col * moduleVoxels + x) * 4;
          sum += luma(photo.data[o], photo.data[o + 1], photo.data[o + 2]);
        }
      }
      const mean = sum / (moduleVoxels * moduleVoxels);
      const i = row * modules + col;
      target[i] = mean < SPLIT ? 1 : 0;
      cost[i] = Math.abs(mean - SPLIT) / 128 + jitter(i) * 0.05;
    }
  }
  const qr = encodeQArt(new TextEncoder().encode(trimmed), version, { target, cost });
  return { text: trimmed, version, modules, moduleVoxels, size, photo, depth: depthS, qr };
}

export interface PhotoBuildOptions {
  relief?: ReliefOptions;
  /** Palette sizes; together with the plot colors they must stay under 255. */
  naturalColors?: number;
  scanColors?: number;
}

export function buildPhotoModel(code: PhotoCode, look: LookName, options: PhotoBuildOptions = {}): PhotoModel {
  const relief = options.relief ?? DEFAULT_RELIEF;
  const { modules, moduleVoxels: MV, size: S, photo } = code;
  const layout = createLayout(modules, MV);
  const plotThickness = layout.base;

  const heights = shapeHeights(code.depth, S, relief);
  const shade = hillshade(heights, S, SUN_DIR, relief.exaggeration);
  const fitted = fitScanColors(photo, modules, MV, code.qr.matrix, SCAN_LOOKS[look]);

  // Colors: the lit picture for the model view, the code-ready picture for the scan view.
  const palette = new Palette();
  const rock = palette.addColor(120, 116, 110);
  const soil = palette.addColor(168, 160, 148);
  const tile = palette.addColor(226, 230, 238);
  const rim = palette.addColor(206, 198, 184);

  const natural = new Uint8ClampedArray(S * S * 3);
  const scan = new Uint8ClampedArray(S * S * 3);
  for (let i = 0; i < S * S; i++) {
    for (let c = 0; c < 3; c++) {
      natural[i * 3 + c] = Math.min(255, photo.data[i * 4 + c] * shade[i]);
      scan[i * 3 + c] = fitted.data[i * 4 + c];
    }
  }
  const naturalColors = medianCut(natural, options.naturalColors ?? 120, 3);
  const scanColors = medianCut(scan, options.scanColors ?? 100, 3);
  const naturalLookup = new PaletteLookup(naturalColors);
  const scanLookup = new PaletteLookup(scanColors);
  const naturalMaterial = naturalColors.map((c) => palette.addColor(c[0], c[1], c[2]));
  const scanMaterial = scanColors.map((c) => palette.addColor(c[0], c[1], c[2]));

  const maxHeight = Math.ceil(relief.maxHeight) + 2;
  const grid = new VoxelGrid(layout.size, plotThickness + maxHeight + 2, layout.size);
  for (let z = 0; z < layout.size; z++) {
    for (let x = 0; x < layout.size; x++) {
      const isRim = x < layout.rim || z < layout.rim || x >= layout.size - layout.rim || z >= layout.size - layout.rim;
      for (let y = 0; y < plotThickness; y++) {
        grid.set(x, y, z, y < plotThickness - 2 ? rock : y < plotThickness - 1 ? soil : isRim ? rim : tile);
      }
    }
  }

  const fit = new Uint8Array(grid.cells.length);
  const origin = layout.qrOrigin;
  for (let iy = 0; iy < S; iy++) {
    for (let ix = 0; ix < S; ix++) {
      const i = iy * S + ix;
      const top = naturalMaterial[naturalLookup.nearest(natural[i * 3], natural[i * 3 + 1], natural[i * 3 + 2])];
      const scanned = scanMaterial[scanLookup.nearest(scan[i * 3], scan[i * 3 + 1], scan[i * 3 + 2])];
      const h = Math.max(1, Math.round(heights[i]) + 1);
      const x = origin + ix;
      const z = origin + iy;
      for (let y = plotThickness; y < plotThickness + h; y++) grid.set(x, y, z, top);
      fit[grid.index(x, plotThickness + h - 1, z)] = scanned;
    }
  }
  return { grid, palette, layout, tiles: new Uint8Array(layout.size * layout.size), fit, code, look };
}
