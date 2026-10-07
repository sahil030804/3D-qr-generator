/** Small, dependency-free image helpers that work on plain typed arrays (so they run in tests too). */

export interface RGBA {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export const luma = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Area-average resize of a float plane; exact box filtering when shrinking. */
export function resizePlane(src: Float32Array, sw: number, sh: number, tw: number, th: number): Float32Array {
  const out = new Float32Array(tw * th);
  const xr = sw / tw;
  const yr = sh / th;
  for (let ty = 0; ty < th; ty++) {
    const y0 = ty * yr;
    const y1 = Math.min(sh, y0 + yr);
    for (let tx = 0; tx < tw; tx++) {
      const x0 = tx * xr;
      const x1 = Math.min(sw, x0 + xr);
      let sum = 0;
      let weight = 0;
      for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
          const w = wy * (Math.min(x + 1, x1) - Math.max(x, x0));
          sum += src[y * sw + x] * w;
          weight += w;
        }
      }
      out[ty * tw + tx] = weight ? sum / weight : 0;
    }
  }
  return out;
}

/** Area-average resize of an RGBA image (alpha is flattened onto white). */
export function resizeRGBA(src: RGBA, tw: number, th: number): RGBA {
  const n = src.width * src.height;
  const planes = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) {
    const a = src.data[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) planes[c][i] = src.data[i * 4 + c] * a + 255 * (1 - a);
  }
  const resized = planes.map((p) => resizePlane(p, src.width, src.height, tw, th));
  const data = new Uint8ClampedArray(tw * th * 4);
  for (let i = 0; i < tw * th; i++) {
    for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(resized[c][i]);
    data[i * 4 + 3] = 255;
  }
  return { data, width: tw, height: th };
}

/** Center-crop to a square. */
export function cropSquare(src: RGBA): RGBA {
  const side = Math.min(src.width, src.height);
  const x0 = Math.floor((src.width - side) / 2);
  const y0 = Math.floor((src.height - side) / 2);
  const data = new Uint8ClampedArray(side * side * 4);
  for (let y = 0; y < side; y++) {
    const from = ((y0 + y) * src.width + x0) * 4;
    data.set(src.data.subarray(from, from + side * 4), y * side * 4);
  }
  return { data, width: side, height: side };
}

/** Separable box blur on a float plane. */
export function boxBlur(src: Float32Array, size: number, radius: number): Float32Array {
  if (radius <= 0) return src.slice();
  const tmp = new Float32Array(size * size);
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      let count = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < size) { sum += src[y * size + xx]; count++; }
      }
      tmp[y * size + x] = sum / count;
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      let count = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < size) { sum += tmp[yy * size + x]; count++; }
      }
      out[y * size + x] = sum / count;
    }
  }
  return out;
}

/** Gaussian blur of an RGBA image (used to imitate a phone camera when checking scan robustness). */
export function gaussianBlurRGBA(src: RGBA, sigma: number): RGBA {
  if (sigma <= 0) return src;
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float32Array(radius * 2 + 1);
  let total = 0;
  for (let i = -radius; i <= radius; i++) { kernel[i + radius] = Math.exp(-(i * i) / (2 * sigma * sigma)); total += kernel[i + radius]; }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= total;
  const { width: w, height: h } = src;
  const pass = (from: Float32Array, horizontal: boolean): Float32Array => {
    const to = new Float32Array(from.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) {
          const xx = horizontal ? Math.min(w - 1, Math.max(0, x + k)) : x;
          const yy = horizontal ? y : Math.min(h - 1, Math.max(0, y + k));
          sum += from[yy * w + xx] * kernel[k + radius];
        }
        to[y * w + x] = sum;
      }
    }
    return to;
  };
  const data = new Uint8ClampedArray(src.data.length);
  for (let c = 0; c < 3; c++) {
    const plane = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) plane[i] = src.data[i * 4 + c];
    const blurred = pass(pass(plane, true), false);
    for (let i = 0; i < w * h; i++) data[i * 4 + c] = Math.round(blurred[i]);
  }
  for (let i = 0; i < w * h; i++) data[i * 4 + 3] = 255;
  return { data, width: w, height: h };
}

/** Add a white quiet zone of `margin` pixels around an image. */
export function padWhite(src: RGBA, margin: number): RGBA {
  const w = src.width + margin * 2;
  const h = src.height + margin * 2;
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 0; y < src.height; y++) data.set(src.data.subarray(y * src.width * 4, (y + 1) * src.width * 4), ((y + margin) * w + margin) * 4);
  return { data, width: w, height: h };
}
