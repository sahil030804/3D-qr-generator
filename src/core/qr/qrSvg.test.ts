import { describe, expect, it } from 'vitest';
import { generateQRMatrix } from './QRGenerator';
import { qrToSvg } from './qrSvg';

describe('qrToSvg', () => {
  it('produces a square SVG with the quiet zone included', () => {
    const qr = generateQRMatrix('https://example.com');
    const svg = qrToSvg(qr, 10);
    const side = (qr.size + 8) * 10;
    expect(svg).toContain(`viewBox="0 0 ${side} ${side}"`);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  it('draws exactly the dark modules', () => {
    const qr = generateQRMatrix('abc');
    const svg = qrToSvg(qr, 1);
    const path = /<path d="([^"]*)"/.exec(svg)![1];
    let area = 0;
    for (const match of path.matchAll(/h(\d+)v1/g)) area += Number(match[1]);
    const dark = qr.matrix.flat().filter(Boolean).length;
    expect(area).toBe(dark);
  });
});
