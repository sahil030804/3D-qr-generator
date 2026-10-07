/** Pure animation curves. Everything here is a function of time so it can be unit tested. */

export const TAU = Math.PI * 2;
export const IDLE_ELEVATION = (26 * Math.PI) / 180;
export const LIFT_SECONDS = 2.8;
export const BUILD_SECONDS = 1.5;

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - clamp01(t), 3);
}

export interface Pose {
  azimuth: number;
  elevation: number;
}

export interface LiftFrame {
  /** Visible half-height in voxels while orbiting. */
  scene: number;
  /** Visible half-height in voxels in the straight-down view. */
  top: number;
}

export interface LiftView extends Pose {
  halfHeight: number;
  ortho: number;
  flat: number;
  /** 0 = natural colors, 1 = colors resolved into the QR. */
  resolve: number;
}

/**
 * The camera move between the orbit pose and the scan pose, p in [0, 1].
 * The camera arcs overhead and settles square to the code, the lens blends to orthographic, the lighting
 * fades to flat color and the model's top surfaces resolve into the QR, so the final frame is the straight-down QR.
 */
export function liftView(p: number, from: Pose, frame: LiftFrame): LiftView {
  const settledAzimuth = Math.round(from.azimuth / TAU) * TAU;
  const arc = easeInOutCubic(p);
  const swing = easeInOutCubic(p / 0.88);
  return {
    azimuth: lerp(from.azimuth, settledAzimuth, swing),
    elevation: lerp(from.elevation, Math.PI / 2, arc),
    halfHeight: lerp(frame.scene, frame.top, arc),
    ortho: smoothstep(0.2, 0.95, p),
    flat: smoothstep(0.45, 0.96, p),
    resolve: smoothstep(0.3, 0.9, p),
  };
}

/** Eased build-in progress for elapsed seconds. */
export function buildProgress(elapsed: number): number {
  return clamp01(elapsed / BUILD_SECONDS);
}
