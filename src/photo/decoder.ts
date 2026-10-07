import type { RGBA } from './imageOps';

type Reader = typeof import('zxing-wasm/reader');
let readerPromise: Promise<Reader> | null = null;

async function loadReader(): Promise<Reader> {
  readerPromise ??= (async () => {
    const reader = await import('zxing-wasm/reader');
    if (typeof window !== 'undefined') {
      // In the browser, serve the WebAssembly from our own bundle instead of a CDN.
      const wasmUrl = (await import('zxing-wasm/reader/zxing_reader.wasm?url')).default;
      reader.setZXingModuleOverrides({
        locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
      });
    }
    return reader;
  })();
  return readerPromise;
}

/**
 * Decode a QR code with ZXing (the engine Android scanners use). Unlike jsQR it copes with codes drawn over a
 * photograph, so it is what we trust to say a photo code is scannable.
 */
export async function decodeWithZXing(image: RGBA): Promise<string | null> {
  const { readBarcodes } = await loadReader();
  const imageData = { data: image.data, width: image.width, height: image.height, colorSpace: 'srgb' } as ImageData;
  const results = await readBarcodes(imageData, { formats: ['QRCode'], tryHarder: true, maxNumberOfSymbols: 1 });
  return results[0]?.text ?? null;
}
