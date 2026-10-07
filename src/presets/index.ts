import type { NaturalScenePreset } from './Preset';
import { cherryBlossomPreset } from './cherry-blossom';
import { forestPreset } from './forest';
import { flowerFieldPreset, mountainPreset, crystalPreset, mushroomPreset } from './nature-pack';
import { coralPreset, templePreset, cityPreset, customPreset } from './urban-pack';

export const PRESETS: NaturalScenePreset[] = [
  cherryBlossomPreset,
  forestPreset,
  flowerFieldPreset,
  mountainPreset,
  crystalPreset,
  mushroomPreset,
  coralPreset,
  templePreset,
  cityPreset,
  customPreset,
];

export function getPreset(id: string): NaturalScenePreset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}
