/**
 * Category & Subcategory taxonomy for the model picker.
 * Supports multi-tier hierarchy: Domain -> Subcategory -> Leaf models.
 */

export interface SubCategory {
  id: string;
  domainId: string;
  name: string;
  blurb: string;
  preview?: string[];
}

export interface DomainCategory {
  id: string;
  name: string;
  blurb: string;
  subcategories: SubCategory[];
}

export interface ObjectCategory {
  id: string;
  name: string;
  blurb: string;
  domainId?: string;
  preview?: string[];
}

export const DOMAINS: DomainCategory[] = [
  {
    id: 'medical',
    name: 'Medical & Healthcare',
    blurb: 'Doctors, hospitals, surgery and clinical care',
    subcategories: [
      {
        id: 'medical-doctor',
        domainId: 'medical',
        name: 'Doctor & Clinical',
        blurb: 'Cardiology, primary care and clinical instruments',
        preview: ['Syringe', 'Heart'],
      },
      {
        id: 'medical-hospital',
        domainId: 'medical',
        name: 'Hospital & Emergency',
        blurb: 'Emergency medical services, hospital facilities and transport',
        preview: ['First aid kit', 'Hospital', 'Ambulance'],
      },
      {
        id: 'medical-dentistry',
        domainId: 'medical',
        name: 'Dentistry',
        blurb: 'Dental care, dental chair and orthodontics',
        preview: ['Tooth', 'Dental drill', 'Toothbrush', 'Braces'],
      },
      {
        id: 'medical-neuro',
        domainId: 'medical',
        name: 'Neurosurgery & Neurology',
        blurb: 'Brain surgery, spine care and neurology',
        preview: ['Brain', 'Spine column', 'Scalpel', 'Reflex hammer'],
      },
      {
        id: 'medical-pharma',
        domainId: 'medical',
        name: 'Diagnostics & Pharmacy',
        blurb: 'Pathology labs, pharmaceuticals and radiology',
        preview: ['Pill capsule', 'Optical microscope', 'MRI scanner'],
      },
    ],
  },
  {
    id: 'food',
    name: 'Food & Culinary',
    blurb: 'Regional cuisines, fast food, cafe and dining',
    subcategories: [
      {
        id: 'food-fastfood',
        domainId: 'food',
        name: 'Fast Food & Diner',
        blurb: 'Burgers, fries and American classics',
        preview: ['Burger', 'Fries', 'Hot dog'],
      },
      {
        id: 'food-cafe',
        domainId: 'food',
        name: 'Cafe & Bakery',
        blurb: 'Coffee, cakes and baked pastries',
        preview: ['Coffee cup', 'Cake', 'Croissant', 'Donut'],
      },
      {
        id: 'food-dining',
        domainId: 'food',
        name: 'Restaurants & Dining',
        blurb: 'Bistros, fine dining and hospitality',
        preview: ['Restaurant', 'Dining table'],
      },
      {
        id: 'food-south-india',
        domainId: 'food',
        name: 'South Indian',
        blurb: 'Traditional South Indian culinary classics',
        preview: ['Masala Dosa', 'Idli-Sambar', 'Medu Vada', 'Filter Coffee'],
      },
      {
        id: 'food-west-india',
        domainId: 'food',
        name: 'West Indian',
        blurb: 'Maharashtrian and Gujarati delicacies',
        preview: ['Vadapav', 'Pav Bhaji', 'Misal Pav', 'Khaman Dhokla'],
      },
      {
        id: 'food-north-india',
        domainId: 'food',
        name: 'North Indian',
        blurb: 'Rich North Indian curries and tandoori breads',
        preview: ['Chole Bhature', 'Tandoori Naan', 'Samosa', 'Paneer Tikka'],
      },
      {
        id: 'food-east-india',
        domainId: 'food',
        name: 'East Indian',
        blurb: 'Bengali sweets and coastal Eastern specialties',
        preview: ['Rosogolla', 'Sandesh', 'Kolkata Kathi Roll', 'Fish Curry'],
      },
      {
        id: 'food-asian',
        domainId: 'food',
        name: 'East & Southeast Asian',
        blurb: 'Japanese sushi, ramen, dim sum and noodles',
        preview: ['Sushi roll', 'Ramen bowl', 'Dim sum steamer'],
      },
    ],
  },
  {
    id: 'tech',
    name: 'IT & Technology',
    blurb: 'Computers, cloud infrastructure and robotics',
    subcategories: [
      {
        id: 'tech-devices',
        domainId: 'tech',
        name: 'Workstations & Devices',
        blurb: 'Desktop PCs, laptops and mobile phones',
        preview: ['Computer', 'Laptop', 'Smartphone'],
      },
      {
        id: 'tech-infra',
        domainId: 'tech',
        name: 'Infrastructure & Cloud',
        blurb: 'Enterprise server racks and datacenter networking',
        preview: ['Server rack', 'Router', 'Cloud cluster'],
      },
      {
        id: 'tech-ai',
        domainId: 'tech',
        name: 'AI & Robotics',
        blurb: 'Artificial intelligence and autonomous robotics',
        preview: ['Robot', 'Neural net GPU', 'Robotic arm'],
      },
      {
        id: 'tech-software',
        domainId: 'tech',
        name: 'Software & Web Development',
        blurb: 'Code editors, terminal consoles and version control',
        preview: ['Code editor', 'Terminal prompt', 'Git branch'],
      },
      {
        id: 'tech-security',
        domainId: 'tech',
        name: 'Cybersecurity',
        blurb: 'Digital defense, crypto keys and biometric sensors',
        preview: ['Padlock shield', 'Biometric scanner', 'Keycard'],
      },
    ],
  },
  {
    id: 'vehicles',
    name: 'Vehicles & Transport',
    blurb: 'Cars, bicycles, airplanes and heavy freight',
    subcategories: [
      {
        id: 'vehicles-commute',
        domainId: 'vehicles',
        name: 'Personal Commute',
        blurb: 'Everyday cars and city bicycles',
        preview: ['Car', 'Bicycle', 'Electric scooter'],
      },
      {
        id: 'vehicles-aviation',
        domainId: 'vehicles',
        name: 'Aviation & Flight',
        blurb: 'Commercial airliners and aircraft',
        preview: ['Airplane', 'Helicopter', 'Jet engine'],
      },
      {
        id: 'vehicles-commercial',
        domainId: 'vehicles',
        name: 'Commercial Freight',
        blurb: 'Heavy cargo trucks and freight logistics',
        preview: ['Truck', 'Semi-trailer', 'Forklift'],
      },
      {
        id: 'vehicles-rail',
        domainId: 'vehicles',
        name: 'Rail & Mass Transit',
        blurb: 'High-speed bullet trains and city subways',
        preview: ['Bullet train', 'Subway metro', 'City tram'],
      },
      {
        id: 'vehicles-space',
        domainId: 'vehicles',
        name: 'Space Exploration',
        blurb: 'Orbital rockets and interplanetary rovers',
        preview: ['Space rocket', 'Mars rover', 'Astronaut helmet'],
      },
    ],
  },
  {
    id: 'education',
    name: 'Education & Study',
    blurb: 'Schools, libraries, classrooms and academia',
    subcategories: [
      {
        id: 'education-classroom',
        domainId: 'education',
        name: 'Primary & Classroom',
        blurb: 'School buildings, blackboards and student supplies',
        preview: ['School', 'Blackboard', 'Pencil'],
      },
      {
        id: 'education-higher',
        domainId: 'education',
        name: 'Higher Ed & Library',
        blurb: 'University graduation and research book stacks',
        preview: ['Graduation cap', 'Book stack', 'Diploma scroll'],
      },
      {
        id: 'education-stem',
        domainId: 'education',
        name: 'STEM Laboratory',
        blurb: 'Science experiments and laboratory apparatus',
        preview: ['Erlenmeyer flask', 'Bunsen burner', 'Microscope'],
      },
    ],
  },
  {
    id: 'nature',
    name: 'Nature & Outdoors',
    blurb: 'Trees, flowers, wildlife and landscapes',
    subcategories: [
      {
        id: 'nature-trees',
        domainId: 'nature',
        name: 'Botany & Trees',
        blurb: 'Flowering cherry trees and evergreen pines',
        preview: ['Cherry blossom', 'Pine tree', 'Palm tree'],
      },
      {
        id: 'nature-garden',
        domainId: 'nature',
        name: 'Flowers & Garden',
        blurb: 'Garden blossoms and flora',
        preview: ['Flower', 'Rose', 'Sunflower', 'Potted cactus'],
      },
      {
        id: 'nature-wildlife',
        domainId: 'nature',
        name: 'Wildlife & Marine',
        blurb: 'Terrestrial animals and oceanic sea creatures',
        preview: ['Lion', 'Giant panda', 'Dolphin', 'Blue whale'],
      },
      {
        id: 'nature-weather',
        domainId: 'nature',
        name: 'Earth & Weather',
        blurb: 'Mountains, volcanoes and meteorology',
        preview: ['Volcano', 'Alpine peak', 'Rainbow', 'Storm cloud'],
      },
    ],
  },
  {
    id: 'business',
    name: 'Business & Finance',
    blurb: 'Offices, wealth, commerce and analytics',
    subcategories: [
      {
        id: 'business-corporate',
        domainId: 'business',
        name: 'Corporate & Office',
        blurb: 'Skyscrapers, executive briefcases and workspaces',
        preview: ['Office tower', 'Briefcase', 'Conference table'],
      },
      {
        id: 'business-wealth',
        domainId: 'business',
        name: 'Banking & Wealth',
        blurb: 'Currency, money bags and market growth charts',
        preview: ['Money bag', 'Growth chart', 'Gold bar', 'Safe vault'],
      },
      {
        id: 'business-retail',
        domainId: 'business',
        name: 'Retail & Shopping',
        blurb: 'Storefronts, supermarket carts and point-of-sale',
        preview: ['Shopping cart', 'Storefront boutique', 'Barcode scanner'],
      },
      {
        id: 'business-logistics',
        domainId: 'business',
        name: 'Logistics & Supply Chain',
        blurb: 'Warehouses, shipping packages and pallets',
        preview: ['Cardboard parcel', 'Shipping container', 'Pallet'],
      },
    ],
  },
  {
    id: 'sports',
    name: 'Sports & Fitness',
    blurb: 'Athletics, ball games, gym and trophies',
    subcategories: [
      {
        id: 'sports-field',
        domainId: 'sports',
        name: 'Pitch & Field Games',
        blurb: 'Football / Soccer and cricket',
        preview: ['Football / Soccer ball', 'Cricket bat & stumps'],
      },
      {
        id: 'sports-court',
        domainId: 'sports',
        name: 'Court & Racket Sports',
        blurb: 'Tennis rackets, balls and badminton',
        preview: ['Tennis racket & ball', 'Basketball & hoop'],
      },
      {
        id: 'sports-fitness',
        domainId: 'sports',
        name: 'Gym & Fitness',
        blurb: 'Strength training and iron dumbbells',
        preview: ['Dumbbell', 'Olympic barbell', 'Kettlebell'],
      },
      {
        id: 'sports-honors',
        domainId: 'sports',
        name: 'Honors & Trophies',
        blurb: 'Gold championship trophies and victory awards',
        preview: ['Gold trophy', 'Medal', 'Winner podium'],
      },
      {
        id: 'sports-combat',
        domainId: 'sports',
        name: 'Combat & Martial Arts',
        blurb: 'Boxing, martial arts and rings',
        preview: ['Boxing gloves', 'Heavy bag', 'Black belt'],
      },
    ],
  },
  {
    id: 'arts',
    name: 'Arts & Entertainment',
    blurb: 'Music instruments, fine art, cinema and gaming',
    subcategories: [
      {
        id: 'arts-music',
        domainId: 'arts',
        name: 'Music & Instruments',
        blurb: 'Pianos, guitars, synthesizers and studio audio',
        preview: ['Grand piano', 'Acoustic guitar', 'Studio headphones'],
      },
      {
        id: 'arts-visual',
        domainId: 'arts',
        name: 'Painting & Sculpture',
        blurb: 'Artist color palettes, canvas easels and sculptures',
        preview: ['Artist palette', 'Canvas easel', 'Sculpting chisel'],
      },
      {
        id: 'arts-cinema',
        domainId: 'arts',
        name: 'Cinema & Theater',
        blurb: 'Film clapperboards, projectors and theater seating',
        preview: ['Clapperboard', 'Film reel', 'Popcorn tub'],
      },
      {
        id: 'arts-gaming',
        domainId: 'arts',
        name: 'Gaming & Tabletop',
        blurb: 'Arcade machines, gamepads and polyhedral dice',
        preview: ['Arcade machine', 'Gamepad controller', 'D20 die'],
      },
    ],
  },
  {
    id: 'architecture',
    name: 'Architecture & Places',
    blurb: 'World heritage, residential homes and civil monuments',
    subcategories: [
      {
        id: 'architecture-heritage',
        domainId: 'architecture',
        name: 'Historic Monuments',
        blurb: 'Eiffel tower, pyramids, colosseum and landmarks',
        preview: ['Eiffel tower', 'Colosseum', 'Pyramid', 'Taj Mahal'],
      },
      {
        id: 'architecture-residential',
        domainId: 'architecture',
        name: 'Residential Homes',
        blurb: 'Cozy suburban houses, modern villas and cottages',
        preview: ['Suburban house', 'Modern villa', 'Log cabin'],
      },
      {
        id: 'architecture-civil',
        domainId: 'architecture',
        name: 'Civil & Infrastructure',
        blurb: 'Lighthouses, windmills and suspension bridges',
        preview: ['Coastal lighthouse', 'Windmill', 'Suspension bridge'],
      },
    ],
  },
  {
    id: 'science',
    name: 'Science & Energy',
    blurb: 'Physics, astronomy, clean energy and cosmology',
    subcategories: [
      {
        id: 'science-physics',
        domainId: 'science',
        name: 'Fundamental Physics',
        blurb: 'Atomic structure, DNA molecules and magnetism',
        preview: ['Atom model', 'DNA double helix', 'Horseshoe magnet'],
      },
      {
        id: 'science-astronomy',
        domainId: 'science',
        name: 'Astronomy & Space',
        blurb: 'Planets, celestial bodies and observatories',
        preview: ['Ringed Saturn', 'Moon crescent', 'Optical telescope'],
      },
      {
        id: 'science-green',
        domainId: 'science',
        name: 'Clean Green Energy',
        blurb: 'Wind turbines, solar photovoltaic panels and batteries',
        preview: ['Wind turbine', 'Solar panel array', 'EV charger'],
      },
    ],
  },
  {
    id: 'lifestyle',
    name: 'Lifestyle & Home',
    blurb: 'Home living, fashion, domestic pets and camping',
    subcategories: [
      {
        id: 'lifestyle-home',
        domainId: 'lifestyle',
        name: 'Home & Living',
        blurb: 'Cozy armchairs, warm fireplaces and interior decor',
        preview: ['Tufted armchair', 'Fireplace', 'Floor lamp'],
      },
      {
        id: 'lifestyle-fashion',
        domainId: 'lifestyle',
        name: 'Fashion & Style',
        blurb: 'Sneakers, luxury watches, jackets and sunglasses',
        preview: ['Sneaker shoe', 'Wristwatch', 'Aviator sunglasses'],
      },
      {
        id: 'lifestyle-outdoor',
        domainId: 'lifestyle',
        name: 'Camping & Outdoor',
        blurb: 'Wilderness tents, campfires and compasses',
        preview: ['Canvas tent', 'Campfire', 'Magnetic compass'],
      },
    ],
  },
];

/** Flattened subcategories for quick lookups */
export const SUBCATEGORIES: SubCategory[] = DOMAINS.flatMap((d) => d.subcategories);

/** Backwards-compatible CATEGORIES list */
export const CATEGORIES: ObjectCategory[] = DOMAINS.map((d) => ({
  id: d.id,
  name: d.name,
  blurb: d.blurb,
}));

export function getAllDomains(): DomainCategory[] {
  return DOMAINS;
}

export function getAllSubcategories(): SubCategory[] {
  return SUBCATEGORIES;
}

export function getSubcategory(id: string): SubCategory | undefined {
  return SUBCATEGORIES.find((s) => s.id === id);
}

export function getCategory(id: string): ObjectCategory {
  const sub = getSubcategory(id);
  if (sub) {
    return { id: sub.id, name: sub.name, blurb: sub.blurb, domainId: sub.domainId, preview: sub.preview };
  }
  const dom = DOMAINS.find((d) => d.id === id);
  if (dom) {
    return { id: dom.id, name: dom.name, blurb: dom.blurb };
  }
  return CATEGORIES[0];
}
