import qrcode from 'qrcode-generator';

export interface QRData {
  /** Module matrix, true = dark. Size N x N (without quiet zone). */
  matrix: boolean[][];
  size: number;
  content: string;
  /** QR version 1..40 */
  version: number;
}

const MAX_QR_BYTES = 1200;

/** Generate a QR matrix with HIGH error correction. Throws on invalid input. */
export function generateQRMatrix(content: string): QRData {
  const text = (content ?? '').trim();
  if (!text) throw new QRInputError('Enter some text or a URL first.');
  if (text.length > MAX_QR_BYTES) {
    throw new QRInputError(`Input too long (${text.length} chars). Keep it under ${MAX_QR_BYTES} characters.`);
  }
  // typeNumber 0 = automatic version selection
  const qr = qrcode(0, 'H');
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  const matrix: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) row.push(qr.isDark(r, c));
    matrix.push(row);
  }
  // Derive version from size: size = 21 + 4*(version-1)
  const version = Math.round((size - 21) / 4) + 1;
  return { matrix, size, content: text, version };
}

/** Verify finder-pattern integrity of a matrix (used by tests). */
export function hasFinderPatterns(matrix: boolean[][]): boolean {
  const n = matrix.length;
  if (n < 21) return false;
  const check = (r0: number, c0: number): boolean => {
    // 7x7 finder: outer dark ring, inner light ring, 3x3 dark core
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const dark =
          r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        if (matrix[r0 + r][c0 + c] !== dark) return false;
      }
    }
    return true;
  };
  return check(0, 0) && check(0, n - 7) && check(n - 7, 0);
}

export class QRInputError extends Error {}
