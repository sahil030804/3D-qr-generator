import { describe, expect, it } from 'vitest';
import { BlockedImageError, fetchPhotoFile, parseImageUrl, proxiedUrl } from './photoUrl';

const respond = (body: BlobPart, init: ResponseInit & { type?: string } = {}): typeof fetch =>
  (async () => new Response(new Blob([body], { type: init.type ?? 'image/png' }), init)) as typeof fetch;

describe('parseImageUrl', () => {
  it('accepts http and https links and assumes https when the scheme is missing', () => {
    expect(parseImageUrl(' https://example.com/a.jpg ').href).toBe('https://example.com/a.jpg');
    expect(parseImageUrl('http://example.com/a.png').protocol).toBe('http:');
    expect(parseImageUrl('example.com/a.webp').href).toBe('https://example.com/a.webp');
    expect(parseImageUrl('localhost:5201/a.png').href).toBe('https://localhost:5201/a.png');
  });

  it('rejects empty input, other schemes and non-links', () => {
    expect(() => parseImageUrl('  ')).toThrow(/Paste a link/);
    expect(() => parseImageUrl('javascript:alert(1)')).toThrow(/http and https/);
    expect(() => parseImageUrl('file:///etc/passwd')).toThrow(/http and https/);
    expect(() => parseImageUrl('data:image/png;base64,AAAA')).toThrow(/http and https/);
    expect(() => parseImageUrl('my cat photo')).toThrow(/web link/);
    expect(() => parseImageUrl('localhost')).toThrow(/web link/);
  });
});

describe('fetchPhotoFile', () => {
  const url = new URL('https://cdn.example.com/pics/my%20face.png?size=big');

  it('returns the image as a named file', async () => {
    const file = await fetchPhotoFile(url, respond('x'));
    expect(file.type).toBe('image/png');
    expect(file.name).toBe('my face.png');
  });

  it('explains a blocked or failed request', async () => {
    const blocked = (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;
    await expect(fetchPhotoFile(url, blocked)).rejects.toBeInstanceOf(BlockedImageError);
  });

  it('reports HTTP errors and non-image answers', async () => {
    await expect(fetchPhotoFile(url, respond('no', { status: 404 }))).rejects.toThrow(/404/);
    await expect(fetchPhotoFile(url, respond('<html>', { type: 'text/html' }))).rejects.toThrow(/not an image/);
  });

  it('recognizes an image served with a made-up content type by its bytes', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]);
    const file = await fetchPhotoFile(url, respond(jpeg, { type: 'JPG' }));
    expect(file.type).toBe('image/jpeg');
  });

  it('refuses images that declare more than the size limit', async () => {
    const huge = (async () => new Response('x', { headers: { 'content-length': String(30 * 1024 * 1024), 'content-type': 'image/png' } })) as typeof fetch;
    await expect(fetchPhotoFile(url, huge)).rejects.toThrow(/25 MB/);
  });
});

describe('proxiedUrl', () => {
  it('passes the whole link, query string included, as one encoded parameter', () => {
    const original = new URL('https://cdn.example.com/a b.jpg?Expires=1&Signature=a~b__&x=1');
    const proxy = proxiedUrl(original);
    expect(proxy.origin).toBe('https://images.weserv.nl');
    expect(proxy.searchParams.get('url')).toBe(original.href);
    expect(proxy.search.split('&').length).toBe(1);
  });

  it('keeps the original file name', async () => {
    const original = new URL('https://cdn.example.com/pics/face.png');
    const file = await fetchPhotoFile(proxiedUrl(original), respond('x'), original);
    expect(file.name).toBe('face.png');
  });
});
