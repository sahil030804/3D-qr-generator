import { officeTower, briefcase, moneyBag, shopCart, growthChart } from './business';
import { car } from './car';
import { CATEGORIES, DOMAINS, SUBCATEGORIES, getAllDomains, getAllSubcategories, getSubcategory } from './categories';
import { cherryTree } from './cherry-tree';
import { gradCap, bookStack, school, pencil, blackboard } from './education';
import { coffeeCup, restaurant, burger, cake } from './food';
import { firstAid, hospital, ambulance, syringe, heart } from './medical';
import { flower } from './nature-extra';
import { pineTree } from './pine-tree';
import { football, dumbbell, trophy, tennis, cricket } from './sports';
import { computer, laptop, serverRack, smartphone, robot } from './tech';
import { bicycle, airplane, truck } from './vehicles-extra';
import { tooth, brain, pill } from './medical-extra';
import { dosa, vadaPav } from './food-extra';
import type { VoxelObject } from './types';

export const OBJECTS: VoxelObject[] = [
  computer, laptop, serverRack, smartphone, robot,
  firstAid, hospital, ambulance, syringe, heart,
  tooth, brain, pill,
  gradCap, bookStack, school, pencil, blackboard,
  cherryTree, pineTree, flower,
  car, bicycle, airplane, truck,
  officeTower, briefcase, moneyBag, shopCart, growthChart,
  coffeeCup, restaurant, burger, cake,
  dosa, vadaPav,
  football, dumbbell, trophy, tennis, cricket,
];

/** Mapping from existing model ID to its specific subcategory in the taxonomy */
export const OBJECT_SUBCATEGORY_MAP: Record<string, string> = {
  // IT & Tech
  computer: 'tech-devices',
  laptop: 'tech-devices',
  smartphone: 'tech-devices',
  'server-rack': 'tech-infra',
  robot: 'tech-ai',

  // Medical
  'first-aid': 'medical-hospital',
  hospital: 'medical-hospital',
  ambulance: 'medical-hospital',
  syringe: 'medical-doctor',
  heart: 'medical-doctor',
  tooth: 'medical-dentistry',
  brain: 'medical-neuro',
  pill: 'medical-pharma',

  // Education
  school: 'education-classroom',
  pencil: 'education-classroom',
  blackboard: 'education-classroom',
  'grad-cap': 'education-higher',
  'book-stack': 'education-higher',

  // Nature
  'cherry-tree': 'nature-trees',
  'pine-tree': 'nature-trees',
  flower: 'nature-garden',

  // Vehicles
  car: 'vehicles-commute',
  bicycle: 'vehicles-commute',
  airplane: 'vehicles-aviation',
  truck: 'vehicles-commercial',

  // Business
  'office-tower': 'business-corporate',
  briefcase: 'business-corporate',
  'money-bag': 'business-wealth',
  'growth-chart': 'business-wealth',
  'shop-cart': 'business-retail',

  // Food
  burger: 'food-fastfood',
  'coffee-cup': 'food-cafe',
  cake: 'food-cafe',
  restaurant: 'food-dining',
  dosa: 'food-south-india',
  'vada-pav': 'food-west-india',

  // Sports
  football: 'sports-field',
  cricket: 'sports-field',
  tennis: 'sports-court',
  dumbbell: 'sports-fitness',
  trophy: 'sports-honors',
};

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

/**
 * Find objects matching a subcategory or domain.
 * If categoryId is a subcategory ID (e.g. 'medical-doctor'), matches objects mapped to that subcategory.
 * If categoryId is a domain ID (e.g. 'medical'), matches all objects in that domain.
 */
export function getObjectsByCategory(categoryId: string): VoxelObject[] {
  const bySubcategory = OBJECTS.filter((o) => OBJECT_SUBCATEGORY_MAP[o.id] === categoryId);
  if (bySubcategory.length > 0) {
    return bySubcategory;
  }
  return OBJECTS.filter((o) => o.category === categoryId);
}

/** Return the specific subcategory ID for an object */
export function getCategoryForObject(objectId: string): string {
  return OBJECT_SUBCATEGORY_MAP[objectId] ?? getObject(objectId).category;
}

export type { VoxelObject, ObjectVariant } from './types';
export type { DomainCategory, SubCategory } from './categories';
export { CATEGORIES, DOMAINS, SUBCATEGORIES, getAllDomains, getAllSubcategories, getSubcategory };
