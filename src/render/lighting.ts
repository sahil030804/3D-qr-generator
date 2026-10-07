export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';

export interface Lighting {
  /** Ambient light from above. */
  sky: [number, number, number];
  /** Ambient bounce from below. */
  ground: [number, number, number];
  /** Sun (or moon) color including intensity. */
  sun: [number, number, number];
  exposure: number;
  /** How strongly emissive voxels glow. */
  glow: number;
  /** Opacity of the contact shadow under the plot. */
  shadow: number;
  /** Whether the page chrome should use light or dark styling over this scene. */
  tone: 'light' | 'dark';
}

export const TIMES_OF_DAY: TimeOfDay[] = ['dawn', 'day', 'dusk', 'night'];

export const LIGHTING: Record<TimeOfDay, Lighting> = {
  dawn: { sky: [0.5, 0.46, 0.58], ground: [0.28, 0.22, 0.22], sun: [1.0, 0.64, 0.46], exposure: 1.18, glow: 0.45, shadow: 0.32, tone: 'light' },
  day: { sky: [0.36, 0.43, 0.54], ground: [0.22, 0.2, 0.19], sun: [0.84, 0.77, 0.66], exposure: 1.18, glow: 0.2, shadow: 0.3, tone: 'light' },
  dusk: { sky: [0.32, 0.3, 0.5], ground: [0.2, 0.15, 0.17], sun: [1.0, 0.48, 0.28], exposure: 1.1, glow: 0.9, shadow: 0.5, tone: 'dark' },
  night: { sky: [0.17, 0.21, 0.4], ground: [0.09, 0.09, 0.14], sun: [0.4, 0.5, 0.9], exposure: 1.12, glow: 2.1, shadow: 0.6, tone: 'dark' },
};
