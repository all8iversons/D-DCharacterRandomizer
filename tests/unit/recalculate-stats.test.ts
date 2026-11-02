import { describe, expect, it } from "vitest";
import {
  recalculateDerivedStatistics,
  RulesResolutionError,
  type RulesResolution,
} from "../../src/rules/recalculate-stats.js";
import { normalizeCharacterPayload } from "../../src/import/normalize-character.js";
import { readFileSync } from "node:fs";
import { sliceCharacter } from "../../src/import/slice-character.js";

function character() {
  const payload = JSON.parse(
    readFileSync(
      new URL("../fixtures/ddb-character.json", import.meta.url),
      "utf8",
    ),
  ) as unknown;
  return sliceCharacter(normalizeCharacterPayload(payload, "12345"));
}

const rules: RulesResolution = {
  classes: [
    {
      className: "Sample Class",
      hitDie: 8,
      spellcastingAbility: "intelligence",
      unarmoredDefense: null,
    },
  ],
  armor: [
    {
      itemId: "1000012",
      name: "Sample Armor",
      category: "medium",
      baseArmorClass: 14,
      dexterityCap: 2,
      shieldBonus: 0,
    },
  ],
};

describe("recalculateDerivedStatistics", () => {
  it("calculates HP, AC, proficiency, saves, and spellcasting values", () => {
    const { slices } = character();
    const result = recalculateDerivedStatistics(
      slices.classProgression,
      slices.coreAbilityScores,
      slices.equipmentAndGold,
      rules,
      true,
    );

    expect(result).toMatchObject({
      proficiencyBonus: 3,
      maxHitPoints: 33,
      armorClass: 16,
      spellcasting: {
        ability: "intelligence",
        saveDc: 12,
        attackBonus: 4,
      },
    });
    expect(result.savingThrows.wisdom).toMatchObject({
      abilityModifier: 0,
      proficient: true,
      total: 3,
    });
  });

  it("applies the Constitution modifier at every level and minimum HP of one", () => {
    const { slices } = character();
    const lowCon = { ...slices.coreAbilityScores, constitution: 3 };
    const result = recalculateDerivedStatistics(
      slices.classProgression,
      lowCon,
      { ...slices.equipmentAndGold, armor: [] },
      { ...rules, classes: [{ ...rules.classes[0]!, unarmoredDefense: null }] },
      false,
    );
    expect(result.maxHitPoints).toBe(8);
  });

  it("uses the assigned class's saving throws rather than the shuffled proficiency slice", () => {
    const { slices } = character();
    const noClassSaves: RulesResolution = {
      ...rules,
    };
    const noClassSaveProgression = {
      ...slices.classProgression,
      classes: slices.classProgression.classes.map((classLevel) => ({
        ...classLevel,
        savingThrowProficiencies: [],
      })),
    };
    const result = recalculateDerivedStatistics(
      noClassSaveProgression,
      slices.coreAbilityScores,
      slices.equipmentAndGold,
      noClassSaves,
      false,
    );
    expect(result.savingThrows.wisdom.proficient).toBe(false);
  });

  it("rejects unresolved armor or ambiguous spellcasting metadata", () => {
    const { slices } = character();
    const multiclass = {
      ...slices.classProgression,
      className: "Sample Class / Other",
      classes: [
        {
          ...slices.classProgression.classes[0]!,
          level: 4,
        },
        {
          className: "Other",
          subclass: "",
          level: 1,
          hitDie: 8,
          ddbDefinitionId: null,
        },
      ],
    };
    expect(() =>
      recalculateDerivedStatistics(
        multiclass,
        slices.coreAbilityScores,
        slices.equipmentAndGold,
        { ...rules, armor: [] },
        true,
      ),
    ).toThrow(RulesResolutionError);
    expect(() =>
      recalculateDerivedStatistics(
        multiclass,
        slices.coreAbilityScores,
        slices.equipmentAndGold,
        {
          ...rules,
          classes: [
            {
              ...rules.classes[0]!,
              spellcastingAbility: "wisdom",
            },
            { ...rules.classes[0]!, className: "Other", spellcastingAbility: "charisma" },
          ],
        },
        true,
      ),
    ).toThrow(RulesResolutionError);
  });

  it("uses Unarmored Defense from resolved system feature metadata", () => {
    const { slices } = character();
    const unarmored = {
      ...slices.equipmentAndGold,
      armor: [
        {
          ...slices.equipmentAndGold.armor[0]!,
          equipped: true,
        },
      ],
    };
    const barbarianRules: RulesResolution = {
      classes: [
        {
          ...rules.classes[0]!,
          unarmoredDefense: {
            abilities: ["dexterity", "constitution"],
            shieldAllowed: true,
          },
        },
      ],
      armor: [
        {
          itemId: "1000012",
          name: "Sample Armor",
          category: "shield",
          baseArmorClass: 2,
          dexterityCap: null,
          shieldBonus: 2,
        },
      ],
    };
    const result = recalculateDerivedStatistics(
      slices.classProgression,
      slices.coreAbilityScores,
      unarmored,
      barbarianRules,
      false,
    );
    expect(result.armorClass).toBe(15);

    const monkRules: RulesResolution = {
      ...barbarianRules,
      classes: [
        {
          ...barbarianRules.classes[0]!,
          unarmoredDefense: {
            abilities: ["dexterity", "wisdom"],
            shieldAllowed: false,
          },
        },
      ],
    };
    const monk = recalculateDerivedStatistics(
      slices.classProgression,
      slices.coreAbilityScores,
      unarmored,
      monkRules,
      false,
    );
    expect(monk.armorClass).toBe(12);
  });
});
