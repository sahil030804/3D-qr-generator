import { describe, expect, it } from 'vitest';
import {
  DOMAINS,
  SUBCATEGORIES,
  OBJECTS,
  OBJECT_SUBCATEGORY_MAP,
  getObjectsByCategory,
  getCategoryForObject,
  getObject,
  getSubcategory,
} from './index';

describe('Hierarchical Taxonomy & Category Dropdown Data', () => {
  it('defines all 12 major domains', () => {
    expect(DOMAINS.length).toBe(12);
    const domainIds = DOMAINS.map((d) => d.id);
    expect(domainIds).toContain('medical');
    expect(domainIds).toContain('food');
    expect(domainIds).toContain('tech');
    expect(domainIds).toContain('vehicles');
    expect(domainIds).toContain('education');
    expect(domainIds).toContain('nature');
    expect(domainIds).toContain('business');
    expect(domainIds).toContain('sports');
    expect(domainIds).toContain('arts');
    expect(domainIds).toContain('architecture');
    expect(domainIds).toContain('science');
    expect(domainIds).toContain('lifestyle');
  });

  it('contains expected real-world subcategories like Dentistry, Neurosurgery, South India, and West India', () => {
    const dentist = getSubcategory('medical-dentistry');
    expect(dentist).toBeDefined();
    expect(dentist?.preview).toContain('Tooth');
    expect(dentist?.preview).toContain('Dental drill');

    const neuro = getSubcategory('medical-neuro');
    expect(neuro).toBeDefined();
    expect(neuro?.preview).toContain('Brain');
    expect(neuro?.preview).toContain('Scalpel');

    const southIndia = getSubcategory('food-south-india');
    expect(southIndia).toBeDefined();
    expect(southIndia?.preview).toContain('Masala Dosa');
    expect(southIndia?.preview).toContain('Idli-Sambar');

    const westIndia = getSubcategory('food-west-india');
    expect(westIndia).toBeDefined();
    expect(westIndia?.preview).toContain('Vadapav');
    expect(westIndia?.preview).toContain('Pav Bhaji');
  });

  it('maps all 36 existing objects to valid subcategories in the taxonomy', () => {
    const subcategoryIds = new Set(SUBCATEGORIES.map((s) => s.id));
    for (const object of OBJECTS) {
      const subcategoryId = OBJECT_SUBCATEGORY_MAP[object.id];
      expect(subcategoryId, `Object ${object.id} should have a subcategory mapping`).toBeDefined();
      expect(subcategoryIds.has(subcategoryId), `Subcategory ${subcategoryId} should exist in taxonomy`).toBe(true);
    }
  });

  it('correctly resolves subcategory for objects with getCategoryForObject', () => {
    expect(getCategoryForObject('heart')).toBe('medical-doctor');
    expect(getCategoryForObject('hospital')).toBe('medical-hospital');
    expect(getCategoryForObject('burger')).toBe('food-fastfood');
    expect(getCategoryForObject('coffee-cup')).toBe('food-cafe');
    expect(getCategoryForObject('car')).toBe('vehicles-commute');
  });

  it('filters objects by subcategory correctly', () => {
    const doctors = getObjectsByCategory('medical-doctor');
    expect(doctors.map((d) => d.id)).toEqual(['syringe', 'heart']);

    const hospitals = getObjectsByCategory('medical-hospital');
    expect(hospitals.map((h) => h.id)).toEqual(['first-aid', 'hospital', 'ambulance']);

    const fastfood = getObjectsByCategory('food-fastfood');
    expect(fastfood.map((f) => f.id)).toEqual(['burger']);

    const dentists = getObjectsByCategory('medical-dentistry');
    expect(dentists.map((d) => d.id)).toEqual(['tooth']);

    const neuro = getObjectsByCategory('medical-neuro');
    expect(neuro.map((n) => n.id)).toEqual(['brain']);

    const southIndia = getObjectsByCategory('food-south-india');
    expect(southIndia.map((s) => s.id)).toEqual(['dosa']);

    const westIndia = getObjectsByCategory('food-west-india');
    expect(westIndia.map((w) => w.id)).toEqual(['vada-pav']);
  });

  it('supports domain fallback queries', () => {
    const medicalAll = getObjectsByCategory('medical');
    expect(medicalAll.length).toBe(8);

    const foodAll = getObjectsByCategory('food');
    expect(foodAll.length).toBe(6);
  });
});
