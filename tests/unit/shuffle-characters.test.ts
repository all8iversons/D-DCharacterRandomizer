import { describe, expect, it } from "vitest";
import type { ImportedCharacter } from "../../src/types/import-model.js";
import { shuffleCharacters } from "../../src/shuffle/shuffle-characters.js";
import { normalizeCharacterPayload } from "../../src/import/normalize-character.js";
import { readFileSync } from "node:fs";
import { sliceCharacter } from "../../src/import/slice-character.js";

function fixture(): unknown {
  return JSON.parse(
    readFileSync(
      new URL("../fixtures/ddb-character.json", import.meta.url),
      "utf8",
    ),
  ) as unknown;
}

function characters(): ImportedCharacter[] {
  return [0, 1, 2, 3].map((index) => {
    const source = normalizeCharacterPayload(fixture(), String(index + 1));
    source.identityBackground.name = `Character ${index}`;
    source.coreAbilityScores.strength = 10 + index;
    return sliceCharacter(source);
  });
}

describe("shuffleCharacters", () => {
  it("creates six independent derangements without changing source characters", () => {
    const source = characters();
    const before = structuredClone(source);
    let value = 0.37;
    const result = shuffleCharacters(source, () => {
      value = (value + 0.618033988749895) % 1;
      return value;
    });

    expect(result).toHaveLength(source.length);
    expect(source).toEqual(before);
    for (const resultCharacter of result) {
      expect(Object.keys(resultCharacter.slices)).toHaveLength(6);
      for (const [category, origin] of Object.entries(resultCharacter.origins)) {
        const targetIndex = result.indexOf(resultCharacter);
        expect(origin.sourceIndex).not.toBe(targetIndex);
        expect(
          resultCharacter.slices[category as keyof ImportedCharacter["slices"]],
        ).toEqual(source[origin.sourceIndex]?.slices[
          category as keyof ImportedCharacter["slices"]
        ]);
      }
    }
    for (const category of Object.keys(source[0]!.slices) as Array<
      keyof ImportedCharacter["slices"]
    >) {
      const origins = result.map(
        (character) => character.origins[category].sourceIndex,
      );
      expect(new Set(origins).size).toBe(source.length);
      expect(origins.every((origin, index) => origin !== index)).toBe(true);
    }
  });

  it("mixes two inputs instead of swapping whole sheets and rejects invalid random values", () => {
    const source = characters().slice(0, 2);
    const result = shuffleCharacters(source, () => 0.5);

    for (const character of result) {
      const origins = new Set(
        Object.values(character.origins).map((origin) => origin.sourceIndex),
      );
      expect(origins.size).toBe(2);
    }
    expect(() => shuffleCharacters(source, () => 1)).toThrow(RangeError);
  });

  it("requires at least two characters", () => {
    expect(() => shuffleCharacters(characters().slice(0, 1))).toThrow(
      RangeError,
    );
  });
});
