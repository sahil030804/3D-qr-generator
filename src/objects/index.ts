import { car } from './car';
import { cherryTree } from './cherry-tree';
import { pineTree } from './pine-tree';
import type { VoxelObject } from './types';

export const OBJECTS: VoxelObject[] = [cherryTree, pineTree, car];

export function getObject(id: string): VoxelObject {
  return OBJECTS.find((object) => object.id === id) ?? OBJECTS[0];
}

export function getVariantId(object: VoxelObject, variantId: string | undefined): string {
  return object.variants.some((v) => v.id === variantId) ? (variantId as string) : object.variants[0].id;
}

export type { VoxelObject, ObjectVariant } from './types';
