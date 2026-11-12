import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportService, importService } from "../../src/import/import-service.js";
import { normalizeCharacterPayload } from "../../src/import/normalize-character.js";
import { sliceCharacter } from "../../src/import/slice-character.js";
import type { ShuffledCharacter } from "../../src/types/shuffle-model.js";

class MockApplication {
  render() {
    return this;
  }
  async _prepareContext() {
    return {};
  }
}

function target(first: string, category: string, second: string): HTMLElement {
  const values: Record<string, string> = {
    "[name='swap-first']": first,
    "[name='swap-category']": category,
    "[name='swap-second']": second,
  };
  return {
    closest: () => ({
      querySelector: (selector: string) => ({ value: values[selector] }),
    }),
  } as unknown as HTMLElement;
}

describe("importer manual swaps", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("applies the selected swap to the preview and resets it on reshuffle", async () => {
    vi.stubGlobal("foundry", {
      applications: {
        api: {
          ApplicationV2: MockApplication,
          HandlebarsApplicationMixin: (base: typeof MockApplication) => base,
        },
      },
    });
    const data: unknown = JSON.parse(
      readFileSync(new URL("../fixtures/ddb-character.json", import.meta.url), "utf8"),
    );
    const characters = [0, 1, 2].map((index) => {
      const input = normalizeCharacterPayload(data, String(index + 1));
      input.identityBackground.name = `Character ${index}`;
      return sliceCharacter(input);
    });
    vi.spyOn(importService, "characters", "get").mockReturnValue(characters);
    vi.spyOn(importService, "canShuffle", "get").mockReturnValue(true);
    Object.defineProperty(game, "users", {
      configurable: true,
      value: { contents: [] },
    });
    const { DdbImporterApplication } = await import("../../src/applications/importer.js");
    const app = new DdbImporterApplication();
    const event = { preventDefault: vi.fn() } as unknown as Event;
    DdbImporterApplication.DEFAULT_OPTIONS.actions["shuffle-preview"].call(app, event);
    const before = await app._prepareContext({});
    const original = before.shuffledPreview as ShuffledCharacter[];
    DdbImporterApplication.DEFAULT_OPTIONS.actions["swap-slices"].call(
      app, event, target("0", "spellcasting", "1"),
    );
    const after = await app._prepareContext({});
    const swapped = after.shuffledPreview as ShuffledCharacter[];
    expect(swapped[0]!.origins.spellcasting).toEqual(original[1]!.origins.spellcasting);
    expect(swapped[1]!.origins.spellcasting).toEqual(original[0]!.origins.spellcasting);
    expect(after.statusMessage).toContain("Slices swapped");

    DdbImporterApplication.DEFAULT_OPTIONS.actions["swap-slices"].call(
      app, event, target("0", "spellcasting", "0"),
    );
    const invalid = await app._prepareContext({});
    expect(invalid.errorMessage).toContain("two different hybrids");
    expect(invalid.shuffledPreview).toEqual(after.shuffledPreview);

    DdbImporterApplication.DEFAULT_OPTIONS.actions["shuffle-preview"].call(app, event);
    const reshuffled = await app._prepareContext({});
    expect(reshuffled.manualWarnings).toEqual([]);
    expect(reshuffled.statusMessage).toContain("Reshuffled");
  });

  it("removes a character and clears a manual preview", async () => {
    vi.stubGlobal("foundry", {
      applications: {
        api: {
          ApplicationV2: MockApplication,
          HandlebarsApplicationMixin: (base: typeof MockApplication) => base,
        },
      },
    });
    const data: unknown = JSON.parse(
      readFileSync(new URL("../fixtures/ddb-character.json", import.meta.url), "utf8"),
    );
    const service = new ImportService(async () => data);
    await service.importCharacter("1");
    await service.importCharacter("2");
    vi.spyOn(importService, "characters", "get").mockImplementation(() => service.characters);
    vi.spyOn(importService, "canShuffle", "get").mockImplementation(() => service.canShuffle);
    vi.spyOn(importService, "revision", "get").mockImplementation(() => service.revision);
    vi.spyOn(importService, "removeCharacter").mockImplementation(
      (index, id, revision) => service.removeCharacter(index, id, revision),
    );
    Object.defineProperty(game, "users", { configurable: true, value: { contents: [] } });
    const { DdbImporterApplication } = await import("../../src/applications/importer.js");
    const app = new DdbImporterApplication();
    const event = { preventDefault: vi.fn() } as unknown as Event;
    DdbImporterApplication.DEFAULT_OPTIONS.actions["shuffle-preview"].call(app, event);
    DdbImporterApplication.DEFAULT_OPTIONS.actions["swap-slices"].call(
      app, event, target("0", "spellcasting", "1"),
    );
    const removalTarget = {
      dataset: { characterIndex: "0", characterId: "1", rosterRevision: String(service.revision) },
    } as unknown as HTMLElement;
    DdbImporterApplication.DEFAULT_OPTIONS.actions["remove-character"].call(app, event, removalTarget);
    const context = await app._prepareContext({});
    expect(context.characterCount).toBe(1);
    expect(context.canShuffle).toBe(false);
    expect(context.hasShufflePreview).toBe(false);
    expect(context.manualWarnings).toEqual([]);
    expect(context.statusMessage).toContain("shuffle preview was cleared");
    expect(context.statusMessage).toContain("Existing Actors were not affected");
    DdbImporterApplication.DEFAULT_OPTIONS.actions["remove-character"].call(app, event, removalTarget);
    const stale = await app._prepareContext({});
    expect(stale.errorMessage).toContain("list has changed");
    expect(stale.characterCount).toBe(1);
  });

  it("invalidates another window's preview after a roster change", async () => {
    vi.stubGlobal("foundry", {
      applications: { api: { ApplicationV2: MockApplication, HandlebarsApplicationMixin: (base: typeof MockApplication) => base } },
    });
    const data: unknown = JSON.parse(
      readFileSync(new URL("../fixtures/ddb-character.json", import.meta.url), "utf8"),
    );
    const service = new ImportService(async () => data);
    await service.importCharacter("1");
    await service.importCharacter("2");
    vi.spyOn(importService, "characters", "get").mockImplementation(() => service.characters);
    vi.spyOn(importService, "canShuffle", "get").mockImplementation(() => service.canShuffle);
    vi.spyOn(importService, "revision", "get").mockImplementation(() => service.revision);
    Object.defineProperty(game, "users", { configurable: true, value: { contents: [] } });
    const { DdbImporterApplication } = await import("../../src/applications/importer.js");
    const app = new DdbImporterApplication();
    const event = { preventDefault: vi.fn() } as unknown as Event;
    DdbImporterApplication.DEFAULT_OPTIONS.actions["shuffle-preview"].call(app, event);
    service.removeCharacter(0, "1", service.revision);
    await DdbImporterApplication.DEFAULT_OPTIONS.actions["create-actors"].call(app, event);
    const context = await app._prepareContext({});
    expect(context.hasShufflePreview).toBe(false);
    expect(context.statusMessage).toContain("list changed");
  });
});
