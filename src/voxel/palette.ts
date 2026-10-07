export type Tone = 'dark' | 'mid' | 'light';

export interface Material {
  r: number;
  g: number;
  b: number;
  family: number;
  tone: Tone;
  /** Glows at night. */
  emissive: boolean;
}

export interface Family {
  dark: number;
  mid: number;
  light: number;
}

function parseHex(hex: string): [number, number, number] {
  const value = parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Every material belongs to a named family with a dark, mid and light tone. Objects are built mostly
 * from mid tones; ground tiles use the dark and light tones to form the QR. Index 0 means "empty".
 */
export class Palette {
  readonly materials: Material[] = [{ r: 0, g: 0, b: 0, family: -1, tone: 'mid', emissive: false }];
  readonly families: Family[] = [];
  private readonly names = new Map<string, number>();

  addFamily(name: string, dark: string, mid: string, light: string, emissive = false): number {
    const family = this.families.length;
    this.names.set(name, family);
    const add = (hex: string, tone: Tone): number => {
      const [r, g, b] = parseHex(hex);
      this.materials.push({ r, g, b, family, tone, emissive });
      return this.materials.length - 1;
    };
    this.families.push({ dark: add(dark, 'dark'), mid: add(mid, 'mid'), light: add(light, 'light') });
    return family;
  }

  /** Family id by name. */
  id(name: string): number {
    const family = this.names.get(name);
    if (family === undefined) throw new Error(`Unknown material family: ${name}`);
    return family;
  }

  /** Material index for a family and tone. */
  tone(family: number, tone: Tone): number {
    return this.families[family][tone];
  }

  /** Pick a tone with a [0, 1) value: low = dark, high = light. */
  pick(family: number, n: number, darkBelow = 0.25, lightAbove = 0.75): number {
    const f = this.families[family];
    return n < darkBelow ? f.dark : n > lightAbove ? f.light : f.mid;
  }

  luminanceOf(index: number): number {
    const m = this.materials[index];
    return luminance(m.r, m.g, m.b);
  }
}
