import { generateQRMatrix } from '../qr/QRGenerator';
import { QRField } from '../qr/QRField';
import { SeededRandom } from '../generation/SeededRandom';
import { defaultParams } from '../generation/types';
import { getPreset } from '../../presets';
import { disposeObject } from '../../presets/shared';
import { TopDownRenderer } from './TopDownRenderer';
/**
 * Generate -> top-down render -> decode -> compare, retrying (<=10) with
 * controlled contrast/density adjustments. Never an infinite loop.
 */
export async function generateVerifiedScene(renderer, scene, opts, cb = {}) {
    const { content, presetId } = opts;
    const preset = getPreset(presetId);
    const qr = generateQRMatrix(content);
    const maxAttempts = Math.min(4, opts.maxAttempts ?? 4);
    const top = new TopDownRenderer(renderer);
    const t0 = performance.now();
    let group = null;
    let lastResult = null;
    let lastParams = defaultParams(opts.params);
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const boost = attempt; // 0 = user settings, then progressively stronger
        const params = {
            ...defaultParams(opts.params),
            qrStrength: Math.min(1, (opts.params.qrStrength ?? 0.9) + boost * 0.04),
            density: Math.min(1.2, (opts.params.density ?? 0.85) + boost * 0.04),
            foliageDensity: Math.min(1.2, (opts.params.foliageDensity ?? 0.9) + boost * 0.03),
            variation: Math.max(0.15, (opts.params.variation ?? 0.55) - boost * 0.06),
            seed: (opts.params.seed ?? 20260707) + (attempt === 0 ? 0 : 1000 + boost),
        };
        lastParams = params;
        const field = new QRField(qr);
        const rng = new SeededRandom(SeededRandom.hashSeed(`${params.seed}:${presetId}:${content}`));
        const worldSize = (opts.worldSizeOverride ?? preset.qrWorldSize) * (params.sceneScale || 1);
        const ctx = { field, rng, params, worldSize };
        if (group) {
            scene.remove(group);
            disposeObject(group);
        }
        group = preset.generate(ctx);
        scene.add(group);
        // let the GL pipeline settle (textures upload) before readback
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const note = attempt === 0
            ? `attempt 1 · baseline (strength ${params.qrStrength.toFixed(2)})`
            : `attempt ${attempt + 1} · strength ${params.qrStrength.toFixed(2)}, density ${params.density.toFixed(2)}, seed ${params.seed}`;
        cb.onAttempt?.(attempt + 1, note);
        const result = top.render(scene, worldSize, opts.resolution ?? 512, opts.lighting, field);
        lastResult = result;
        if (result.success && result.data === qr.content) {
            return { group, field, content: qr.content, params, attempts: attempt + 1, result, generationMs: performance.now() - t0 };
        }
        // yield to UI between attempts
        await new Promise((r) => setTimeout(r, 0));
    }
    return {
        group: group,
        field: new QRField(qr),
        content: qr.content,
        params: lastParams,
        attempts: maxAttempts,
        result: lastResult,
        generationMs: performance.now() - t0,
    };
}
