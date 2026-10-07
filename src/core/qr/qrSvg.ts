import { QUIET_ZONE_MODULES, type QRData } from './QRGenerator';

/** Print-ready black-on-white SVG of the code, with the standard quiet zone. One path, no raster. */
export function qrToSvg(qr: QRData, moduleSize = 10): string {
  const total = qr.size + QUIET_ZONE_MODULES * 2;
  const px = total * moduleSize;
  const parts: string[] = [];
  for (let row = 0; row < qr.size; row++) {
    let column = 0;
    while (column < qr.size) {
      if (!qr.matrix[row][column]) {
        column++;
        continue;
      }
      let end = column;
      while (end < qr.size && qr.matrix[row][end]) end++;
      const x = (column + QUIET_ZONE_MODULES) * moduleSize;
      const y = (row + QUIET_ZONE_MODULES) * moduleSize;
      parts.push(`M${x} ${y}h${(end - column) * moduleSize}v${moduleSize}h-${(end - column) * moduleSize}z`);
      column = end;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${px} ${px}" width="${px}" height="${px}" shape-rendering="crispEdges">`
    + `<rect width="${px}" height="${px}" fill="#fff"/><path d="${parts.join('')}" fill="#000"/></svg>`;
}
