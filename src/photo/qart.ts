/**
 * QArt-style QR encoder. A QR code carries far more room than a short link needs: everything after the
 * message is padding that scanners ignore. We fill that room so the code's black-and-white pattern follows
 * a target image, then use Reed-Solomon's linearity (GF(2) algebra) to decide which few modules must
 * deviate. The result is a genuine, fully valid code that already resembles the picture.
 */
import { ALIGNMENT_POSITIONS, EC_BLOCKS_L } from './qrTables';

// ---------- GF(256), the field QR error correction lives in ----------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const gfMul = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

const generatorCache = new Map<number, Uint8Array>();
function generator(degree: number): Uint8Array {
  const cached = generatorCache.get(degree);
  if (cached) return cached;
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  const out = Uint8Array.from(poly);
  generatorCache.set(degree, out);
  return out;
}

/** Reed-Solomon parity bytes for a data block. */
export function rsParity(data: Uint8Array, parityLength: number): Uint8Array {
  const gen = generator(parityLength);
  const rem = new Uint8Array(parityLength);
  for (let i = 0; i < data.length; i++) {
    const coef = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[parityLength - 1] = 0;
    if (coef) for (let k = 0; k < parityLength; k++) rem[k] ^= gfMul(gen[k + 1], coef);
  }
  return rem;
}

// ---------- Frame: where function patterns and data modules go ----------

/** 0 = light function module, 1 = dark function module, 2 = data/ecc module. */
export interface Frame {
  version: number;
  size: number;
  kind: Uint8Array;
  /** Row-major cell index of every message bit, in placement order. */
  positions: Uint32Array;
}

const frameCache = new Map<number, Frame>();

/** Cell positions of the 15 format bits, bit 14 first. Two copies. */
function formatCells(size: number): [number, number][][] {
  const first: [number, number][] = [];
  for (let c = 0; c <= 5; c++) first.push([8, c]);
  first.push([8, 7], [8, 8], [7, 8]);
  for (let r = 5; r >= 0; r--) first.push([r, 8]);
  const second: [number, number][] = [];
  for (let r = size - 1; r >= size - 7; r--) second.push([r, 8]);
  for (let c = size - 8; c < size; c++) second.push([8, c]);
  return [first, second];
}

/** Cell positions of the 18 version bits, bit 17 first. Two copies. */
function versionCells(size: number): [number, number][][] {
  const a: [number, number][] = [];
  const b: [number, number][] = [];
  for (let j = 5; j >= 0; j--) {
    for (let i = size - 9; i >= size - 11; i--) {
      a.push([j, i]);
      b.push([i, j]);
    }
  }
  return [a, b];
}

export function buildFrame(version: number): Frame {
  const cached = frameCache.get(version);
  if (cached) return cached;
  const size = 17 + 4 * version;
  const kind = new Uint8Array(size * size).fill(2);
  const set = (r: number, c: number, value: number): void => {
    if (r >= 0 && c >= 0 && r < size && c < size) kind[r * size + c] = value;
  };

  for (const [r0, c0] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const d = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
        set(r0 + dr, c0 + dc, d === 3 || d <= 1 ? 1 : 0);
      }
    }
  }
  for (let i = 8; i < size - 8; i++) {
    set(6, i, i % 2 === 0 ? 1 : 0);
    set(i, 6, i % 2 === 0 ? 1 : 0);
  }
  const centers = ALIGNMENT_POSITIONS[version];
  const last = centers[centers.length - 1];
  for (const pr of centers) {
    for (const pc of centers) {
      if ((pr === 6 && pc === 6) || (pr === 6 && pc === last) || (pr === last && pc === 6)) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const d = Math.max(Math.abs(dr), Math.abs(dc));
          set(pr + dr, pc + dc, d === 2 || d === 0 ? 1 : 0);
        }
      }
    }
  }
  set(size - 8, 8, 1);
  for (const copy of formatCells(size)) for (const [r, c] of copy) set(r, c, 0);
  if (version >= 7) for (const copy of versionCells(size)) for (const [r, c] of copy) set(r, c, 0);

  // Zig-zag placement over the two-module-wide columns, right to left.
  const positions: number[] = [];
  for (let right = size - 1; right > 0; right -= 2) {
    const base = right <= 6 ? right - 1 : right;
    for (let vertical = 0; vertical < size; vertical++) {
      for (let z = 0; z < 2; z++) {
        const j = base - z;
        let upwards = (base & 2) === 0;
        if (j < 6) upwards = !upwards;
        const i = upwards ? size - 1 - vertical : vertical;
        if (kind[i * size + j] === 2) positions.push(i * size + j);
      }
    }
  }
  const frame: Frame = { version, size, kind, positions: Uint32Array.from(positions) };
  frameCache.set(version, frame);
  return frame;
}

// ---------- Capacity ----------

export function dataCodewords(version: number): number {
  return EC_BLOCKS_L[version].reduce((sum, g) => sum + g.blocks * g.data, 0);
}

function headerBytes(version: number, payloadLength: number): number {
  return (version < 10 ? 2 : 3) + payloadLength;
}

/**
 * Smallest version that still leaves room to steer. Phones read large modules far more reliably than small
 * ones (tested up to 100% through version 11 and falling off above it), and a bigger code buys almost no extra
 * fidelity, so we want the smallest code that has about this many spare bytes. Returns null if nothing fits.
 */
export function chooseVersion(payloadLength: number, minFreeBytes = 130): number | null {
  for (let version = 7; version <= 30; version++) {
    if (dataCodewords(version) - headerBytes(version, payloadLength) >= minFreeBytes) return version;
  }
  return null;
}

// ---------- Masks, format and version information ----------

const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function formatBits(mask: number): number {
  const data = (0b01 << 3) | mask; // error correction level L
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
  return ((data << 10) | rem) ^ 0x5412;
}

function versionBits(version: number): number {
  let rem = version << 12;
  for (let i = 17; i >= 12; i--) if ((rem >> i) & 1) rem ^= 0x1f25 << (i - 12);
  return (version << 12) | rem;
}

// ---------- GF(2) linear algebra over packed bit rows ----------

class BitRows {
  readonly words: number;
  readonly data: Uint32Array;
  constructor(readonly rows: number, readonly cols: number) {
    this.words = Math.ceil(cols / 32);
    this.data = new Uint32Array(rows * this.words);
  }
  set(r: number, c: number): void {
    this.data[r * this.words + (c >> 5)] |= 1 << (c & 31);
  }
  get(r: number, c: number): number {
    return (this.data[r * this.words + (c >> 5)] >>> (c & 31)) & 1;
  }
  xorRow(dst: number, src: number): void {
    const w = this.words;
    for (let i = 0; i < w; i++) this.data[dst * w + i] ^= this.data[src * w + i];
  }
  swap(a: number, b: number): void {
    const w = this.words;
    for (let i = 0; i < w; i++) {
      const t = this.data[a * w + i];
      this.data[a * w + i] = this.data[b * w + i];
      this.data[b * w + i] = t;
    }
  }
}

// ---------- The encoder ----------

export interface QArtOptions {
  /** Desired module value, 1 = dark. Row-major, size*size. Function modules are ignored. */
  target: Uint8Array;
  /** How costly it is to deviate from the target at each module (higher = keep it as the picture wants). */
  cost: Float32Array;
  mask?: number;
}

export interface QArtResult {
  version: number;
  size: number;
  /** Final code, 1 = dark, row-major. */
  matrix: Uint8Array;
  /** 1 for data/error-correction modules (the steerable ones), 0 for function patterns. */
  steerable: Uint8Array;
  /** Steerable modules whose value differs from the target. */
  deviations: number;
}

export function encodeQArt(payload: Uint8Array, version: number, options: QArtOptions): QArtResult {
  const { target, cost } = options;
  const mask = options.mask ?? 0;
  const maskFn = MASKS[mask];
  const frame = buildFrame(version);
  const { size, kind, positions } = frame;

  // Block structure.
  const blocks: { nd: number; ne: number }[] = [];
  for (const g of EC_BLOCKS_L[version]) for (let i = 0; i < g.blocks; i++) blocks.push({ nd: g.data, ne: g.total - g.data });
  const totalData = blocks.reduce((s, b) => s + b.nd, 0);

  // Fixed prefix: byte mode, character count, payload, terminator.
  const countBits = version < 10 ? 8 : 16;
  const header: number[] = [];
  const pushBits = (value: number, bits: number): void => {
    for (let i = bits - 1; i >= 0; i--) header.push((value >> i) & 1);
  };
  pushBits(0b0100, 4);
  pushBits(payload.length, countBits);
  for (const b of payload) pushBits(b, 8);
  pushBits(0, 4);
  if (header.length % 8 !== 0 || header.length / 8 > totalData) throw new Error('Payload does not fit this QR version.');
  const fixed = new Uint8Array(header.length / 8);
  for (let i = 0; i < fixed.length; i++) for (let k = 0; k < 8; k++) fixed[i] = (fixed[i] << 1) | header[i * 8 + k];

  // Which cell holds which data/parity bit (interleaved final message order).
  const dataCell: Int32Array[] = blocks.map((b) => new Int32Array(b.nd * 8).fill(-1));
  const eccCell: Int32Array[] = blocks.map((b) => new Int32Array(b.ne * 8).fill(-1));
  let t = 0;
  const maxData = Math.max(...blocks.map((b) => b.nd));
  for (let k = 0; k < maxData; k++) {
    for (let b = 0; b < blocks.length; b++) {
      if (k >= blocks[b].nd) continue;
      for (let bit = 0; bit < 8; bit++) dataCell[b][k * 8 + bit] = positions[t++];
    }
  }
  const maxEcc = Math.max(...blocks.map((b) => b.ne));
  for (let k = 0; k < maxEcc; k++) {
    for (let b = 0; b < blocks.length; b++) {
      if (k >= blocks[b].ne) continue;
      for (let bit = 0; bit < 8; bit++) eccCell[b][k * 8 + bit] = positions[t++];
    }
  }
  const wantRaw = (cell: number): number => (target[cell] ^ (maskFn(Math.floor(cell / size), cell % size) ? 1 : 0)) & 1;

  const dataBytes = blocks.map((b) => new Uint8Array(b.nd));
  let streamIndex = 0;
  for (let b = 0; b < blocks.length; b++) {
    const { nd, ne } = blocks[b];
    const fixedHere = Math.max(0, Math.min(nd, fixed.length - streamIndex));
    for (let k = 0; k < fixedHere; k++) dataBytes[b][k] = fixed[streamIndex + k];
    streamIndex += nd;

    // Free bits take the value the picture wants; then fix the parity by flipping the cheapest ones.
    const freeBits: number[] = [];
    for (let bitIndex = fixedHere * 8; bitIndex < nd * 8; bitIndex++) freeBits.push(bitIndex);
    for (const bitIndex of freeBits) {
      if (wantRaw(dataCell[b][bitIndex])) dataBytes[b][bitIndex >> 3] |= 0x80 >> (bitIndex & 7);
    }
    const current = rsParity(dataBytes[b], ne);
    const equations = ne * 8;
    const order = freeBits.map((_, i) => i).sort((a, c) => cost[dataCell[b][freeBits[a]]] - cost[dataCell[b][freeBits[c]]]);

    const system = new BitRows(equations, order.length + 1);
    const unit = new Uint8Array(nd);
    for (let col = 0; col < order.length; col++) {
      const bitIndex = freeBits[order[col]];
      unit.fill(0);
      unit[bitIndex >> 3] = 0x80 >> (bitIndex & 7);
      const parity = rsParity(unit, ne);
      for (let r = 0; r < equations; r++) if ((parity[r >> 3] >> (7 - (r & 7))) & 1) system.set(r, col);
    }
    for (let r = 0; r < equations; r++) {
      const have = (current[r >> 3] >> (7 - (r & 7))) & 1;
      if (have !== wantRaw(eccCell[b][r])) system.set(r, order.length);
    }

    let rank = 0;
    const pivots: number[] = [];
    for (let col = 0; col < order.length && rank < equations; col++) {
      let pivot = -1;
      for (let r = rank; r < equations; r++) if (system.get(r, col)) { pivot = r; break; }
      if (pivot < 0) continue;
      if (pivot !== rank) system.swap(pivot, rank);
      for (let r = 0; r < equations; r++) if (r !== rank && system.get(r, col)) system.xorRow(r, rank);
      pivots.push(col);
      rank++;
    }
    // Rows left over when the block has too little free room (a long link fills most of the first block)
    // cannot be steered. That is fine: the real parity is still computed below, so the code stays valid and
    // those few parity modules simply deviate from the picture.
    for (let r = 0; r < rank; r++) {
      if (system.get(r, order.length)) {
        const bitIndex = freeBits[order[pivots[r]]];
        dataBytes[b][bitIndex >> 3] ^= 0x80 >> (bitIndex & 7);
      }
    }
  }

  // Final message: interleaved data, interleaved real parity, remainder bits as zeros.
  const matrix = new Uint8Array(size * size);
  for (let i = 0; i < kind.length; i++) if (kind[i] !== 2) matrix[i] = kind[i];
  const raw = new Uint8Array(positions.length);
  for (let b = 0; b < blocks.length; b++) {
    const parity = rsParity(dataBytes[b], blocks[b].ne);
    for (let bitIndex = 0; bitIndex < blocks[b].nd * 8; bitIndex++) {
      raw[indexOfCell(positions, dataCell[b][bitIndex])] = (dataBytes[b][bitIndex >> 3] >> (7 - (bitIndex & 7))) & 1;
    }
    for (let bitIndex = 0; bitIndex < blocks[b].ne * 8; bitIndex++) {
      raw[indexOfCell(positions, eccCell[b][bitIndex])] = (parity[bitIndex >> 3] >> (7 - (bitIndex & 7))) & 1;
    }
  }
  let deviations = 0;
  const steerable = new Uint8Array(size * size);
  for (let i = 0; i < positions.length; i++) {
    const cell = positions[i];
    const module = raw[i] ^ (maskFn(Math.floor(cell / size), cell % size) ? 1 : 0);
    matrix[cell] = module;
    steerable[cell] = 1;
    if (module !== (target[cell] & 1)) deviations++;
  }

  // Format and version information.
  const fmt = formatBits(mask);
  formatCells(size).forEach((cells) => cells.forEach(([r, c], i) => { matrix[r * size + c] = (fmt >> (14 - i)) & 1; }));
  if (version >= 7) {
    const ver = versionBits(version);
    versionCells(size).forEach((cells) => cells.forEach(([r, c], i) => { matrix[r * size + c] = (ver >> (17 - i)) & 1; }));
  }
  return { version, size, matrix, steerable, deviations };
}

// Position lookups are repeated for every bit; index them once.
let lookupFor: Uint32Array | null = null;
let lookup: Map<number, number> | null = null;
function indexOfCell(positions: Uint32Array, cell: number): number {
  if (lookupFor !== positions || !lookup) {
    lookup = new Map();
    for (let i = 0; i < positions.length; i++) lookup.set(positions[i], i);
    lookupFor = positions;
  }
  return lookup.get(cell)!;
}
