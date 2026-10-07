import { officeTower, briefcase, moneyBag, shopCart, growthChart } from './business';
import { car } from './car';
import { CATEGORIES } from './categories';
import { cherryTree } from './cherry-tree';
import { gradCap, bookStack, school, pencil, blackboard } from './education';
import { coffeeCup, restaurant, burger, cake } from './food';
import { firstAid, hospital, ambulance, syringe, heart } from './medical';
import { flower } from './nature-extra';
import { pineTree } from './pine-tree';
import { football, dumbbell, trophy, tennis, cricket } from './sports';
import { computer, laptop, serverRack, smartphone, robot } from './tech';
import { bicycle, airplane, truck } from './vehicles-extra';
import type { VoxelObject } from './types';

export const OBJECTS: VoxelObject[] = [
  computer, laptop, serverRack, smartphone, robot,
  firstAid, hospital, ambulance, syringe, heart,
  gradCap, bookStack, school, pencil, blackboard,
  cherryTree, pineTree, flower,
  car, bicycle, airplane, truck,
  officeTower, briefcase, moneyBag, shopCart, growthChart,
  coffeeCup, restaurant, burger, cake,
  football, dumbbell, trophy, tennis, cricket,
];

export function getObject(id: string): VoxelObject {
  return OBJECTS.find((object) => object.id === id) ?? OBJECTS[0];
}

export function getVariantId(object: VoxelObject, variantId: string | undefined): string {
  return object.variants.some((v) => v.id === variantId) ? (variantId as string) : object.variants[0].id;
}

/** Categories that actually have models, in catalog order. */
export function getCategories(): { id: string; name: string; blurb: string }[] {
  const used = new Set(OBJECTS.map((o) => o.category));
  return CATEGORIES.filter((c) => used.has(c.id));
}

export function getObjectsByCategory(categoryId: string): VoxelObject[] {
  return OBJECTS.filter((o) => o.category === categoryId);
}

export function getCategoryForObject(objectId: string): string {
  return getObject(objectId).category;
}

export type { VoxelObject, ObjectVariant } from './types';
export { CATEGORIES };
