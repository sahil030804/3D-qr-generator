/** Dense voxel grid. x = east, y = up, z = south. Cells hold palette indices; 0 = empty. */
export class VoxelGrid {
  readonly cells: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly depth: number,
  ) {
    this.cells = new Uint8Array(width * height * depth);
  }

  index(x: number, y: number, z: number): number {
    return (y * this.depth + z) * this.width + x;
  }

  inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.width && y < this.height && z < this.depth;
  }

  get(x: number, y: number, z: number): number {
    return this.inBounds(x, y, z) ? this.cells[this.index(x, y, z)] : 0;
  }

  set(x: number, y: number, z: number, material: number): void {
    if (this.inBounds(x, y, z)) this.cells[this.index(x, y, z)] = material;
  }

  solid(x: number, y: number, z: number): boolean {
    return this.get(x, y, z) !== 0;
  }

  /** Highest occupied y in a column, or -1. */
  topY(x: number, z: number): number {
    for (let y = this.height - 1; y >= 0; y--) if (this.cells[this.index(x, y, z)] !== 0) return y;
    return -1;
  }

  /** Highest occupied y anywhere. */
  maxY(): number {
    let max = -1;
    for (let z = 0; z < this.depth; z++) {
      for (let x = 0; x < this.width; x++) max = Math.max(max, this.topY(x, z));
    }
    return max;
  }
}
