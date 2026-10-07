import type { VoxelGrid } from '../voxel/grid';
import { inRim } from '../voxel/layout';
import { fbm3, hash3, mulberry32 } from '../voxel/noise';
import { luminance, Palette } from '../voxel/palette';
import { fillBox, fillCapsule, fillEllipsoid, fillLathe, type Chooser } from '../voxel/shapes';
import { addGrass, addGroundFamilies, addStones, paletteSet } from './common';
import type { ObjectContext, ObjectVariant, VoxelObject } from './types';

/**
 * Flowering tree, modeled on a mature Yoshino cherry at roughly 1u = 20 cm: a 2.6 m clear trunk, five scaffold
 * limbs spreading at ~45° and flattening out, two upright leaders, and a broad domed crown about 9 m across.
 */
interface Colors {
  /** Blossom tones: shaded underside, natural, sunlit top. */
  shade: string;
  mid: string;
  sun: string;
  /** Young leaves showing between the flowers. */
  leaf: string;
  bark: string;
}

const COLORS: Record<string, Colors> = {
  blossom: { shade: '#e7a3b9', mid: '#f4c3d2', sun: '#fde3ea', leaf: '#8a6a3c', bark: '#4a3832' },
  lavender: { shade: '#8a7bc9', mid: '#a597dc', sun: '#c4b9ec', leaf: '#6f8f4a', bark: '#57483c' },
  coral: { shade: '#d0577f', mid: '#e47a9c', sun: '#f3a6bf', leaf: '#7a4a2c', bark: '#45332c' },
  snow: { shade: '#dcdfe4', mid: '#f1f2f0', sun: '#ffffff', leaf: '#7d8f4c', bark: '#4f433d' },
};

const VARIANTS: ObjectVariant[] = [
  { id: 'blossom', name: 'Yoshino pink', color: '#f4c3d2' },
  { id: 'lavender', name: 'Jacaranda', color: '#a597dc' },
  { id: 'coral', name: 'Kanzan', color: '#e47a9c' },
  { id: 'snow', name: 'White cherry', color: '#f1f2f0' },
];

interface Point {
  x: number;
  y: number;
  z: number;
}

/** Draw a tapering branch through `points`, radius r0 at the first point and r1 at the last. */
function branch(grid: VoxelGrid, points: Point[], r0: number, r1: number, choose: Chooser): void {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const ra = r0 + (r1 - r0) * (i / (points.length - 1));
    const rb = r0 + (r1 - r0) * ((i + 1) / (points.length - 1));
    fillCapsule(grid, a.x, a.y, a.z, b.x, b.y, b.z, ra, rb, choose);
  }
}

/** Single fallen items (petals, needles) on free ground, denser near (cx, cz), drawn in natural tones only. */
export function scatterLitter(
  grid: VoxelGrid, ctx: ObjectContext, materials: number[], chance: number, cx: number, cz: number, radius: number, seed: number,
): void {
  const { size } = ctx.layout;
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      if (inRim(ctx.layout, x, z) || grid.get(x, ctx.g, z) !== 0) continue;
      const r = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
      if (hash3(x, 5, z, seed) >= chance * Math.exp(-Math.pow(r / radius, 2))) continue;
      grid.set(x, ctx.g, z, materials[Math.floor(hash3(x, 6, z, seed) * materials.length)]);
    }
  }
}

function hexToHsl(hex: string): [number, number, number] {
  const v = parseInt(hex.replace('#', ''), 16);
  const r = ((v >> 16) & 255) / 255;
  const g = ((v >> 8) & 255) / 255;
  const b = (v & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const f = (n: number): number => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
  };
  return [f(0), f(8), f(4)];
}

/** Same hue and saturation at the lightness whose luminance is closest to `target`. */
function toneWithLuminance(h: number, s: number, target: number): string {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    const l = (lo + hi) / 2;
    if (luminance(...hslToRgb(h, s, l)) < target) lo = l;
    else hi = l;
  }
  return '#' + hslToRgb(h, s, (lo + hi) / 2).map((v) => v.toString(16).padStart(2, '0')).join('');
}

/**
 * Register a natural material whose scan tones match the plot tiles (dark ~62, light ~234 luminance). A crown or
 * pot that covers a large part of the code then binarizes exactly like the ground around it; much darker darks
 * next to the mid-grey tile darks make jsQR's local threshold drop modules.
 */
export function addNatural(palette: Palette, name: string, hex: string, emissive = false): number {
  const [h, s] = hexToHsl(hex);
  return palette.addFamily(name, toneWithLuminance(h, Math.min(s, 0.5), 62), hex, toneWithLuminance(h, Math.min(s, 0.55), 234), emissive);
}

export const cherryTree: VoxelObject = {
  id: 'cherry-tree',
  name: 'Cherry Tree',
  description: 'A flowering cherry with paper lanterns.',
  category: 'nature',
  variants: VARIANTS,
  createPalette(variantId) {
    const c = COLORS[variantId] ?? COLORS.blossom;
    const palette = new Palette();
    addNatural(palette, 'bark', c.bark);
    addNatural(palette, 'barkBand', '#6e6058');
    addNatural(palette, 'blossomShade', c.shade);
    addNatural(palette, 'blossom', c.mid);
    addNatural(palette, 'blossomSun', c.sun);
    addNatural(palette, 'leaf', c.leaf);
    palette.addFamily('grass', '#2c5530', '#5f9a45', '#b6d98a');
    addNatural(palette, 'paper', '#ffb04a', true);
    addNatural(palette, 'lacquer', '#2a1d18');
    addNatural(palette, 'cord', '#3a2c22');
    const ground = addGroundFamilies(palette, {
      tileA: ['#4a3f48', '#a79ea4', '#f3ede6'],
      tileB: ['#3f4a45', '#a2aaa4', '#ebe8de'],
      accent: ['#2d5a3a', '#8fb98a', '#d3e8b8'],
    });
    return paletteSet(palette, ground);
  },
  build(grid, palette, ctx) {
    const { layout, seed, u, g } = ctx;
    const rng = mulberry32(seed);
    const c = layout.size / 2;
    const mid = (name: string): number => palette.tone(palette.id(name), 'mid');
    const BARK = mid('bark');
    const BAND = mid('barkBand');
    const SHADE = mid('blossomShade');
    const BLOSSOM = mid('blossom');
    const SUN = mid('blossomSun');
    const LEAF = mid('leaf');
    const PAPER = mid('paper');
    const LACQUER = mid('lacquer');
    const CORD = mid('cord');

    // Cherry bark: dark with pale horizontal lenticel bands.
    const bark: Chooser = (x, y, z) => (fbm3((x / u) * 0.35, (y / u) * 1.5, (z / u) * 0.35, seed + 1) > 0.66 ? BAND : BARK);
    const aboveGround = (choose: Chooser): Chooser => (x, y, z) => (y >= g ? choose(x, y, z) : 0);

    // Trunk: a gentle S-curve leaning a little, from the root flare to the fork at 2.6 m.
    const leanA = rng() * Math.PI * 2;
    const leanD = (1 + rng() * 1.2) * u;
    const forkH = 13 * u;
    const trunkAt = (s: number): Point => {
      const side = Math.sin(s * Math.PI * 2) * 0.6 * u;
      return {
        x: c + Math.cos(leanA) * leanD * s + Math.cos(leanA + Math.PI / 2) * side,
        y: g + forkH * s,
        z: c + Math.sin(leanA) * leanD * s + Math.sin(leanA + Math.PI / 2) * side,
      };
    };
    const trunk: Point[] = [];
    for (let i = 0; i <= 8; i++) trunk.push(trunkAt(i / 8));
    branch(grid, trunk, 2.6 * u, 2.1 * u, bark);
    const fork = trunkAt(1);

    // Root flare with buttress lobes, then a few surface roots running out into the ground.
    const lobe = rng() * Math.PI * 2;
    fillBox(grid, c - 7 * u, g, c - 7 * u, c + 7 * u, g + 4.5 * u, c + 7 * u, (x, y, z) => {
      const dx = x + 0.5 - c;
      const dz = z + 0.5 - c;
      const h = y + 0.5 - g;
      const lobes = Math.pow(Math.max(0, Math.cos(5 * Math.atan2(dz, dx) + lobe)), 2);
      const r = 2.6 * u + 2.2 * u * Math.exp(-h / (1.2 * u)) * (0.45 + 0.55 * lobes);
      return dx * dx + dz * dz <= r * r ? bark(x, y, z) : 0;
    });
    for (let i = 0; i < 5; i++) {
      const a = lobe / 5 + (i / 5) * Math.PI * 2 + (rng() - 0.5) * 0.3;
      const reach = (6 + rng() * 2.5) * u;
      fillCapsule(grid, c + Math.cos(a) * 2 * u, g + 1 * u, c + Math.sin(a) * 2 * u,
        c + Math.cos(a) * reach, g + 0.2 * u, c + Math.sin(a) * reach, 1.3 * u, 0.6 * u, aboveGround(bark));
    }

    // Five scaffold limbs rise at ~45° and level out with drooping tips, plus two upright leaders in the middle;
    // each throws secondary branches. Blossom clumps sit along the outer part of every branch, so the whole crown
    // is carried by wood.
    const clusters: { p: Point; r: number }[] = [];
    const MAX_SPREAD = 20 * u;
    const addCluster = (p: Point, r: number): void => {
      const dx = p.x - c;
      const dz = p.z - c;
      const d = Math.hypot(dx, dz);
      const k = d > MAX_SPREAD ? MAX_SPREAD / d : 1;
      clusters.push({ p: { x: c + dx * k, y: p.y, z: c + dz * k }, r });
    };
    const limbStart = rng() * Math.PI * 2;
    const limbs: { az: number; reach: number; rise: number; r0: number; droop: number }[] = [];
    for (let i = 0; i < 5; i++) {
      limbs.push({
        az: limbStart + (i / 5) * Math.PI * 2 + (rng() - 0.5) * 0.5,
        reach: (15 + rng() * 3) * u,
        rise: (14 + rng() * 4) * u,
        r0: 1.9 * u,
        droop: 3 * u,
      });
    }
    for (let i = 0; i < 2; i++) {
      limbs.push({ az: limbStart + Math.PI / 5 + i * Math.PI, reach: (4 + rng() * 2) * u, rise: (19 + rng() * 3) * u, r0: 1.5 * u, droop: 0 });
    }
    for (const limb of limbs) {
      const bend = (rng() - 0.5) * 0.35;
      const limbAt = (s: number): Point => {
        const a = limb.az + bend * Math.sin(s * Math.PI);
        return {
          x: fork.x + Math.cos(a) * limb.reach * s,
          y: fork.y - 1.5 * u + limb.rise * (1 - (1 - s) * (1 - s)) - limb.droop * Math.pow(s, 4),
          z: fork.z + Math.sin(a) * limb.reach * s,
        };
      };
      const path: Point[] = [];
      for (let k = 0; k <= 6; k++) path.push(limbAt(k / 6));
      branch(grid, path, limb.r0, 0.8 * u, bark);
      const upright = limb.droop === 0;
      for (const s of upright ? [0.75, 1] : [0.55, 0.78, 0.96]) {
        addCluster({ ...limbAt(s), y: limbAt(s).y + 1.4 * u }, (upright ? 5.4 : 4.4) + rng() * 1.2);
      }
      for (const s of upright ? [0.6] : [0.4, 0.7]) {
        const start = limbAt(s);
        const a2 = limb.az + (rng() < 0.5 ? -1 : 1) * (0.55 + rng() * 0.35);
        const len = (7 + rng() * 3) * u;
        const up = (upright ? 6 : 4 + rng() * 3) * u;
        const twigAt = (t: number): Point => ({
          x: start.x + Math.cos(a2) * len * t,
          y: start.y + up * Math.sin(t * Math.PI * 0.6) - 1.2 * u * t * t,
          z: start.z + Math.sin(a2) * len * t,
        });
        branch(grid, [twigAt(0), twigAt(0.35), twigAt(0.7), twigAt(1)], 1 * u, 0.55 * u, bark);
        addCluster({ ...twigAt(0.55), y: twigAt(0.55).y + 1.3 * u }, 4 + rng() * 1.2);
        addCluster({ ...twigAt(1), y: twigAt(1).y + 1 * u }, 4.4 + rng() * 1.3);
      }
    }

    // Each clump is shaded like a cloud: sunlit on top, deeper in its underside, with smooth patches and a few
    // young leaves. Clumps are eroded by smooth noise so the crown edge stays soft.
    const wobble = (x: number, y: number, z: number): number => (fbm3((x / u) * 0.5, (y / u) * 0.5, (z / u) * 0.5, seed + 9) - 0.5) * 1.6;
    for (const { p, r } of clusters) {
      const ry = r * 0.72 * u;
      const blossom: Chooser = (x, y, z) => {
        const X = x / u;
        const Y = y / u;
        const Z = z / u;
        if (fbm3(X * 0.6, Y * 0.6, Z * 0.6, seed + 50) > 0.8) return LEAF;
        const light = 0.5 + ((y + 0.5 - p.y) / ry) * 0.42 + (fbm3(X * 0.25, Y * 0.25, Z * 0.25, seed + 3) - 0.5) * 0.7;
        return light < 0.36 ? SHADE : light > 0.72 ? SUN : BLOSSOM;
      };
      fillEllipsoid(grid, p.x, p.y, p.z, r * u, ry, r * u, blossom, wobble);
    }

    // Paper lanterns hang on cords from the underside of the crown, clear of the trunk.
    const hung: Point[] = [];
    for (let attempt = 0; attempt < 60 && hung.length < 5; attempt++) {
      const a = rng() * Math.PI * 2;
      const d = (9 + rng() * 8) * u;
      const lx = Math.floor(c + Math.cos(a) * d);
      const lz = Math.floor(c + Math.sin(a) * d);
      if (hung.some((h) => Math.hypot(h.x - lx, h.z - lz) < 7 * u)) continue;
      let anchor = -1;
      for (let y = Math.floor(g + 12 * u); y < grid.height; y++) {
        if (grid.solid(lx, y, lz)) {
          anchor = y;
          break;
        }
      }
      if (anchor < 0) continue;
      const cord = Math.max(2, Math.round((1.5 + rng() * 2) * u));
      const lanternH = 3 * u;
      const top = anchor - cord;
      const bottom = top - lanternH;
      if (bottom < g + 8 * u) continue;
      let clear = true;
      for (let y = Math.floor(bottom) - 1; y < anchor && clear; y++) {
        for (let dz = -2; dz <= 2 && clear; dz++) for (let dx = -2; dx <= 2; dx++) if (grid.solid(lx + dx, y, lz + dz)) clear = false;
      }
      if (!clear) continue;
      for (let y = top; y < anchor; y++) grid.set(lx, y, lz, CORD);
      const r = Math.max(1, 1.2 * u);
      fillLathe(grid, lx + 0.5, lz + 0.5, bottom, top, (t) => r * (0.72 + 0.28 * Math.sin(t * Math.PI)), (x, y) =>
        y < bottom + 0.6 * u || y >= top - 0.6 * u ? LACQUER : PAPER);
      hung.push({ x: lx, y: anchor, z: lz });
    }

    // Ground: fallen petals under the crown, short grass tufts (thicker at the finder corners) and a few stones.
    scatterLitter(grid, ctx, [BLOSSOM, SUN, SHADE], 0.2, c, c, 22 * u, seed + 21);
    addGrass(grid, palette, ctx, { family: palette.id('grass'), density: 0.03, finderBoost: 0.28, maxHeight: Math.max(2, Math.round(1.6 * u)), seed: seed + 41 });
    addStones(grid, palette, ctx, palette.id('rock'), rng, 3);
  },
};
