import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/export/export-service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/export/export-service.js")>();
  return { ...actual, exportActorPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])) };
});

import { createPdfHandout } from "../../src/foundry/handouts.js";

describe("PDF handout filenames", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("uses the dated PDF filename and isolates repeated handouts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 12, 12));
    const createDirectory = vi.fn(async () => ({}));
    const upload = vi.fn(async (_source: string, directory: string, file: File) => ({
      path: `${directory}/${file.name}`,
    }));
    vi.stubGlobal("foundry", {
      applications: { apps: { FilePicker: { implementation: { createDirectory, upload } } } },
    });
    Object.defineProperty(game, "world", {
      configurable: true,
      value: { id: "test-world" },
    });
    game.folders.contents = [{ id: "folder", name: "Shuffled Characters", type: "JournalEntry" }];
    const create = vi.fn(async (document: Record<string, unknown>) => ({
      id: "journal",
      name: String(document.name),
    }));
    Object.defineProperty(CONFIG, "JournalEntry", {
      configurable: true,
      value: { documentClass: { create } },
    });
    const actor: FoundryActor = {
      id: "actor-1",
      name: "Tim (Shuffled 4)",
      folder: null,
      exportToJSON: () => "{}",
      toObject: () => ({ system: { details: { class: "Barbarian" } } }),
    };

    await createPdfHandout(actor, "player");
    await createPdfHandout(actor, "player");
    const first = upload.mock.calls[0]!;
    const second = upload.mock.calls[1]!;
    expect(first[2].name).toBe("Tim (Shuffled 4)-Barbarian-2026-11-12.pdf");
    expect(second[2].name).toBe(first[2].name);
    expect(first[1]).not.toBe(second[1]);
    expect(create.mock.calls[0]![0]).toMatchObject({
      ownership: { default: 0, player: 2 },
      pages: [{ type: "pdf", src: `${first[1]}/${first[2].name}` }],
    });
  });
});
