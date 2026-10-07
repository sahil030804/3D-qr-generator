import { MAX_PHOTO_BYTES, PhotoReadError } from './photoSession';

const FETCH_TIMEOUT_MS = 20_000;
const PROXY_ORIGIN = 'https://images.weserv.nl/';

/** The site refused (or could not be reached for) a cross-site read; going through the proxy may still work. */
export class BlockedImageError extends PhotoReadError {}

/** The same image, fetched by the proxy's server (where CORS does not apply). Only used when the person asks for it. */
export function proxiedUrl(url: URL): URL {
  const proxy = new URL(PROXY_ORIGIN);
  proxy.searchParams.set('url', url.href);
  return proxy;
}

/** Accept what people actually paste: trims, and assumes https when the scheme is missing. Only http(s) is allowed. */
export function parseImageUrl(input: string): URL {
  const text = input.trim();
  if (!text) throw new PhotoReadError('Paste a link to an image first.');
  // "host:8080/x" is a host and port, not a scheme; real schemes are followed by // or are one of the usual non-web ones.
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) || /^(javascript|data|file|blob|mailto|tel|ftp|about|vbscript):/i.test(text);
  if (!hasScheme && (/\s/.test(text) || !/[.:]/.test(text))) throw new PhotoReadError('That does not look like a web link.');
  let url: URL;
  try {
    url = new URL(hasScheme ? text : `https://${text}`);
  } catch {
    throw new PhotoReadError('That does not look like a web link.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new PhotoReadError('Only http and https image links are supported.');
  return url;
}

/** The image type named by a file's first bytes, or null when it does not look like a picture. */
export async function sniffImageType(blob: Blob): Promise<string | null> {
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const startsWith = (...bytes: number[]): boolean => bytes.every((byte, index) => head[index] === byte);
  const ascii = (from: number, text: string): boolean => [...text].every((char, index) => head[from + index] === char.charCodeAt(0));
  if (startsWith(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (startsWith(0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (ascii(0, 'GIF8')) return 'image/gif';
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp';
  if (ascii(0, 'BM')) return 'image/bmp';
  if (ascii(4, 'ftyp') && (ascii(8, 'avif') || ascii(8, 'avis'))) return 'image/avif';
  return null;
}

function fileName(url: URL): string {
  const last = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '');
  return last || url.hostname;
}

/**
 * Download a public image straight from its own site. The site has to allow other sites to read it (CORS);
 * when it does not, the browser refuses and we say so instead of routing the image through a third party.
 */
export async function fetchPhotoFile(url: URL, fetchImpl: typeof fetch = fetch, nameFrom: URL = url): Promise<File> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetchImpl(url.href, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    } catch (error) {
      if (controller.signal.aborted) throw new PhotoReadError('That link took too long to answer.');
      const mixed = typeof location !== 'undefined' && location.protocol === 'https:' && url.protocol === 'http:';
      throw new BlockedImageError(
        mixed
          ? 'This page is secure, so it cannot load an http image. Try the https version of the link.'
          : 'Could not load that image. The site may not allow other sites to use its images.',
      );
    }
    if (!response.ok) throw new PhotoReadError(`The site answered with an error (${response.status}).`);
    const declared = Number(response.headers.get('content-length'));
    if (declared > MAX_PHOTO_BYTES) throw new PhotoReadError('That image is larger than 25 MB. Try a smaller one.');
    const blob = await response.blob();
    // Some storage setups label images with a made-up type ("JPG", "binary/octet-stream"), so trust the bytes over the header.
    const type = blob.type.startsWith('image/') ? blob.type : await sniffImageType(blob);
    if (!type) throw new PhotoReadError('That link is not an image. Use the direct link to the picture file.');
    return new File([blob], fileName(nameFrom), { type });
  } finally {
    clearTimeout(timer);
  }
}
