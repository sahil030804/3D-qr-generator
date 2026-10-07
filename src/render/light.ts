/** Fixed sun in object space (toward the sun, normalized). Shadows are baked against this direction. */
const raw: [number, number, number] = [-0.5, 0.8, 0.42];
const length = Math.hypot(...raw);
export const SUN_DIR: [number, number, number] = [raw[0] / length, raw[1] / length, raw[2] / length];
