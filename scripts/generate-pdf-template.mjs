import { mkdir, writeFile } from "node:fs/promises";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const pageWidth = 612;
const pageHeight = 792;
const navy = rgb(0.12, 0.19, 0.29);
const gray = rgb(0.36, 0.4, 0.45);
const pdf = await PDFDocument.create();
const form = pdf.getForm();
const font = await pdf.embedFont(StandardFonts.Helvetica);

pdf.setTitle("Open 5e Character Record");
pdf.setAuthor("D&D Beyond Character Shuffler contributors");
pdf.setSubject("Original, fillable three-page fifth-edition character record");

function heading(page, title, pageNumber) {
  page.drawText("OPEN 5E CHARACTER RECORD", {
    x: 40,
    y: pageHeight - 36,
    size: 9,
    font,
    color: gray,
  });
  page.drawText(title, {
    x: 40,
    y: pageHeight - 61,
    size: 18,
    font,
    color: navy,
  });
  page.drawText(`${pageNumber} / 3`, {
    x: pageWidth - 68,
    y: pageHeight - 38,
    size: 9,
    font,
    color: gray,
  });
  page.drawLine({
    start: { x: 40, y: pageHeight - 70 },
    end: { x: pageWidth - 40, y: pageHeight - 70 },
    thickness: 1,
    color: navy,
  });
}

function field(page, name, label, x, top, width, height = 28, multiline = false) {
  page.drawText(label, {
    x,
    y: pageHeight - top - 10,
    size: 8,
    font,
    color: gray,
  });
  const textField = form.createTextField(name);
  textField.setMaxLength(multiline ? 2000 : 160);
  if (multiline) {
    textField.enableMultiline();
  }
  textField.addToPage(page, {
    x,
    y: pageHeight - top - height - 14,
    width,
    height,
    font,
    fontSize: 9,
    borderWidth: 0.7,
    borderColor: rgb(0.55, 0.59, 0.64),
    backgroundColor: rgb(1, 1, 1),
  });
}

function section(page, label, top) {
  page.drawText(label.toUpperCase(), {
    x: 40,
    y: pageHeight - top - 11,
    size: 10,
    font,
    color: navy,
  });
}

const first = pdf.addPage([pageWidth, pageHeight]);
heading(first, "Identity and abilities", 1);
field(first, "identity.name", "Character name", 40, 84, 340, 28);
field(first, "identity.species", "Species", 392, 84, 180, 28);
field(first, "identity.class", "Class", 40, 130, 195, 28);
field(first, "identity.subclass", "Subclass", 247, 130, 155, 28);
field(first, "identity.level", "Level", 414, 130, 70, 28);
field(first, "identity.background", "Background", 496, 130, 76, 28);
field(first, "identity.alignment", "Alignment", 40, 176, 195, 28);
field(first, "stats.hp", "Hit points", 247, 176, 100, 28);
field(first, "stats.ac", "Armor class", 359, 176, 100, 28);
field(first, "stats.prof", "Proficiency bonus", 471, 176, 101, 28);

section(first, "Ability scores", 232);
const abilityNames = [
  ["strength", "STR"],
  ["dexterity", "DEX"],
  ["constitution", "CON"],
  ["intelligence", "INT"],
  ["wisdom", "WIS"],
  ["charisma", "CHA"],
];
abilityNames.forEach(([key, label], index) => {
  field(first, `ability.${key}`, label, 40 + index * 89, 252, 78, 28);
});

section(first, "Saving throws", 306);
abilityNames.forEach(([key, label], index) => {
  field(first, `save.${key}`, label, 40 + index * 89, 326, 78, 28);
});

section(first, "Appearance and story", 380);
field(first, "identity.appearance", "Appearance", 40, 400, 532, 50, true);
field(first, "identity.personality", "Personality traits", 40, 472, 258, 46, true);
field(first, "identity.ideals", "Ideals", 314, 472, 258, 46, true);
field(first, "identity.bonds", "Bonds", 40, 538, 258, 46, true);
field(first, "identity.flaws", "Flaws", 314, 538, 258, 46, true);
field(first, "identity.backstory", "Backstory", 40, 604, 532, 110, true);

const second = pdf.addPage([pageWidth, pageHeight]);
heading(second, "Proficiencies and equipment", 2);
section(second, "Training", 88);
field(second, "proficiency.skills", "Skills", 40, 108, 258, 104, true);
field(second, "proficiency.saves", "Saving throws", 314, 108, 258, 104, true);
field(second, "proficiency.languages", "Languages", 40, 244, 258, 76, true);
field(second, "proficiency.tools", "Tools", 314, 244, 258, 76, true);
field(second, "proficiency.armor", "Armor", 40, 350, 258, 64, true);
field(second, "proficiency.weapons", "Weapons", 314, 350, 258, 64, true);
field(second, "proficiency.feats", "Feats and features", 40, 444, 532, 82, true);
section(second, "Inventory", 548);
field(second, "equipment.weapons", "Weapons", 40, 568, 258, 66, true);
field(second, "equipment.armor", "Armor and shields", 314, 568, 258, 66, true);
field(second, "equipment.other", "Other equipment and magic items", 40, 662, 354, 72, true);
field(second, "equipment.currency", "Currency", 410, 662, 162, 72, true);

const third = pdf.addPage([pageWidth, pageHeight]);
heading(third, "Spellcasting and notes", 3);
field(third, "spellcasting.ability", "Spellcasting ability", 40, 88, 170, 28);
field(third, "spellcasting.dc", "Spell save DC", 222, 88, 150, 28);
field(third, "spellcasting.attack", "Spell attack", 384, 88, 188, 28);
field(third, "spellcasting.slots", "Spell slots", 40, 142, 532, 66, true);
field(third, "spellcasting.cantrips", "Cantrips", 40, 236, 258, 94, true);
field(third, "spellcasting.known", "Known spells", 314, 236, 258, 94, true);
field(third, "spellcasting.prepared", "Prepared spells", 40, 364, 258, 94, true);
field(third, "spellcasting.other", "Other spell notes", 314, 364, 258, 94, true);
section(third, "Notes", 492);
field(third, "notes.general", "Additional notes", 40, 512, 532, 206, true);

form.updateFieldAppearances(font);
await mkdir("assets", { recursive: true });
await writeFile(
  "assets/character-sheet-template.pdf",
  await pdf.save(),
);
