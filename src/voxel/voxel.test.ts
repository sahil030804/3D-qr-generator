import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { generateQRMatrix } from '../core/qr/QRGenerator';
import { OBJECTS } from '../objects';
import { buildModel } from './buildModel';
import { projectTop } from './fit';
import { projectTiles } from './ground';
import { VoxelGrid } from './grid';
import { chooseModuleVoxels, createLayout, isFinderAt, moduleAt } from './layout';
import { luminance } from './palette';

const INPUTS = [
  'https://example.com',
  'Hello from the voxel garden!',
  'https://example.org/some/longer/path?with=query&and=more#fragment-1234567890',
];

function decodeTiles(text: string, objectId: string, variantId?: string, compat = false, pixelsPerVoxel = 4): string | null {
  const qr = generateQRMatrix(text);
  const model = buildModel(qr, { objectId, variantId, compat });
  const luma = projectTiles(model.tiles, model.palette);
  const width = model.layout.size * pixelsPerVoxel;
  const data = new Uint8ClampedArray(width * width * 4);
  for (let py = 0; py < width; py++) {
    for (let px = 0; px < width; px++) {
      const v = luma[Math.floor(py / pixelsPerVoxel) * model.layout.size + Math.floor(px / pixelsPerVoxel)];
      const o = (py * width + px) * 4;
      data[o] = data[o + 1] = data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
  return jsQR(data, width, width)?.data ?? null;
}

function decodeScanView(text: string, objectId: string, variantId?: string, compat = false, pixelsPerVoxel = 4): string | null {
  const qr = generateQRMatrix(text);
  const model = buildModel(qr, { objectId, variantId, compat });
  const luma = projectTop(model.grid, model.palette, model.fit);
  const width = model.grid.width * pixelsPerVoxel;
  const data = new Uint8ClampedArray(width * width * 4);
  for (let py = 0; py < width; py++) {
    for (let px = 0; px < width; px++) {
      const v = luma[Math.floor(py / pixelsPerVoxel) * model.grid.width + Math.floor(px / pixelsPerVoxel)];
      const o = (py * width + px) * 4;
      data[o] = data[o + 1] = data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
  return jsQR(data, width, width)?.data ?? null;
}

describe('scan view with the object still standing', () => {
  for (const object of OBJECTS) {
    for (const text of INPUTS) {
      it(`${object.id} model decodes "${text.slice(0, 24)}"`, () => {
        expect(decodeScanView(text, object.id)).toBe(text);
      });
    }
    for (const variant of object.variants) {
      it(`${object.id}/${variant.id} model decodes`, () => {
        expect(decodeScanView('https://example.com', object.id, variant.id)).toBe('https://example.com');
      });
    }
  }

  it('decodes in compatibility mode with coarse voxels', () => {
    expect(decodeScanView('https://example.com', 'pine-tree', undefined, true, 6)).toBe('https://example.com');
  });

  it('only recolors column tops, never changes the shape', () => {
    const qr = generateQRMatrix('https://example.com');
    const model = buildModel(qr, { objectId: 'cherry-tree' });
    let recolored = 0;
    for (let i = 0; i < model.fit.length; i++) {
      if (!model.fit[i]) continue;
      recolored++;
      expect(model.grid.cells[i]).not.toBe(0);
    }
    expect(recolored).toBeGreaterThan(model.layout.size * model.layout.size * 0.9);
    expect(recolored).toBeLessThanOrEqual(model.layout.size * model.layout.size);
  });

  it('keeps every family that can end up on top well separated for scanners', () => {
    for (const object of OBJECTS) {
      for (const variant of object.variants) {
        const qr = generateQRMatrix('https://example.com');
        const model = buildModel(qr, { objectId: object.id, variantId: variant.id });
        const topFamilies = new Set<number>();
        for (let z = 0; z < model.grid.depth; z++) {
          for (let x = 0; x < model.grid.width; x++) {
            const y = model.grid.topY(x, z);
            if (y >= 0) topFamilies.add(model.palette.materials[model.grid.get(x, y, z)].family);
          }
        }
        for (const id of topFamilies) {
          const family = model.palette.families[id];
          const dark = model.palette.materials[family.dark];
          const light = model.palette.materials[family.light];
          const gap = luminance(light.r, light.g, light.b) - luminance(dark.r, dark.g, dark.b);
          expect(gap, `${object.id}/${variant.id} family ${id}`).toBeGreaterThanOrEqual(85);
        }
      }
    }
  });
});

describe('ground-tile QR', () => {
  for (const object of OBJECTS) {
    for (const text of INPUTS) {
      it(`${object.id} tiles decode "${text.slice(0, 24)}"`, () => {
        expect(decodeTiles(text, object.id)).toBe(text);
      });
    }
    for (const variant of object.variants) {
      it(`${object.id}/${variant.id} decodes`, () => {
        expect(decodeTiles('https://example.com', object.id, variant.id)).toBe('https://example.com');
      });
    }
  }

  it('decodes in compatibility mode with coarse voxels', () => {
    expect(decodeTiles('https://example.com', 'cherry-tree', undefined, true, 6)).toBe('https://example.com');
  });

  it('keeps tile, accent and stone tones well separated for scanners', () => {
    for (const object of OBJECTS) {
      for (const variant of object.variants) {
        const { palette, ground } = object.createPalette(variant.id);
        for (const id of [ground.tileA, ground.tileB, ground.accent]) {
          const f = palette.families[id];
          const dark = palette.materials[f.dark];
          const light = palette.materials[f.light];
          const gap = luminance(light.r, light.g, light.b) - luminance(dark.r, dark.g, dark.b);
          expect(gap, `${object.id}/${variant.id} family ${id}`).toBeGreaterThanOrEqual(110);
        }
      }
    }
  });

  it('is deterministic for the same text', () => {
    const qr = generateQRMatrix('deterministic');
    const a = buildModel(qr, { objectId: 'pine-tree' });
    const b = buildModel(qr, { objectId: 'pine-tree' });
    expect(Array.from(a.grid.cells)).toEqual(Array.from(b.grid.cells));
  });

  it('keeps every object inside the grid height', () => {
    const qr = generateQRMatrix('https://example.com');
    for (const object of OBJECTS) {
      const { grid } = buildModel(qr, { objectId: object.id });
      expect(grid.maxY(), object.id).toBeLessThan(grid.height - 1);
    }
  });
});

describe('plot layout', () => {
  it('maps voxel columns to modules and marks the three finder squares', () => {
    const layout = createLayout(29, 4);
    expect(layout.size).toBe((29 + 10) * 4);
    expect(moduleAt(layout, layout.qrOrigin - 1, layout.qrOrigin)).toBeNull();
    expect(moduleAt(layout, layout.qrOrigin, layout.qrOrigin)).toEqual({ row: 0, column: 0 });
    expect(isFinderAt(layout, layout.qrOrigin + 1, layout.qrOrigin + 1)).toBe(true);
    expect(isFinderAt(layout, layout.size / 2, layout.size / 2)).toBe(false);
    expect(isFinderAt(layout, layout.size - layout.qrOrigin - 1, layout.size - layout.qrOrigin - 1)).toBe(false);
  });

  it('chooses coarser voxels for bigger codes and compatibility mode', () => {
    expect(chooseModuleVoxels(29, false)).toBe(4);
    expect(chooseModuleVoxels(41, false)).toBe(3);
    expect(chooseModuleVoxels(57, false)).toBe(2);
    expect(chooseModuleVoxels(29, true)).toBe(2);
  });
});

describe('VoxelGrid', () => {
  it('reports top voxels and ignores out-of-bounds writes', () => {
    const grid = new VoxelGrid(4, 6, 4);
    grid.set(1, 3, 2, 5);
    grid.set(99, 0, 0, 5);
    expect(grid.topY(1, 2)).toBe(3);
    expect(grid.topY(0, 0)).toBe(-1);
    expect(grid.get(99, 0, 0)).toBe(0);
  });
});
