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

const SPELLCASTING_INDEX = SLICE_CATEGORIES.indexOf("spellcasting");function checkedSample(random: () => number): number {
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
  // A hybrid never keeps its own spell list.
  swaps[SPELLCASTING_INDEX] = true;
  const forced = Math.floor(
    checkedSample(random) * (SLICE_CATEGORIES.length - 1),
  );
  if (swaps.every((swap) => swap)) {
    swaps[forced] = false;
  }
  const sources = {} as Record<SliceCategory, number[]>;
  SLICE_CATEGORIES.forEach((category, index) => {
    sources[category] = swaps[index] ? [1, 0] : [0, 1];
  });
  return sources;
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(checkedSample(random) * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }
  return result;
}

// Each bucket is a cyclic rotation of one shared random ordering. Giving every
// bucket a different rotation offset spreads a sheet's buckets over as many
// different source characters as possible (N >= 6 means one bucket per character).
function drawSources(
  length: number,
  random: () => number,
): Record<SliceCategory, number[]> {
  if (length === 2) {
    return drawPairSources(random);
  }
  const order = shuffled(
    Array.from({ length }, (_, index) => index),
    random,
  );
  // At exactly six characters one bucket must come from the sheet's own character
  // for every bucket to have a different origin.
  const offsets = Array.from({ length }, (_, index) => index).filter(
    (offset) => offset !== 0 || length === SLICE_CATEGORIES.length,
  );
  const assigned: number[] = [];
  while (assigned.length < SLICE_CATEGORIES.length) {
    assigned.push(...shuffled(offsets, random));
  }
  // Offset 0 would hand a hybrid its own spell list, so move it to another bucket.
  const zeroAt = assigned.indexOf(0, 0);
  if (zeroAt === SPELLCASTING_INDEX) {
    const swapWith = assigned.findIndex(
      (offset, index) => index !== SPELLCASTING_INDEX && offset !== 0,
    );
    if (swapWith >= 0) {
      [assigned[SPELLCASTING_INDEX], assigned[swapWith]] = [
        assigned[swapWith]!,
        assigned[SPELLCASTING_INDEX]!,
      ];
    }
  }
  const sources = {} as Record<SliceCategory, number[]>;
  SLICE_CATEGORIES.forEach((category, categoryIndex) => {
    const offset = assigned[categoryIndex]!;
    const mapping = new Array<number>(length);
    order.forEach((target, position) => {
      mapping[target] = order[(position + offset) % length]!;
    });
    sources[category] = mapping;
  });
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
