export type Mat4 = Float32Array;

/** Everything that defines one rendered frame. */
export interface ViewState {
  /** Orbit angle around the object in radians. 0 puts screen-up toward -z, which is upright for the QR. */
  azimuth: number;
  /** Camera elevation in radians; PI / 2 looks straight down. */
  elevation: number;
  /** Half of the visible height at the focus plane, in voxels. */
  halfHeight: number;
  /** 0 = perspective, 1 = orthographic. */
  ortho: number;
  /** 0 = lit and shaded, 1 = flat albedo (guaranteed scan contrast). */
  flat: number;
  /** 0..1 build-in progress. */
  build: number;
  /** 0 = natural colors, 1 = top surfaces resolved into the QR's dark and light tones. */
  resolve: number;
  /** Vertical screen shift in normalized device units; positive moves the scene up. */
  shiftY: number;
}

export interface SceneBounds {
  /** Plot width and depth in voxels. */
  size: number;
  /** Occupied height in voxels. */
  height: number;
  /** Vertical focus point of the orbit. */
  focusY: number;
  /** Voxels per QR module. */
  moduleVoxels: number;
}

export interface CameraFrame {
  viewProj: Mat4;
  position: [number, number, number];
  /** Unit vector the camera looks along. */
  forward: [number, number, number];
}

const FOV = (30 * Math.PI) / 180;

function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

function perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0,
  ]);
}

function orthographic(halfH: number, halfW: number, near: number, far: number): Mat4 {
  return new Float32Array([
    1 / halfW, 0, 0, 0,
    0, 1 / halfH, 0, 0,
    0, 0, -2 / (far - near), 0,
    0, 0, -(far + near) / (far - near), 1,
  ]);
}

const cross = (a: number[], b: number[]): [number, number, number] => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: number[], b: number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Past this amount the lens is treated as exactly orthographic; the leftover perspective is sub-pixel. */
const ORTHO_SNAP = 0.995;

/**
 * Build the view-projection matrix. `view.ortho` drives a dolly-zoom: the camera backs away as the lens
 * narrows so the focus plane keeps its size. Distance follows d / (1 - ortho), which makes the on-screen
 * scale of everything change evenly instead of lurching at the very end, then it snaps to a true
 * orthographic projection once the difference is invisible.
 */
export function computeCamera(view: ViewState, aspect: number, bounds: SceneBounds): CameraFrame {
  const halfHeight = view.halfHeight;
  const k = Math.min(1, Math.max(0, view.ortho));
  const isOrtho = k >= ORTHO_SNAP;
  const focusDistance = halfHeight / Math.tan(FOV / 2);
  const distance = isOrtho ? focusDistance : focusDistance / (1 - k);
  const fovY = 2 * Math.atan(halfHeight / distance);
  const target: [number, number, number] = [bounds.size / 2, bounds.focusY, bounds.size / 2];
  const cosE = Math.cos(view.elevation);
  const back: [number, number, number] = [cosE * Math.sin(view.azimuth), Math.sin(view.elevation), cosE * Math.cos(view.azimuth)];
  const right: [number, number, number] = [Math.cos(view.azimuth), 0, -Math.sin(view.azimuth)];
  const up = cross(back, right);
  const position: [number, number, number] = [
    target[0] + back[0] * distance,
    target[1] + back[1] * distance,
    target[2] + back[2] * distance,
  ];

  const viewMatrix = new Float32Array([
    right[0], up[0], back[0], 0,
    right[1], up[1], back[1], 0,
    right[2], up[2], back[2], 0,
    -dot(right, position), -dot(up, position), -dot(back, position), 1,
  ]);

  const radius = 0.5 * Math.hypot(bounds.size * Math.SQRT2, bounds.height) * 1.2 + bounds.size * 0.1;
  const near = Math.max(1, distance - radius);
  const far = distance + radius;
  const projection = isOrtho
    ? orthographic(halfHeight, halfHeight * aspect, near, far)
    : perspective(fovY, aspect, near, far);
  if (view.shiftY) {
    // Shift the picture vertically on screen: clip.y += shift * clip.w.
    for (let col = 0; col < 4; col++) projection[col * 4 + 1] += view.shiftY * projection[col * 4 + 3];
  }

  return {
    viewProj: multiply(projection, viewMatrix),
    position,
    forward: [-back[0], -back[1], -back[2]],
  };
}
