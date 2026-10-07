import * as THREE from 'three';
import jsQR from 'jsqr';
import type { QRField } from '../qr/QRField';

export interface TopDownResult {
  success: boolean;
  data: string | null;
  /** Binarized image used for the successful decode (debug display). */
  debugUrl: string;
  resolution: number;
  /** Mean dark-module vs light-module contrast estimate 0..1 */
  contrast: number;
  /** Fraction of QR modules whose rendered tone matches polarity (0..1). */
  agreement: number;
  darkMean: number;
  lightMean: number;
}

/**
 * Renders the CURRENT 3D scene from a square orthographic top camera,
 * enhances it (grayscale -> contrast stretch -> Otsu binarization) and
 * decodes with jsQR. Tries several binarizations + rotations.
 */
export class TopDownRenderer {
  private target: THREE.WebGLRenderTarget | null = null;

  constructor(private renderer: THREE.WebGLRenderer) {}

  render(
    scene: THREE.Scene,
    worldSize: number,
    resolution = 1024,
    lighting?: () => () => void,
    field?: QRField,
  ): TopDownResult {
    const restore = lighting?.();
    const half = worldSize * 0.5 * 1.04; // include quiet zone
    const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, worldSize * 4);
    cam.position.set(0, worldSize * 2, 0);
    cam.up.set(0, 0, -1); // image row 0 == -z == v=0 edge
    cam.lookAt(0, 0, 0);

    if (!this.target || this.target.width !== resolution) {
      this.target?.dispose();
      this.target = new THREE.WebGLRenderTarget(resolution, resolution, {
        colorSpace: THREE.LinearSRGBColorSpace,
      });
    }
    const prevTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, cam);
    const pixels = new Uint8Array(resolution * resolution * 4);
    this.renderer.readRenderTargetPixels(this.target, 0, 0, resolution, resolution, pixels as unknown as Uint8ClampedArray);
    this.renderer.setRenderTarget(prevTarget);
    restore?.();

    // flip Y (GL reads bottom-up) -> top-down canvas
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = resolution;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const img = ctx.createImageData(resolution, resolution);
    const row = resolution * 4;
    for (let y = 0; y < resolution; y++) {
      img.data.set(pixels.subarray((resolution - 1 - y) * row, (resolution - y) * row), y * row);
    }
    ctx.putImageData(img, 0, 0);

    const gray = toGrayscale(img);
    const contrast = estimateContrast(gray, resolution);
    // half-res aggregated copy: averages blossom/leaf speckle into module tones
    const halfRes = resolution >> 1;
    const small = new Float32Array(halfRes * halfRes);
    for (let y = 0; y < halfRes; y++) {
      for (let x = 0; x < halfRes; x++) {
        small[y * halfRes + x] =
          (gray[(y * 2) * resolution + x * 2] +
            gray[(y * 2) * resolution + x * 2 + 1] +
            gray[(y * 2 + 1) * resolution + x * 2] +
            gray[(y * 2 + 1) * resolution + x * 2 + 1]) *
          0.25;
      }
    }
    // quarter-res: one value per ~module neighborhood, kills fine speckle
    const quarter = resolution >> 2;
    const tiny = new Float32Array(quarter * quarter);
    for (let y = 0; y < quarter; y++) {
      for (let x = 0; x < halfRes; x += 2) {
        const yy = y * 2;
        tiny[y * quarter + (x >> 1)] =
          (small[yy * halfRes + x] + small[yy * halfRes + x + 1] + small[(yy + 1) * halfRes + x] + small[(yy + 1) * halfRes + x + 1]) * 0.25;
      }
    }
    const variants: { w: number; img: ImageData }[] = [
      { w: resolution, img: binarize(gray, resolution, otsu(gray)) },
      { w: resolution, img: binarize(boxBlur(gray, resolution), resolution, otsu(gray)) },
      { w: resolution, img: adaptiveBinarize(gray, resolution) },
      { w: halfRes, img: binarize(small, halfRes, otsu(small)) },
      { w: halfRes, img: binarize(small, halfRes, otsu(small) - 14) },
      { w: quarter, img: binarize(tiny, quarter, otsu(tiny)) },
      { w: quarter, img: adaptiveBinarize(tiny, quarter) },
    ];
    let data: string | null = null;
    let used = variants[0].img;
    outer: for (const v of variants) {
      for (const inv of [false, true]) {
        const attempt = inv ? invert(v.img, v.w) : v.img;
        const decoded = jsQR(new Uint8ClampedArray(attempt.data.buffer.slice(0)), v.w, v.w, {
          inversionAttempts: 'dontInvert',
        });
        if (decoded?.data) {
          data = decoded.data;
          used = attempt;
          break outer;
        }
      }
    }
    const debug = document.createElement('canvas');
    debug.width = debug.height = Math.min(512, resolution);
    const dctx = debug.getContext('2d')!;
    // draw used variant scaled
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = resolution;
    tmp.getContext('2d')!.putImageData(used, 0, 0);
    dctx.imageSmoothingEnabled = false;
    dctx.drawImage(tmp, 0, 0, debug.width, debug.height);
    const agree = field ? moduleAgreement(gray, resolution, field, worldSize) : { pct: 0, darkMean: 0, lightMean: 0 };
    return { success: data != null, data, debugUrl: debug.toDataURL(), resolution, contrast, agreement: agree.pct, darkMean: agree.darkMean, lightMean: agree.lightMean };
  }

  dispose(): void {
    this.target?.dispose();
    this.target = null;
  }
}

function toGrayscale(img: ImageData): Float32Array {
  const g = new Float32Array(img.width * img.height);
  for (let i = 0; i < g.length; i++) {
    g[i] = img.data[i * 4] * 0.299 + img.data[i * 4 + 1] * 0.587 + img.data[i * 4 + 2] * 0.114;
  }
  // contrast stretch 2nd..98th percentile
  const sorted = Float32Array.from(g).sort();
  const lo = sorted[Math.floor(sorted.length * 0.02)];
  const hi = sorted[Math.floor(sorted.length * 0.98)];
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < g.length; i++) g[i] = Math.min(255, Math.max(0, ((g[i] - lo) / span) * 255));
  return g;
}

function boxBlur(g: Float32Array, size: number): Float32Array {
  const out = new Float32Array(g.length);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      let n = 0;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(size - 1, y + 1); yy++) {
        for (let xx = Math.max(0, x - 1); xx <= Math.min(size - 1, x + 1); xx++) {
          sum += g[yy * size + xx];
          n++;
        }
      }
      out[y * size + x] = sum / n;
    }
  }
  return out;
}

function otsu(g: Float32Array): number {
  const hist = new Array(256).fill(0);
  for (const v of g) hist[Math.min(255, v | 0)]++;
  const total = g.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let thresh = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      thresh = i;
    }
  }
  return thresh;
}

function binarize(g: Float32Array, size: number, t: number): ImageData {
  const out = new ImageData(size, size);
  for (let i = 0; i < g.length; i++) {
    const v = g[i] > t ? 255 : 0;
    out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = v;
    out.data[i * 4 + 3] = 255;
  }
  return out;
}

function adaptiveBinarize(g: Float32Array, size: number): ImageData {
  const out = new ImageData(size, size);
  const win = Math.max(8, Math.floor(size / 25));
  const integral = new Float64Array((size + 1) * (size + 1));
  for (let y = 0; y < size; y++) {
    let rowSum = 0;
    for (let x = 0; x < size; x++) {
      rowSum += g[y * size + x];
      integral[(y + 1) * (size + 1) + x + 1] = integral[y * (size + 1) + x + 1] + rowSum;
    }
  }
  const box = (x0: number, y0: number, x1: number, y1: number) => {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(size, x1); y1 = Math.min(size, y1);
    const W = size + 1;
    return (integral[y1 * W + x1] - integral[y0 * W + x1] - integral[y1 * W + x0] + integral[y0 * W + x0]) / Math.max(1, (x1 - x0) * (y1 - y0));
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const mean = box(x - win, y - win, x + win, y + win);
      const v = g[y * size + x] > mean - 8 ? 255 : 0;
      const i = (y * size + x) * 4;
      out.data[i] = out.data[i + 1] = out.data[i + 2] = v;
      out.data[i + 3] = 255;
    }
  }
  return out;
}

function invert(img: ImageData, size: number): ImageData {
  const out = new ImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = 255 - img.data[i * 4];
    out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = v;
    out.data[i * 4 + 3] = 255;
  }
  return out;
}

/**
 * Ground-truth check: mean rendered tone per QR module vs matrix polarity.
 * Returns the fraction of modules on the correct side of the global median.
 * Independent of jsQR — isolates "does the 3D projection carry the code".
 */
function moduleAgreement(
  gray: Float32Array,
  size: number,
  field: QRField,
  worldSize: number,
): { pct: number; darkMean: number; lightMean: number } {
  const half = (worldSize * 0.5 * 1.04) / worldSize; // ortho half-extent in uv units
  // pixel (px,py0-top) -> world: x = (px/size-0.5)*2*half*worldSize
  const pxPerUnit = size / (2 * half * worldSize);
  const cx = size / 2;
  // cy for v: canvas row 0 == v=0 == -z
  const n = field.qr.size;
  const qz = field.quietZone;
  const t = field.total;
  const modPx = (worldSize / t) * pxPerUnit;
  let ok = 0;
  let tot = 0;
  let darkSum = 0;
  let darkN = 0;
  let lightSum = 0;
  let lightN = 0;
  const means: number[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      // module center in world units
      const u = (c + qz + 0.5) / t;
      const v = (r + qz + 0.5) / t;
      const px = (u - 0.5) * 2 * half * worldSize * pxPerUnit + cx;
      const py = (v - 0.5) * 2 * half * worldSize * pxPerUnit + cx;
      const rad = Math.max(1, Math.floor(modPx * 0.3));
      let sum = 0;
      let cnt = 0;
      for (let yy = Math.floor(py - rad); yy <= py + rad; yy++) {
        for (let xx = Math.floor(px - rad); xx <= px + rad; xx++) {
          if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
          sum += gray[yy * size + xx];
          cnt++;
        }
      }
      const mean = sum / Math.max(1, cnt);
      means.push(mean);
      if (field.qr.matrix[r][c]) {
        darkSum += mean;
        darkN++;
      } else {
        lightSum += mean;
        lightN++;
      }
      tot++;
    }
  }
  const sorted = [...means].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  void ok;
  let agree = 0;
  let k = 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const dark = field.qr.matrix[r][c];
      if ((means[k++] < median) === dark) agree++;
    }
  }
  void tot;
  return { pct: agree / Math.max(1, k), darkMean: darkSum / Math.max(1, darkN), lightMean: lightSum / Math.max(1, lightN) };
}

function estimateContrast(g: Float32Array, size: number): number {
  // spread between 20th and 80th percentile brightness
  const sorted = Float32Array.from(g).sort();
  const lo = sorted[Math.floor(sorted.length * 0.2)];
  const hi = sorted[Math.floor(sorted.length * 0.8)];
  void size;
  return Math.min(1, (hi - lo) / 255);
}
