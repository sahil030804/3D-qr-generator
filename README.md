# Voxel QR

A 3D QR code generator that runs entirely in the browser. Paste a link and pick a design from 8 categories (IT, Medical, Education, Nature, Vehicles, Business, Food, Sports — 36 voxel models) standing on a tiled plot. Tap it: the camera lifts overhead, the lighting flattens and the model's own colors resolve into a QR code you can scan straight off the screen.

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

## Embed it on a website

Build a model, then **Save → Copy embed code** and paste the iframe into any page (or open `/embed-demo.html`). Options and the postMessage API are in [docs/embedding.md](docs/embedding.md).

## Your own photo

Choose **Your photo** and upload a picture, paste a public image link, or drop an image anywhere to turn it into an embossed 3D relief that resolves into a scannable QR code.

- A small depth model (Depth Anything V2, about 27 MB) is downloaded once and cached in the browser; without it, a built-in relief is used so a photo always works. Set `VITE_DEPTH_MODEL_URL` to host the model yourself.
- The code is a real, valid QR whose black-and-white pattern is steered to follow your picture (a "QArt" encoder in `src/photo/qart.ts`), so only a few modules need to be nudged. Only the center of those modules is adjusted, just enough for a camera to read.
- **Scan strength** is tuned automatically: the most photo-like look that still decodes, including through simulated camera blur, is chosen, and the rendered result is verified with ZXing (WebAssembly, loaded only in photo mode). Override it with Photo-like, Balanced or Easy scan.
- The code is kept as small as the link allows (the smallest version with room to steer), because bigger modules are what phones read most reliably. For the easiest scan open **Save → Full-screen scan**.
- Image links are fetched by your browser straight from their own site. If the site does not allow cross-origin reads (CORS), the link is automatically retried through the images.weserv.nl proxy, which then sees the link (and any signature in it). Hosts that allow CORS never involve the proxy.
- Photos never leave the browser. Photo mode needs WebGL 2. Share links do not include the photo.

## Features

- Tap or drag to rotate; tap the model (or press Space / R) to reveal the QR; T cycles the time of day.
- Save a scan PNG, a model PNG or a print-ready black-and-white SVG.
- Share link (`?q=…&o=…&v=…&t=…`) restores text, object, color and lighting.
- Respects `prefers-reduced-motion`; text never leaves the browser.
