import jsQR from 'jsqr';

/** Decode a QR code from rendered pixels, or null if none is readable. */
export function decodeImage(image: ImageData): string | null {
  return jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
}
