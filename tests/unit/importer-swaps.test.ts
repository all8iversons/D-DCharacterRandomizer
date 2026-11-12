import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { importService } from "../../src/import/import-service.js";
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
});
