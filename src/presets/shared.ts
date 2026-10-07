import * as THREE from 'three';
import { SeededRandom } from '../core/generation/SeededRandom';
import { Noise2D } from '../core/generation/NoiseSystem';

/** Procedural canvas texture: bark ridges with crevices + tonal variation. */
export function makeBarkTexture(rng: SeededRandom): THREE.CanvasTexture {
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d')!;
  const base = ctx.createLinearGradient(0, 0, s, 0);
  base.addColorStop(0, '#4a382a');
  base.addColorStop(0.5, '#5d4732');
  base.addColorStop(1, '#42322​5'.replace('​', ''));
  ctx.fillStyle = '#4e3b2b';
  ctx.fillRect(0, 0, s, s);
  // vertical ridge streaks
  for (let i = 0; i < 90; i++) {
    const x = rng.range(0, s);
    const w = rng.range(1, 5);
    const dark = rng.chance(0.55);
    ctx.fillStyle = dark ? `rgba(28,18,12,${rng.range(0.25, 0.6)})` : `rgba(140,110,80,${rng.range(0.15, 0.4)})`;
    const wob = rng.range(2, 9);
    ctx.beginPath();
    for (let y = 0; y <= s; y += 8) {
      const xx = x + Math.sin((y / s) * Math.PI * 2 + i) * wob + rng.range(-2, 2);
      if (y === 0) ctx.moveTo(xx, y);
      else ctx.lineTo(xx, y);
    }
    ctx.lineWidth = w;
    ctx.strokeStyle = ctx.fillStyle as string;
    ctx.stroke();
  }
  // knots / scars
  for (let i = 0; i < 7; i++) {
    const x = rng.range(0, s);
    const y = rng.range(0, s);
    const r = rng.range(4, 12);
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, 'rgba(20,12,8,0.9)');
    g.addColorStop(0.6, 'rgba(60,44,30,0.6)');
    g.addColorStop(1, 'rgba(60,44,30,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft mottled ground texture (moss/soil/gravel blend). */
export function makeGroundTexture(rng: SeededRandom, base = '#b9c0a8', dark = '#8a9077'): THREE.CanvasTexture {
  const s = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 9000; i++) {
    const x = rng.range(0, s);
    const y = rng.range(0, s);
    const r = rng.range(0.6, 3.2);
    ctx.fillStyle = rng.chance(0.5) ? withAlpha(dark, rng.range(0.08, 0.3)) : `rgba(255,255,250,${rng.range(0.05, 0.2)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // blades / speckles
  for (let i = 0; i < 1500; i++) {
    ctx.strokeStyle = `rgba(70,90,55,${rng.range(0.1, 0.35)})`;
    ctx.lineWidth = 1;
    const x = rng.range(0, s);
    const y = rng.range(0, s);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + rng.range(-3, 3), y - rng.range(2, 6));
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Five-petal cherry blossom geometry (~120 tris), origin at flower center. */
export function makeBlossomGeometry(): THREE.BufferGeometry {
  const petalShape = new THREE.Shape();
  petalShape.moveTo(0, 0);
  petalShape.bezierCurveTo(0.09, 0.02, 0.16, 0.1, 0.15, 0.2);
  petalShape.bezierCurveTo(0.14, 0.3, 0.06, 0.36, 0, 0.36);
  petalShape.bezierCurveTo(-0.06, 0.36, -0.14, 0.3, -0.15, 0.2);
  petalShape.bezierCurveTo(-0.16, 0.1, -0.09, 0.02, 0, 0);
  const petalGeo = new THREE.ShapeGeometry(petalShape, 5);
  // cup the petal slightly
  const pos = petalGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    pos.setZ(i, 0.06 * (x * x * 18 + y * y * 4) + 0.02 * y);
  }
  petalGeo.computeVertexNormals();
  const geos: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) {
    const g = petalGeo.clone();
    g.rotateZ((k / 5) * Math.PI * 2 + 0.3);
    g.rotateX(-0.35);
    geos.push(g);
  }
  // center: small cup of stamens (low-poly sphere + dots merged as one)
  const center = new THREE.SphereGeometry(0.045, 6, 5);
  center.translate(0, 0, 0.03);
  geos.push(center);
  const merged = mergeGeometries(geos);
  merged.scale(1.4, 1.4, 1.4);
  return merged;
}

/** Simple pointed leaf card, bent along midrib. */
export function makeLeafGeometry(len = 0.55, wid = 0.22): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(wid, len, 1, 3);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const t = y / len + 0.5;
    pos.setX(i, x * Math.sin(Math.PI * Math.min(1, Math.max(0.05, t))));
    pos.setZ(i, 0.08 * (x * x * 20) + 0.12 * t * t);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Irregular foliage blob: noisy icosahedron, flat-shaded. */
export function makeFoliageBlobGeometry(rng: SeededRandom, detail = 1): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(0.5, detail);
  const pos = geo.attributes.position as THREE.BufferAttribute;
    const noise = new Noise2D(SeededRandom.hashSeed(Math.floor(rng.next() * 1e9)));
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = 1 + noise.fbm(v.x * 2 + 9, (v.y + v.z) * 2, 3) * 0.45;
    v.multiplyScalar(n);
    v.y *= 0.72; // squash: canopy reads as volume from side, coverage from top
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // minimal non-indexed merge (avoids BufferGeometryUtils import)
  const list: THREE.BufferGeometry[] = geos.map((g) => g.toNonIndexed());
  let total = 0;
  for (const g of list) total += g.attributes.position.count;
  const posArr = new Float32Array(total * 3);
  const normArr = new Float32Array(total * 3);
  const uvArr = new Float32Array(total * 2);
  let o = 0;
  for (const g of list) {
    const p = g.attributes.position as THREE.BufferAttribute;
    const n = g.attributes.normal as THREE.BufferAttribute;
    const uv = g.attributes.uv as THREE.BufferAttribute | undefined;
    posArr.set(p.array as Float32Array, o * 3);
    if (n) normArr.set(n.array as Float32Array, o * 3);
    if (uv) uvArr.set(uv.array as Float32Array, o * 2);
    o += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
  return out;
}

/** Tapered tube along a curve (branch segments with radiusTop/radiusBottom). */
export function taperedTube(curve: THREE.CatmullRomCurve3, segs: number, r0: number, r1: number, radial = 7): THREE.BufferGeometry {
  const frames = curve.computeFrenetFrames(segs, false);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const P = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, P);
    const N = frames.normals[Math.min(segs, i)];
    const B = frames.binormals[Math.min(segs, i)];
    const r = r0 * (1 - t) + r1 * t;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const sin = Math.sin(a);
      const cos = Math.cos(a);
      const nx = cos * N.x + sin * B.x;
      const ny = cos * N.y + sin * B.y;
      const nz = cos * N.z + sin * B.z;
      positions.push(P.x + r * nx, P.y + r * ny, P.z + r * nz);
      normals.push(nx, ny, nz);
      uvs.push(j / radial, t * 4);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

/** Traverse and dispose all GPU resources under an object. */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh & { isInstancedMesh?: boolean };
    if (mesh.isMesh || mesh.isInstancedMesh) {
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => disposeMaterial(m));
      else if (mat) disposeMaterial(mat);
    }
  });
}

function disposeMaterial(m: THREE.Material): void {
  const anyM = m as unknown as Record<string, unknown>;
  for (const key of ['map', 'normalMap', 'roughnessMap', 'aoMap']) {
    const t = anyM[key] as THREE.Texture | undefined;
    if (t && (t as THREE.Texture).isTexture) (t as THREE.Texture).dispose();
  }
  m.dispose();
}
