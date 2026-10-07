import { describe, expect, it } from 'vitest';
import { embedDataToFile } from './photoSession';

// photoToEmbedData (the encode direction) draws through a <canvas>, so it is covered by browser testing
// rather than here — this unit test exercises the decode direction, which is plain base64url and runs in Node.
describe('embedDataToFile', () => {
  it('decodes base64url bytes (with - and _ in place of + and /) back into a file of the given type', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x10, 0xfb, 0xef, 0xbe]);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const base64url = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const file = embedDataToFile({ data: base64url, mime: 'image/jpeg' });
    expect(file.type).toBe('image/jpeg');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
  });

  it('falls back to image/jpeg when no mime is given', () => {
    expect(embedDataToFile({ data: 'QQ', mime: '' }).type).toBe('image/jpeg');
  });

  it('rejects non-raster types and malformed payloads', () => {
    expect(() => embedDataToFile({ data: 'QQ', mime: 'image/svg+xml' })).toThrow();
    expect(() => embedDataToFile({ data: 'QQ', mime: 'text/html' })).toThrow();
    expect(() => embedDataToFile({ data: '!!!', mime: 'image/jpeg' })).toThrow();
    expect(() => embedDataToFile({ data: '', mime: 'image/jpeg' })).toThrow();
  });
});
