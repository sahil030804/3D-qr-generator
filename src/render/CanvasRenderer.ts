import { computeCamera, type ViewState } from './camera';
import { SUN_DIR } from './light';
import { LIGHTING, type Lighting } from './lighting';
import { FLAG_EMISSIVE, FLAG_GROUND, VERTEX_STRIDE, type Mesh } from './mesher';
import type { ViewRenderer } from './types';

const NORMALS: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const STYLE_LEVELS = 8;

interface FaceData {
  count: number;
  /** Quad corner positions, 12 floats per face. */
  corners: Float32Array;
  centers: Float32Array;
  normal: Uint8Array;
  span: Float32Array;
  ground: Uint8Array;
  emissive: Uint8Array;
  ao: Float32Array;
  shadow: Float32Array;
  albedo: Uint8Array;
  lit: Uint8Array;
  /** Scan-view colors of the same faces. */
  albedoAlt: Uint8Array;
  litAlt: Uint8Array;
}

function prepare(mesh: Mesh): FaceData {
  const floats = new Float32Array(mesh.vertices);
  const bytes = new Uint8Array(mesh.vertices);
  const count = mesh.faceCount;
  const data: FaceData = {
    count,
    corners: new Float32Array(count * 12),
    centers: new Float32Array(count * 3),
    normal: new Uint8Array(count),
    span: new Float32Array(count),
    ground: new Uint8Array(count),
    emissive: new Uint8Array(count),
    ao: new Float32Array(count),
    shadow: new Float32Array(count),
    albedo: new Uint8Array(count * 3),
    lit: new Uint8Array(count * 3),
    albedoAlt: new Uint8Array(count * 3),
    litAlt: new Uint8Array(count * 3),
  };
  for (let f = 0; f < count; f++) {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let ao = 0;
    for (let c = 0; c < 4; c++) {
      const vertex = f * 4 + c;
      const fo = vertex * (VERTEX_STRIDE / 4);
      const x = floats[fo];
      const y = floats[fo + 1];
      const z = floats[fo + 2];
      data.corners.set([x, y, z], f * 12 + c * 3);
      cx += x / 4;
      cy += y / 4;
      cz += z / 4;
      ao += bytes[vertex * VERTEX_STRIDE + 15] / 255 / 4;
    }
    data.centers.set([cx, cy, cz], f * 3);
    const base = f * 4 * VERTEX_STRIDE + 12;
    const flags = bytes[base + 7];
    data.normal[f] = bytes[base + 4];
    data.shadow[f] = bytes[base + 5] / 255;
    data.span[f] = bytes[base + 6] / 255;
    data.ground[f] = flags & FLAG_GROUND ? 1 : 0;
    data.emissive[f] = flags & FLAG_EMISSIVE ? 1 : 0;
    data.ao[f] = ao;
    for (let channel = 0; channel < 3; channel++) {
      data.albedo[f * 3 + channel] = bytes[base + channel];
      data.albedoAlt[f * 3 + channel] = bytes[base + 8 + channel];
    }
  }
  return data;
}

function shade(data: FaceData, light: Lighting, soften: number): void {
  for (let f = 0; f < data.count; f++) {
    let normal = NORMALS[data.normal[f]];
    if (soften > 0 && data.ground[f] && data.normal[f] !== 2) {
      const m = [normal[0] * (1 - soften), normal[1] * (1 - soften) + soften, normal[2] * (1 - soften)];
      const len = Math.hypot(m[0], m[1], m[2]) || 1;
      normal = [m[0] / len, m[1] / len, m[2] / len];
    }
    const sky = normal[1] * 0.5 + 0.5;
    const lambert = Math.max(0, normal[0] * SUN_DIR[0] + normal[1] * SUN_DIR[1] + normal[2] * SUN_DIR[2]);
    const ao = data.ao[f];
    for (let channel = 0; channel < 3; channel++) {
      const ambient = light.ground[channel] + (light.sky[channel] - light.ground[channel]) * sky;
      const sun = light.sun[channel] * lambert * (1 - data.shadow[f] * 0.82) * (0.55 + 0.45 * ao);
      let value = (ambient * ao + sun) * light.exposure;
      if (data.emissive[f]) value += light.glow;
      const toLit = (albedo: number): number => {
        let linear = Math.pow(albedo / 255, 2.2) * value;
        linear /= 1 + Math.max(0, linear - 0.7);
        return Math.round(Math.pow(Math.min(1, linear), 1 / 2.2) * 255);
      };
      data.lit[f * 3 + channel] = toLit(data.albedo[f * 3 + channel]);
      data.litAlt[f * 3 + channel] = toLit(data.albedoAlt[f * 3 + channel]);
    }
  }
}

/** Software fallback for devices without WebGL2: sorts and fills the same faces with a painter's algorithm. */
export class CanvasRenderer implements ViewRenderer {
  readonly kind = 'canvas' as const;
  private readonly context: CanvasRenderingContext2D;
  private mesh: Mesh | null = null;
  private faces: FaceData | null = null;
  private lighting: Lighting = LIGHTING.night;
  private styles = new Map<number, string[]>();
  private width = 1;
  private height = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('Canvas rendering is not available in this browser.');
    this.context = context;
  }

  setMesh(mesh: Mesh): void {
    this.mesh = mesh;
    this.faces = prepare(mesh);
    shade(this.faces, this.lighting, mesh.soften);
    this.styles = new Map();
  }

  setLighting(lighting: Lighting): void {
    this.lighting = lighting;
    if (this.faces && this.mesh) shade(this.faces, lighting, this.mesh.soften);
    this.styles = new Map();
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  private stylesFor(flatLevel: number, resolveLevel: number): string[] {
    const key = flatLevel * (STYLE_LEVELS + 1) + resolveLevel;
    const cached = this.styles.get(key);
    if (cached) return cached;
    if (this.styles.size > 24) this.styles.clear();
    const faces = this.faces!;
    const flat = flatLevel / STYLE_LEVELS;
    const resolve = resolveLevel / STYLE_LEVELS;
    const out = new Array<string>(faces.count);
    for (let f = 0; f < faces.count; f++) {
      const channel = (i: number): number => {
        const lit = faces.lit[f * 3 + i] * (1 - resolve) + faces.litAlt[f * 3 + i] * resolve;
        const albedo = faces.albedo[f * 3 + i] * (1 - resolve) + faces.albedoAlt[f * 3 + i] * resolve;
        return Math.round(lit * (1 - flat) + albedo * flat);
      };
      out[f] = `rgb(${channel(0)},${channel(1)},${channel(2)})`;
    }
    this.styles.set(key, out);
    return out;
  }

  render(view: ViewState): void {
    const mesh = this.mesh;
    const faces = this.faces;
    const ctx = this.context;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    if (!mesh || !faces) return;

    const camera = computeCamera(view, this.width / this.height, mesh.bounds);
    const m = camera.viewProj;
    const [px, py, pz] = camera.position;
    const [fx, fy, fz] = camera.forward;
    const halfW = this.width / 2;
    const halfH = this.height / 2;
    const drop = mesh.bounds.height * 0.3;

    const project = (x: number, y: number, z: number, out: Float64Array, offset: number): void => {
      const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
      const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
      const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
      out[offset] = (cx / cw) * halfW + halfW;
      out[offset + 1] = (1 - cy / cw) * halfH;
    };

    const buffer = new Float64Array(8);
    if (view.flat < 0.99) {
      const size = mesh.bounds.size;
      const corners = [[-0.1, -0.1], [1.1, -0.1], [1.1, 1.1], [-0.1, 1.1]];
      ctx.save();
      try { ctx.filter = `blur(${Math.max(6, this.width / 70)}px)`; } catch { /* filter unsupported */ }
      ctx.fillStyle = `rgba(0,0,0,${this.lighting.shadow * 0.8 * (1 - view.flat)})`;
      ctx.beginPath();
      corners.forEach(([cx, cz], i) => {
        project(cx * size, -0.4, cz * size, buffer, 0);
        if (i === 0) ctx.moveTo(buffer[0], buffer[1]);
        else ctx.lineTo(buffer[0], buffer[1]);
      });
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    const visible: number[] = [];
    const depth = new Float32Array(faces.count);
    const lift = new Float32Array(faces.count);
    for (let f = 0; f < faces.count; f++) {
      const t = faces.ground[f]
        ? Math.min(1, Math.max(0, view.build * 1.9 - faces.span[f] * 0.9))
        : Math.min(1, Math.max(0, (view.build - faces.span[f] * 0.45 - 0.2) / 0.35));
      if (t <= 0.02) continue;
      lift[f] = Math.pow(1 - Math.min(1, t), 3) * drop;
      const dx = faces.centers[f * 3] - px;
      const dy = faces.centers[f * 3 + 1] - lift[f] - py;
      const dz = faces.centers[f * 3 + 2] - pz;
      const n = NORMALS[faces.normal[f]];
      if (n[0] * dx + n[1] * dy + n[2] * dz >= 0) continue;
      depth[f] = dx * fx + dy * fy + dz * fz;
      visible.push(f);
    }
    visible.sort((a, b) => depth[b] - depth[a]);

    const flatLevel = Math.round(Math.min(1, Math.max(0, view.flat)) * STYLE_LEVELS);
    const resolveLevel = Math.round(Math.min(1, Math.max(0, view.resolve)) * STYLE_LEVELS);
    const styles = this.stylesFor(flatLevel, resolveLevel);
    const stroke = faces.count < 70000;
    ctx.lineWidth = 0.7;
    ctx.lineJoin = 'round';
    for (const f of visible) {
      for (let c = 0; c < 4; c++) {
        const o = f * 12 + c * 3;
        project(faces.corners[o], faces.corners[o + 1] - lift[f], faces.corners[o + 2], buffer, c * 2);
      }
      const style = styles[f];
      ctx.fillStyle = style;
      ctx.beginPath();
      ctx.moveTo(buffer[0], buffer[1]);
      ctx.lineTo(buffer[2], buffer[3]);
      ctx.lineTo(buffer[4], buffer[5]);
      ctx.lineTo(buffer[6], buffer[7]);
      ctx.closePath();
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = style;
        ctx.stroke();
      }
    }
  }

  dispose(): void {
    this.mesh = null;
    this.faces = null;
    this.styles = new Map();
  }
}
