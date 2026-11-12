import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ImportFailure } from "../../src/import/import-errors.js";
import { normalizeCharacterPayload } from "../../src/import/normalize-character.js";
import { sliceCharacter } from "../../src/import/slice-character.js";

function readFixture(): unknown {
  const contents = readFileSync(
    new URL("../fixtures/ddb-character.json", import.meta.url),
    "utf8",
  );
  return JSON.parse(contents) as unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected fixture object");
  }
  return value as Record<string, unknown>;
}

describe("normalizeCharacterPayload", () => {
  it("maps a sanitized D&D Beyond response into six independent slices", () => {
    const payload = readFixture();
    const character = sliceCharacter(
      normalizeCharacterPayload(payload, "12345"),
    );

    expect(character).toMatchObject({
      sourceCharacterId: "12345",
      sourceCampaignId: null,
      name: "Sample Character",
      slices: {
        identityBackground: {
          species: "Sample Species",
          background: "Sample Background",
          alignment: "Neutral",
          appearance: "Synthetic appearance.",
          backstory: "Synthetic backstory.",
        },
        classProgression: {
          className: "Sample Class",
          subclass: "Sample Subclass",
          totalLevel: 5,
          hitDice: "d8",
        },
        coreAbilityScores: {
          strength: 15,
          dexterity: 14,
          constitution: 13,
          intelligence: 12,
          wisdom: 10,
          charisma: 8,
        },
      },
    });
    expect(Object.keys(character.slices)).toHaveLength(6);
    expect(character.slices.proficienciesAndFeats.skills).toContainEqual(
      expect.objectContaining({ name: "Perception" }),
    );
    expect(character.slices.proficienciesAndFeats.savingThrows).toContainEqual(
      expect.objectContaining({ name: "Wisdom Saving Throws" }),
    );
    expect(character.slices.proficienciesAndFeats.languages).toContainEqual(
      expect.objectContaining({ name: "Common" }),
    );
    expect(character.slices.proficienciesAndFeats.tools).toContainEqual(
      expect.objectContaining({ name: "Thieves Tools" }),
    );
    expect(character.slices.proficienciesAndFeats.armor).toContainEqual(
      expect.objectContaining({ name: "Light Armor" }),
    );
    expect(character.slices.proficienciesAndFeats.weapons).toContainEqual(
      expect.objectContaining({ name: "Simple Weapons" }),
    );
    expect(character.slices.proficienciesAndFeats.feats).toContainEqual(
      expect.objectContaining({ name: "Sample Feat" }),
    );
    expect(character.slices.proficienciesAndFeats.senses).toContainEqual(
      expect.objectContaining({ name: "Darkvision" }),
    );
    expect(character.slices.equipmentAndGold).toMatchObject({
      weapons: [{ name: "Sample Weapon" }],
      armor: [{ name: "Sample Armor" }],
      magicItems: [{ name: "Sample Magic Item", attuned: true }],
      otherItems: [{ name: "Sample Gear" }],
      currency: { copper: 1, silver: 2, gold: 25, electrum: 0, platinum: 1 },
      attunedItems: [{ name: "Sample Magic Item" }],
    });
    expect(character.slices.spellcasting).toMatchObject({
      cantrips: [{ name: "Sample Cantrip", level: 0 }],
      knownSpells: [{ name: "Sample Spell", level: 2 }],
      preparedSpells: [{ name: "Sample Spell", prepared: true }],
      spellSlots: expect.arrayContaining([
        { level: 1, count: 4 },
        { level: 2, count: 2 },
      ]),
    });
  });

  it("defaults missing optional narrative fields without changing the source", () => {
    const payload = readFixture();
    const before = structuredClone(payload);
    const root = asRecord(payload);
    const data = asRecord(root.data);
    data.traits = {};
    data.notes = {};

    const normalized = normalizeCharacterPayload(payload, "12345");

    expect(normalized.identityBackground).toMatchObject({
      appearance: "",
      personalityTraits: "",
      ideals: "",
      bonds: "",
      flaws: "",
      backstory: "",
    });
    expect(asRecord(before)).not.toBe(payload);
    expect(asRecord(before).data).not.toEqual(data);
  });

  it("preserves weapon names when optional damage metadata uses an unknown shape", () => {
    const payload = readFixture();
    const data = asRecord(asRecord(payload).data);
    const inventory = data.inventory;
    if (!Array.isArray(inventory)) {
      throw new Error("Expected fixture inventory");
    }
    const weapon = asRecord(inventory[0]);
    const definition = asRecord(weapon.definition);
    definition.damage = { diceString: "1d8" };
    definition.damageType = { name: "slashing" };

    const character = sliceCharacter(
      normalizeCharacterPayload(payload, "12345"),
    );

    expect(character.slices.equipmentAndGold.weapons[0]).toMatchObject({
      name: "Sample Weapon",
      damage: "",
      damageType: "",
    });
  });

  it("keeps undefined spells for review while preserving normal spells", () => {
    const payload = readFixture();
    const data = asRecord(asRecord(payload).data);
    asRecord(data.spells).feat = [
      { id: 123, name: "Custom Spell", definition: null },
      { id: 456 },
    ];
    data.classSpells = [{ spells: [{ spell: { name: "Nested Spell" } }] }];

    const character = sliceCharacter(normalizeCharacterPayload(payload, "12345"));
    expect(character.slices.spellcasting.unresolvedSpells).toEqual([
      { name: "Custom Spell", source: "feat entry 1" },
      { name: "Unidentified spell (ID 456)", source: "feat entry 2" },
      { name: "Nested Spell", source: "classSpells entry 1" },
    ]);
    expect(character.slices.spellcasting.knownSpells).toEqual([
      expect.objectContaining({ name: "Sample Spell", level: 2 }),
    ]);
  });

  it("rejects incomplete ability scores without exposing payload content", () => {
    const payload = readFixture();
    const root = asRecord(payload);
    const data = asRecord(root.data);
    const stats = data.stats;
    if (!Array.isArray(stats)) {
      throw new Error("Expected fixture ability scores");
    }
    data.stats = stats.slice(0, 5);

    expect(() => normalizeCharacterPayload(payload, "12345")).toThrowError(
      expect.objectContaining({
        details: expect.objectContaining({
          category: "invalid-payload",
          sourceCharacterId: "12345",
        }),
      }),
    );
  });

  it("rejects malformed source IDs before returning slices", () => {
    expect(() => normalizeCharacterPayload(readFixture(), "0")).toThrow(
      ImportFailure,
    );
  });
});
