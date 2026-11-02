import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  exportActorJson,
  exportActorsJsonZip,
  exportActorPdf,
  pdfTemplateFieldNames,
} from "../../src/export/export-service.js";

function actor(): FoundryActor {
  const data = {
    name: "Synthetic Hero",
    type: "character",
    system: {
      details: {
        level: 5,
        class: "Wizard",
        subclass: "Evoker",
        race: "Synthetic Species",
        background: "Sage",
        alignment: "Neutral",
        biography: { value: "Synthetic backstory." },
      },
      attributes: {
        hp: { value: 33, max: 33 },
        ac: { value: 16 },
        prof: 3,
        spellcasting: "int",
        spelldc: 12,
        spellattack: 4,
      },
      abilities: {
        str: { value: 15, proficient: 0 },
        dex: { value: 14, proficient: 0 },
        con: { value: 13, proficient: 0 },
        int: { value: 12, proficient: 1 },
        wis: { value: 10, proficient: 1 },
        cha: { value: 8, proficient: 0 },
      },
      traits: {
        languages: { value: ["common"], custom: "" },
        armorProf: { value: [], custom: "" },
        weaponProf: { value: [], custom: "" },
        toolProf: { value: [], custom: "" },
      },
      skills: { prc: { value: 1 } },
      currency: { pp: 1, gp: 25, ep: 0, sp: 2, cp: 1 },
      spells: { spell1: { value: 4, max: "4" } },
    },
    items: [
      { name: "Sample Cantrip", type: "spell", system: { level: 0 } },
      { name: "Sample Spell", type: "spell", system: { level: 2 } },
      { name: "Sample Weapon", type: "weapon", system: {} },
    ],
    flags: {
      "d-d-character-randomizer": {
        narrative: {
          appearance: "Synthetic appearance.",
          personalityTraits: "Synthetic personality.",
          ideals: "Synthetic ideal.",
          bonds: "Synthetic bond.",
          flaws: "Synthetic flaw.",
          backstory: "Synthetic backstory.",
        },
      },
    },
  };
  return {
    id: "actor-1",
    name: "Synthetic Hero",
    folder: "folder-1",
    exportToJSON: () => JSON.stringify(data),
    toObject: () => structuredClone(data),
  };
}

describe("exportService", () => {
  it("exports valid native Actor JSON", async () => {
    const json = await exportActorJson(actor());
    expect(JSON.parse(json)).toMatchObject({
      type: "character",
      name: "Synthetic Hero",
    });
    await expect(
      exportActorJson({
        ...actor(),
        exportToJSON: () => "not-json",
      }),
    ).rejects.toThrow("Foundry returned invalid Actor JSON.");
  });

  it("exports each Actor as an individual file in a batch ZIP", async () => {
    const secondActor = {
      ...actor(),
      id: "actor-2",
      name: "Synthetic Hero",
    };
    const archive = await exportActorsJsonZip([actor(), secondActor]);
    const files = unzipSync(archive);
    const names = Object.keys(files);

    expect(names).toHaveLength(2);
    expect(names).toContain("Synthetic Hero-actor-1.json");
    expect(names).toContain("Synthetic Hero-actor-2.json");
    expect(JSON.parse(strFromU8(files[names[0]!]!))).toMatchObject({
      type: "character",
      name: "Synthetic Hero",
    });
  });

  it("fills all three pages of the bundled fillable template", async () => {
    const template = new Uint8Array(
      readFileSync("assets/character-sheet-template.pdf"),
    );
    const result = await exportActorPdf(actor(), template);
    const pdf = await PDFDocument.load(result);
    const form = pdf.getForm();

    expect(pdf.getPageCount()).toBe(3);
    expect(form.getTextField("identity.name").getText()).toBe("Synthetic Hero");
    expect(form.getTextField("stats.hp").getText()).toBe("33");
    expect(form.getTextField("identity.appearance").getText()).toBe(
      "Synthetic appearance.",
    );
    expect(form.getTextField("spellcasting.known").getText()).toContain(
      "Sample Spell",
    );
    expect(form.getFields()).toHaveLength(pdfTemplateFieldNames().length);
  });

  it("fails explicitly if the template is not the expected fillable form", async () => {
    const invalidTemplate = await PDFDocument.create();
    invalidTemplate.addPage();

    await expect(
      exportActorPdf(actor(), await invalidTemplate.save()),
    ).rejects.toThrow(/missing the identity.name field/);
  });
});
