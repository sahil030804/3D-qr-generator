import * as THREE from 'three';
import type { SceneGenerationContext } from '../core/generation/types';
import { QUALITY_BUDGET, constrainByQR } from '../core/generation/types';
import { Noise2D } from '../core/generation/NoiseSystem';
import type { NaturalScenePreset } from './Preset';
import { qrMask } from './shared';
import {
  makeBarkTexture,
  makeGroundTexture,
  makeBlossomGeometry,
  makeFoliageBlobGeometry,
  makeLeafGeometry,
  taperedTube,
} from './shared';

/**
 * Realistic cherry blossom tree whose canopy density encodes the QR field.
 *
 * QR influence is hierarchical, never 1 cell -> 1 object:
 *  - macro: major limb direction + canopy region density
 *  - medium: secondary branches + foliage cluster acceptance
 *  - micro: blossom / leaf acceptance + color jitter
 * Dark QR modules grow dense dark foliage; light modules stay open so the
 * pale ground + light blossoms show through from above.
 */
export const cherryBlossomPreset: NaturalScenePreset = {
  id: 'cherry-blossom',
  name: 'Cherry Blossom',
  icon: '🌸',
  description: 'Cinematic sakura tree with a hidden canopy QR',
  qrWorldSize: 38,

  generate(ctx: SceneGenerationContext): THREE.Group {
    const { field, rng, params, worldSize } = ctx;
    const S = worldSize; // 24 * sceneScale
    const budget = QUALITY_BUDGET[params.quality];
    const noise = new Noise2D(rng.int(1, 1 << 30));
    const group = new THREE.Group();
    group.name = 'cherry-blossom';

    const H = 11 * params.height + 4; // canopy height
    const warpFn = (u: number, v: number): [number, number] => [
      noise.fbm(u * 6 + 3.1, v * 6, 3),
      noise.fbm(u * 6, v * 6 + 7.7, 3),
    ];
    field.warpAmount = 0.002 + params.variation * 0.003; // <0.2 modules: organic jitter, finders survive
    const at = (x: number, z: number) => {
      const u = x / S + 0.5;
      const v = z / S + 0.5;
      if (u < 0 || u > 1 || v < 0 || v > 1) return 0.05;
      // crisp micro backbone (protects finders/timing) inside organic macro
      return field.combined(u, v, [0.35, 0.3, 0.35], warpFn) * 0.65 + field.sharp(u, v) * 0.35;
    };
    const gradAt = (x: number, z: number): [number, number] => {
      const e = 0.35;
      return [(at(x + e, z) - at(x - e, z)) / (2 * e), (at(x, z + e) - at(x, z - e)) / (2 * e)];
    };

    // ---------- ground (pale so light modules read light from above) ----------
    const groundGeo = new THREE.CircleGeometry(S * 0.95, 72);
    groundGeo.rotateX(-Math.PI / 2);
    // subtle QR luminance modulation: dark regions slightly deeper soil tone
    {
      const p = groundGeo.attributes.position as THREE.BufferAttribute;
      const colors = new Float32Array(p.count * 3);
      const base = new THREE.Color('#dbe1ca');
      const deep = new THREE.Color('#9aa184');
      const c = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const z = p.getZ(i);
        const f = at(x, z);
        const n = noise.unit(x * 0.25, z * 0.25, 3) * 0.5 + 0.5;
        c.copy(base).lerp(deep, Math.min(0.6, f * 0.45 * params.qrStrength * qrMask(field, x, z, S) + (1 - n) * 0.12));
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }
      groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    const groundMat = new THREE.MeshStandardMaterial({
      map: makeGroundTexture(rng),
      vertexColors: true,
      roughness: 1,
      metalness: 0,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    group.add(ground);

    // ---------- trunk + branches (merged into few meshes) ----------
    const barkMat = new THREE.MeshStandardMaterial({
      map: makeBarkTexture(rng),
      color: '#8a6f52',
      roughness: 0.95,
      metalness: 0,
    });
    const branchGeos: THREE.BufferGeometry[] = [];
    const twigTips: { pos: THREE.Vector3; dir: THREE.Vector3 }[] = [];
    const maxDepth = budget.branchDepth;

    const grow = (origin: THREE.Vector3, dir: THREE.Vector3, len: number, r0: number, depth: number): void => {
      const steps = 5;
      const pts: THREE.Vector3[] = [origin.clone()];
      const p = origin.clone();
      const d = dir.clone();
      for (let i = 0; i < steps; i++) {
        // QR attraction: upper limbs bend toward dense (dark) canopy regions
        if (qrMask(field, p.x, p.z, S) < 0.9) {
          d.x -= ((p.x - trunkBase.x) / (S * 0.5)) * 0.9;
          d.z -= ((p.z - trunkBase.z) / (S * 0.5)) * 0.9;
        }
        if (depth >= 1 && Math.abs(p.x) < S / 2 && Math.abs(p.z) < S / 2) {
          const [gx, gz] = gradAt(p.x, p.z);
          const pull = (0.25 + params.qrStrength * 0.75) * (depth >= 2 ? 0.55 : 0.3);
          d.x += gx * pull;
          d.z += gz * pull;
        }
        d.y += depth === 0 ? 0.06 : 0.16 - depth * 0.035; // phototropism fades
        if (depth >= 2) d.y -= 0.05; // gravity droop on small wood
        d.x += rng.gaussian(0, 0.1 + params.variation * 0.14);
        d.z += rng.gaussian(0, 0.1 + params.variation * 0.14);
        d.y += rng.gaussian(0, 0.05);
        d.normalize();
        p.addScaledVector(d, len / steps);
        pts.push(p.clone());
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      branchGeos.push(taperedTube(curve, 6, r0, r0 * 0.55, depth === 0 ? 9 : 6));
      if (depth >= maxDepth) {
        twigTips.push({ pos: p.clone(), dir: d.clone() });
        return;
      }
      const kids = depth === 0 ? rng.int(4, 5) : depth === 1 ? rng.int(2, 3) : rng.int(2, 3);
      for (let k = 0; k < kids; k++) {
        const t = rng.range(0.45, 1);
        const start = curve.getPointAt(t);
        const tangent = curve.getTangentAt(t);
        // irregular branch angle
        const az = rng.range(0, Math.PI * 2);
        const el = rng.range(0.35, 1.0);
        const nd = new THREE.Vector3(
          tangent.x * 0.5 + Math.cos(az) * el,
          rng.range(0.35, 0.9),
          tangent.z * 0.5 + Math.sin(az) * el,
        ).normalize();
        grow(start, nd, len * rng.range(0.55, 0.72), r0 * rng.range(0.5, 0.62), depth + 1);
      }
    };

    const trunkBase = new THREE.Vector3(rng.range(-1, 1), 0, rng.range(-1, 1));
    // seat the trunk on a dark module near the middle: the trunk's top-down
    // footprint then reinforces a dark module instead of punching a light one
    {
      const n = field.qr.size;
      const t = field.total;
      const qz = field.quietZone;
      let best: { x: number; z: number; score: number } | null = null;
      for (let r = Math.floor(n / 2) - 3; r <= Math.floor(n / 2) + 3; r++) {
        for (let c = Math.floor(n / 2) - 3; c <= Math.floor(n / 2) + 3; c++) {
          if (!field.qr.matrix[r]?.[c]) continue;
          const u = (c + qz + 0.5) / t;
          const v = (r + qz + 0.5) / t;
          const x = (u - 0.5) * S;
          const z = (v - 0.5) * S;
          const score = -(x * x + z * z) + rng.next() * 4;
          if (!best || score > best.score) best = { x, z, score };
        }
      }
      if (best) trunkBase.set(best.x, 0, best.z);
    }
    grow(trunkBase, new THREE.Vector3(rng.range(-0.08, 0.08), 1, rng.range(-0.08, 0.08)).normalize(), H * 0.7, 0.8, 0);
    // roots
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + rng.range(-0.3, 0.3);
      const dir = new THREE.Vector3(Math.cos(a), 0.25, Math.sin(a)).normalize();
      const pts = [trunkBase.clone().add(new THREE.Vector3(0, 0.7, 0))];
      const q = pts[0].clone();
      for (let s = 0; s < 3; s++) {
        q.addScaledVector(dir, rng.range(0.5, 0.9));
        q.y = Math.max(0.02, q.y - rng.range(0.25, 0.5));
        pts.push(q.clone());
      }
      branchGeos.push(taperedTube(new THREE.CatmullRomCurve3(pts), 4, 0.4, 0.08, 6));
    }
    const wood = new THREE.Mesh(mergeParts(branchGeos), barkMat);
    wood.castShadow = true;
    wood.receiveShadow = true;
    group.add(wood);

    // ---------- canopy: dense dark foliage where QR is dark ----------
    // Candidate-based placement (NOT fill-to-target): light modules stay open.
    // Counts scale with QR area so per-module density stays constant.
    const areaK = (S / 30) * (S / 30);
    const canopyMax = Math.round(budget.canopy * areaK * params.density * params.foliageDensity);
    const blobDetail = 0;
    const blobGeoA = makeFoliageBlobGeometry(rng, blobDetail);
    const blobGeoB = makeFoliageBlobGeometry(rng, blobDetail);
    const leafMat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, flatShading: true });
    const canopyA = new THREE.InstancedMesh(blobGeoA, leafMat, canopyMax);
    const canopyB = new THREE.InstancedMesh(blobGeoB, leafMat.clone(), canopyMax);
    canopyA.castShadow = canopyB.castShadow = true;
    canopyA.receiveShadow = canopyB.receiveShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const sc = new THREE.Vector3();
    const pv = new THREE.Vector3();
    const darkC = new THREE.Color('#101e0c');
    const midC = new THREE.Color('#3f6132');
    const liteC = new THREE.Color('#5d7f43');
    const cc = new THREE.Color();
    let ia = 0;
    let ib = 0;
    const smoothstep = (a: number, b: number, x: number) => {
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    const candidates = Math.round(canopyMax * 3 * areaK);
    for (let i = 0; i < candidates && ia + ib < canopyMax; i++) {
      // uniform over the QR square with a noisy ragged rim (covers corner finders)
      const x = trunkBase.x + rng.range(-0.5, 0.5) * S * 0.98;
      const z = trunkBase.z + rng.range(-0.5, 0.5) * S * 0.94;
      const nx = Math.abs(x - trunkBase.x) / (S * 0.5);
      const nz = Math.abs(z - trunkBase.z) / (S * 0.5);
      const rim = Math.max(nx, nz) + (noise.unit(x * 0.4, z * 0.4, 2) - 0.5) * 0.22;
      if (rim > 1 || rng.next() < smoothstep(0.86, 1.0, rim) * 0.9) continue;
      const f = at(x, z);
      // steep contrast curve: dark modules ~opaque, light modules nearly open
      const trunkD = Math.hypot(x - trunkBase.x, z - trunkBase.z);
      if (trunkD < 1.6) continue; // trunk flare owns the center module
      // near-binary acceptance: light modules stay genuinely open
      const p = (0.01 + 0.99 * smoothstep(0.45, 0.6, f) * Math.min(1, params.density + 0.15)) * (0.05 + 0.95 * qrMask(field, x, z, S));
      if (rng.next() > p) continue;
      // cloud-pruned dome: higher near middle, ragged edge
      const y = H * (0.8 + 0.35 * (1 - rim * rim)) + rng.gaussian(0, 0.45 + params.variation * 0.45);
      pv.set(x + rng.gaussian(0, 0.25), Math.max(H * 0.5, y), z + rng.gaussian(0, 0.25));
      e.set(rng.range(0, Math.PI), rng.range(0, Math.PI * 2), rng.range(0, Math.PI));
      q.setFromEuler(e);
      // small footprints: side-volume only, the anchor roof carries the top view
      const s = rng.range(0.25, 0.45) * (0.7 + params.density * 0.5);
      sc.set(s * rng.range(0.9, 1.5), s * rng.range(0.7, 1), s * rng.range(0.9, 1.5));
      m.compose(pv, q, sc);
      // darker instances in dark modules -> stronger top-down contrast
      cc.copy(darkC).lerp(f > 0.6 ? midC : liteC, rng.range(0, 0.45) + (1 - f) * 0.35);
      if (rng.chance(0.5) && ia < canopyA.count) {
        canopyA.setMatrixAt(ia, m);
        canopyA.setColorAt(ia, cc);
        ia++;
      } else if (ib < canopyB.count) {
        canopyB.setMatrixAt(ib, m);
        canopyB.setColorAt(ib, cc);
        ib++;
      }
    }
    canopyA.count = ia;
    canopyB.count = ib;
    group.add(canopyA, canopyB);

    // ---------- anchor leaves: one dark foliage tuft per dark module ----------
    // Micro-scale QR fidelity: jittered irregular leaves (never squares) pinned
    // at dark-module cores so every dark module reads dark from directly above.
    // From the side they dissolve into ordinary canopy.
    {
      const leafGeo = makeLeafGeometry(0.6, 0.3);
      const leafMat = new THREE.MeshStandardMaterial({
        color: '#16280f',
        roughness: 1,
        side: THREE.DoubleSide,
      });
      const darkMods: { x: number; z: number }[] = [];
      const n = field.qr.size;
      const t = field.total;
      const qz = field.quietZone;
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (!field.qr.matrix[r][c]) continue;
          const u = (c + qz + 0.5) / t;
          const v = (r + qz + 0.5) / t;
          darkMods.push({ x: (u - 0.5) * S, z: (v - 0.5) * S });
        }
      }
      const anchors = new THREE.InstancedMesh(leafGeo, leafMat, Math.max(1, darkMods.length * 5));
      let ai2 = 0;
      for (const dm of darkMods) {
        if (qrMask(field, dm.x, dm.z, S) < 0.3) continue;
        if (Math.hypot(dm.x - trunkBase.x, dm.z - trunkBase.z) < 1.6) continue;
        // five overlapping leaves per dark module: a dense living roof with
        // ragged organic edges (never solid squares)
        for (let k = 0; k < 5 && ai2 < anchors.count; k++) {
          const jx = dm.x + rng.gaussian(0, 0.24);
          const jz = dm.z + rng.gaussian(0, 0.24);
          const nx = Math.abs(jx - trunkBase.x) / (S * 0.5);
          const nz = Math.abs(jz - trunkBase.z) / (S * 0.5);
          const rim = Math.min(1, Math.max(nx, nz));
          pv.set(jx, H * (0.88 + 0.35 * (1 - rim * rim)) + rng.gaussian(0, 0.3) + k * 0.12, jz);
          // flat to the sky (top-visible): yaw around world-Y, then small tilts
          q.setFromEuler(new THREE.Euler(0, rng.range(0, Math.PI * 2), 0));
          const tilt = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(-Math.PI / 2 + rng.gaussian(0, 0.3), 0, rng.gaussian(0, 0.3)),
          );
          q.multiply(tilt);
          // broad overlapping leaves: adjacent dark modules merge into a living
          // canopy roof from above, ragged and organic at the edges
          sc.set(rng.range(1.2, 1.8), rng.range(1.3, 2.0), 1);
          m.compose(pv, q, sc);
          anchors.setMatrixAt(ai2++, m);
        }
      }
      anchors.count = ai2;
      group.add(anchors);
    }

    // ---------- blossoms: 5-petal instanced flowers clustered on twigs ----------
    const blossomGeo = makeBlossomGeometry();
    const blossomMat = new THREE.MeshStandardMaterial({
      roughness: 0.55,
      metalness: 0,
      emissive: '#5c2a35',
      emissiveIntensity: 0.25,
      side: THREE.DoubleSide,
    });
    const blossomTarget = Math.round(budget.blossom * areaK * params.density * params.flowerDensity);
    const blossoms = new THREE.InstancedMesh(blossomGeo, blossomMat, Math.max(8, blossomTarget * 2));
    const pink = new THREE.Color('#f6cdd8');
    const deepPink = new THREE.Color('#ef9db4');
    const white = new THREE.Color('#fdeef2');
    let bi = 0;
    const placeFlower = (x: number, y: number, z: number, s: number) => {
      if (bi >= blossoms.count) return;
      pv.set(x, y, z);
      e.set(rng.range(-0.6, 0.6) + Math.PI / 2, rng.range(0, Math.PI * 2), rng.range(0, Math.PI));
      // face outward/down-ish like real sakura
      q.setFromEuler(e);
      sc.setScalar(s);
      m.compose(pv, q, sc);
      blossoms.setMatrixAt(bi, m);
      cc.copy(pink).lerp(rng.chance(0.3) ? white : deepPink, rng.range(0, 0.6));
      blossoms.setColorAt(bi, cc);
      bi++;
    };
    // clusters around twig tips (natural), thinned where QR is dark
    for (const tip of twigTips) {
      const f = at(tip.pos.x, tip.pos.z);
      const keep = (Math.pow(1 - f, 1.6) * 0.6 + 0.01) * (0.1 + 0.9 * qrMask(field, tip.pos.x, tip.pos.z, S));
      if (rng.next() > keep * params.flowerDensity + 0.02) continue;
      const n = rng.int(3, 7);
      for (let k = 0; k < n && bi < blossoms.count; k++) {
        // hang blossoms well under the anchor roof so the top projection stays clean
        placeFlower(
          tip.pos.x + rng.gaussian(0, 0.45),
          Math.min(tip.pos.y * 0.82, H * 0.7) + rng.gaussian(0, 0.3),
          tip.pos.z + rng.gaussian(0, 0.45),
          rng.range(0.5, 0.95),
        );
      }
    }
    // airy blossom drift inside canopy openings (light modules glow pink)
    let guard = blossomTarget * 4;
    while (bi < blossomTarget && guard-- > 0) {
      const r = Math.sqrt(rng.next()) * S * 0.5;
      const a = rng.next() * Math.PI * 2;
      const x = trunkBase.x + Math.cos(a) * r;
      const z = trunkBase.z + Math.sin(a) * r;
      const f = at(x, z);
      if (rng.next() > (1 - f) * 0.5 * params.flowerDensity * (0.1 + 0.9 * qrMask(field, x, z, S))) continue;
      placeFlower(x, H * rng.range(0.45, 0.7) + rng.gaussian(0, 0.4), z, rng.range(0.45, 0.8));
    }
    blossoms.count = bi;
    blossoms.castShadow = true;
    group.add(blossoms);

    // ---------- fallen petals on ground (brighten light modules) ----------
    const petalGeo = new THREE.CircleGeometry(0.09, 6);
    const petalMat = new THREE.MeshStandardMaterial({ color: '#f4c3d2', roughness: 0.8, side: THREE.DoubleSide });
    const fallenMax = Math.round(900 * areaK);
    const fallen = new THREE.InstancedMesh(petalGeo, petalMat, fallenMax);
    let fi = 0;
    for (let i = 0; i < fallenMax * 4 + 400 && fi < fallenMax; i++) {
      const x = rng.range(-S / 2, S / 2);
      const z = rng.range(-S / 2, S / 2);
      const f = at(x, z);
      if (rng.next() > (1 - f) * 0.55 * (0.15 + 0.85 * qrMask(field, x, z, S))) continue;
      pv.set(x, 0.02 + rng.next() * 0.02, z);
      e.set(-Math.PI / 2 + rng.range(-0.4, 0.4), 0, rng.range(0, Math.PI * 2));
      q.setFromEuler(e);
      sc.setScalar(rng.range(0.7, 1.6));
      m.compose(pv, q, sc);
      fallen.setMatrixAt(fi++, m);
    }
    fallen.count = fi;
    fallen.receiveShadow = true;
    group.add(fallen);

    // ---------- accent rocks ----------
    const rockGeo = new THREE.DodecahedronGeometry(0.5, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: '#8d8d89', roughness: 0.95, flatShading: true });
    for (let i = 0; i < 7; i++) {
      const rock = new THREE.Mesh(rockGeo, rockMat);
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(2.5, S * 0.55);
      rock.position.set(trunkBase.x + Math.cos(a) * r, 0.15, trunkBase.z + Math.sin(a) * r);
      rock.scale.set(rng.range(0.4, 1.4), rng.range(0.3, 0.8), rng.range(0.4, 1.4));
      rock.rotation.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3));
      rock.castShadow = rock.receiveShadow = true;
      group.add(rock);
    }
    return group;
  },
};

function mergeParts(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const list = geos.map((g) => g.toNonIndexed());
  let total = 0;
  for (const g of list) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of list) {
    const p = g.attributes.position as THREE.BufferAttribute;
    const n = g.attributes.normal as THREE.BufferAttribute;
    const u = g.attributes.uv as THREE.BufferAttribute;
    pos.set(p.array as Float32Array, o * 3);
    if (n) nor.set(n.array as Float32Array, o * 3);
    if (u) uv.set(u.array as Float32Array, o * 2);
    o += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}
