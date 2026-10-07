import * as THREE from 'three';
import type { SceneGenerationContext } from '../core/generation/types';

/** Common contract: natural generator driven by a QR density field. */
export interface NaturalScenePreset {
  id: string;
  name: string;
  icon: string;
  description: string;
  /** World-space square extent of the QR region (before sceneScale). */
  qrWorldSize: number;
  generate(ctx: SceneGenerationContext): THREE.Group;
}

export function uvOf(x: number, z: number, worldSize: number): [number, number] {
  return [x / worldSize + 0.5, z / worldSize + 0.5];
}

export function inQRBounds(x: number, z: number, worldSize: number): boolean {
  return Math.abs(x) <= worldSize / 2 && Math.abs(z) <= worldSize / 2;
}
