import { heuristicDepth } from './heuristicDepth';
import { resizePlane, resizeRGBA, type RGBA } from './imageOps';

export type DepthSource = 'model' | 'heuristic';

export interface DepthResult {
  /** 0 = farthest, 1 = nearest, one value per input pixel. */
  depth: Float32Array;
  source: DepthSource;
}

export type StatusFn = (message: string, fraction?: number) => void;

/**
 * Depth Anything V2 (small, int8) exported to ONNX. Downloaded once on first use and kept in the browser's cache.
 * Set VITE_DEPTH_MODEL_URL to host it yourself.
 */
const MODEL_URL: string = import.meta.env?.VITE_DEPTH_MODEL_URL
  ?? 'https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model_quantized.onnx';
const CACHE_NAME = 'voxel-qr-models-v1';
const INPUT_SIZE = 392; // a multiple of 14, which the network requires
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

async function fetchModel(onStatus: StatusFn): Promise<ArrayBuffer> {
  const cache = 'caches' in globalThis ? await caches.open(CACHE_NAME) : null;
  const hit = await cache?.match(MODEL_URL);
  if (hit) {
    onStatus('Loading depth model…');
    return hit.arrayBuffer();
  }
  const response = await fetch(MODEL_URL);
  if (!response.ok || !response.body) throw new Error(`Depth model download failed (${response.status}).`);
  const total = Number(response.headers.get('content-length')) || 0;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onStatus(`Downloading depth model (one time, ${(received / 1e6).toFixed(0)}${total ? ` of ${(total / 1e6).toFixed(0)}` : ''} MB)…`, total ? received / total : undefined);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    await cache?.put(MODEL_URL, new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } }));
  } catch {
    /* storage full or blocked: the model still works this session */
  }
  return bytes.buffer;
}

type Ort = typeof import('onnxruntime-web/wasm');
let sessionPromise: Promise<{ ort: Ort; session: import('onnxruntime-web/wasm').InferenceSession }> | null = null;

function loadSession(onStatus: StatusFn): Promise<{ ort: Ort; session: import('onnxruntime-web/wasm').InferenceSession }> {
  sessionPromise ??= (async () => {
    const ort = await import('onnxruntime-web/wasm');
    const wasmUrl = (await import('onnxruntime-web/ort-wasm-simd-threaded.wasm?url')).default;
    ort.env.wasm.wasmPaths = { wasm: wasmUrl } as unknown as typeof ort.env.wasm.wasmPaths;
    ort.env.wasm.numThreads = 1;
    const bytes = await fetchModel(onStatus);
    onStatus('Preparing depth model…');
    const session = await ort.InferenceSession.create(new Uint8Array(bytes), { executionProviders: ['wasm'] });
    return { ort, session };
  })().catch((error) => {
    sessionPromise = null; // allow a retry next time
    throw error;
  });
  return sessionPromise;
}

async function modelDepth(image: RGBA, onStatus: StatusFn): Promise<Float32Array> {
  const { ort, session } = await loadSession(onStatus);
  onStatus('Estimating depth…');
  const small = resizeRGBA(image, INPUT_SIZE, INPUT_SIZE);
  const plane = INPUT_SIZE * INPUT_SIZE;
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) input[c * plane + i] = (small.data[i * 4 + c] / 255 - MEAN[c]) / STD[c];
  }
  const feeds = { [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE]) };
  const outputs = await session.run(feeds);
  const raw = outputs[session.outputNames[0]];
  const data = raw.data as Float32Array;
  const side = Math.round(Math.sqrt(data.length));
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < data.length; i++) { if (data[i] < min) min = data[i]; if (data[i] > max) max = data[i]; }
  const normalized = new Float32Array(data.length);
  const range = max - min || 1;
  for (let i = 0; i < data.length; i++) normalized[i] = (data[i] - min) / range;
  return resizePlane(normalized, side, side, image.width, image.height);
}

/**
 * Per-pixel depth of a square picture. Uses the depth model when it can be loaded and quietly falls back to a
 * simple built-in relief when it cannot (offline, blocked, unsupported), so a photo always produces a model.
 */
export async function estimateDepth(image: RGBA, onStatus: StatusFn = () => {}): Promise<DepthResult> {
  try {
    return { depth: await modelDepth(image, onStatus), source: 'model' };
  } catch (error) {
    console.warn('Depth model unavailable, using the built-in relief instead.', error);
    onStatus('Shaping the relief…');
    return { depth: heuristicDepth(image), source: 'heuristic' };
  }
}
