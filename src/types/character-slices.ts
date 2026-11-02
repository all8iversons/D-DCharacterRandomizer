export interface IdentityBackgroundSlice {
  name: string;
  species: string;
  appearance: string;
  background: string;
  alignment: string;
  personalityTraits: string;
  ideals: string;
  bonds: string;
  flaws: string;
  backstory: string;
}

export interface ClassProgressionSlice {
  className: string;
  subclass: string;
  totalLevel: number;
  hitDice: string;
  classes: readonly ClassLevel[];
}

export interface ClassLevel {
  className: string;
  subclass: string;
  level: number;
  hitDie: number;
  ddbDefinitionId: string | null;
  savingThrowProficiencies: readonly (
    | "strength"
    | "dexterity"
    | "constitution"
    | "intelligence"
    | "wisdom"
    | "charisma"
  )[];
}

export interface CoreAbilityScoresSlice {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

export interface ProficiencyEntry {
  id: string | null;
  name: string;
}

export interface FeatEntry {
  id: string | null;
  name: string;
  description: string;
}

export interface ProficienciesAndFeatsSlice {
  skills: readonly ProficiencyEntry[];
  savingThrows: readonly ProficiencyEntry[];
  languages: readonly ProficiencyEntry[];
  tools: readonly ProficiencyEntry[];
  armor: readonly ProficiencyEntry[];
  weapons: readonly ProficiencyEntry[];
  feats: readonly FeatEntry[];
  senses: readonly ProficiencyEntry[];
}

export interface EquipmentEntry {
  id: string | null;
  name: string;
  category: string;
  description: string;
  quantity: number;
  attuned: boolean;
  equipped: boolean;
  armorClass: number | null;
  armorTypeId: number | null;
  damage: string;
  damageType: string;
  weight: number | null;
  cost: number | null;
}

export interface Currency {
  copper: number;
  silver: number;
  electrum: number;
  gold: number;
  platinum: number;
}

export interface EquipmentAndGoldSlice {
  weapons: readonly EquipmentEntry[];
  armor: readonly EquipmentEntry[];
  magicItems: readonly EquipmentEntry[];
  otherItems: readonly EquipmentEntry[];
  currency: Currency;
  attunedItems: readonly EquipmentEntry[];
}

export interface SpellEntry {
  id: string | null;
  name: string;
  level: number;
  prepared: boolean;
}

export interface SpellSlotCount {
  level: number;
  count: number;
}

export interface SpellcastingSlice {
  cantrips: readonly SpellEntry[];
  knownSpells: readonly SpellEntry[];
  preparedSpells: readonly SpellEntry[];
  spellSlots: readonly SpellSlotCount[];
}

export interface CharacterSlices {
  identityBackground: IdentityBackgroundSlice;
  classProgression: ClassProgressionSlice;
  coreAbilityScores: CoreAbilityScoresSlice;
  proficienciesAndFeats: ProficienciesAndFeatsSlice;
  equipmentAndGold: EquipmentAndGoldSlice;
  spellcasting: SpellcastingSlice;
}

export type DdbJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly DdbJsonValue[]
  | { readonly [key: string]: DdbJsonValue };

export interface DdbCharacterPayload {
  readonly [key: string]: DdbJsonValue;
}
