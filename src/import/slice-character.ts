import type {
  CharacterSlices,
  Currency,
  IdentityBackgroundSlice,
  ProficienciesAndFeatsSlice,
  EquipmentAndGoldSlice,
  SpellcastingSlice,
  ClassProgressionSlice,
  CoreAbilityScoresSlice,
} from "../types/character-slices.js";
import type { ImportedCharacter } from "../types/import-model.js";
import { ImportFailure } from "./import-errors.js";

export interface CharacterSliceInput {
  sourceCharacterId: string;
  sourceCampaignId?: string | null;
  identityBackground: Omit<
    IdentityBackgroundSlice,
    "personalityTraits" | "ideals" | "bonds" | "flaws" | "backstory"
  > &
    Partial<
      Pick<
        IdentityBackgroundSlice,
        "personalityTraits" | "ideals" | "bonds" | "flaws" | "backstory"
      >
    >;
  classProgression: ClassProgressionSlice;
  coreAbilityScores: CoreAbilityScoresSlice;
  proficienciesAndFeats?: Partial<ProficienciesAndFeatsSlice>;
  equipmentAndGold?: Omit<Partial<EquipmentAndGoldSlice>, "currency"> & {
    currency?: Partial<Currency>;
  };
  spellcasting?: Partial<SpellcastingSlice>;
}

const EMPTY_CURRENCY: Currency = {
  copper: 0,
  silver: 0,
  electrum: 0,
  gold: 0,
  platinum: 0,
};

function assertCharacterInput(input: CharacterSliceInput): void {
  if (!/^[1-9]\d*$/.test(input.sourceCharacterId)) {
    throw new ImportFailure({
      category: "invalid-payload",
      message: "The imported character is missing a valid source identifier.",
      sourceCharacterId: null,
      retryable: false,
    });
  }

  if (input.identityBackground.name.trim().length === 0) {
    throw new ImportFailure({
      category: "invalid-payload",
      message: "The imported character is missing a name.",
      sourceCharacterId: input.sourceCharacterId,
      retryable: false,
    });
  }

  if (
    input.identityBackground.species.trim().length === 0 ||
    input.identityBackground.background.trim().length === 0 ||
    input.classProgression.className.trim().length === 0 ||
    input.classProgression.hitDice.trim().length === 0
  ) {
    throw new ImportFailure({
      category: "invalid-payload",
      message: "The imported character is missing required identity or class data.",
      sourceCharacterId: input.sourceCharacterId,
      retryable: false,
    });
  }

  if (
    !Number.isInteger(input.classProgression.totalLevel) ||
    input.classProgression.totalLevel < 1 ||
    !Number.isInteger(input.coreAbilityScores.strength) ||
    !Number.isInteger(input.coreAbilityScores.dexterity) ||
    !Number.isInteger(input.coreAbilityScores.constitution) ||
    !Number.isInteger(input.coreAbilityScores.intelligence) ||
    !Number.isInteger(input.coreAbilityScores.wisdom) ||
    !Number.isInteger(input.coreAbilityScores.charisma)
  ) {
    throw new ImportFailure({
      category: "invalid-payload",
      message: "The imported character has invalid level or ability scores.",
      sourceCharacterId: input.sourceCharacterId,
      retryable: false,
    });
  }
}

export function sliceCharacter(input: CharacterSliceInput): ImportedCharacter {
  assertCharacterInput(input);

  const identityBackground: IdentityBackgroundSlice = structuredClone({
    ...input.identityBackground,
    personalityTraits: input.identityBackground.personalityTraits ?? "",
    ideals: input.identityBackground.ideals ?? "",
    bonds: input.identityBackground.bonds ?? "",
    flaws: input.identityBackground.flaws ?? "",
    backstory: input.identityBackground.backstory ?? "",
  });
  const classProgression: ClassProgressionSlice = structuredClone(
    input.classProgression,
  );
  const coreAbilityScores: CoreAbilityScoresSlice = structuredClone(
    input.coreAbilityScores,
  );
  const proficienciesAndFeats: ProficienciesAndFeatsSlice = structuredClone({
    skills: input.proficienciesAndFeats?.skills ?? [],
    savingThrows: input.proficienciesAndFeats?.savingThrows ?? [],
    languages: input.proficienciesAndFeats?.languages ?? [],
    tools: input.proficienciesAndFeats?.tools ?? [],
    armor: input.proficienciesAndFeats?.armor ?? [],
    weapons: input.proficienciesAndFeats?.weapons ?? [],
    feats: input.proficienciesAndFeats?.feats ?? [],
    senses: input.proficienciesAndFeats?.senses ?? [],
  });
  const equipmentAndGold: EquipmentAndGoldSlice = structuredClone({
    weapons: input.equipmentAndGold?.weapons ?? [],
    armor: input.equipmentAndGold?.armor ?? [],
    magicItems: input.equipmentAndGold?.magicItems ?? [],
    otherItems: input.equipmentAndGold?.otherItems ?? [],
    currency: { ...EMPTY_CURRENCY, ...input.equipmentAndGold?.currency },
    attunedItems: input.equipmentAndGold?.attunedItems ?? [],
  });
  const spellcasting: SpellcastingSlice = structuredClone({
    cantrips: input.spellcasting?.cantrips ?? [],
    knownSpells: input.spellcasting?.knownSpells ?? [],
    preparedSpells: input.spellcasting?.preparedSpells ?? [],
    spellSlots: input.spellcasting?.spellSlots ?? [],
    unresolvedSpells: input.spellcasting?.unresolvedSpells ?? [],
  });

  const slices: CharacterSlices = {
    identityBackground,
    classProgression,
    coreAbilityScores,
    proficienciesAndFeats,
    equipmentAndGold,
    spellcasting,
  };

  return {
    sourceCharacterId: input.sourceCharacterId,
    sourceCampaignId: input.sourceCampaignId ?? null,
    name: identityBackground.name,
    slices,
  };
}
