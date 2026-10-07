import * as THREE from 'three';
import { QUALITY_BUDGET, constrainByQR, qualityMultiplier } from '../core/generation/types';
import { Noise2D } from '../core/generation/NoiseSystem';
import { makeGroundTexture } from './shared';
function fieldSampler(ctx, S) {
    const { field, rng, params } = ctx;
    const noise = new Noise2D(rng.int(1, 1 << 30));
    const warpFn = (u, v) => [
        noise.fbm(u * 5 + 3, v * 5, 3),
        noise.fbm(u * 5, v * 5 + 9, 3),
    ];
    field.warpAmount = 0.002 + params.variation * 0.003; // <0.2 modules: organic jitter, finders survive
    return {
        noise,
        at: (x, z) => {
            const u = x / S + 0.5;
            const v = z / S + 0.5;
            if (u < 0 || u > 1 || v < 0 || v > 1)
                return 0.4;
            return field.combined(u, v, [0.35, 0.3, 0.35], warpFn);
        },
    };
}
function groundMesh(rng, S, tint, at, noise, texBase = '#bcc59b') {
    const g = new THREE.CircleGeometry(S * 0.95, 64);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const z = p.getZ(i);
        tint(at(x, z), noise.unit(x * 0.3, z * 0.3, 3), c);
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: makeGroundTexture(rng, texBase), vertexColors: true, roughness: 1 }));
    mesh.receiveShadow = true;
    return mesh;
}
/** Flower field: jewel-toned bloom drifts (dark) vs pale daisy meadow (light). */
export const flowerFieldPreset = {
    id: 'flower-field', name: 'Flower Field', icon: '🌷', description: 'Wildflower meadow with a hidden bloom QR', qrWorldSize: 26,
    generate(ctx) {
        const { rng, params, worldSize: S } = ctx;
        const { noise, at } = fieldSampler(ctx, S);
        const group = new THREE.Group();
        const light = new THREE.Color('#cfd6a4');
        const dark = new THREE.Color('#5a6b3c');
        group.add(groundMesh(rng, S, (f, n, c) => c.copy(light).lerp(dark, Math.min(0.7, f * 0.6 * params.qrStrength + (1 - n) * 0.15)), at, noise));
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const e = new THREE.Euler();
        const v = new THREE.Vector3();
        const s = new THREE.Vector3();
        const cc = new THREE.Color();
        // dark blooms: tulip-ish cones on stems
        const stemG = new THREE.CylinderGeometry(0.03, 0.05, 0.9, 5);
        stemG.translate(0, 0.45, 0);
        const headG = new THREE.ConeGeometry(0.16, 0.42, 7);
        headG.translate(0, 1.05, 0);
        const N = Math.round(QUALITY_BUDGET[params.quality].grass * 1.4 * params.density * params.flowerDensity);
        const stems = new THREE.InstancedMesh(stemG, new THREE.MeshStandardMaterial({ color: '#3d5a2c', roughness: 1 }), N);
        const heads = new THREE.InstancedMesh(headG, new THREE.MeshStandardMaterial({ roughness: 0.7, flatShading: true }), N);
        const jewel = [new THREE.Color('#7a1f3d'), new THREE.Color('#8e2f4a'), new THREE.Color('#5c2a72'), new THREE.Color('#a33b2e')];
        let n = 0;
        let guard = N * 2;
        while (n < N && guard-- > 0) {
            const x = rng.range(-S / 2, S / 2);
            const z = rng.range(-S / 2, S / 2);
            const f = at(x, z);
            if (rng.next() > constrainByQR(0.4, Math.pow(f, 1.3), params.qrStrength) * params.density)
                continue;
            v.set(x, 0, z);
            e.set(rng.range(-0.12, 0.12), rng.range(0, 6), rng.range(-0.12, 0.12));
            q.setFromEuler(e);
            const g = rng.range(0.7, 1.5);
            s.set(g, g, g);
            m.compose(v, q, s);
            stems.setMatrixAt(n, m);
            heads.setMatrixAt(n, m);
            heads.setColorAt(n, cc.copy(jewel[n % jewel.length]).offsetHSL(0, 0, rng.range(-0.05, 0.08)));
            n++;
        }
        stems.count = heads.count = n;
        heads.castShadow = true;
        group.add(stems, heads);
        // pale daisies in light modules
        const daisyG = new THREE.SphereGeometry(0.11, 6, 5);
        daisyG.translate(0, 0.55, 0);
        const daisyMax = Math.round(1500 * qualityMultiplier(params.quality));
        const daisies = new THREE.InstancedMesh(daisyG, new THREE.MeshStandardMaterial({ color: '#f3ead0', roughness: 0.8 }), daisyMax);
        let di = 0;
        guard = 8000;
        while (di < daisyMax && guard-- > 0) {
            const x = rng.range(-S / 2, S / 2);
            const z = rng.range(-S / 2, S / 2);
            const f = at(x, z);
            if (rng.next() > (1 - f) * 0.7 * params.flowerDensity)
                continue;
            v.set(x, 0, z);
            q.identity();
            s.setScalar(rng.range(0.7, 1.4));
            m.compose(v, q, s);
            daisies.setMatrixAt(di++, m);
        }
        daisies.count = di;
        group.add(daisies);
        return group;
    },
};
/** Mountain: dark pine slopes vs pale snow/granite. */
export const mountainPreset = {
    id: 'mountain', name: 'Mountain', icon: '🏔️', description: 'Alpine ridges with a hidden summit QR', qrWorldSize: 30,
    generate(ctx) {
        const { rng, params, worldSize: S } = ctx;
        const { noise, at } = fieldSampler(ctx, S);
        const group = new THREE.Group();
        const seg = params.quality === 'preview' ? 56 : 96;
        const g = new THREE.PlaneGeometry(S * 1.1, S * 1.1, seg, seg);
        g.rotateX(-Math.PI / 2);
        const p = g.attributes.position;
        const colors = new Float32Array(p.count * 3);
        const snow = new THREE.Color('#e8e9e4');
        const granite = new THREE.Color('#9a968c');
        const pine = new THREE.Color('#2c4429');
        const c = new THREE.Color();
        const heightAt = (x, z) => {
            const ridge = 1 - Math.abs(noise.warped(x * 0.09, z * 0.09, 0.9, 4));
            return Math.pow(Math.max(0, ridge), 1.6) * 9 * params.height + noise.unit(x * 0.4, z * 0.4, 2) * 0.4;
        };
        for (let i = 0; i < p.count; i++) {
            const x = p.getX(i);
            const z = p.getZ(i);
            const h = heightAt(x, z);
            p.setY(i, h);
            const f = at(x, z);
            c.copy(granite).lerp(snow, Math.min(1, Math.max(0, (h - 3.2) / 3)));
            // forested dark bands where QR is dark and altitude is low
            const forest = f * params.qrStrength * Math.max(0, 1 - h / 5);
            c.lerp(pine, Math.min(0.9, forest * 1.2));
            colors[i * 3] = c.r;
            colors[i * 3 + 1] = c.g;
            colors[i * 3 + 2] = c.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        g.computeVertexNormals();
        const terr = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
        terr.receiveShadow = true;
        group.add(terr);
        // pines on dark low slopes
        const cone = new THREE.ConeGeometry(0.7, 2.4, 7);
        cone.translate(0, 1.4, 0);
        const pineMax = Math.round(1400 * qualityMultiplier(params.quality));
        const pines = new THREE.InstancedMesh(cone, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true }), pineMax);
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const e = new THREE.Euler();
        const v = new THREE.Vector3();
        const s = new THREE.Vector3();
        const cc = new THREE.Color();
        const dg = new THREE.Color('#1e3a20');
        let n = 0;
        let guard = 2800;
        while (n < pineMax && guard-- > 0) {
            const x = rng.range(-S / 2, S / 2);
            const z = rng.range(-S / 2, S / 2);
            const h = heightAt(x, z);
            if (h > 4.6)
                continue;
            const f = at(x, z);
            if (rng.next() > f * f * params.density)
                continue;
            v.set(x, h - 0.1, z);
            e.set(0, rng.range(0, 6), 0);
            q.setFromEuler(e);
            const sc = rng.range(0.6, 1.6);
            s.set(sc, sc, sc);
            m.compose(v, q, s);
            pines.setMatrixAt(n, m);
            pines.setColorAt(n, cc.copy(dg).offsetHSL(0, 0, rng.range(0, 0.06)));
            n++;
        }
        pines.count = n;
        pines.castShadow = true;
        group.add(pines);
        return group;
    },
};
/** Crystal formation: dark amethyst clusters vs pale quartz sand. */
export const crystalPreset = {
    id: 'crystal', name: 'Crystal', icon: '💎', description: 'Amethyst field with a hidden crystal QR', qrWorldSize: 26,
    generate(ctx) {
        const { rng, params, worldSize: S } = ctx;
        const { noise, at } = fieldSampler(ctx, S);
        const group = new THREE.Group();
        const sand = new THREE.Color('#d8cfae');
        const shade = new THREE.Color('#a89a76');
        group.add(groundMesh(rng, S, (f, nn, c) => c.copy(sand).lerp(shade, f * 0.3 * params.qrStrength + (1 - nn) * 0.1), at, noise, '#d8cfae'));
        const shard = new THREE.OctahedronGeometry(0.5, 0);
        shard.scale(1, 2.6, 1);
        shard.translate(0, 1.1, 0);
        const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.25, metalness: 0.1, flatShading: true, clearcoat: 0.6 });
        const N = params.quality === 'preview' ? 500 : params.quality === 'high' ? 1300 : 2400;
        const inst = new THREE.InstancedMesh(shard, mat, N);
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const e = new THREE.Euler();
        const v = new THREE.Vector3();
        const s = new THREE.Vector3();
        const cc = new THREE.Color();
        const deep = new THREE.Color('#3a1f5c');
        const mid = new THREE.Color('#6b3fa0');
        const pale = new THREE.Color('#cbb8e8');
        // cluster centers in dark regions
        const centers = [];
        let cg = 4000;
        while (centers.length < 60 && cg-- > 0) {
            const x = rng.range(-S / 2, S / 2);
            const z = rng.range(-S / 2, S / 2);
            if (rng.next() < at(x, z))
                centers.push({ x, z });
        }
        let n = 0;
        let guard = N * 2;
        while (n < N && guard-- > 0) {
            const cn = centers.length ? centers[Math.floor(rng.next() * centers.length)] : { x: 0, z: 0 };
            const x = cn.x + rng.gaussian(0, 1.2);
            const z = cn.z + rng.gaussian(0, 1.2);
            const f = at(x, z);
            if (rng.next() > (0.15 + 0.85 * f) * params.density)
                continue;
            const tall = 0.5 + f * 1.6;
            v.set(x, 0, z);
            e.set(rng.range(-0.25, 0.25), rng.range(0, 6), rng.range(-0.25, 0.25));
            q.setFromEuler(e);
            s.set(rng.range(0.4, 1), tall * rng.range(0.7, 1.4), rng.range(0.4, 1));
            m.compose(v, q, s);
            inst.setMatrixAt(n, m);
            inst.setColorAt(n, cc.copy(f > 0.5 ? deep : mid).lerp(pale, (1 - f) * 0.5 + rng.range(0, 0.15)));
            n++;
        }
        inst.count = n;
        inst.castShadow = true;
        group.add(inst);
        return group;
    },
};
/** Mushroom forest: big russet caps (dark) vs glowing moss (light). */
export const mushroomPreset = {
    id: 'mushroom', name: 'Mushroom', icon: '🍄', description: 'Bioluminescent mushroom grove QR', qrWorldSize: 26,
    generate(ctx) {
        const { rng, params, worldSize: S } = ctx;
        const { noise, at } = fieldSampler(ctx, S);
        const group = new THREE.Group();
        const mossL = new THREE.Color('#b9c98e');
        const mossD = new THREE.Color('#4a5c33');
        group.add(groundMesh(rng, S, (f, nn, c) => c.copy(mossL).lerp(mossD, Math.min(0.8, f * 0.7 * params.qrStrength + (1 - nn) * 0.15)), at, noise));
        const stemG = new THREE.CylinderGeometry(0.12, 0.22, 1.4, 7);
        stemG.translate(0, 0.7, 0);
        const capG = new THREE.SphereGeometry(0.55, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
        capG.translate(0, 1.35, 0);
        const N = params.quality === 'preview' ? 260 : params.quality === 'high' ? 650 : 1100;
        const stems = new THREE.InstancedMesh(stemG, new THREE.MeshStandardMaterial({ color: '#e5d9bd', roughness: 0.9 }), N);
        const caps = new THREE.InstancedMesh(capG, new THREE.MeshStandardMaterial({ roughness: 0.6, flatShading: true }), N);
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const e = new THREE.Euler();
        const v = new THREE.Vector3();
        const s = new THREE.Vector3();
        const cc = new THREE.Color();
        const russet = new THREE.Color('#7a2f1d');
        const umber = new THREE.Color('#4e2415');
        let n = 0;
        let guard = N * 2;
        while (n < N && guard-- > 0) {
            const x = rng.range(-S / 2, S / 2);
            const z = rng.range(-S / 2, S / 2);
            const f = at(x, z);
            if (rng.next() > constrainByQR(0.35, Math.pow(f, 1.2), params.qrStrength) * params.density)
                continue;
            v.set(x, 0, z);
            e.set(0, rng.range(0, 6), 0);
            q.setFromEuler(e);
            const sc = rng.range(0.5, 2.2) * (0.6 + params.height * 0.7);
            s.set(sc, sc, sc);
            m.compose(v, q, s);
            stems.setMatrixAt(n, m);
            caps.setMatrixAt(n, m);
            caps.setColorAt(n, cc.copy(russet).lerp(umber, rng.range(0, 0.7)));
            n++;
        }
        stems.count = caps.count = n;
        caps.castShadow = true;
        group.add(stems, caps);
        return group;
    },
};
