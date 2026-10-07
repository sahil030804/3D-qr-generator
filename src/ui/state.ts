import { MAX_QR_CHARS } from '../core/qr/QRGenerator';
import { OBJECTS } from '../objects';
import { TIMES_OF_DAY, type TimeOfDay } from '../render/lighting';

export interface AppState {
  text: string;
  objectId: string;
  variantId: string;
  time: TimeOfDay;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): string | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** Parse shareable state from a query string, ignoring anything invalid. */
export function readState(search: string, fallback: AppState): AppState {
  const params = new URLSearchParams(search);
  const text = params.get('q') ? fromBase64Url(params.get('q')!) : null;
  const object = OBJECTS.find((o) => o.id === params.get('o'));
  const variant = object?.variants.find((v) => v.id === params.get('v'));
  const time = TIMES_OF_DAY.find((t) => t === params.get('t'));
  return {
    text: text && text.trim() && text.length <= MAX_QR_CHARS ? text : fallback.text,
    objectId: object?.id ?? fallback.objectId,
    variantId: variant?.id ?? (object ?? OBJECTS.find((o) => o.id === fallback.objectId)!).variants[0].id,
    time: time ?? fallback.time,
  };
}

export function writeQuery(state: AppState): string {
  const params = new URLSearchParams();
  params.set('q', toBase64Url(state.text));
  params.set('o', state.objectId);
  params.set('v', state.variantId);
  params.set('t', state.time);
  return params.toString();
}
