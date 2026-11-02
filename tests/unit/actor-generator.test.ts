import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createShuffledActors } from "../../src/foundry/actor-generator.js";
import { normalizeCharacterPayload } from "../../src/import/normalize-character.js";
import { sliceCharacter } from "../../src/import/slice-character.js";
import type { ImportedCharacter } from "../../src/types/import-model.js";

function fixture(): unknown {
  return JSON.parse(
    readFileSync(
      new URL("../fixtures/ddb-character.json", import.meta.url),
      "utf8",
    ),
  ) as unknown;
}

function characters(): ImportedCharacter[] {
  return [0, 1].map((index) => {
    const input = normalizeCharacterPayload(fixture(), String(index + 1));
    input.identityBackground.name = `Hero ${index + 1}`;
    return sliceCharacter(input);
  });
}

function packItem(
  id: string,
  name: string,
  type: string,
  system: Record<string, unknown>,
) {
  return {
    id,
    name,
    type,
    system,
    toObject: () => ({ _id: id, name, type, system: structuredClone(system) }),
  };
}

function installPack() {
  const items = [
    packItem("class", "Sample Class", "class", {
      hd: { denomination: "d8" },
      spellcasting: { ability: "int" },
    }),
    packItem("armor", "Sample Armor", "equipment", {
      armor: { value: 14, dex: 2, type: "medium" },
    }),
    packItem("cantrip", "Sample Cantrip", "spell", {
      level: 0,
      preparation: { mode: "prepared", prepared: false },
    }),
    packItem("spell", "Sample Spell", "spell", {
      level: 2,
      preparation: { mode: "prepared", prepared: false },
    }),
  ];
  game.packs = [
    {
      documentName: "Item",
      metadata: { id: "dnd5e.test" },
      getIndex: vi.fn(async () =>
        items.map((item) => ({
          _id: item.id,
          name: item.name,
          type: item.type,
        })),
      ),
      getDocument: vi.fn(async (id: string) =>
        items.find((item) => item.id === id) ?? null,
      ),
    },
  ];
}

describe("createShuffledActors", () => {
  beforeEach(() => {
    installPack();
    game.folders.contents = [];
    game.actors.contents = [];
    game.system.config.skills = {
      prc: { label: "Perception", ability: "wis" },
    };
    const createFolder = vi
      .fn()
      .mockImplementation(async (data: { name: string; type: string }) => ({
        id: "folder-1",
        ...data,
      }));
    const createDocuments = vi
      .fn()
      .mockImplementation(async (documents: readonly Record<string, unknown>[]) =>
        documents.map((data, index) => ({
          id: `actor-${index + 1}`,
          name: data.name,
          folder: data.folder,
          exportToJSON: () => JSON.stringify(data),
          toObject: () => structuredClone(data),
        })),
      );
    CONFIG.Folder.documentClass.create =
      createFolder as typeof CONFIG.Folder.documentClass.create;
    CONFIG.Actor.documentClass.createDocuments =
      createDocuments as typeof CONFIG.Actor.documentClass.createDocuments;
  });

  it("preflights the whole batch and creates new Actors in the dedicated folder", async () => {
    game.actors.contents = [
      {
        id: "existing",
        name: "Hero 1 (Shuffled 1)",
        folder: null,
        exportToJSON: () => "{}",
        toObject: () => ({}),
      },
    ];
    let value = 0.41;
    const result = await createShuffledActors(characters(), () => {
      value = (value + 0.618033988749895) % 1;
      return value;
    });

    expect(result.actors).toHaveLength(2);
    expect(result.actors.map((actor) => actor.folder)).toEqual([
      "folder-1",
      "folder-1",
    ]);
    expect(result.actors[0]?.name).toContain("(Shuffled");
    const createDocuments = CONFIG.Actor.documentClass
      .createDocuments as ReturnType<typeof vi.fn>;
    expect(createDocuments).toHaveBeenCalledOnce();
    expect(createDocuments.mock.calls[0]?.[0]).toHaveLength(2);
    expect(result.warnings.some((warning) => warning.includes("custom loot"))).toBe(
      true,
    );
  });

  it("creates no Actors or folder when essential class metadata is missing", async () => {
    game.packs = [];

    await expect(createShuffledActors(characters(), () => 0.5)).rejects.toThrow(
      /No D&D 5e compendium class matches/,
    );
    expect(CONFIG.Actor.documentClass.createDocuments).not.toHaveBeenCalled();
    expect(CONFIG.Folder.documentClass.create).not.toHaveBeenCalled();
  });
});
