import * as THREE from 'three';
import { QUALITY_BUDGET, constrainByQR, qualityMultiplier } from '../core/generation/types';
import { Noise2D } from '../core/generation/NoiseSystem';
import { makeGroundTexture, qrMask } from './shared';
function sampler(ctx, S) {
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
                return 0.05;
            return field.combined(u, v, [0.35, 0.3, 0.35], warpFn);
        },
    };
}
/** Coral reef: dark sea fans/corals vs pale sand. */
export const coralPreset = {
    id: 'coral', name: 'Coral Reef', icon: '🪸', description: 'Coral garden with a hidden reef QR', qrWorldSize: 26,
    generate(ctx) {
        const { field, rng, params, worldSize: S } = ctx;
        const { noise, at } = sampler(ctx, S);
        const group = new THREE.Group();
        const sand = new THREE.Color('#d9cf9f');
        const deep = new THREE.Color('#7a6a4a');
        const g = new THREE.CircleGeometry(S * 0.95, 64);
        g.rotateX(-Math.PI / 2);
        const p = g.attributes.position;
        const colors = new Float32Array(p.count * 3);
        const c = new THREE.Color();
        for (let i = 0; i < p.count; i++) {
            const x = p.getX(i);
            const z = p.getZ(i);
            c.copy(sand).lerp(deep, Math.min(0.6, at(x, z) * 0.45 * params.qrStrength + (1 - noise.unit(x * 0.3, z * 0.3, 3)) * 0.12));
            colors[i * 3] = c.r;
            colors[i * 3 + 1] = c.g;
            colors[i * 3 + 2] = c.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: makeGroundTexture(rng, '#d9cf9f'), vertexColors: true, roughness: 1 }));
        ground.receiveShadow = true;
        group.add(ground);
        // sea fans: dark branching cones
        const fan = new THREE.ConeGeometry(0.5, 1.6, 6);
        fan.translate(0, 0.8, 0);
        const N = params.quality === 'preview' ? 400 : params.quality === 'high' ? 1000 : 1800;
        const inst = new THREE.InstancedMesh(fan, new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), N);
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const e = new THREE.Euler();
        const v = new THREE.Vector3();
        const s = new THREE.Vector3();
        const cc = new THREE.Color();
        const purple = new THREE.Color('#4a2a5c');
        const rust = new THREE.Color('#8e3b22');
        const kelp = new THREE.Color('#2e4a2a');
        const pal = [purple, rust, kelp];
        let n = 0;
        let guard = N * 2;
        while (n < N && guard-- > 0) {
            const x = rng.range(-S / 2, S / 2);
            const z = rng.range(-S / 2, S / 2);
            const f = at(x, z);
            if (rng.next() > constrainByQR(0.35, Math.pow(f, 1.25), params.qrStrength) * params.density * (0.05 + 0.95 * qrMask(field, x, z, S)))
                continue;
            v.set(x, 0, z);
            e.set(rng.range(-0.2, 0.2), rng.range(0, 6), rng.range(-0.2, 0.2));
            q.setFromEuler(e);
            const sc = rng.range(0.5, 1.8) * (0.6 + params.height * 0.7);
            s.set(sc, sc, sc);
            m.compose(v, q, s);
            inst.setMatrixAt(n, m);
            inst.setColorAt(n, cc.copy(pal[n % 3]).offsetHSL(0, 0, rng.range(-0.04, 0.05)));
            n++;
        }
        inst.count = n;
        inst.castShadow = true;
        group.add(inst);
        // pale shells in light areas
        const shellG = new THREE.SphereGeometry(0.16, 7, 5);
        shellG.scale(1, 0.5, 1);
        const shellMax = Math.round(400 * qualityMultiplier(params.quality));
        const shells = new THREE.InstancedMesh(shellG, new THREE.MeshStandardMaterial({ color: '#f2e6cc', roughness: 0.5 }), shellMax);
        let si = 0;
        guard = 4000;
        while (si < shellMax && guard-- > 0) {
            const x = rng.range(-S / 2, S / 2);
            const z = rng.range(-S / 2, S / 2);
            if (rng.next() > (1 - at(x, z)) * 0.5)
                continue;
            v.set(x, 0.05, z);
            q.identity();
            s.setScalar(rng.range(0.6, 1.5));
            m.compose(v, q, s);
            shells.setMatrixAt(si++, m);
        }
        shells.count = si;
        group.add(shells);
        return group;
    },
};
/** Temple garden: dark pines + stones vs pale raked gravel, pagoda centerpiece. */
export const templePreset = {
    id: 'temple', name: 'Temple Garden', icon: '⛩️', description: 'Zen garden with a hidden stone QR', qrWorldSize: 28,
    generate(ctx) {
        const { field, rng, params, worldSize: S } = ctx;
        const { noise, at } = sampler(ctx, S);
        const group = new THREE.Group();
        const gravel = new THREE.Color('#d5cfbb');
        const mossD = new THREE.Color('#55603a');
        const g = new THREE.CircleGeometry(S * 0.95, 64);
        g.rotateX(-Math.PI / 2);
        const p = g.attributes.position;
        const colors = new Float32Array(p.count * 3);
        const c = new THREE.Color();
        for (let i = 0; i < p.count; i++) {
            const x = p.getX(i);
            const z = p.getZ(i);
            c.copy(gravel).lerp(mossD, Math.min(0.75, at(x, z) * 0.65 * params.qrStrength + (1 - noise.unit(x * 0.3, z * 0.3, 3)) * 0.12));
            colors[i * 3] = c.r;
            colors[i * 3 + 1] = c.g;
            colors[i * 3 + 2] = c.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: makeGroundTexture(rng, '#d5cfbb'), vertexColors: true, roughness: 1 }));
        ground.receiveShadow = true;
        group.add(ground);
        // central pagoda (dark timber + tile roofs)
        const timber = new THREE.MeshStandardMaterial({ color: '#4a2f1d', roughness: 0.85 });
        const tile = new THREE.MeshStandardMaterial({ color: '#2e3138', roughness: 0.7, flatShading: true });
        const pagoda = new THREE.Group();
        let wy = 0;
        for (let tier = 0; tier < 3; tier++) {
            const w = 3.2 - tier * 0.8;
            const body = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, w), timber);
            body.position.y = wy + 0.55;
            body.castShadow = true;
            pagoda.add(body);
            const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 1.05, 0.9, 4), tile);
            roof.position.y = wy + 1.55;
            roof.rotation.y = Math.PI / 4;
            roof.castShadow = true;
            pagoda.add(roof);
            wy += 1.7;
        }
        group.add(pagoda);
        // pines where QR dark (avoid pagoda footprint)
        const cone = new THREE.ConeGeometry(0.9, 2.8, 8);
        cone.translate(0, 1.6, 0);
        const trunkG = new THREE.CylinderGeometry(0.12, 0.2, 1.2, 6);
        trunkG.translate(0, 0.6, 0);
        const N = params.quality === 'preview' ? 120 : params.quality === 'high' ? 300 : 520;
        const pines = new THREE.InstancedMesh(cone, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, flatShading: true }), N);
        const trunks = new THREE.InstancedMesh(trunkG, timber, N);
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const e = new THREE.Euler();
        const v = new THREE.Vector3();
        const s = new THREE.Vector3();
        const cc = new THREE.Color();
        const dg = new THREE.Color('#223d22');
        let n = 0;
        let guard = N * 2;
        while (n < N && guard-- > 0) {
            const x = rng.range(-S / 2, S / 2);
            const z = rng.range(-S / 2, S / 2);
            if (Math.hypot(x, z) < 3.4)
                continue;
            const f = at(x, z);
            if (rng.next() > Math.pow(f, 1.3) * params.density * (0.05 + 0.95 * qrMask(field, x, z, S)))
                continue;
            v.set(x, 0, z);
            e.set(0, rng.range(0, 6), 0);
            q.setFromEuler(e);
            const sc = rng.range(0.7, 1.5);
            s.set(sc, sc, sc);
            m.compose(v, q, s);
            pines.setMatrixAt(n, m);
            trunks.setMatrixAt(n, m);
            pines.setColorAt(n, cc.copy(dg).offsetHSL(0, 0, rng.range(0, 0.06)));
            n++;
        }
        pines.count = trunks.count = n;
        pines.castShadow = true;
        group.add(pines, trunks);
        // dark stepping stones denser in dark modules
        const stoneG = new THREE.CylinderGeometry(0.5, 0.55, 0.14, 8);
        const stoneMax = Math.round(300 * qualityMultiplier(params.quality));
        const stones = new THREE.InstancedMesh(stoneG, new THREE.MeshStandardMaterial({ color: '#6f6c64', roughness: 1, flatShading: true }), stoneMax);
        let sti = 0;
        guard = 5000;
        while (sti < stoneMax && guard-- > 0) {
            const x = rng.range(-S / 2, S / 2);
            const z = rng.range(-S / 2, S / 2);
            if (Math.hypot(x, z) < 3)
                continue;
            if (rng.next() > at(x, z) * 0.8)
                continue;
            v.set(x, 0.07, z);
            e.set(0, rng.range(0, 6), 0);
            q.setFromEuler(e);
            s.set(rng.range(0.6, 1.4), 1, rng.range(0.6, 1.4));
            m.compose(v, q, s);
            stones.setMatrixAt(sti++, m);
        }
        stones.count = sti;
        stones.receiveShadow = true;
        group.add(stones);
        return group;
    },
};
/** City: dark towers (dense blocks) vs sunlit parks/plazas. */
export const cityPreset = {
    id: 'city', name: 'City', icon: '🏙️', description: 'Urban blocks with a hidden rooftop QR', qrWorldSize: 28,
    generate(ctx) {
        const { field, rng, params, worldSize: S } = ctx;
        const { noise, at } = sampler(ctx, S);
        const group = new THREE.Group();
        const asphalt = new THREE.Color('#b9b7ae');
        const parkG = new THREE.Color('#5f7a3c');
        const g = new THREE.PlaneGeometry(S * 1.05, S * 1.05, 8, 8);
        g.rotateX(-Math.PI / 2);
        const p = g.attributes.position;
        const colors = new Float32Array(p.count * 3);
        const c = new THREE.Color();
        for (let i = 0; i < p.count; i++) {
            const x = p.getX(i);
            const z = p.getZ(i);
            c.copy(asphalt).lerp(parkG, Math.min(0.8, (1 - at(x, z)) * 0.6 + noise.unit(x * 0.4, z * 0.4, 2) * 0.15));
            colors[i * 3] = c.r;
            colors[i * 3 + 1] = c.g;
            colors[i * 3 + 2] = c.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
        ground.receiveShadow = true;
        group.add(ground);
        // buildings: varied footprints/heights/rotations (never a raw module grid)
        const box = new THREE.BoxGeometry(1, 1, 1);
        box.translate(0, 0.5, 0);
        const N = params.quality === 'preview' ? 130 : params.quality === 'high' ? 300 : 480;
        const towers = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.35, flatShading: true }), N);
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const e = new THREE.Euler();
        const v = new THREE.Vector3();
        const s = new THREE.Vector3();
        const cc = new THREE.Color();
        const glass = new THREE.Color('#232c38');
        const brick = new THREE.Color('#4a3f3a');
        const conc = new THREE.Color('#5c6066');
        const mats = [glass, brick, conc];
        let n = 0;
        let guard = N * 2;
        while (n < N && guard-- > 0) {
            // jittered block lattice so placement feels urban, not QR-grid
            const bx = Math.round(rng.range(-4, 4));
            const bz = Math.round(rng.range(-4, 4));
            const cell = S / 9;
            const x = bx * cell + rng.gaussian(0, cell * 0.14);
            const z = bz * cell + rng.gaussian(0, cell * 0.14);
            if (Math.abs(x) > S / 2 || Math.abs(z) > S / 2)
                continue;
            const f = at(x, z);
            if (rng.next() > (Math.pow(f, 1.1) * params.density + 0.02) * (0.05 + 0.95 * qrMask(field, x, z, S)))
                continue;
            const h = (1.5 + f * 5.5) * (0.6 + params.height * 0.8) * rng.range(0.7, 1.3);
            v.set(x, 0, z);
            e.set(0, rng.range(-0.09, 0.09), 0);
            q.setFromEuler(e);
            s.set(rng.range(1.4, 3.2), h, rng.range(1.4, 3.2));
            m.compose(v, q, s);
            towers.setMatrixAt(n, m);
            towers.setColorAt(n, cc.copy(mats[n % 3]).offsetHSL(0, 0, rng.range(-0.03, 0.04)));
            n++;
        }
        towers.count = n;
        towers.castShadow = towers.receiveShadow = true;
        group.add(towers);
        // street trees in light modules
        const blob = new THREE.IcosahedronGeometry(0.7, 1);
        const treeMax = Math.round(400 * qualityMultiplier(params.quality));
        const trees = new THREE.InstancedMesh(blob, new THREE.MeshStandardMaterial({ color: '#4d7038', roughness: 1, flatShading: true }), treeMax);
        let ti = 0;
        guard = 5000;
        while (ti < treeMax && guard-- > 0) {
            const x = rng.range(-S / 2, S / 2);
            const z = rng.range(-S / 2, S / 2);
            if (rng.next() > (1 - at(x, z)) * 0.5 * params.foliageDensity)
                continue;
            v.set(x, 1.2, z);
            q.identity();
            s.setScalar(rng.range(0.6, 1.4));
            m.compose(v, q, s);
            trees.setMatrixAt(ti++, m);
        }
        trees.count = ti;
        trees.castShadow = true;
        group.add(trees);
        return group;
    },
};
/** Custom: balanced sampler mixing canopy blobs + meadow, good default. */
export const customPreset = {
    id: 'custom', name: 'Custom Meadow', icon: '✨', description: 'Balanced grove tuned for QR contrast', qrWorldSize: 26,
    generate(ctx) {
        const { field, rng, params, worldSize: S } = ctx;
        const { noise, at } = sampler(ctx, S);
        const group = new THREE.Group();
        const light = new THREE.Color('#c9cfa5');
        const dark = new THREE.Color('#55663a');
        const g = new THREE.CircleGeometry(S * 0.95, 48);
        g.rotateX(-Math.PI / 2);
        const p = g.attributes.position;
        const colors = new Float32Array(p.count * 3);
        const c = new THREE.Color();
        for (let i = 0; i < p.count; i++) {
            const x = p.getX(i);
            const z = p.getZ(i);
            c.copy(light).lerp(dark, Math.min(0.75, at(x, z) * 0.65 * params.qrStrength + (1 - noise.unit(x * 0.3, z * 0.3, 3)) * 0.12));
            colors[i * 3] = c.r;
            colors[i * 3 + 1] = c.g;
            colors[i * 3 + 2] = c.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: makeGroundTexture(rng), vertexColors: true, roughness: 1 }));
        ground.receiveShadow = true;
        group.add(ground);
        const blob = new THREE.IcosahedronGeometry(0.9, 1);
        const N = Math.round(QUALITY_BUDGET[params.quality].canopy * 0.7 * params.density);
        const inst = new THREE.InstancedMesh(blob, new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), N);
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const e = new THREE.Euler();
        const v = new THREE.Vector3();
        const s = new THREE.Vector3();
        const cc = new THREE.Color();
        const dg = new THREE.Color('#2c4426');
        const lg = new THREE.Color('#6b8a44');
        let n = 0;
        let guard = N * 2;
        while (n < N && guard-- > 0) {
            const x = rng.range(-S / 2, S / 2);
            const z = rng.range(-S / 2, S / 2);
            const f = at(x, z);
            if (rng.next() > constrainByQR(0.4, Math.pow(f, 1.25), params.qrStrength) * params.density * (0.05 + 0.95 * qrMask(field, x, z, S)))
                continue;
            v.set(x, rng.range(0.4, 1.6 + params.height * 2), z);
            e.set(rng.range(0, 3), rng.range(0, 6), rng.range(0, 3));
            q.setFromEuler(e);
            const sc = rng.range(0.5, 1.4);
            s.set(sc, sc * 0.8, sc);
            m.compose(v, q, s);
            inst.setMatrixAt(n, m);
            inst.setColorAt(n, cc.copy(dg).lerp(lg, (1 - f) * 0.5 + rng.range(0, 0.2)));
            n++;
        }
        inst.count = n;
        inst.castShadow = true;
        group.add(inst);
        return group;
    },
};
