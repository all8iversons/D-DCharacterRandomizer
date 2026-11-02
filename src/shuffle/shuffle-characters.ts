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

function isCaster(character: ImportedCharacter): boolean {
  return character.slices.spellcasting.spellSlots.some(
    (slot) => slot.count > 0,
  );
}

// Spell lists from casters go to hybrids whose class came from a caster (and
// non-caster lists to the rest), so full spell lists are not wasted on classes
// that cannot use them. Within each group the draw avoids a hybrid keeping its
// own original list and avoids repeating a source already used by that sheet.
function assignSpellLists(
  characters: readonly ImportedCharacter[],
  sources: Record<SliceCategory, number[]>,
  random: () => number,
): void {
  const targets = characters.map((_, index) => index);
  const casterTargets = targets.filter((target) =>
    isCaster(characters[sources.classProgression[target]!]!),
  );
  const otherTargets = targets.filter((target) => !casterTargets.includes(target));
  const casterLists = targets.filter((index) => isCaster(characters[index]!));
  const otherLists = targets.filter((index) => !casterLists.includes(index));
  if (
    casterTargets.length !== casterLists.length ||
    otherTargets.length !== otherLists.length
  ) {
    return;
  }

  const others = SLICE_CATEGORIES.filter(
    (category) => category !== "spellcasting",
  );
  const cost = (target: number, list: number): number => {
    const duplicates = others.filter(
      (category) => sources[category][target] === list,
    ).length;
    // Below six characters one-per-source is impossible, but keeping a hybrid's
    // own original list is still avoided; at six or more it is only a tie-breaker.
    const selfCost = characters.length < SLICE_CATEGORIES.length ? 1000 : 1;
    return (list === target ? selfCost : 0) + duplicates * 10;
  };
  // Backtracking search for a matching inside one group, within a cost limit.
  const solveGroup = (
    groupTargets: number[],
    groupLists: number[],
    limit: number,
  ): number[] | undefined => {
    const result = new Array<number>(groupTargets.length);
    const taken = new Set<number>();
    let budget = 20000;
    const visit = (position: number): boolean => {
      if (position === groupTargets.length) {
        return true;
      }
      for (const list of shuffled(groupLists, random)) {
        budget -= 1;
        if (budget < 0) {
          return false;
        }
        if (taken.has(list) || cost(groupTargets[position]!, list) > limit) {
          continue;
        }
        taken.add(list);
        result[position] = list;
        if (visit(position + 1)) {
          return true;
        }
        taken.delete(list);
      }
      return false;
    };
    return visit(0) ? result : undefined;
  };
  for (const limit of [0, 1, 10, 11, 20, 21, 30, 31, 40, 41, 50, 51]) {
    const exactCasters = solveGroup(casterTargets, casterLists, limit);
    const exactOthers = solveGroup(otherTargets, otherLists, limit);
    if (exactCasters && exactOthers) {
      const mapping = new Array<number>(characters.length);
      casterTargets.forEach((target, position) => {
        mapping[target] = exactCasters[position]!;
      });
      otherTargets.forEach((target, position) => {
        mapping[target] = exactOthers[position]!;
      });
      sources.spellcasting = mapping;
      return;
    }
  }
  const score = (mapping: number[]): number =>
    targets.reduce((total, target) => total + cost(target, mapping[target]!), 0);

  let best: number[] | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < 300 && bestScore > 0; attempt += 1) {
    const mapping = new Array<number>(characters.length);
    const casters = shuffled(casterLists, random);
    const rest = shuffled(otherLists, random);
    casterTargets.forEach((target, position) => {
      mapping[target] = casters[position]!;
    });
    otherTargets.forEach((target, position) => {
      mapping[target] = rest[position]!;
    });
    const candidate = score(mapping);
    if (candidate < bestScore) {
      best = mapping;
      bestScore = candidate;
    }
  }
  if (best) {
    sources.spellcasting = best;
  }
}

export function shuffleCharacters(
  characters: readonly ImportedCharacter[],
  random: () => number = Math.random,
): ShuffledCharacter[] {
  if (characters.length < 2) {
    throw new RangeError("At least two characters are required to shuffle.");
  }

  const sources = drawSources(characters.length, random);
  if (characters.length > 2) {
    assignSpellLists(characters, sources, random);
  }

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
