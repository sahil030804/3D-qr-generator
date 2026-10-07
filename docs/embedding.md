# Embedding Voxel QR on another website

Voxel QR can run inside an `<iframe>` on any page. The embed shows only the interactive 3D view: drag to rotate, tap the model (or the small button) to lift the camera and reveal the flat, scannable QR.

## The quick way

In the app, build the model you want, then choose **Save → Copy embed code** and paste the result into your page:

```html
<iframe
  src="https://YOUR-HOST/?embed=1&amp;text=https%3A%2F%2Fexample.com&amp;o=cherry-tree&amp;v=blossom&amp;t=day"
  title="Interactive 3D QR code"
  width="480" height="480"
  style="border:0;width:100%;max-width:480px;aspect-ratio:1/1"
  loading="lazy"
  allow="fullscreen"
></iframe>
```

`public/embed-demo.html` (served at `/embed-demo.html`) shows three working variations.

## Parameters

| Parameter | Values | Default | Meaning |
|---|---|---|---|
| `embed` | `1` | off | Turns embed mode on |
| `text` | any text or URL, URL-encoded, up to 120 characters | `https://example.com` | What the QR encodes |
| `o` | `cherry-tree`, `pine-tree`, `car` | `cherry-tree` | The object |
| `v` | e.g. `blossom`, `lavender`, `coral`, `snow` · `evergreen`, `frost`, `larch` · `red`, `blue`, `yellow`, `white` | first of the object | Color variant |
| `t` | `dawn`, `day`, `dusk`, `night` | `day` | Time of day (lighting) |
| `bg` | `transparent` | sky backdrop | Let the host page show through |
| `controls` | `0` | shown | Hide the Reveal button |
| `hint` | `0` | shown | Hide the "tap to reveal" hint |
| `rotate` | `0` | on | Keep the model still when idle |
| `view` | `scan` | `object` | Start on the flat QR |

## Embedding a photo

**Save → Copy embed code** also works for a photo model (uploaded, or loaded from an image link). The photo can't be
passed as a short parameter the way an object can, so the app re-compresses a small copy (about 320px, JPEG) and
packs it into the link's `#` fragment — never the `?` query, which real servers cap around 8 KB and which is sent to
a server; a fragment never leaves the browser. The result is a longer link (tens of KB) that still works as a plain
`src`, but it does carry a compressed copy of the photo, so treat the link the same way you'd treat the photo itself.

```html
<iframe
  src="https://YOUR-HOST/?embed=1&amp;text=https%3A%2F%2Fexample.com&amp;o=photo&amp;t=day#img=...&amp;mime=image%2Fjpeg&amp;look=auto"
  title="Interactive 3D QR code"
  width="480" height="480"
  style="border:0;width:100%;max-width:480px;aspect-ratio:1/1"
  loading="lazy"
  allow="fullscreen"
></iframe>
```

An embedded photo downloads the same AI depth model (about 27 MB, cached after the first load) that photo mode
always uses, so the first visitor to see it will wait a few seconds.

## Talking to the embed

The embed posts messages to the page that contains it, and accepts a few commands back. Neither side needs a library.

```js
// Events from the embed
window.addEventListener('message', (event) => {
  const d = event.data;
  if (!d || d.source !== 'voxel-qr') return;
  // d.type: 'ready' | 'state'    d.mode: 'object' | 'scan'    d.busy: true while the camera is moving
});

// Commands to the embed
frame.contentWindow.postMessage({ source: 'voxel-qr-host', command: 'reveal' }, '*'); // 'reveal' | 'hide' | 'toggle'
```

Only these three commands are accepted, and only from the embedding page.

## Hosting

The app is a static site: `npm run build` produces `dist/`, which any static host can serve over HTTPS (Netlify, Vercel, Cloudflare Pages, GitHub Pages, an S3 bucket, nginx).

- **Do not send `X-Frame-Options: DENY` or `SAMEORIGIN`**, and do not set `Content-Security-Policy: frame-ancestors 'none'`. Either one stops other sites from embedding the page. To allow only some sites, use `Content-Security-Policy: frame-ancestors https://your-site.example https://*.your-site.example`.
- Sites that embed it may need `frame-src https://YOUR-HOST` in their own Content-Security-Policy.
- Each embed starts a WebGL context. Browsers allow roughly 16 per page, so keep embeds per page modest. `loading="lazy"` on the iframe defers off-screen ones until the visitor scrolls near them.
- The embed needs WebGL 2 (or falls back to a slower software renderer). It never uploads anything; the text (and, for a photo model, a small compressed copy of the photo) is only in the URL.
