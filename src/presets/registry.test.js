import { describe, it, expect } from 'vitest';
import { PRESETS } from './index';
describe('preset registry', () => {
    it('exposes all required presets with unique ids', () => {
        const ids = PRESETS.map((p) => p.id);
        for (const need of [
            'cherry-blossom', 'forest', 'flower-field', 'mountain', 'crystal',
            'mushroom', 'coral', 'temple', 'city', 'custom',
        ]) {
            expect(ids).toContain(need);
        }
        expect(new Set(ids).size).toBe(ids.length);
    });
    it('every preset implements generate() with a QR world size', () => {
        for (const p of PRESETS) {
            expect(typeof p.generate).toBe('function');
            expect(p.qrWorldSize).toBeGreaterThan(0);
            expect(p.name.length).toBeGreaterThan(0);
        }
    });
});
