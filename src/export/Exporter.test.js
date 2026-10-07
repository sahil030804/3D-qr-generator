import { describe, it, expect } from 'vitest';
import { encodeConfig, decodeConfig } from './Exporter';
describe('shareable config', () => {
    it('round-trips through URL hash encoding', () => {
        const cfg = { content: 'hello qr', preset: 'forest', params: { seed: 42, density: 0.9 } };
        const hash = encodeConfig(cfg);
        expect(hash).not.toMatch(/[+/=]/);
        expect(decodeConfig(hash)).toEqual(cfg);
    });
    it('returns null for garbage', () => {
        expect(decodeConfig('!!!not-valid!!!')).toBeNull();
    });
});
