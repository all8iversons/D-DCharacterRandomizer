import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeCharacterPayload } from "../../src/import/normalize-character.js";
import { sliceCharacter } from "../../src/import/slice-character.js";
import {
  manualShuffleWarnings,
  SLICE_OPTIONS,
  swapSlices,
} from "../../src/shuffle/manual-swaps.js";
import { shuffleCharacters } from "../../src/shuffle/shuffle-characters.js";

function preview() {
  const fixture: unknown = JSON.parse(
    readFileSync(new URL("../fixtures/ddb-character.json", import.meta.url), "utf8"),
  );
  const characters = [0, 1, 2, 3].map((index) => {
    const input = normalizeCharacterPayload(fixture, String(index + 1));
    input.identityBackground.name = `Character ${index}`;
    input.coreAbilityScores.strength = 10 + index;
    return sliceCharacter(input);
  });
  return shuffleCharacters(characters, () => 0.5);
}

describe("manual slice swaps", () => {
  it("exchanges each category and its origin without changing or losing other slices", () => {
    for (const { value } of SLICE_OPTIONS) {
      const original = preview();
      const snapshot = structuredClone(original);
      const updated = swapSlices(original, 0, 1, value);
      expect(original).toEqual(snapshot);
      expect(updated[0]!.slices[value]).toEqual(snapshot[1]!.slices[value]);
      expect(updated[1]!.slices[value]).toEqual(snapshot[0]!.slices[value]);
      expect(updated[0]!.origins[value]).toEqual(snapshot[1]!.origins[value]);
      expect(updated[1]!.origins[value]).toEqual(snapshot[0]!.origins[value]);
      expect(updated.slice(2)).toEqual(snapshot.slice(2));
      for (const category of SLICE_OPTIONS) {
        expect(updated.map((entry) => entry.origins[category.value].sourceIndex).sort())
          .toEqual(snapshot.map((entry) => entry.origins[category.value].sourceIndex).sort());
        if (category.value !== value) {
          expect(updated[0]!.slices[category.value]).toEqual(snapshot[0]!.slices[category.value]);
          expect(updated[1]!.slices[category.value]).toEqual(snapshot[1]!.slices[category.value]);
        }
      }
      if (value === "identityBackground") {
        expect(updated[0]!.name).toBe(snapshot[1]!.name);
        expect(updated[1]!.name).toBe(snapshot[0]!.name);
      }
      expect(swapSlices(updated, 0, 1, value)).toEqual(snapshot);
    }
  });

  it("allows swaps that reunite a spell list and displays warnings", () => {
    const original = preview();
    const sourceIndex = original[0]!.origins.spellcasting.sourceIndex;
    const updated = swapSlices(original, 0, sourceIndex, "spellcasting");
    expect(manualShuffleWarnings(updated).join(" ")).toContain(
      "spell list from its original shuffle position",
    );
    const spellOwner = updated.findIndex(
      (entry) => entry.origins.spellcasting.sourceIndex === updated[0]!.origins.identityBackground.sourceIndex,
    );
    const withIdentitySpell = spellOwner === 0
      ? updated
      : swapSlices(updated, 0, spellOwner, "spellcasting");
    expect(manualShuffleWarnings(withIdentitySpell).join(" ")).toContain(
      "spell list belonging to its displayed identity",
    );
  });

  it("warns about uneven source mixing even when the number of sources stays high", () => {
    const updated = preview();
    const entries = Object.values(updated[0]!.origins);
    [1, 1, 1, 1, 2, 3].forEach((source, index) => {
      entries[index]!.sourceIndex = source;
    });
    expect(manualShuffleWarnings(updated).join(" ")).toContain(
      "less balanced source mixing",
    );
  });

  it("rejects invalid indices and categories", () => {
    const original = preview();
    for (const [first, second] of [[0, 0], [-1, 1], [0, 4], [0.5, 1], [NaN, 1]]) {
      expect(() => swapSlices(original, first!, second!, "spellcasting")).toThrow(RangeError);
    }
    expect(() => swapSlices(original, 0, 1, "invalid" as never)).toThrow(RangeError);
  });
});
