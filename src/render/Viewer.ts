import type { ViewState } from './camera';
import { CanvasRenderer } from './CanvasRenderer';
import { LIGHTING, type TimeOfDay } from './lighting';
import type { Mesh } from './mesher';
import {
  BUILD_SECONDS,
  IDLE_ELEVATION,
  LIFT_SECONDS,
  buildProgress,
  clamp01,
  liftView,
  type Pose,
} from './timeline';
import type { ViewRenderer } from './types';
import { WebGLRenderer } from './WebGLRenderer';

export type ViewMode = 'object' | 'scan';

export interface ViewerState {
  mode: ViewMode;
  /** True while the camera is moving between the two views. */
  busy: boolean;
  renderer: 'webgl' | 'canvas';
}

export interface Insets {
  top: number;
  bottom: number;
}

const MAX_PIXELS = 2_300_000;
const MIN_ELEVATION = (10 * Math.PI) / 180;
const MAX_ELEVATION = (70 * Math.PI) / 180;
const START_ELEVATION = IDLE_ELEVATION + (4 * Math.PI) / 180;
const SWAY_AMPLITUDE = 0.42;

/**
 * Owns the canvas, camera and animation loop. The loop only runs while something is moving, so a
 * parked scan view costs nothing.
 */
export class Viewer {
  private canvas: HTMLCanvasElement;
  private renderer!: ViewRenderer;
  private mesh: Mesh | null = null;
  private idleElevation = IDLE_ELEVATION;
  private autoRotate = true;
  private pose: Pose = { azimuth: Math.PI / 4, elevation: START_ELEVATION };
  private from: Pose = { ...this.pose };
  private liftP = 0;
  private liftTarget = 0;
  private buildElapsed = 0;
  private velocity = 0;
  private swayAmount = 0;
  private lastInteraction = -10;
  private clock = 0;
  private dragging = false;
  private pointerDown: { x: number; y: number; t: number } | null = null;
  private lastPointer = { x: 0, y: 0, t: 0 };
  private rafId = 0;
  private lastTs = 0;
  private pixelWidth = 1;
  private pixelHeight = 1;
  private aspect = 1;
  private insets: Insets = { top: 0, bottom: 0 };
  private timeOfDay: TimeOfDay = 'night';
  private readonly reducedMotion: boolean;
  private readonly resizeObserver: ResizeObserver;
  private disposed = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly onState: (state: ViewerState) => void = () => {},
    options: { forceCompat?: boolean } = {},
  ) {
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.canvas = this.createCanvas();
    container.append(this.canvas);
    this.createRenderer(options.forceCompat ?? false);
    this.renderer.setLighting(LIGHTING[this.timeOfDay]);

    this.resizeObserver = new ResizeObserver(() => this.measure());
    this.resizeObserver.observe(container);
    this.attachPointer();
    document.addEventListener('visibilitychange', this.onVisibility);
    this.measure();
    this.emit();
  }

  get mode(): ViewMode {
    return this.liftTarget === 1 ? 'scan' : 'object';
  }

  get rendererKind(): 'webgl' | 'canvas' {
    return this.renderer.kind;
  }

  /** Show a new mesh. The build-in animation replays unless motion is reduced. */
  setMesh(mesh: Mesh): void {
    this.mesh = mesh;
    this.renderer.setMesh(mesh);
    this.buildElapsed = this.reducedMotion ? BUILD_SECONDS : 0;
    this.requestFrame();
  }

  setTimeOfDay(time: TimeOfDay): void {
    this.timeOfDay = time;
    this.renderer.setLighting(LIGHTING[time]);
    this.requestFrame();
  }

  /** Reserve screen space for floating UI so the scene is centered in what remains. */
  setInsets(insets: Insets): void {
    this.insets = insets;
    this.requestFrame();
  }

  setMode(mode: ViewMode): void {
    const target = mode === 'scan' ? 1 : 0;
    if (target === this.liftTarget) return;
    if (this.liftP === 0) {
      this.from = { azimuth: this.displayedAzimuth(), elevation: this.pose.elevation };
      this.pose.azimuth = this.from.azimuth;
      this.swayAmount = 0;
    }
    this.liftTarget = target;
    this.velocity = 0;
    this.emit();
    this.requestFrame();
  }

  toggle(): void {
    this.setMode(this.mode === 'object' ? 'scan' : 'object');
  }

  /** Turn the gentle idle sway on or off (embeds can ask for a still model). */
  setAutoRotate(on: boolean): void {
    this.autoRotate = on;
    this.requestFrame();
  }

  /** Preferred resting camera angle, e.g. higher for a relief that lies flat on the plot. */
  setRestingView(elevation: number, azimuth?: number): void {
    this.idleElevation = elevation;
    if (this.liftP === 0 && this.liftTarget === 0) {
      this.pose.elevation = elevation;
      if (azimuth !== undefined) this.pose.azimuth = azimuth;
    }
    this.requestFrame();
  }

  rotateBy(radians: number): void {
    if (this.liftP !== 0) return;
    this.pose.azimuth += radians;
    this.lastInteraction = this.clock;
    this.requestFrame();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.renderer.dispose();
    this.canvas.remove();
  }

  /** Straight-down, flat-lit QR at the given pixel size, exactly as a camera would see the screen. */
  renderScanImage(pixels: number): ImageData | null {
    const mesh = this.mesh;
    if (!mesh) return null;
    this.renderer.resize(pixels, pixels);
    this.renderer.render(this.scanView(mesh));
    const out = document.createElement('canvas');
    out.width = pixels;
    out.height = pixels;
    const context = out.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, pixels, pixels);
    context.drawImage(this.canvas, 0, 0);
    const data = context.getImageData(0, 0, pixels, pixels);
    this.restoreSize();
    return data;
  }

  /** Render an export image. 'scan' is the exact straight-down QR; 'object' is a hero shot of the model. */
  exportImage(kind: 'scan' | 'object'): Promise<Blob> {
    const mesh = this.mesh;
    if (!mesh) return Promise.reject(new Error('Nothing to export yet.'));
    const width = kind === 'scan' ? 1200 : 1600;
    const height = kind === 'scan' ? 1200 : 1000;
    const view: ViewState = kind === 'scan'
      ? this.scanView(mesh)
      : {
        azimuth: this.mode === 'object' ? this.displayedAzimuth() : this.from.azimuth,
        elevation: (30 * Math.PI) / 180,
        halfHeight: this.frameHalf(width / height, { top: 0, bottom: 0 }).scene,
        ortho: 0, flat: 0, build: 1, resolve: 0, shiftY: 0,
      };

    this.renderer.resize(width, height);
    this.renderer.render(view);
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const context = out.getContext('2d');
    if (!context) return Promise.reject(new Error('Canvas rendering is not available.'));
    if (kind === 'scan') {
      context.fillStyle = '#ffffff';
    } else {
      const dark = LIGHTING[this.timeOfDay].tone === 'dark';
      const gradient = context.createRadialGradient(width / 2, height * 0.45, 40, width / 2, height / 2, width * 0.7);
      gradient.addColorStop(0, dark ? '#2a3346' : '#f7f1e8');
      gradient.addColorStop(1, dark ? '#0b0f18' : '#d9e3ef');
      context.fillStyle = gradient;
    }
    context.fillRect(0, 0, width, height);
    context.drawImage(this.canvas, 0, 0);
    this.restoreSize();
    return new Promise((resolve, reject) => {
      out.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image.'))), 'image/png');
    });
  }

  private scanView(mesh: Mesh): ViewState {
    return { azimuth: 0, elevation: Math.PI / 2, halfHeight: mesh.bounds.size / 2, ortho: 1, flat: 1, build: 1, resolve: 1, shiftY: 0 };
  }

  private restoreSize(): void {
    this.renderer.resize(this.pixelWidth, this.pixelHeight);
    this.draw();
    this.requestFrame();
  }

  private displayedAzimuth(): number {
    return this.pose.azimuth + Math.sin(this.clock * 0.33) * SWAY_AMPLITUDE * this.swayAmount;
  }

  private createCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.className = 'viewer-canvas';
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', '3D voxel model on a QR tile plot. Drag to rotate, tap to reveal the QR code.');
    return canvas;
  }

  private createRenderer(forceCompat: boolean): void {
    try {
      if (forceCompat) throw new Error('Compatibility mode requested.');
      this.renderer = new WebGLRenderer(this.canvas);
    } catch {
      // A canvas that already created a WebGL context can't provide a 2D one, so swap in a fresh canvas.
      this.canvas.remove();
      this.canvas = this.createCanvas();
      this.container.append(this.canvas);
      this.renderer = new CanvasRenderer(this.canvas);
    }
  }

  private emit(): void {
    this.onState({ mode: this.mode, busy: this.liftP !== this.liftTarget, renderer: this.renderer.kind });
  }

  private measure(): void {
    const rect = this.container.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.round(rect.width));
    const cssHeight = Math.max(1, Math.round(rect.height));
    let dpr = this.renderer.kind === 'canvas' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    while (cssWidth * cssHeight * dpr * dpr > MAX_PIXELS && dpr > 1) dpr -= 0.25;
    this.pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
    this.pixelHeight = Math.max(1, Math.round(cssHeight * dpr));
    this.aspect = this.pixelWidth / this.pixelHeight;
    this.renderer.resize(this.pixelWidth, this.pixelHeight);
    this.requestFrame();
  }

  /** Half-heights that keep the plot inside the space left by the floating UI. */
  private frameHalf(aspect: number, insets: Insets): { scene: number; top: number } {
    const size = this.mesh?.bounds.size ?? 156;
    const cssHeight = this.container.getBoundingClientRect().height || 1;
    const available = Math.max(0.25, 1 - (insets.top + insets.bottom) / cssHeight);
    const fit = (vertical: number, horizontal: number): number => Math.max(vertical / available, horizontal / aspect);
    return {
      scene: fit(size * 0.68, size * 0.66),
      top: fit(size * 0.56, size * 0.56),
    };
  }

  private shiftY(): number {
    const cssHeight = this.container.getBoundingClientRect().height || 1;
    return (this.insets.bottom - this.insets.top) / cssHeight;
  }

  private attachPointer(): void {
    this.container.addEventListener('pointerdown', (event) => {
      this.pointerDown = { x: event.clientX, y: event.clientY, t: performance.now() };
      if (this.liftTarget !== 0 || this.liftP !== 0) return;
      this.dragging = true;
      this.velocity = 0;
      this.pose.azimuth = this.displayedAzimuth();
      this.swayAmount = 0;
      this.lastPointer = { x: event.clientX, y: event.clientY, t: performance.now() };
      this.container.setPointerCapture(event.pointerId);
      this.container.classList.add('dragging');
    });
    this.container.addEventListener('pointermove', (event) => {
      if (!this.dragging) return;
      const now = performance.now();
      const dx = event.clientX - this.lastPointer.x;
      const dy = event.clientY - this.lastPointer.y;
      const dt = Math.max(1, now - this.lastPointer.t) / 1000;
      this.pose.azimuth -= dx * 0.0085;
      if (event.pointerType === 'mouse') {
        this.pose.elevation = Math.min(MAX_ELEVATION, Math.max(MIN_ELEVATION, this.pose.elevation + dy * 0.005));
      }
      this.velocity = (-(dx * 0.0085) / dt) * 0.6 + this.velocity * 0.4;
      this.lastPointer = { x: event.clientX, y: event.clientY, t: now };
      this.lastInteraction = this.clock;
      this.requestFrame();
    });
    const end = (event: PointerEvent): void => {
      const down = this.pointerDown;
      this.pointerDown = null;
      if (this.dragging) {
        this.dragging = false;
        this.container.classList.remove('dragging');
        this.lastInteraction = this.clock;
        this.velocity = this.reducedMotion ? 0 : Math.max(-4, Math.min(4, this.velocity));
      }
      // A short, nearly stationary press is a tap: reveal or restore.
      if (down && event.type === 'pointerup' && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 7 && performance.now() - down.t < 450) {
        this.velocity = 0;
        this.toggle();
      }
      this.requestFrame();
    };
    this.container.addEventListener('pointerup', end);
    this.container.addEventListener('pointercancel', end);
    this.canvas.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); this.rotateBy(-0.2); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); this.rotateBy(0.2); }
    });
  }

  private readonly onVisibility = (): void => {
    if (document.hidden) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    } else {
      this.lastTs = 0;
      this.requestFrame();
    }
  };

  private requestFrame(): void {
    if (this.rafId || this.disposed || document.hidden) return;
    this.rafId = requestAnimationFrame(this.frame);
  }

  private readonly frame = (timestamp: number): void => {
    this.rafId = 0;
    if (this.disposed) return;
    const dt = this.lastTs ? Math.min(0.05, (timestamp - this.lastTs) / 1000) : 0.016;
    this.lastTs = timestamp;
    this.clock += dt;

    let animating = false;
    if (this.buildElapsed < BUILD_SECONDS) {
      this.buildElapsed += dt;
      animating = true;
    }

    if (this.liftP !== this.liftTarget) {
      const was = this.liftP;
      const step = this.reducedMotion ? 1 : dt / LIFT_SECONDS;
      this.liftP = this.liftTarget > this.liftP ? Math.min(this.liftTarget, this.liftP + step) : Math.max(this.liftTarget, this.liftP - step);
      animating = true;
      if (this.liftP === this.liftTarget && was !== this.liftP) this.emit();
    }

    if (this.liftP === 0 && this.liftTarget === 0 && !this.dragging) {
      if (Math.abs(this.velocity) > 0.01) {
        this.pose.azimuth += this.velocity * dt;
        this.velocity *= Math.exp(-dt * 2.6);
        animating = true;
      }
      const idle = this.clock - this.lastInteraction > 1.2;
      if (idle && !this.reducedMotion && this.autoRotate) {
        this.swayAmount += (1 - this.swayAmount) * (1 - Math.exp(-dt * 1.2));
        this.pose.elevation += (this.idleElevation - this.pose.elevation) * (1 - Math.exp(-dt * 1.4));
        animating = true;
      }
    } else if (this.dragging) {
      animating = true;
    }

    this.draw();
    if (animating) this.rafId = requestAnimationFrame(this.frame);
  };

  private draw(): void {
    if (!this.mesh) return;
    const half = this.frameHalf(this.aspect, this.insets);
    const build = this.reducedMotion ? 1 : buildProgress(this.buildElapsed);
    const shiftY = this.shiftY();
    let view: ViewState;
    if (this.liftP > 0) {
      const lift = liftView(clamp01(this.liftP), this.from, half);
      view = { azimuth: lift.azimuth, elevation: lift.elevation, halfHeight: lift.halfHeight, ortho: lift.ortho, flat: lift.flat, build, resolve: lift.resolve, shiftY };
    } else {
      view = { azimuth: this.displayedAzimuth(), elevation: this.pose.elevation, halfHeight: half.scene, ortho: 0, flat: 0, build, resolve: 0, shiftY };
    }
    this.renderer.render(view);
  }
}
