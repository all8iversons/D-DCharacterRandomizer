import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ImportService } from "../../src/import/import-service.js";
import { normalizeCharacterPayload } from "../../src/import/normalize-character.js";
import { sliceCharacter } from "../../src/import/slice-character.js";

function readFixture(): unknown {
  return JSON.parse(
    readFileSync(
      new URL("../fixtures/ddb-character.json", import.meta.url),
      "utf8",
    ),
  ) as unknown;
}

describe("import safety", () => {
  it("keeps source data and sibling slices unchanged when a slice is edited", () => {
    const source = readFixture();
    const sourceBefore = structuredClone(source);
    const character = sliceCharacter(
      normalizeCharacterPayload(source, "12345"),
    );
    const sourceSkill =
      character.slices.proficienciesAndFeats.skills[0];
    if (!sourceSkill) {
      throw new Error("Expected a normalized skill");
    }

    sourceSkill.name = "Edited skill";
    character.slices.identityBackground.name = "Edited identity";

    expect(source).toEqual(sourceBefore);
    expect(character.slices.proficienciesAndFeats.skills[0]?.name).toBe(
      "Edited skill",
    );
    expect(character.slices.identityBackground.name).toBe("Edited identity");
    expect(character.slices.classProgression.className).toBe("Sample Class");
  });

  it("leaves Foundry Actors unchanged when importing a character", async () => {
    const actorsBefore = structuredClone(game.actors.contents);
    const service = new ImportService(async () => readFixture());

    await service.importCharacter("12345");

    expect(game.actors.contents).toEqual(actorsBefore);
  });
});
