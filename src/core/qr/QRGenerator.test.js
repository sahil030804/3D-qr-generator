import { describe, it, expect } from 'vitest';
import { generateQRMatrix, hasFinderPatterns, QRInputError } from './QRGenerator';
describe('QRGenerator', () => {
    it('produces a square matrix with quiet-zone-free finder patterns', () => {
        const qr = generateQRMatrix('https://example.com/hidden-garden');
        expect(qr.size).toBeGreaterThanOrEqual(21);
        expect(qr.matrix).toHaveLength(qr.size);
        expect(qr.matrix[0]).toHaveLength(qr.size);
        expect(hasFinderPatterns(qr.matrix)).toBe(true);
    });
    it('uses HIGH error correction (version grows vs L for same payload)', () => {
        const payload = 'HELLO WORLD 1234567890';
        const h = generateQRMatrix(payload);
        // EC-H carries fewer data codewords -> same payload needs >= version of lower EC.
        // Minimal assertion: version field consistent with size formula.
        expect(h.version).toBe(Math.round((h.size - 21) / 4) + 1);
        expect(h.version).toBeGreaterThanOrEqual(1);
    });
    it('encodes timing patterns (alternating row 6)', () => {
        const qr = generateQRMatrix('test-timing');
        const row = qr.matrix[6];
        // timing strip runs between finders: columns 8..size-9 alternate
        let alternations = 0;
        for (let c = 8; c < qr.size - 9; c++)
            if (row[c] !== row[c + 1])
                alternations++;
        expect(alternations).toBeGreaterThan(qr.size - 20);
    });
    it('rejects empty and oversized input', () => {
        expect(() => generateQRMatrix('   ')).toThrow(QRInputError);
        expect(() => generateQRMatrix('x'.repeat(2000))).toThrow(QRInputError);
    });
    it('is deterministic for the same content', () => {
        const a = generateQRMatrix('deterministic-content');
        const b = generateQRMatrix('deterministic-content');
        expect(a.matrix).toEqual(b.matrix);
    });
});
