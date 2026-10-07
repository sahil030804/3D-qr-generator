/** Seeded 2D value noise + fBm with domain-warp support. */
export class Noise2D {
    constructor(seed = 1337) {
        const p = new Uint8Array(512);
        const base = new Uint8Array(256);
        for (let i = 0; i < 256; i++)
            base[i] = i;
        let s = seed >>> 0 || 1;
        const rnd = () => {
            s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
            return s / 4294967296;
        };
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            const t = base[i];
            base[i] = base[j];
            base[j] = t;
        }
        for (let i = 0; i < 512; i++)
            p[i] = base[i & 255];
        this.perm = p;
    }
    fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }
    grad(hash, x, y) {
        switch (hash & 7) {
            case 0: return x + y;
            case 1: return x - y;
            case 2: return -x + y;
            case 3: return -x - y;
            case 4: return x;
            case 5: return -x;
            case 6: return y;
            default: return -y;
        }
    }
    /** Raw noise in [-1, 1] */
    noise(x, y) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        const xf = x - Math.floor(x);
        const yf = y - Math.floor(y);
        const p = this.perm;
        const aa = p[p[X] + Y];
        const ab = p[p[X] + Y + 1];
        const ba = p[p[X + 1] + Y];
        const bb = p[p[X + 1] + Y + 1];
        const u = this.fade(xf);
        const v = this.fade(yf);
        const x1 = this.grad(aa, xf, yf) + u * (this.grad(ba, xf - 1, yf) - this.grad(aa, xf, yf));
        const x2 = this.grad(ab, xf, yf - 1) + u * (this.grad(bb, xf - 1, yf - 1) - this.grad(ab, xf, yf - 1));
        return (x1 + v * (x2 - x1)) * 0.7071;
    }
    /** Fractal Brownian motion in [-1, 1] */
    fbm(x, y, octaves = 4, lacunarity = 2.02, gain = 0.5) {
        let amp = 0.5;
        let freq = 1;
        let sum = 0;
        let norm = 0;
        for (let i = 0; i < octaves; i++) {
            sum += amp * this.noise(x * freq, y * freq);
            norm += amp;
            amp *= gain;
            freq *= lacunarity;
        }
        return sum / (norm || 1);
    }
    /** Domain-warped fbm for organic variation. warp in world units. */
    warped(x, y, warp = 0.6, octaves = 4) {
        const qx = this.fbm(x + 5.2, y + 1.3, 3);
        const qy = this.fbm(x + 1.7, y + 9.2, 3);
        return this.fbm(x + warp * qx * 2, y + warp * qy * 2, octaves);
    }
    /** Normalized to [0, 1] */
    unit(x, y, octaves = 4) {
        return this.fbm(x, y, octaves) * 0.5 + 0.5;
    }
}
