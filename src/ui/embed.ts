import { MAX_QR_CHARS } from '../core/qr/QRGenerator';
import type { LookName } from '../photo/scanColors';

/** Scan strength carried into an embedded photo; `auto` plus the photo pipeline's looks (type-only, no runtime cost). */
export type EmbedLook = 'auto' | LookName;
const EMBED_LOOKS: readonly EmbedLook[] = ['auto', 'soft', 'firm', 'max'];

/** Longest `img` value accepted from an embed hash (chars). Tens of KB is expected; this caps abuse at ~375 KB decoded. */
const MAX_EMBED_DATA_CHARS = 500_000;
/** Raster types the embed decoder accepts; `photoToEmbedData` always produces `image/jpeg`. */
const EMBED_MIMES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

function isBase64Url(value: string): boolean {
  return value.length > 0 && value.length <= MAX_EMBED_DATA_CHARS && /^[A-Za-z0-9\-_]*$/.test(value);
}

function normalizeEmbedMime(mime: string | null): string | undefined {
  if (!mime) return undefined;
  const clean = mime.split(';')[0].trim().toLowerCase();
  return EMBED_MIMES.includes(clean) ? clean : undefined;
}

/** A small, re-compressed copy of an uploaded or linked photo, carried in the embed URL's hash. */
export interface EmbedPhoto {
  data: string;
  mime: string;
  look: EmbedLook;
}

/** Options read from the query string when the app runs inside an iframe (`?embed=1`). */
export interface EmbedOptions {
  /** Plain-text content to encode (URL-encoded in the query), as an easier alternative to the base64 `q`. */
  text?: string;
  /** `transparent` lets the host page show through; `sky` draws the scene's own backdrop. */
  background: 'sky' | 'transparent';
  /** Show the small Reveal button. */
  controls: boolean;
  /** Show the small "tap to reveal" hint until the first interaction. */
  hint: boolean;
  /** Gently sway the model when idle. */
  rotate: boolean;
  /** Start on the flat QR instead of the 3D model. */
  view: 'object' | 'scan';
  /** The user explicitly picked a time of day; otherwise embeds default to a bright daytime. */
  timeGiven: boolean;
  /** A photo to show instead of a built-in object, read from the URL's hash. */
  photo?: EmbedPhoto;
}

/** Returns null when the page is not in embed mode. `hash` is the URL's fragment (with or without its leading `#`). */
export function parseEmbed(search: string, hash = ''): EmbedOptions | null {
  const params = new URLSearchParams(search);
  const flag = params.get('embed');
  if (flag === null || flag === '0' || flag === 'false') return null;
  const text = params.get('text')?.trim();
  const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
  const rawData = hashParams.get('img');
  const mime = normalizeEmbedMime(hashParams.get('mime'));
  const look = hashParams.get('look');
  const photo: EmbedPhoto | undefined =
    rawData && mime && isBase64Url(rawData)
      ? { data: rawData, mime, look: EMBED_LOOKS.includes(look as EmbedLook) ? (look as EmbedLook) : 'auto' }
      : undefined;
  return {
    text: text && text.length <= MAX_QR_CHARS ? text : undefined,
    background: params.get('bg') === 'transparent' ? 'transparent' : 'sky',
    controls: params.get('controls') !== '0',
    hint: params.get('hint') !== '0',
    rotate: params.get('rotate') !== '0',
    view: params.get('view') === 'scan' ? 'scan' : 'object',
    timeGiven: params.has('t'),
    photo,
  };
}

export interface EmbedSource {
  text: string;
  objectId: string;
  variantId: string;
  time: string;
}

/** A link to the embeddable view of the current model. `photo` carries a photo model's picture; see {@link EmbedPhoto}. */
export function embedUrl(base: string, source: EmbedSource, options: { bg?: 'transparent'; photo?: EmbedPhoto } = {}): string {
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  url.searchParams.set('embed', '1');
  url.searchParams.set('text', source.text);
  url.searchParams.set('o', source.objectId);
  url.searchParams.set('v', source.variantId);
  url.searchParams.set('t', source.time);
  if (options.bg) url.searchParams.set('bg', options.bg);
  if (options.photo) {
    const hash = new URLSearchParams();
    hash.set('img', options.photo.data);
    hash.set('mime', options.photo.mime);
    hash.set('look', options.photo.look);
    url.hash = hash.toString();
  }
  return url.toString();
}

/** Escape a URL for use inside a double-quoted HTML attribute. */
function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Copy-paste HTML for the iframe. Responsive: it fills its container up to `size` pixels and stays square. */
export function embedSnippet(src: string, size = 480): string {
  return [
    `<iframe`,
    `  src="${escapeAttr(src)}"`,
    `  title="Interactive 3D QR code"`,
    `  width="${size}" height="${size}"`,
    `  style="border:0;width:100%;max-width:${size}px;aspect-ratio:1/1"`,
    `  loading="lazy"`,
    `  allow="fullscreen"`,
    `></iframe>`,
  ].join('\n');
}

/** Messages the embed sends to the page that contains it. */
export interface EmbedEvent {
  source: 'voxel-qr';
  type: 'ready' | 'state';
  mode: 'object' | 'scan';
  busy: boolean;
}

/** Commands a host page may send to the embed. */
export type EmbedCommand = 'reveal' | 'hide' | 'toggle';

export function parseCommand(data: unknown): EmbedCommand | null {
  if (!data || typeof data !== 'object') return null;
  const message = data as { source?: unknown; command?: unknown };
  if (message.source !== 'voxel-qr-host') return null;
  return message.command === 'reveal' || message.command === 'hide' || message.command === 'toggle' ? message.command : null;
}
