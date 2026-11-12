import type { CharacterSlices } from "./character-slices.js";

export type SliceCategory = keyof CharacterSlices;

export interface SliceOrigin {
  sourceCharacterId: string;
  sourceCharacterName: string;
  sourceIndex: number;
}

export interface ShuffledCharacter {
  name: string;
  slices: CharacterSlices;
  origins: Record<SliceCategory, SliceOrigin>;
}
