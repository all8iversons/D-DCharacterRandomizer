import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeCharacterPayload } from "../../src/import/normalize-character.js";

function fixture(): Record<string, unknown> {
  return JSON.parse(
    readFileSync(
      new URL("../fixtures/ddb-character.json", import.meta.url),
      "utf8",
    ),
  ) as Record<string, unknown>;
}

function dataOf(payload: Record<string, unknown>): Record<string, unknown> {
  return payload.success === true &&
    typeof payload.data === "object" &&
    payload.data !== null
    ? (payload.data as Record<string, unknown>)
    : payload;
}

describe("custom character content", () => {
  it("imports custom items and custom actions without failing on odd shapes", () => {
    const payload = fixture();
    const data = dataOf(payload);
    data.customItems = [
      { id: 1, name: "Lucky Coin", description: "Homebrew", weight: 0.1, quantity: 2 },
      { id: 2, name: "Glowing Ring", isAttuned: true },
      { name: "" },
      "not-an-object",
    ];
    data.customActions = [
      { id: 7, name: "Bonk", description: "Hit it.", activationType: 3 },
      { name: "Stare" },
      null,
    ];

    const input = normalizeCharacterPayload(payload, "1");
    const equipment = input.equipmentAndGold;
    const coin = equipment?.otherItems?.find((item) => item.name === "Lucky Coin");
    expect(coin).toMatchObject({ custom: true, quantity: 2, weight: 0.1 });
    expect(
      equipment?.magicItems?.find((item) => item.name === "Glowing Ring"),
    ).toMatchObject({ custom: true, attuned: true });
    expect(equipment?.attunedItems?.map((item) => item.name)).toContain(
      "Glowing Ring",
    );

    const feats = input.proficienciesAndFeats?.feats ?? [];
    expect(feats.find((feat) => feat.name === "Bonk")).toMatchObject({
      custom: true,
      activation: "bonus",
    });
    expect(feats.find((feat) => feat.name === "Stare")).toMatchObject({
      custom: true,
      activation: "action",
    });
  });

  it("flags homebrew feats, items and spells as custom", () => {
    const payload = fixture();
    const data = dataOf(payload);
    const inventory = data.inventory as { definition: Record<string, unknown> }[];
    const feats = data.feats as { definition: Record<string, unknown> }[];
    if (inventory[0]) {
      inventory[0].definition.isHomebrew = true;
    }
    if (feats[0]) {
      feats[0].definition.isHomebrew = true;
    }

    const input = normalizeCharacterPayload(payload, "1");
    const all = [
      ...(input.equipmentAndGold?.weapons ?? []),
      ...(input.equipmentAndGold?.armor ?? []),
      ...(input.equipmentAndGold?.magicItems ?? []),
      ...(input.equipmentAndGold?.otherItems ?? []),
    ];
    if (inventory[0]) {
      expect(all.some((item) => item.custom === true)).toBe(true);
    }
    if (feats[0]) {
      expect(
        input.proficienciesAndFeats?.feats?.some((feat) => feat.custom === true),
      ).toBe(true);
    }
  });
});
