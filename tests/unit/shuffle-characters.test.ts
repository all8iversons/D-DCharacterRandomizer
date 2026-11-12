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
        expect(origin.sourceCharacterId).toBe(source[origin.sourceIndex]?.sourceCharacterId);
        expect(origin.sourceCharacterName).toBe(source[origin.sourceIndex]?.name);
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

  it("uses source names for every slice in the preview template", () => {
    const template = readFileSync(
      new URL("../../templates/importer.hbs", import.meta.url),
      "utf8",
    );
    for (const category of Object.keys(characters()[0]!.slices)) {
      expect(template).toContain(
        `{{character.origins.${category}.sourceCharacterName}}`,
      );
      expect(template).not.toContain(
        `{{character.origins.${category}.sourceCharacterId}}`,
      );
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

  it("spreads each sheet's six slices across as many characters as possible", () => {
    const pool = characters();
    const six = [...pool, ...pool.slice(0, 2)];
    const eight = [...six, ...pool.slice(0, 2)];
    for (const source of [six, eight]) {
      for (let run = 0; run < 20; run += 1) {
        const result = shuffleCharacters(source);
        for (const character of result) {
          const origins = Object.values(character.origins).map(
            (origin) => origin.sourceIndex,
          );
          expect(new Set(origins).size).toBe(6);
        }
      }
    }
    const five = shuffleCharacters([...pool, pool[0]!]);
    for (const character of five) {
      const counts = new Map<number, number>();
      for (const origin of Object.values(character.origins)) {
        counts.set(origin.sourceIndex, (counts.get(origin.sourceIndex) ?? 0) + 1);
      }
      expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
    }
  });

  it("never gives a hybrid its own spell list, at any party size", () => {
    const pool = characters();
    for (const size of [2, 3, 4, 5, 6, 7, 8]) {
      const source = Array.from({ length: size }, (_, index) => pool[index % 4]!);
      for (let run = 0; run < 50; run += 1) {
        const result = shuffleCharacters(source);
        result.forEach((hybrid, index) => {
          expect(hybrid.origins.spellcasting.sourceIndex).not.toBe(index);
        });
      }
    }
  });

  it("requires at least two characters", () => {
    expect(() => shuffleCharacters(characters().slice(0, 1))).toThrow(
      RangeError,
    );
  });
});
