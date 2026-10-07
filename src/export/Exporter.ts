import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

/** PNG export of the current viewport (cinematic or top view). */
export function exportPNG(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, name: string): void {
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  download(url, `${name}.png`);
}

/** GLB export of a generated group (architecture-ready optional path). */
export function exportGLB(group: THREE.Group, name: string, onError: (msg: string) => void): void {
  try {
    const exporter = new GLTFExporter();
    exporter.parse(
      group,
      (res) => {
        const blob = res instanceof ArrayBuffer ? new Blob([res], { type: 'model/gltf-binary' }) : new Blob([JSON.stringify(res)], { type: 'model/gltf+json' });
        download(URL.createObjectURL(blob), `${name}.glb`);
      },
      (err) => onError(`GLB export failed: ${String(err)}`),
      { binary: true },
    );
  } catch (err) {
    onError(`GLB export failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function download(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (url.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Shareable config <-> URL hash (base64url JSON). */
export function encodeConfig(cfg: Record<string, unknown>): string {
  const json = JSON.stringify(cfg);
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeConfig<T>(hash: string): T | null {
  try {
    const b64 = hash.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(b64)))) as T;
  } catch {
    return null;
  }
}
