export const QUALITY_BUDGET = {
    preview: { branchDepth: 3, canopy: 900, blossom: 350, grass: 600, shadow: 1024, pixelRatio: 1 },
    high: { branchDepth: 3, canopy: 1800, blossom: 700, grass: 1200, shadow: 2048, pixelRatio: 1.25 },
    cinematic: { branchDepth: 4, canopy: 3500, blossom: 1500, grass: 2500, shadow: 2048, pixelRatio: 2 },
};
export function qualityMultiplier(q) {
    return q === 'preview' ? 0.45 : q === 'high' ? 1 : 1.8;
}
export function defaultParams(partial = {}) {
    return {
        seed: 20260707,
        density: 0.85,
        height: 0.8,
        variation: 0.55,
        qrStrength: 0.9,
        flowerDensity: 0.8,
        foliageDensity: 0.9,
        sceneScale: 1,
        quality: 'high',
        ...partial,
    };
}
/** Blend a natural baseline with the QR field value using qrStrength. */
export function constrainByQR(natural, qr, qrStrength) {
    const s = Math.min(1, Math.max(0, qrStrength));
    return natural * (1 - s) + qr * s;
}
