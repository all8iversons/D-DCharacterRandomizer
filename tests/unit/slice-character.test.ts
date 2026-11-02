import { describe, expect, it } from "vitest";
import { parseResourceId } from "../../src/import/input-validation.js";
import { ImportFailure } from "../../src/import/import-errors.js";
import {
  sliceCharacter,
  type CharacterSliceInput,
} from "../../src/import/slice-character.js";

function createInput(): CharacterSliceInput {
  return {
    sourceCharacterId: "12345",
    identityBackground: {
      name: "Sample Hero",
      species: "Elf",
      appearance: "Silver hair",
      background: "Sage",
      alignment: "Neutral good",
    },
    classProgression: {
      className: "Wizard",
      subclass: "Evocation",
      totalLevel: 3,
      hitDice: "d6",
      classes: [
        {
          className: "Wizard",
          subclass: "Evocation",
          level: 3,
          hitDie: 6,
          ddbDefinitionId: null,
          savingThrowProficiencies: ["intelligence", "wisdom"],
        },
      ],
    },
    coreAbilityScores: {
      strength: 8,
      dexterity: 14,
      constitution: 12,
      intelligence: 16,
      wisdom: 13,
      charisma: 10,
    },
  };
}

describe("parseResourceId", () => {
  it("accepts a positive numeric character ID", () => {
    expect(parseResourceId("12345", "character")).toEqual({
      kind: "character",
      id: "12345",
    });
  });

  it("extracts IDs from approved HTTPS character and campaign URLs", () => {
    expect(
      parseResourceId(
        "https://www.dndbeyond.com/characters/12345/sample-hero",
        "character",
      ),
    ).toEqual({ kind: "character", id: "12345" });
    expect(
      parseResourceId("https://dndbeyond.com/campaigns/9876", "campaign"),
    ).toEqual({ kind: "campaign", id: "9876" });
  });

  it.each([
    "",
    "0",
    "-1",
    "not-an-id",
    "http://www.dndbeyond.com/characters/123",
    "https://dndbeyond.com.evil.example/characters/123",
    "https://dndbeyond.com/campaigns/123",
  ])("rejects invalid character input %j", (value) => {
    expect(() => parseResourceId(value, "character")).toThrow(ImportFailure);
  });
});

describe("sliceCharacter", () => {
  it("creates six slices and fills missing optional narrative fields", () => {
    const result = sliceCharacter(createInput());

    expect(Object.keys(result.slices)).toHaveLength(6);
    expect(result.slices.identityBackground).toMatchObject({
      name: "Sample Hero",
      personalityTraits: "",
      ideals: "",
      bonds: "",
      flaws: "",
      backstory: "",
    });
    expect(result.slices.equipmentAndGold.currency).toEqual({
      copper: 0,
      silver: 0,
      electrum: 0,
      gold: 0,
      platinum: 0,
    });
  });

  it("does not share mutable nested values with the input or sibling slices", () => {
    const input = createInput();
    input.proficienciesAndFeats = {
      skills: [{ id: "perception", name: "Perception" }],
    };

    const result = sliceCharacter(input);
    const originalName = input.identityBackground.name;
    const skills = result.slices.proficienciesAndFeats.skills;
    const editableSkill = skills[0];
    if (!editableSkill) {
      throw new Error("Expected copied proficiency entry");
    }

    input.identityBackground.name = "Changed source";
    result.slices.identityBackground.name = "Changed slice";
    editableSkill.name = "Changed skill";

    expect(originalName).toBe("Sample Hero");
    expect(result.name).toBe("Sample Hero");
    expect(input.proficienciesAndFeats.skills[0]?.name).toBe("Perception");
  });

  it("rejects invalid source IDs, missing names, and invalid levels", () => {
    expect(() =>
      sliceCharacter({ ...createInput(), sourceCharacterId: "0" }),
    ).toThrow(ImportFailure);
    expect(() =>
      sliceCharacter({
        ...createInput(),
        identityBackground: {
          ...createInput().identityBackground,
          name: "  ",
        },
      }),
    ).toThrow(ImportFailure);
    expect(() =>
      sliceCharacter({
        ...createInput(),
        classProgression: {
          ...createInput().classProgression,
          totalLevel: 0,
        },
      }),
    ).toThrow(ImportFailure);
  });
});
