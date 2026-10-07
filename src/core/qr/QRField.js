/**
 * Continuous QR density field over normalized UV space.
 *
 * Pipeline: QR matrix -> padded grid (quiet zone) -> multi-scale blurred
 * pyramids -> bilinear sampling -> optional domain warp. Dark modules yield
 * values near 1, light modules near 0. Callers combine macro/medium/micro
 * scales with weights instead of mapping cells to objects.
 */
export class QRField {
    constructor(qr) {
        this.qr = qr;
        this.quietZone = 4;
        this.warpAmount = 0.012;
        this.modules = qr.size;
        this.total = qr.size + this.quietZone * 2;
        const t = this.total;
        this.raw = new Float32Array(t * t);
        for (let r = 0; r < qr.size; r++) {
            for (let c = 0; c < qr.size; c++) {
                if (qr.matrix[r][c])
                    this.raw[(r + this.quietZone) * t + (c + this.quietZone)] = 1;
            }
        }
        this.macro = this.boxBlur(this.raw, t, Math.max(2, Math.round(qr.size / 12)));
        this.medium = this.boxBlur(this.raw, t, 1);
    }
    boxBlur(src, t, radius) {
        if (radius <= 0)
            return src.slice();
        const tmp = new Float32Array(src.length);
        const out = new Float32Array(src.length);
        for (let r = 0; r < t; r++) {
            let acc = 0;
            for (let c = -radius; c <= radius; c++)
                acc += src[r * t + Math.min(t - 1, Math.max(0, c))];
            for (let c = 0; c < t; c++) {
                const add = src[r * t + Math.min(t - 1, c + radius + (radius > 0 ? 0 : 0))] ?? 0;
                void add;
                tmp[r * t + c] = acc / (radius * 2 + 1);
                const outIdx = c - radius;
                const inIdx = c + radius + 1;
                acc += (inIdx < t ? src[r * t + inIdx] : src[r * t + t - 1]) - (outIdx >= 0 ? src[r * t + outIdx] : src[r * t]);
            }
        }
        for (let c = 0; c < t; c++) {
            let acc = 0;
            for (let r = -radius; r <= radius; r++)
                acc += tmp[Math.min(t - 1, Math.max(0, r)) * t + c];
            for (let r = 0; r < t; r++) {
                out[r * t + c] = acc / (radius * 2 + 1);
                const outIdx = r - radius;
                const inIdx = r + radius + 1;
                acc += (inIdx < t ? tmp[inIdx * t + c] : tmp[(t - 1) * t + c]) - (outIdx >= 0 ? tmp[outIdx * t + c] : tmp[c]);
            }
        }
        return out;
    }
    /** Bilinear sample of a grid at uv in [0,1] (texel-center aligned). */
    sampleGrid(grid, u, v) {
        const t = this.total;
        const x = Math.min(t - 1.001, Math.max(0, u * t - 0.5));
        const y = Math.min(t - 1.001, Math.max(0, v * t - 0.5));
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const fx = x - x0;
        const fy = y - y0;
        const a = grid[y0 * t + x0];
        const b = grid[y0 * t + x0 + 1];
        const c = grid[Math.min(t - 1, y0 + 1) * t + x0];
        const d = grid[Math.min(t - 1, y0 + 1) * t + x0 + 1];
        return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
    }
    /**
     * Warped UV lookup. warpFn maps (u,v)->[du,dv] offsets (e.g. from noise).
     * Keep offsets small (< ~0.5 module) so decodability survives.
     */
    warpUV(u, v, warpFn) {
        if (!warpFn)
            return [u, v];
        const [du, dv] = warpFn(u, v);
        return [
            Math.min(1, Math.max(0, u + du * this.warpAmount)),
            Math.min(1, Math.max(0, v + dv * this.warpAmount)),
        ];
    }
    /** Sharp (nearest-module) value: 1 dark / 0 light. */
    sharp(u, v) {
        const t = this.total;
        const c = Math.min(t - 1, Math.max(0, Math.floor(u * t)));
        const r = Math.min(t - 1, Math.max(0, Math.floor(v * t)));
        return this.raw[r * t + c];
    }
    smooth(u, v, warpFn) {
        const [wu, wv] = this.warpUV(u, v, warpFn);
        return this.sampleGrid(this.medium, wu, wv);
    }
    macroField(u, v, warpFn) {
        const [wu, wv] = this.warpUV(u, v, warpFn);
        return this.sampleGrid(this.macro, wu, wv);
    }
    /**
     * Weighted multi-scale field: macro*0.35 + medium*0.3 + micro*0.35.
     * Micro samples the raw grid so module polarity survives; macro/medium
     * provide the natural large-scale structure.
     */
    combined(u, v, weights = [0.35, 0.3, 0.35], warpFn) {
        const [wu, wv] = this.warpUV(u, v, warpFn);
        const m = this.sampleGrid(this.macro, wu, wv);
        const med = this.sampleGrid(this.medium, wu, wv);
        const mic = this.sampleGrid(this.raw, wu, wv);
        return m * weights[0] + med * weights[1] + mic * weights[2];
    }
    /** World (x,z) -> uv given square worldSize centered at origin. */
    worldToUV(x, z, worldSize) {
        return [x / worldSize + 0.5, z / worldSize + 0.5];
    }
    /** Draw matrix preview to a 2D canvas (debug mode). */
    drawToCanvas(canvas, scale = 4) {
        const t = this.total;
        canvas.width = t * scale;
        canvas.height = t * scale;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000';
        const grid = this.raw;
        for (let r = 0; r < t; r++) {
            for (let c = 0; c < t; c++) {
                if (grid[r * t + c] > 0.5)
                    ctx.fillRect(c * scale, r * scale, scale, scale);
            }
        }
    }
    /** Draw smooth field heatmap (debug mode). */
    drawFieldToCanvas(canvas, res = 128) {
        canvas.width = res;
        canvas.height = res;
        const ctx = canvas.getContext('2d');
        const img = ctx.createImageData(res, res);
        for (let y = 0; y < res; y++) {
            for (let x = 0; x < res; x++) {
                const v = this.combined(x / res, y / res);
                const i = (y * res + x) * 4;
                img.data[i] = v * 255;
                img.data[i + 1] = v * 120;
                img.data[i + 2] = 255 - v * 200;
                img.data[i + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
    }
}
