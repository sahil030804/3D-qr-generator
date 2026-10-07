/** Category catalog for the model picker. IDs are stable; names are shown in the dropdown. */
export interface ObjectCategory {
  id: string;
  name: string;
  blurb: string;
}

export const CATEGORIES: ObjectCategory[] = [
  { id: 'tech', name: 'IT & Tech', blurb: 'Computers, phones and robots' },
  { id: 'medical', name: 'Medical', blurb: 'Doctors, hospitals and care' },
  { id: 'education', name: 'Education', blurb: 'Teachers, schools and study' },
  { id: 'nature', name: 'Nature', blurb: 'Trees, plants and outdoors' },
  { id: 'vehicles', name: 'Vehicles', blurb: 'Cars, bikes and aircraft' },
  { id: 'business', name: 'Business', blurb: 'Office, money and shops' },
  { id: 'food', name: 'Food & Cafe', blurb: 'Coffee, restaurants and treats' },
  { id: 'sports', name: 'Sports', blurb: 'Games, fitness and trophies' },
];

export function getCategory(id: string): ObjectCategory {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];
}
