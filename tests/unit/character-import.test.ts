import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { ImportFailure } from "../../src/import/import-errors.js";
import {
  ImportService,
  type CharacterPayloadFetcher,
} from "../../src/import/import-service.js";

function readFixture(): unknown {
  return JSON.parse(
    readFileSync(
      new URL("../fixtures/ddb-character.json", import.meta.url),
      "utf8",
    ),
  ) as unknown;
}

describe("ImportService", () => {
  it("adds a character only after fetch, validation, and slicing succeed", async () => {
    const fetchPayload = vi.fn<CharacterPayloadFetcher>().mockResolvedValue(
      readFixture(),
    );
    const service = new ImportService(fetchPayload);

    expect(service.canShuffle).toBe(false);
    const first = await service.importCharacter("https://www.dndbeyond.com/characters/12345");
    expect(first.sourceCharacterId).toBe("12345");
    expect(Object.keys(first.slices)).toHaveLength(6);
    expect(service.characters).toHaveLength(1);
    expect(service.canShuffle).toBe(false);

    await service.importCharacter("67890");
    expect(service.characters).toHaveLength(2);
    expect(service.canShuffle).toBe(true);
    expect(fetchPayload).toHaveBeenNthCalledWith(1, "12345");
    expect(fetchPayload).toHaveBeenNthCalledWith(2, "67890");
  });

  it("rejects malformed input before making a request", async () => {
    const fetchPayload = vi.fn<CharacterPayloadFetcher>();
    const service = new ImportService(fetchPayload);

    await expect(service.importCharacter("https://example.com/characters/1")).rejects.toMatchObject({
      details: { category: "invalid-input" },
    });
    expect(fetchPayload).not.toHaveBeenCalled();
  });

  it("preserves previously loaded characters when a later payload is invalid", async () => {
    const fetchPayload = vi
      .fn<CharacterPayloadFetcher>()
      .mockResolvedValueOnce(readFixture())
      .mockResolvedValueOnce({ data: { name: "Incomplete" } });
    const service = new ImportService(fetchPayload);
    const first = await service.importCharacter("12345");

    await expect(service.importCharacter("67890")).rejects.toBeInstanceOf(
      ImportFailure,
    );

    expect(service.characters).toEqual([first]);
  });

  it("returns defensive copies so UI edits cannot corrupt loaded imports", async () => {
    const service = new ImportService(async () => readFixture());
    await service.importCharacter("12345");

    const exposed = service.characters;
    const exposedCharacter = exposed[0];
    if (!exposedCharacter) {
      throw new Error("Expected an imported character");
    }
    exposedCharacter.slices.identityBackground.name = "Changed display copy";

    expect(service.characters[0]?.name).toBe("Sample Character");
  });

  it("removes one selected import, supports duplicates and reimport, and rejects stale selections", async () => {
    const service = new ImportService(async () => readFixture(), async () => ["12345"]);
    await service.importCharacter("12345");
    await service.importCharacter("12345");
    await service.importCharacter("67890");
    const revision = service.revision;

    expect(() => service.removeCharacter(0, "67890", revision)).toThrow(RangeError);
    expect(() => service.removeCharacter(10, "12345", revision)).toThrow(RangeError);
    expect(service.removeCharacter(1, "12345", revision).sourceCharacterId).toBe("12345");
    expect(service.characters.map((character) => character.sourceCharacterId)).toEqual(["12345", "67890"]);
    expect(service.canShuffle).toBe(true);
    expect(() => service.removeCharacter(0, "12345", revision)).toThrow(/changed/);
    service.removeCharacter(0, "12345", service.revision);
    expect(service.canShuffle).toBe(false);
    const result = await service.importCampaign("111");
    expect(result.imported.map((character) => character.sourceCharacterId)).toEqual(["12345"]);
    expect(service.canShuffle).toBe(true);
  });
});
