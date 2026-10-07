import { describe, it, expect } from 'vitest';
import { generateQRMatrix } from './QRGenerator';
import { QRField } from './QRField';
describe('QRField', () => {
    const qr = generateQRMatrix('field-test-content');
    const fieldFor = () => new QRField(qr);
    it('sharp() reproduces the raw matrix incl. quiet zone', () => {
        const f = fieldFor();
        const t = f.total;
        // center of module (r,c) maps to uv ((c+0.5)/t, (r+0.5)/t)
        for (let r = 0; r < qr.size; r += 3) {
            for (let c = 0; c < qr.size; c += 3) {
                const u = (c + f.quietZone + 0.5) / t;
                const v = (r + f.quietZone + 0.5) / t;
                expect(f.sharp(u, v)).toBe(qr.matrix[r][c] ? 1 : 0);
            }
        }
        // quiet zone corners are light
        expect(f.sharp(0.01, 0.01)).toBe(0);
        expect(f.sharp(0.99, 0.99)).toBe(0);
    });
    it('combined() stays in [0,1] and tracks module polarity', () => {
        const f = fieldFor();
        let darkSum = 0;
        let lightSum = 0;
        let darkN = 0;
        let lightN = 0;
        for (let r = 0; r < qr.size; r++) {
            for (let c = 0; c < qr.size; c++) {
                const u = (c + f.quietZone + 0.5) / f.total;
                const v = (r + f.quietZone + 0.5) / f.total;
                const val = f.combined(u, v);
                expect(val).toBeGreaterThanOrEqual(0);
                expect(val).toBeLessThanOrEqual(1);
                if (qr.matrix[r][c]) {
                    darkSum += val;
                    darkN++;
                }
                else {
                    lightSum += val;
                    lightN++;
                }
            }
        }
        // dark modules must average clearly above light modules (decodability margin)
        expect(darkSum / darkN - lightSum / lightN).toBeGreaterThan(0.35);
    });
    it('worldToUV maps the square consistently', () => {
        const f = fieldFor();
        const [u, v] = f.worldToUV(0, 0, 24);
        expect(u).toBeCloseTo(0.5);
        expect(v).toBeCloseTo(0.5);
        const [u2] = f.worldToUV(-12, 0, 24);
        expect(u2).toBeCloseTo(0);
    });
});
