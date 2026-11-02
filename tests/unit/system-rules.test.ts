import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveSystemRules } from "../../src/foundry/system-rules.js";
import type {
  ClassProgressionSlice,
  EquipmentAndGoldSlice,
} from "../../src/types/character-slices.js";

const progression: ClassProgressionSlice = {
  className: "Barbarian",
  subclass: "",
  totalLevel: 1,
  hitDice: "d12",
  classes: [
    {
      className: "Barbarian",
      subclass: "",
      level: 1,
      hitDie: 12,
      ddbDefinitionId: null,
      savingThrowProficiencies: ["strength", "constitution"],
    },
  ],
};

const equipment: EquipmentAndGoldSlice = {
  weapons: [],
  armor: [],
  magicItems: [],
  otherItems: [],
  currency: { copper: 0, silver: 0, electrum: 0, gold: 0, platinum: 0 },
  attunedItems: [],
};

describe("resolveSystemRules", () => {
  beforeEach(() => {
    game.system.config.abilities = {
      str: { label: "Strength" },
      dex: { label: "Dexterity" },
      con: { label: "Constitution" },
      int: { label: "Intelligence" },
      wis: { label: "Wisdom" },
      cha: { label: "Charisma" },
    };
  });

  it("reads class hit dice and spellcasting ability from D&D 5e class data", async () => {
    const item = {
      id: "barbarian",
      name: "Barbarian",
      type: "class",
      system: {
        hd: { denomination: "d12" },
        spellcasting: { ability: "" },
      },
      toObject: () => ({}),
    };
    game.packs = [
      {
        documentName: "Item",
        metadata: { id: "dnd5e.classes" },
        getIndex: vi.fn(async () => [
          { _id: "barbarian", name: "Barbarian", type: "class" },
        ]),
        getDocument: vi.fn(async () => item),
      },
    ];

    const result = await resolveSystemRules(progression, equipment);

    expect(result.classes[0]).toMatchObject({
      className: "Barbarian",
      hitDie: 12,
      spellcastingAbility: null,
    });
  });

  it("derives Unarmored Defense from the linked system feature description", async () => {
    const item = {
      id: "barbarian",
      name: "Barbarian",
      type: "class",
      system: {
        hd: { denomination: "d12" },
        spellcasting: { ability: "" },
        advancement: [
          {
            configuration: {
              items: ["Compendium.dnd5e.classfeatures.Item.unarmored"],
            },
          },
        ],
      },
      toObject: () => ({}),
    };
    game.packs = [
      {
        documentName: "Item",
        metadata: { id: "dnd5e.classes" },
        getIndex: vi.fn(async () => [
          { _id: "barbarian", name: "Barbarian", type: "class" },
        ]),
        getDocument: vi.fn(async () => item),
      },
    ];
    foundry.fromUuid = vi.fn(async () => ({
      id: "unarmored",
      name: "Unarmored Defense",
      type: "feat",
      system: {
        description: {
          value:
            "<p>Your Armor Class equals 10 + your Dexterity modifier + your Constitution modifier. You can use a shield and still gain this benefit.</p>",
        },
      },
      toObject: () => ({}),
    }));

    const result = await resolveSystemRules(progression, equipment);

    expect(result.classes[0]?.unarmoredDefense).toEqual({
      abilities: ["dexterity", "constitution"],
      shieldAllowed: true,
    });
  });
});
