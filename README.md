# Voxel QR

A 3D QR code generator that runs entirely in the browser. Paste a link and get a detailed voxel model (cherry tree, pine tree or sports car) standing on a tiled plot. Tap it: the camera lifts overhead, the lighting flattens and the model's own colors resolve into a QR code you can scan straight off the screen.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # vitest, including jsQR decode checks for every object
npm run build    # typecheck + production bundle
```

## How it works

- **QR** – `qrcode-generator` with the highest error correction (`src/core/qr`).
- **Plot** – tiles on a stone-rimmed plot carry the code; dark tiles sit a voxel lower so the pattern reads in 3D (`src/voxel/ground.ts`).
- **Objects** – seeded procedural voxel models with color variants, decorations and emissive lights (`src/objects`).
- **Scan view** – each column's top voxel is recolored to the dark or light tone of its own material, shape untouched, so the straight-down view is exactly the code with the object still standing (`src/voxel/fit.ts`).
- **Renderer** – one indexed mesh of exposed faces with baked ambient occlusion and shadows; WebGL2 first, Canvas 2D fallback (`src/render`). Detail adapts to the device: 4, 3 or 2 voxels per QR module.
- **Verified badge** – after each build the real flat-lit orthographic render is decoded with `jsqr` in the page; the badge only turns green if it matches your text.
- **Time of day** – Dawn, Day, Dusk and Night lighting; lanterns, fairy lights, headlights and street lamp glow after dark.

## Features

- Tap or drag to rotate; tap the model (or press Space / R) to reveal the QR; T cycles the time of day.
- Save a scan PNG, a model PNG or a print-ready black-and-white SVG.
- Share link (`?q=…&o=…&v=…&t=…`) restores text, object, color and lighting.
- Respects `prefers-reduced-motion`; text never leaves the browser.
