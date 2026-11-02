import type { ImportedCharacter } from "../types/import-model.js";
import type {
  ShuffledCharacter,
  SliceCategory,
} from "../types/shuffle-model.js";

const SLICE_CATEGORIES: readonly SliceCategory[] = [
  "identityBackground",
  "classProgression",
  "coreAbilityScores",
  "proficienciesAndFeats",
  "equipmentAndGold",
  "spellcasting",
];

function randomDerangement(
  length: number,
  random: () => number,
): number[] {
  const permutation = Array.from({ length }, (_, index) => index);
  for (let index = length - 1; index > 0; index -= 1) {
    const sample = random();
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
      throw new RangeError("Random source must return a value in [0, 1).");
    }
    const swapIndex = Math.floor(sample * index);
    [permutation[index], permutation[swapIndex]] = [
      permutation[swapIndex]!,
      permutation[index]!,
    ];
  }
  return permutation;
}

function checkedSample(random: () => number): number {
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
    throw new RangeError("Random source must return a value in [0, 1).");
  }
  return sample;
}

// With two characters a full derangement only swaps whole sheets, so each bucket
// independently swaps or stays, and the draw is forced to mix both outputs.
function drawPairSources(
  random: () => number,
): Record<SliceCategory, number[]> {
  const swaps = SLICE_CATEGORIES.map(() => checkedSample(random) < 0.5);
  const forced = Math.floor(checkedSample(random) * SLICE_CATEGORIES.length);
  if (swaps.every((swap) => swap === swaps[0])) {
    swaps[forced] = !swaps[forced];
  }
  const sources = {} as Record<SliceCategory, number[]>;
  SLICE_CATEGORIES.forEach((category, index) => {
    sources[category] = swaps[index] ? [1, 0] : [0, 1];
  });
  return sources;
}

function drawSources(
  length: number,
  random: () => number,
): Record<SliceCategory, number[]> {
  if (length === 2) {
    return drawPairSources(random);
  }
  let sources = {} as Record<SliceCategory, number[]>;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    sources = {} as Record<SliceCategory, number[]>;
    for (const category of SLICE_CATEGORIES) {
      sources[category] = randomDerangement(length, random);
    }
    // Reject draws that hand any target a whole original character.
    const wholeSheet = Array.from({ length }, (_, target) => target).some(
      (target) => {
        const first = sources[SLICE_CATEGORIES[0]!][target];
        return SLICE_CATEGORIES.every(
          (category) => sources[category][target] === first,
        );
      },
    );
    if (!wholeSheet) {
      break;
    }
  }
  return sources;
}

export function shuffleCharacters(
  characters: readonly ImportedCharacter[],
  random: () => number = Math.random,
): ShuffledCharacter[] {
  if (characters.length < 2) {
    throw new RangeError("At least two characters are required to shuffle.");
  }

  const sources = drawSources(characters.length, random);

  return characters.map((_, targetIndex) => {
    const sourceAt = (category: SliceCategory): ImportedCharacter => {
      const sourceIndex = sources[category][targetIndex];
      const source = sourceIndex === undefined ? undefined : characters[sourceIndex];
      if (!source) {
        throw new Error("Unable to resolve a shuffled character component.");
      }
      return source;
    };
    const originAt = (category: SliceCategory) => {
      const sourceIndex = sources[category][targetIndex];
      const source = sourceAt(category);
      if (sourceIndex === undefined) {
        throw new Error("Unable to resolve a shuffled character origin.");
      }
      return { sourceCharacterId: source.sourceCharacterId, sourceIndex };
    };
    const identity = sourceAt("identityBackground");
    const result: ShuffledCharacter = {
      name: identity.slices.identityBackground.name,
      slices: {
        identityBackground: structuredClone(
          identity.slices.identityBackground,
        ),
        classProgression: structuredClone(
          sourceAt("classProgression").slices.classProgression,
        ),
        coreAbilityScores: structuredClone(
          sourceAt("coreAbilityScores").slices.coreAbilityScores,
        ),
        proficienciesAndFeats: structuredClone(
          sourceAt("proficienciesAndFeats").slices.proficienciesAndFeats,
        ),
        equipmentAndGold: structuredClone(
          sourceAt("equipmentAndGold").slices.equipmentAndGold,
        ),
        spellcasting: structuredClone(
          sourceAt("spellcasting").slices.spellcasting,
        ),
      },
      origins: {
        identityBackground: originAt("identityBackground"),
        classProgression: originAt("classProgression"),
        coreAbilityScores: originAt("coreAbilityScores"),
        proficienciesAndFeats: originAt("proficienciesAndFeats"),
        equipmentAndGold: originAt("equipmentAndGold"),
        spellcasting: originAt("spellcasting"),
      },
    };
    return result;
  });
}
