# QR Grove — Cinematic 3D QR Scene Generator

A browser app that grows **realistic 3D scenes whose top-down projection decodes as a QR code**.
From a three-quarter view you see a cherry tree, a forest, a reef… from directly
above, the same scene resolves into a scannable code rendered in the scene's own
materials.

## How it works

```text
QR DATA → QR MATRIX → CONTINUOUS QR FIELD (macro/medium/micro + tiny warp)
→ natural growth constraints (density, not 1-cell-→-1-object)
→ REAL 3D SCENE → top-down ortho render → binarize → jsQR → VERIFIED ✓
```

- `src/core/qr/` — QR encoding (EC-H), continuous multi-scale field, sampling
- `src/core/generation/` — seeded PRNG, value-noise/fBm, budgets, params
- `src/presets/` — 10 natural-scene presets behind one `NaturalScenePreset` interface
- `src/core/scene/` — renderer, cinematic/top cameras, lighting, quality tiers
- `src/core/verification/` — top-down renderer + jsQR loop (≤10 attempts, auto-tuned)
- `src/ui/`, `src/export/` — studio UI, PNG/GLB export, shareable `#s=` configs

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # vitest: QR math, field polarity, determinism, registry, links
npm run build
```

## Controls

- **Generate scene** (Ctrl/Cmd+Enter), 10 presets, density/height/variation/QR-strength sliders
- **◉ Reveal QR** (R) — cinematic glide to top view · **Top view** (T) · **Perspective** (P)
- Export PNG (cinematic / QR), GLB 3D, copy share link; debug drawer shows matrix,
  field heatmap, the exact pixels the decoder saw, and attempt stats.

## Performance

Instanced meshes throughout, shared geometries/materials, quality tiers
(Preview / High / Cinematic), capped pixel ratios, full GPU disposal on regenerate.
