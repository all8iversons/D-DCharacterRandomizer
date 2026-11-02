import { mkdir, writeFile } from "node:fs/promises";
import {
  PDFDocument,
  StandardFonts,
  TextAlignment,
  rgb,
} from "pdf-lib";

const W = 612;
const H = 792;
const navy = rgb(0.12, 0.19, 0.29);
const red = rgb(0.6, 0.12, 0.12);
const gray = rgb(0.38, 0.42, 0.47);
const line = rgb(0.55, 0.59, 0.64);
const white = rgb(1, 1, 1);
const ink = rgb(0.08, 0.08, 0.1);

const pdf = await PDFDocument.create();
const form = pdf.getForm();
const font = await pdf.embedFont(StandardFonts.Helvetica);
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

pdf.setTitle("Open 5e Character Sheet");
pdf.setAuthor("D&D Beyond Character Shuffler contributors");
pdf.setSubject("Original, fillable six-page fifth-edition character sheet");

const ABILITIES = [
  ["strength", "STR", "STRENGTH"],
  ["dexterity", "DEX", "DEXTERITY"],
  ["constitution", "CON", "CONSTITUTION"],
  ["intelligence", "INT", "INTELLIGENCE"],
  ["wisdom", "WIS", "WISDOM"],
  ["charisma", "CHA", "CHARISMA"],
];
const SKILLS = [
  ["acr", "Acrobatics", "DEX"],
  ["ani", "Animal Handling", "WIS"],
  ["arc", "Arcana", "INT"],
  ["ath", "Athletics", "STR"],
  ["dec", "Deception", "CHA"],
  ["his", "History", "INT"],
  ["ins", "Insight", "WIS"],
  ["itm", "Intimidation", "CHA"],
  ["inv", "Investigation", "INT"],
  ["med", "Medicine", "WIS"],
  ["nat", "Nature", "INT"],
  ["prc", "Perception", "WIS"],
  ["prf", "Performance", "CHA"],
  ["per", "Persuasion", "CHA"],
  ["rel", "Religion", "INT"],
  ["slt", "Sleight of Hand", "DEX"],
  ["ste", "Stealth", "DEX"],
  ["sur", "Survival", "WIS"],
];

const fields = new Map();

function text(page, value, x, top, size = 8, options = {}) {
  page.drawText(value, {
    x,
    y: H - top - size,
    size,
    font: options.bold ? bold : font,
    color: options.color ?? ink,
  });
}

// Top-origin text field; reusing a name adds another widget to the same field.
function input(page, name, x, top, w, h, options = {}) {
  let field = fields.get(name);
  let created = false;
  if (!field) {
    field = form.createTextField(name);
    if (options.multiline) {
      field.enableMultiline();
    }
    if (options.center) {
      field.setAlignment(TextAlignment.Center);
    }
    fields.set(name, field);
    created = true;
  }
  field.addToPage(page, {
    x,
    y: H - top - h,
    width: w,
    height: h,
    font,
    textColor: ink,
    borderWidth: options.borderless ? 0 : 0.6,
    borderColor: line,
    backgroundColor: white,
  });
  if (created) {
    field.setFontSize(options.size ?? 9);
  }
}

function labeled(page, name, label, x, top, w, h, options = {}) {
  text(page, label, x, top, 6, { color: gray, bold: true });
  input(page, name, x, top + 8, w, h, options);
}

function panel(page, title, x, top, w, h) {
  page.drawRectangle({
    x,
    y: H - top - h,
    width: w,
    height: h,
    borderColor: navy,
    borderWidth: 1,
  });
  page.drawRectangle({
    x,
    y: H - top - 12,
    width: w,
    height: 12,
    color: navy,
  });
  text(page, title, x + 5, top + 2.5, 7, { color: white, bold: true });
}

function circles(page, x, top, count) {
  for (let index = 0; index < count; index += 1) {
    page.drawCircle({
      x: x + index * 14,
      y: H - top - 5,
      size: 5,
      borderColor: navy,
      borderWidth: 0.8,
    });
  }
}

function footer(page, number) {
  text(
    page,
    `Original CC0-1.0 template - D&D Beyond Character Shuffler - Page ${number} of 6`,
    24,
    778,
    6,
    { color: gray },
  );
}

function header(page) {
  page.drawRectangle({ x: 24, y: H - 76, width: 250, height: 56, color: navy });
  text(page, "CHARACTER NAME", 30, 24, 6, { color: white, bold: true });
  input(page, "identity.name", 28, 34, 242, 38, { size: 16 });
  labeled(page, "identity.class", "CLASS", 282, 20, 100, 18);
  labeled(page, "identity.subclass", "SUBCLASS", 386, 20, 100, 18);
  labeled(page, "identity.level", "LEVEL", 490, 20, 40, 18, { center: true });
  labeled(page, "identity.xp", "XP", 534, 20, 54, 18);
  labeled(page, "identity.species", "SPECIES", 282, 48, 100, 18);
  labeled(page, "identity.background", "BACKGROUND", 386, 48, 100, 18);
  labeled(page, "identity.player", "PLAYER", 490, 48, 98, 18);
}

// Page 1 -------------------------------------------------------------------
const p1 = pdf.addPage([W, H]);
header(p1);

ABILITIES.forEach(([name, , label], index) => {
  const top = 84 + index * 66;
  p1.drawRectangle({ x: 24, y: H - top - 62, width: 62, height: 62, borderColor: navy, borderWidth: 1 });
  p1.drawRectangle({ x: 24, y: H - top - 12, width: 62, height: 12, color: navy });
  text(p1, label, 27, top + 3, 6, { color: white, bold: true });
  input(p1, `ability.${name}`, 30, top + 16, 50, 24, { size: 14, center: true });
  input(p1, `mod.${name}`, 37, top + 44, 36, 14, { size: 9, center: true });
});

panel(p1, "SAVING THROWS", 92, 84, 170, 114);
ABILITIES.forEach(([name, short], index) => {
  const top = 100 + index * 16;
  input(p1, `save.${name}`, 96, top, 44, 13, { size: 8, center: true });
  text(p1, short, 146, top + 3, 8, { bold: true });
});

panel(p1, "SKILLS", 92, 204, 170, 292);
SKILLS.forEach(([key, label, tag], index) => {
  const top = 220 + index * 15;
  input(p1, `skill.${key}`, 96, top, 36, 12, { size: 7.5, center: true });
  text(p1, label, 136, top + 2.5, 8);
  text(p1, tag, 238, top + 3, 6, { color: red, bold: true });
});
text(p1, "P = proficient  E = expertise  H = half", 96, 490, 5.5, { color: gray });

const statBoxes = [
  ["stats.initiative", "INITIATIVE", 270, 84],
  ["stats.ac", "ARMOR CLASS", 348, 84],
  ["stats.speed", "SPEED", 270, 120],
  ["stats.inspiration", "INSPIRATION", 348, 120],
  ["stats.prof", "PROFICIENCY", 270, 156],
  ["spellcasting.dc", "SPELL SAVE DC", 348, 156],
];
for (const [name, label, x, top] of statBoxes) {
  labeled(p1, name, label, x, top, 72, 24, { size: 12, center: true });
}

panel(p1, "HIT POINTS", 428, 84, 160, 76);
labeled(p1, "stats.hp", "MAX", 434, 98, 46, 24, { size: 12, center: true });
labeled(p1, "stats.hpcurrent", "CURRENT", 484, 98, 46, 24, { size: 12, center: true });
labeled(p1, "stats.hptemp", "TEMP", 534, 98, 46, 24, { size: 12, center: true });
labeled(p1, "stats.hitdice", "HIT DICE", 434, 130, 146, 14, { size: 9, center: true });

panel(p1, "DEATH SAVES", 428, 166, 160, 40);
text(p1, "SUCCESSES", 434, 183, 6, { color: gray, bold: true });
circles(p1, 490, 182, 3);
text(p1, "FAILURES", 434, 195, 6, { color: gray, bold: true });
circles(p1, 490, 194, 3);

panel(p1, "PROFICIENCIES & TRAINING", 270, 212, 318, 204);
labeled(p1, "proficiency.armor", "ARMOR", 276, 228, 152, 78, { multiline: true, size: 8 });
labeled(p1, "proficiency.weapons", "WEAPONS", 432, 228, 152, 78, { multiline: true, size: 8 });
labeled(p1, "proficiency.tools", "TOOLS", 276, 322, 152, 78, { multiline: true, size: 8 });
labeled(p1, "proficiency.languages", "LANGUAGES", 432, 322, 152, 78, { multiline: true, size: 8 });

panel(p1, "ACTIONS", 270, 422, 318, 176);
input(p1, "actions.list", 276, 438, 306, 154, { multiline: true, size: 8 });

panel(p1, "PASSIVE SENSES", 24, 500, 238, 98);
labeled(p1, "passive.perception", "PERCEPTION", 30, 516, 72, 16, { size: 10, center: true });
labeled(p1, "passive.investigation", "INVESTIGATION", 108, 516, 72, 16, { size: 10, center: true });
labeled(p1, "passive.insight", "INSIGHT", 186, 516, 70, 16, { size: 10, center: true });
labeled(p1, "senses.list", "SENSES", 30, 548, 226, 42, { multiline: true, size: 8 });

panel(p1, "WEAPON ATTACKS & CANTRIPS", 24, 604, 564, 150);
text(p1, "NAME", 30, 618, 6, { color: gray, bold: true });
text(p1, "HIT / DC", 204, 618, 6, { color: gray, bold: true });
text(p1, "DAMAGE / TYPE", 258, 618, 6, { color: gray, bold: true });
text(p1, "NOTES", 392, 618, 6, { color: gray, bold: true });
input(p1, "attacks.name", 28, 626, 172, 124, { multiline: true, size: 8 });
input(p1, "attacks.hit", 202, 626, 52, 124, { multiline: true, size: 8 });
input(p1, "attacks.damage", 256, 626, 132, 124, { multiline: true, size: 8 });
input(p1, "attacks.notes", 390, 626, 194, 124, { multiline: true, size: 8 });
footer(p1, 1);

// Pages 2-4 ----------------------------------------------------------------
const featureTitles = ["FEATURES & TRAITS", "ADDITIONAL FEATURES & TRAITS", "ADDITIONAL FEATURES & TRAITS (CONTINUED)"];
const equipmentTitles = ["EQUIPMENT", "ADDITIONAL EQUIPMENT", "ADDITIONAL EQUIPMENT (CONTINUED)"];
["p2", "p3", "p4"].forEach((tag, pageIndex) => {
  const page = pdf.addPage([W, H]);
  header(page);
  panel(page, featureTitles[pageIndex], 24, 84, 564, 396);
  [1, 2, 3].forEach((column) => {
    input(page, `features.${tag}c${column}`, 30 + (column - 1) * 185, 100, 180, 366, {
      multiline: true,
      size: 8,
      borderless: true,
    });
  });

  panel(page, equipmentTitles[pageIndex], 24, 486, 564, 268);
  if (pageIndex === 0) {
    ["cp", "sp", "ep", "gp", "pp"].forEach((coin, index) => {
      labeled(page, `equipment.${coin}`, coin.toUpperCase(), 30 + index * 60, 502, 54, 20, { center: true });
    });
    labeled(page, "equipment.weight", "WEIGHT CARRIED", 340, 502, 120, 20, { center: true });
    text(page, "NAME   QTY   WEIGHT   [E] equipped  [A] attuned", 30, 536, 6, { color: gray, bold: true });
    input(page, "equipment.col1", 30, 546, 272, 140, { multiline: true, size: 8 });
    input(page, "equipment.col2", 310, 546, 272, 140, { multiline: true, size: 8 });
    labeled(page, "equipment.attuned", "ATTUNED MAGIC ITEMS", 30, 692, 552, 46, { multiline: true, size: 8 });
  } else {
    const names = pageIndex === 1 ? ["equipment.add1", "equipment.add2"] : ["equipment.more1", "equipment.more2"];
    input(page, names[0], 30, 504, 272, 240, { multiline: true, size: 8 });
    input(page, names[1], 310, 504, 272, 240, { multiline: true, size: 8 });
  }
  footer(page, pageIndex + 2);
});

// Page 5 -------------------------------------------------------------------
const p5 = pdf.addPage([W, H]);
p5.drawRectangle({ x: 24, y: H - 76, width: 250, height: 56, color: navy });
text(p5, "CHARACTER NAME", 30, 24, 6, { color: white, bold: true });
input(p5, "identity.name", 28, 34, 242, 38, { size: 16 });
[
  ["details.gender", "GENDER"],
  ["details.age", "AGE"],
  ["details.size", "SIZE"],
  ["details.height", "HEIGHT"],
  ["details.weight", "WEIGHT"],
  ["identity.alignment", "ALIGNMENT"],
  ["details.faith", "FAITH"],
  ["details.skin", "SKIN"],
  ["details.eyes", "EYES"],
  ["details.hair", "HAIR"],
].forEach(([name, label], index) => {
  labeled(p5, name, label, 282 + (index % 5) * 62, 20 + Math.floor(index / 5) * 28, 58, 18);
});

panel(p5, "CHARACTER APPEARANCE", 24, 84, 564, 190);
input(p5, "identity.appearance", 30, 100, 360, 168, { multiline: true });
p5.drawRectangle({ x: 398, y: H - 268, width: 184, height: 168, borderColor: line, borderWidth: 0.8 });
text(p5, "Character image", 454, 176, 8, { color: gray });

panel(p5, "ALLIES & ORGANIZATIONS", 24, 280, 564, 80);
input(p5, "details.allies", 30, 296, 552, 58, { multiline: true });
panel(p5, "PERSONALITY TRAITS", 24, 366, 276, 72);
input(p5, "identity.personality", 29, 382, 266, 50, { multiline: true });
panel(p5, "IDEALS", 312, 366, 276, 72);
input(p5, "identity.ideals", 317, 382, 266, 50, { multiline: true });
panel(p5, "BONDS", 24, 444, 276, 72);
input(p5, "identity.bonds", 29, 460, 266, 50, { multiline: true });
panel(p5, "FLAWS", 312, 444, 276, 72);
input(p5, "identity.flaws", 317, 460, 266, 50, { multiline: true });
panel(p5, "CHARACTER BACKSTORY", 24, 522, 564, 150);
input(p5, "identity.backstory", 30, 538, 552, 128, { multiline: true });
panel(p5, "ADDITIONAL NOTES", 24, 678, 564, 76);
input(p5, "notes.general", 30, 694, 552, 54, { multiline: true });
footer(p5, 5);

// Page 6 -------------------------------------------------------------------
const p6 = pdf.addPage([W, H]);
header(p6);
labeled(p6, "spellcasting.class", "SPELLCASTING CLASS", 24, 82, 190, 20);
labeled(p6, "spellcasting.ability", "SPELLCASTING ABILITY", 222, 82, 130, 20, { center: true });
labeled(p6, "spellcasting.dc", "SPELL SAVE DC", 360, 82, 110, 20, { center: true });
labeled(p6, "spellcasting.attack", "SPELL ATTACK BONUS", 478, 82, 110, 20, { center: true });
labeled(p6, "spellcasting.slots", "SPELL SLOTS", 24, 116, 564, 22, { size: 9 });

const levelTitles = ["CANTRIPS", "1ST LEVEL", "2ND LEVEL", "3RD LEVEL", "4TH LEVEL", "5TH LEVEL", "6TH LEVEL", "7TH LEVEL", "8TH LEVEL", "9TH LEVEL"];
function spellPanel(level, x, top, h) {
  panel(p6, `${levelTitles[level]}   [P] prepared`, x, top, 276, h);
  input(p6, `spells.level${level}`, x + 4, top + 15, 268, h - 19, { multiline: true, size: 8 });
}
[0, 1, 2].forEach((level, index) => spellPanel(level, 24, 154 + index * 203, 194));
[3, 4, 5, 6, 7, 8, 9].forEach((level, index) => spellPanel(level, 312, 154 + index * 86, 79));
footer(p6, 6);

form.updateFieldAppearances(font);
await mkdir("assets", { recursive: true });
await writeFile("assets/character-sheet-template.pdf", await pdf.save());
