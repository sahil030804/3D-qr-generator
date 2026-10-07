import * as THREE from 'three';
import type { SceneGenerationContext } from '../core/generation/types';
import { QUALITY_BUDGET, constrainByQR, qualityMultiplier } from '../core/generation/types';
import { Noise2D } from '../core/generation/NoiseSystem';
import type { NaturalScenePreset } from './Preset';
import { makeGroundTexture } from './shared';

/**
 * Cinematic forest: clustered multi-species stand. Dark QR modules grow
 * dense dark canopy; light modules stay as sunlit meadow clearings.
 */
export const forestPreset: NaturalScenePreset = {
  id: 'forest',
  name: 'Forest',
  icon: '🌲',
  description: 'Cinematic woodland with hidden clearing QR',
  qrWorldSize: 30,

  generate(ctx: SceneGenerationContext): THREE.Group {
    const { field, rng, params, worldSize } = ctx;
    const S = worldSize;
    const noise = new Noise2D(rng.int(1, 1 << 30));
    const group = new THREE.Group();
    group.name = 'forest';

    const warpFn = (u: number, v: number): [number, number] => [
      noise.fbm(u * 5 + 11, v * 5, 3),
      noise.fbm(u * 5, v * 5 + 4, 3),
    ];
    field.warpAmount = 0.002 + params.variation * 0.003; // <0.2 modules: organic jitter, finders survive
    const at = (x: number, z: number) => {
      const u = x / S + 0.5;
      const v = z / S + 0.5;
      if (u < 0 || u > 1 || v < 0 || v > 1) return 0.4;
      return field.combined(u, v, [0.35, 0.3, 0.35], warpFn) * 0.65 + field.sharp(u, v) * 0.35;
    };
    const groundH = (x: number, z: number) => {
      const f = at(x, z);
      return (
        noise.warped(x * 0.08, z * 0.08, 0.8, 4) * 1.6 * params.height +
        noise.unit(x * 0.5, z * 0.5, 2) * 0.25 +
        f * 0.5 * params.height
      );
    };

    // ---------- terrain with QR-tinted vertex colors ----------
    const seg = params.quality === 'preview' ? 40 : params.quality === 'high' ? 64 : 96;
    const terrGeo = new THREE.PlaneGeometry(S * 1.1, S * 1.1, seg, seg);
    terrGeo.rotateX(-Math.PI / 2);
    {
      const p = terrGeo.attributes.position as THREE.BufferAttribute;
      const colors = new Float32Array(p.count * 3);
      const meadow = new THREE.Color('#b7bf8d');
      const floor = new THREE.Color('#44502f');
      const rock = new THREE.Color('#7d7a6e');
      const c = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const z = p.getZ(i);
        const h = groundH(x, z);
        p.setY(i, h);
        const f = at(x, z);
        c.copy(meadow).lerp(floor, Math.min(0.85, f * 0.8 * params.qrStrength + 0.15));
        if (h > 1.6) c.lerp(rock, Math.min(0.6, (h - 1.6) * 0.5));
        const n = noise.unit(x * 0.8, z * 0.8, 2);
        c.offsetHSL(0, 0, (n - 0.5) * 0.05);
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }
      terrGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      terrGeo.computeVertexNormals();
    }
    const terr = new THREE.Mesh(
      terrGeo,
      new THREE.MeshStandardMaterial({ map: makeGroundTexture(rng), vertexColors: true, roughness: 1 }),
    );
    terr.receiveShadow = true;
    group.add(terr);

    // ---------- tree placement: natural clusters gated by QR density ----------
    const treeTarget =
      params.quality === 'preview' ? 80 : params.quality === 'high' ? 180 : 320;
    const clusters: { x: number; z: number; r: number }[] = [];
    for (let i = 0; i < 9; i++) {
      clusters.push({ x: rng.range(-S / 2, S / 2), z: rng.range(-S / 2, S / 2), r: rng.range(2.5, 6) });
    }
    const spots: { x: number; z: number; s: number; kind: number; age: number }[] = [];
    // Candidate-capped: light modules stay open instead of filling to target.
    for (let g = 0; g < treeTarget * 2.5 && spots.length < treeTarget; g++) {
      const x = rng.range(-S / 2, S / 2);
      const z = rng.range(-S / 2, S / 2);
      let cluster = 0.25;
      for (const c of clusters) {
        const d = Math.hypot(x - c.x, z - c.z);
        cluster = Math.max(cluster, Math.exp(-(d * d) / (c.r * c.r)));
      }
      const f = at(x, z);
      const p = constrainByQR(cluster, Math.pow(f, 1.3), params.qrStrength) * params.density;
      if (rng.next() > p) continue;
      // spacing check against accepted (cheap O(n) fine at these counts)
      let ok = true;
      for (let k = spots.length - 1; k >= Math.max(0, spots.length - 40); k--) {
        const s = spots[k];
        if (Math.hypot(x - s.x, z - s.z) < 0.9 * s.s) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      spots.push({ x, z, s: rng.range(0.7, 1.5), kind: rng.next(), age: rng.next() });
    }

    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.3, 3.4, 7);
    trunkGeo.translate(0, 1.7, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#4c3a28', roughness: 0.95 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, Math.max(1, spots.length));
    const coneGeo = new THREE.ConeGeometry(1.5, 3.2, 8);
    coneGeo.translate(0, 1.2, 0);
    const blobGeo = new THREE.IcosahedronGeometry(1.5, 1);
    blobGeo.translate(0, 0.6, 0);
    const coniferMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true });
    const broadMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true });
    const conifers = new THREE.InstancedMesh(coneGeo, coniferMat, Math.max(1, spots.length));
    const broads = new THREE.InstancedMesh(blobGeo, broadMat, Math.max(1, spots.length));
    const m = new THREE.Matrix4();
    const qq = new THREE.Quaternion();
    const ee = new THREE.Euler();
    const vv = new THREE.Vector3();
    const ss = new THREE.Vector3();
    const cc = new THREE.Color();
    const deepG = new THREE.Color('#1f3a1e');
    const pineG = new THREE.Color('#2e5228');
    const leafG = new THREE.Color('#4a7038');
    let ti = 0;
    let ci = 0;
    let bi2 = 0;
    for (const s of spots) {
      const y = groundH(s.x, s.z) - 0.1;
      const hgt = (2.6 + s.age * 3.2) * s.s * (0.7 + params.height * 0.6);
      const f = at(s.x, s.z);
      ee.set(0, rng.range(0, Math.PI * 2), rng.range(-0.04, 0.04));
      qq.setFromEuler(ee);
      vv.set(s.x, y, s.z);
      ss.set(s.s, hgt / 3.4, s.s);
      m.compose(vv, qq, ss);
      trunks.setMatrixAt(ti++, m);
      vv.y = y + hgt * 0.55;
      const w = s.s * rng.range(0.85, 1.3);
      ss.set(w, (0.7 + s.age * 0.7) * s.s, w);
      m.compose(vv, qq, ss);
      cc.copy(deepG).lerp(s.kind < 0.45 ? pineG : leafG, rng.range(0.2, 0.7) + (1 - f) * 0.2);
      if (s.kind < 0.45 && ci < conifers.count) {
        conifers.setMatrixAt(ci, m);
        conifers.setColorAt(ci, cc);
        ci++;
      } else if (bi2 < broads.count) {
        broads.setMatrixAt(bi2, m);
        broads.setColorAt(bi2, cc);
        bi2++;
      }
    }
    trunks.count = ti;
    conifers.count = ci;
    broads.count = bi2;
    trunks.castShadow = conifers.castShadow = broads.castShadow = true;
    trunks.receiveShadow = conifers.receiveShadow = broads.receiveShadow = true;
    group.add(trunks, conifers, broads);

    // ---------- understory: grass bright in clearings, shrubs dark in forest ----------
    const grassN = Math.round(QUALITY_BUDGET[params.quality].grass * params.density);
    const grassGeo = new THREE.ConeGeometry(0.09, 0.55, 4);
    grassGeo.translate(0, 0.27, 0);
    const grass = new THREE.InstancedMesh(
      grassGeo,
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }),
      grassN,
    );
    let gi = 0;
    let gguard = grassN * 4;
    const straw = new THREE.Color('#cfd28f');
    const moss = new THREE.Color('#4d6b34');
    while (gi < grassN && gguard-- > 0) {
      const x = rng.range(-S / 2, S / 2);
      const z = rng.range(-S / 2, S / 2);
      const f = at(x, z);
      // grass everywhere, but lusher/brighter in light clearings
      if (rng.next() > 0.25 + (1 - f) * 0.75) continue;
      vv.set(x, groundH(x, z), z);
      ee.set(rng.range(-0.2, 0.2), rng.range(0, 6), rng.range(-0.2, 0.2));
      qq.setFromEuler(ee);
      const g = rng.range(0.6, 1.6);
      ss.set(g, g * rng.range(0.8, 1.5), g);
      m.compose(vv, qq, ss);
      grass.setMatrixAt(gi, m);
      grass.setColorAt(gi, cc.copy(moss).lerp(straw, (1 - f) * rng.range(0.4, 1)));
      gi++;
    }
    grass.count = gi;
    group.add(grass);

    // bushes (dark, in dense modules) + rocks + a few dead snags
    const bushGeo = new THREE.IcosahedronGeometry(0.55, 1);
    const bushMax = Math.round(220 * qualityMultiplier(params.quality));
    const bushes = new THREE.InstancedMesh(bushGeo, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), bushMax);
    let bui = 0;
    let bguard = 3000;
    const bushC = new THREE.Color('#2c4a26');
    while (bui < bushMax && bguard-- > 0) {
      const x = rng.range(-S / 2, S / 2);
      const z = rng.range(-S / 2, S / 2);
      const f = at(x, z);
      if (rng.next() > f * f * params.density) continue;
      vv.set(x, groundH(x, z) + 0.25, z);
      ee.set(0, rng.range(0, 6), 0);
      qq.setFromEuler(ee);
      ss.set(rng.range(0.7, 1.8), rng.range(0.5, 1.1), rng.range(0.7, 1.8));
      m.compose(vv, qq, ss);
      bushes.setMatrixAt(bui, m);
      bushes.setColorAt(bui, cc.copy(bushC).offsetHSL(0, 0, rng.range(-0.03, 0.05)));
      bui++;
    }
    bushes.count = bui;
    bushes.castShadow = true;
    group.add(bushes);

    const rockGeo = new THREE.DodecahedronGeometry(0.5, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: '#8a867b', roughness: 0.95, flatShading: true });
    for (let i = 0; i < 14; i++) {
      const rk = new THREE.Mesh(rockGeo, rockMat);
      const x = rng.range(-S / 2, S / 2);
      const z = rng.range(-S / 2, S / 2);
      rk.position.set(x, groundH(x, z) + 0.1, z);
      rk.scale.set(rng.range(0.3, 1.3), rng.range(0.2, 0.7), rng.range(0.3, 1.3));
      rk.rotation.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3));
      rk.castShadow = rk.receiveShadow = true;
      group.add(rk);
    }
    return group;
  },
};
