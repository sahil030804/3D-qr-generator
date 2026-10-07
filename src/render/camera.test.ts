import { describe, expect, it } from 'vitest';
import { computeCamera, type SceneBounds, type ViewState } from './camera';
import { IDLE_ELEVATION, TAU, liftView } from './timeline';

const bounds: SceneBounds = { size: 156, height: 115, focusY: 51, moduleVoxels: 4 };
const aspect = 1.6;
const frame = { scene: 125, top: 88 };
const from = { azimuth: Math.PI / 4 + 0.2, elevation: IDLE_ELEVATION };

function viewAt(p: number): ViewState {
  const lift = liftView(p, from, frame);
  return { ...lift, build: 1, resolve: lift.resolve, shiftY: 0.2 };
}

/** Normalized device coordinates of a world point. */
function project(view: ViewState, point: [number, number, number]): [number, number] {
  const m = computeCamera(view, aspect, bounds).viewProj;
  const [x, y, z] = point;
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
  const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [cx / cw, cy / cw];
}

describe('reveal camera', () => {
  const steps = 500;
  const points: [string, [number, number, number]][] = [
    ['plot corner', [0, 8, 0]],
    ['plot far corner', [156, 8, 156]],
    ['canopy top', [78, 115, 78]],
  ];

  for (const [name, point] of points) {
    it(`moves ${name} smoothly with no late snap`, () => {
      const trace: [number, number][] = [];
      for (let i = 0; i <= steps; i++) trace.push(project(viewAt(i / steps), point));
      const speed = (i: number): number => Math.hypot(trace[i][0] - trace[i - 1][0], trace[i][1] - trace[i - 1][1]);
      let maxJerk = 0;
      for (let i = 2; i <= steps; i++) maxJerk = Math.max(maxJerk, Math.abs(speed(i) - speed(i - 1)));
      // Per-step speed must change gently.
      expect(maxJerk).toBeLessThan(0.0012);
      // The tail must decelerate: the old lens blend sped up about 10x just before stopping.
      const at = (p: number): number => speed(Math.round(p * steps));
      expect(at(0.95)).toBeLessThanOrEqual(at(0.9) * 1.05);
      expect(at(0.97)).toBeLessThanOrEqual(at(0.95) * 1.05 + 1e-6);
      expect(speed(steps)).toBeLessThan(0.0002);
    });
  }

  it('ends exactly straight down, square to the code', () => {
    const end = viewAt(1);
    expect(end.elevation).toBeCloseTo(Math.PI / 2, 6);
    expect(Math.abs(end.azimuth - Math.round(end.azimuth / TAU) * TAU)).toBeLessThan(1e-9);
    expect(end.ortho).toBe(1);
    expect(end.flat).toBe(1);
    expect(end.resolve).toBe(1);
  });

  it('is continuous where the lens snaps to true orthographic', () => {
    const base = viewAt(0.9);
    const just = (ortho: number): [number, number] => project({ ...base, ortho }, [0, 8, 0]);
    const a = just(0.9949);
    const b = just(0.9951);
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(0.002);
  });
});
