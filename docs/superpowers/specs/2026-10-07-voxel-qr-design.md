# Voxel QR — Design (v2)

Date: 2026-10-07
Status: approved by user ("yes lets go"); v1 (top-surface recolor) superseded after reviewing the reference site.

## Goal

A full-screen 3D QR experience. A detailed voxel object stands on a tiled plot. The QR code is
formed by the **ground tiles**. Tapping the model dissolves the object into voxels, a ripple lifts
the tiles, and the camera swings straight down so the flat-lit QR can be scanned. Tapping again
rebuilds the object. It must look professional and distinct from the reference (tree.icqr.com),
whose idea we borrow but not its branding, assets or code.

## Decisions

- QR lives only in the ground tiles. Objects never need to form the QR, so they can look natural.
- Renderer: custom WebGL2 mesh renderer with a Canvas 2D painter's fallback. No Three.js.
- Catalog v1: Cherry Tree, Pine Tree, Sports Car. Each has color variants.
- Differentiators: time-of-day lighting (Dawn, Day, Dusk, Night) with emissive lights, a
  voxel-dissolve reveal with a tile ripple, an in-browser **"verified scannable"** check that decodes
  the actual rendered QR, share link, and PNG and print-ready SVG export.
- Default look: Night. Light-looking scenes come from Dawn and Day.

## 1. Plot and tiles (`src/voxel/`)

- `M` = voxels per QR module: 4 on capable devices for QR modules <= 33, 3 up to 49, otherwise 2.
  Compatibility (Canvas) mode always uses 2.
- Plot width = `(N + 10) * M`: 1 module stone rim, 4 module quiet zone, N modules of code.
- Layers: rock, soil, then a tile layer. Light tiles are 1 voxel higher than dark tiles, so the
  pattern reads in 3D. The rim is raised stone. Finder squares use an accent tile family. Two tile
  families alternate for subtle variety.
- Objects start at `y = BASE` and may overhang. Where an object foot sits above a recessed dark
  tile, the gap is filled with the tile material.
- `tiles` is a per-column array of the tile material, used for tests, SVG and scan checks.

## 2. Objects (`src/objects/`)

- `createPalette(variantId)` returns a palette and ground families. Families keep dark, mid and
  light tones. Emissive families glow at night.
- `build(grid, palette, ctx)` adds the object and decorations (grass blades, petals, stones, cones)
  above the ground. Seeded by the input text. Detail scales with `M`.
- Cherry Tree: trunk, limbs, noise-eroded blossom clumps, hanging lanterns (emissive).
- Pine Tree: tiered drooping boughs, bark, fairy lights (emissive).
- Sports Car: body, glass, wheels with arches, lights (emissive headlights and tail lights).
- Variants: cherry (Blossom, Lavender, Coral, Snow), pine (Evergreen, Frost, Larch),
  car (Red, Blue, Yellow, White).

## 3. Renderer (`src/render/`)

- `mesher.ts`: exposed faces in one indexed mesh. Per-vertex AO, baked sun shadow (one fixed
  direction), per-voxel jitter. Vertex flags: ground, emissive, random seed.
- Shader uniforms: `viewProj`, `flat`, `build`, `dissolve` (object voxels fade out with upward drift
  and dithered discard), `wave` (travelling ripple through ground tiles), lighting colors and
  exposure from the time-of-day preset, emissive strength.
- Camera supports a bottom and top inset so the scene is centered above the UI dock.
- Canvas fallback uses the same flags (dissolve by hiding object faces, no wave).

## 4. Animation

- Build-in: ground grows from the center, the object grows upward.
- Reveal (about 2.6 s): the object dissolves, a ripple lifts the tiles, the camera arcs overhead
  and settles square, ortho and flat blend in. Tap again to reverse.
- Idle: slow auto-rotate, drag to orbit with inertia, ease back. Reduced motion: cuts, no auto-rotate.

## 5. UI

- Full-screen canvas. Background gradient follows the time of day.
- Floating elements: brand (top-left), Share and Info (top-right), a verified badge (top-center),
  a hint chip, and a frosted dock (bottom) with: link field and counter, object pills, color
  variants, time-of-day segmented control, Reveal toggle, Save menu (Scan PNG, Model PNG, SVG).
- Tap or click the model to reveal. Keyboard: Space or R reveal, T time of day, arrows rotate.
- Accessible: labels, focus rings, live status, `prefers-reduced-motion`, responsive to 360 px.
- Share link: `?q=<base64url>&o=<object>&v=<variant>&t=<time>`.

## 6. Verification and tests

- Unit: tiles decode with `jsqr` for all objects and variants and several inputs, SVG export,
  timeline curves, layout math.
- Runtime: after each build, the real flat-lit orthographic render is decoded in the browser. The
  badge says verified only if the decoded text matches the input.
- Manual: Playwright visual passes at desktop and 390 px, both renderers.

## 7. Out of scope for v1

Sound, seasons, accounts, server features.
