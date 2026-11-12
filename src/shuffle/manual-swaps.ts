import type { ShuffledCharacter, SliceCategory } from "../types/shuffle-model.js";

export const SLICE_OPTIONS: readonly { value: SliceCategory; label: string }[] = [
  { value: "identityBackground", label: "Identity" },
  { value: "classProgression", label: "Class" },
  { value: "coreAbilityScores", label: "Ability scores" },
  { value: "proficienciesAndFeats", label: "Proficiencies and feats" },
  { value: "equipmentAndGold", label: "Equipment" },
  { value: "spellcasting", label: "Spellcasting" },
];

export function isSliceCategory(value: string): value is SliceCategory {
  return SLICE_OPTIONS.some((option) => option.value === value);
}

export function swapSlices<K extends SliceCategory>(
  preview: readonly ShuffledCharacter[],
  firstIndex: number,
  secondIndex: number,
  category: K,
): ShuffledCharacter[] {
  if (
    !isSliceCategory(category) ||
    !Number.isInteger(firstIndex) ||
    !Number.isInteger(secondIndex) ||
    firstIndex < 0 ||
    secondIndex < 0 ||
    firstIndex >= preview.length ||
    secondIndex >= preview.length ||
    firstIndex === secondIndex
  ) {
    throw new RangeError("Choose two different hybrids and a valid slice to swap.");
  }
  const updated = structuredClone([...preview]);
  const first = updated[firstIndex]!;
  const second = updated[secondIndex]!;
  [first.slices[category], second.slices[category]] = [
    second.slices[category],
    first.slices[category],
  ];
  [first.origins[category], second.origins[category]] = [
    second.origins[category],
    first.origins[category],
  ];
  if (category === "identityBackground") {
    first.name = first.slices.identityBackground.name;
    second.name = second.slices.identityBackground.name;
  }
  return updated;
}

export function manualShuffleWarnings(
  preview: readonly ShuffledCharacter[],
): string[] {
  const idealDistinct = Math.min(
    SLICE_OPTIONS.length,
    preview.length === 2 || preview.length >= 6
      ? preview.length
      : preview.length - 1,
  );
  const warnings: string[] = [];
  preview.forEach((character, index) => {
    const label = `Hybrid ${index + 1} (${character.name})`;
    const origins = Object.values(character.origins);
    const counts = new Map<number, number>();
    for (const origin of origins) {
      counts.set(origin.sourceIndex, (counts.get(origin.sourceIndex) ?? 0) + 1);
    }
    const maxPerSource = preview.length === 2
      ? SLICE_OPTIONS.length - 1
      : Math.ceil(SLICE_OPTIONS.length / idealDistinct);
    if (
      counts.size < idealDistinct ||
      Math.max(...counts.values()) > maxPerSource
    ) {
      warnings.push(`${label} has less balanced source mixing than the automatic shuffle.`);
    }
    if (
      preview.length > 2 &&
      preview.length !== 6 &&
      SLICE_OPTIONS.some(
        ({ value }) => value !== "spellcasting" &&
          character.origins[value].sourceIndex === index,
      )
    ) {
      warnings.push(`${label} has a slice from its original shuffle position.`);
    }
    if (character.origins.spellcasting.sourceIndex === index) {
      warnings.push(`${label} has the spell list from its original shuffle position.`);
    }
    if (
      character.origins.spellcasting.sourceIndex ===
      character.origins.identityBackground.sourceIndex
    ) {
      warnings.push(`${label} has the spell list belonging to its displayed identity.`);
    }
  });
  return warnings;
}
