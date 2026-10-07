import { MAX_QR_CHARS } from '../core/qr/QRGenerator';

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
}

/** Returns null when the page is not in embed mode. */
export function parseEmbed(search: string): EmbedOptions | null {
  const params = new URLSearchParams(search);
  const flag = params.get('embed');
  if (flag === null || flag === '0' || flag === 'false') return null;
  const text = params.get('text')?.trim();
  return {
    text: text && text.length <= MAX_QR_CHARS ? text : undefined,
    background: params.get('bg') === 'transparent' ? 'transparent' : 'sky',
    controls: params.get('controls') !== '0',
    hint: params.get('hint') !== '0',
    rotate: params.get('rotate') !== '0',
    view: params.get('view') === 'scan' ? 'scan' : 'object',
    timeGiven: params.has('t'),
  };
}

export interface EmbedSource {
  text: string;
  objectId: string;
  variantId: string;
  time: string;
}

/** A link to the embeddable view of the current model. */
export function embedUrl(base: string, source: EmbedSource, extra: { bg?: 'transparent' } = {}): string {
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  url.searchParams.set('embed', '1');
  url.searchParams.set('text', source.text);
  url.searchParams.set('o', source.objectId);
  url.searchParams.set('v', source.variantId);
  url.searchParams.set('t', source.time);
  if (extra.bg) url.searchParams.set('bg', extra.bg);
  return url.toString();
}

/** Copy-paste HTML for the iframe. Responsive: it fills its container up to `size` pixels and stays square. */
export function embedSnippet(src: string, size = 480): string {
  return [
    `<iframe`,
    `  src="${src.replace(/&/g, '&amp;')}"`,
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
