import { strToU8, zipSync } from "fflate";
import { PDFDocument, StandardFonts } from "pdf-lib";

type JsonRecord = Record<string, unknown>;

const ABILITY_ID_TO_NAME: Readonly<Record<string, string>> = {
  str: "strength",
  dex: "dexterity",
  con: "constitution",
  int: "intelligence",
  wis: "wisdom",
  cha: "charisma",
};

const PDF_FIELD_NAMES = [
  "identity.name",
  "identity.species",
  "identity.class",
  "identity.subclass",
  "identity.level",
  "identity.background",
  "identity.alignment",
  "stats.hp",
  "stats.ac",
  "stats.prof",
  "ability.strength",
  "ability.dexterity",
  "ability.constitution",
  "ability.intelligence",
  "ability.wisdom",
  "ability.charisma",
  "save.strength",
  "save.dexterity",
  "save.constitution",
  "save.intelligence",
  "save.wisdom",
  "save.charisma",
  "identity.appearance",
  "identity.personality",
  "identity.ideals",
  "identity.bonds",
  "identity.flaws",
  "identity.backstory",
  "proficiency.skills",
  "proficiency.saves",
  "proficiency.languages",
  "proficiency.tools",
  "proficiency.armor",
  "proficiency.weapons",
  "proficiency.feats",
  "equipment.weapons",
  "equipment.armor",
  "equipment.other",
  "equipment.currency",
  "spellcasting.ability",
  "spellcasting.dc",
  "spellcasting.attack",
  "spellcasting.slots",
  "spellcasting.cantrips",
  "spellcasting.known",
  "spellcasting.prepared",
  "spellcasting.other",
  "notes.general",
] as const;

export class ExportFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportFailure";
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordAt(value: unknown, key: string): JsonRecord {
  if (!isRecord(value) || !isRecord(value[key])) {
    return {};
  }
  return value[key];
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

function entries(value: unknown): readonly JsonRecord[] {
  return Array.isArray(value)
    ? value.filter(isRecord)
    : [];
}

function listText(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }
  return value.map(text).filter(Boolean).join(", ");
}

function actorFieldValues(actorData: JsonRecord): Record<string, string> {
  const system = recordAt(actorData, "system");
  const details = recordAt(system, "details");
  const attributes = recordAt(system, "attributes");
  const hp = recordAt(attributes, "hp");
  const ac = recordAt(attributes, "ac");
  const abilities = recordAt(system, "abilities");
  const traits = recordAt(system, "traits");
  const languages = recordAt(traits, "languages");
  const armorProf = recordAt(traits, "armorProf");
  const weaponProf = recordAt(traits, "weaponProf");
  const toolProf = recordAt(traits, "toolProf");
  const currency = recordAt(system, "currency");
  const biography = recordAt(details, "biography");
  const flags = recordAt(actorData, "flags");
  const moduleFlags = recordAt(flags, "d-d-character-randomizer");
  const narrative = recordAt(moduleFlags, "narrative");
  const items = entries(actorData.items);
  const values: Record<string, string> = {
    "identity.name": text(actorData.name),
    "identity.species": text(details.race),
    "identity.class": text(details.class),
    "identity.subclass": text(details.subclass),
    "identity.level": text(details.level),
    "identity.background": text(details.background),
    "identity.alignment": text(details.alignment),
    "stats.hp": text(hp.max ?? hp.value),
    "stats.ac": text(ac.value),
    "stats.prof": text(attributes.prof),
    "identity.appearance": text(narrative.appearance),
    "identity.personality": text(narrative.personalityTraits),
    "identity.ideals": text(narrative.ideals),
    "identity.bonds": text(narrative.bonds),
    "identity.flaws": text(narrative.flaws),
    "identity.backstory": text(narrative.backstory) || text(biography.value),
    "proficiency.skills": "",
    "proficiency.saves": "",
    "proficiency.languages": text(languages.custom) || listText(languages.value),
    "proficiency.tools": text(toolProf.custom) || listText(toolProf.value),
    "proficiency.armor": text(armorProf.custom) || listText(armorProf.value),
    "proficiency.weapons":
      text(weaponProf.custom) || listText(weaponProf.value),
    "proficiency.feats": items
      .filter((item) => item.type === "feat")
      .map((item) => text(item.name))
      .filter(Boolean)
      .join("\n"),
    "equipment.weapons": "",
    "equipment.armor": "",
    "equipment.other": "",
    "equipment.currency": `PP ${text(currency.pp)}  GP ${text(currency.gp)}  EP ${text(currency.ep)}  SP ${text(currency.sp)}  CP ${text(currency.cp)}`,
    "spellcasting.ability": text(attributes.spellcasting),
    "spellcasting.dc": text(attributes.spelldc),
    "spellcasting.attack": text(attributes.spellattack),
    "spellcasting.slots": "",
    "spellcasting.cantrips": "",
    "spellcasting.known": "",
    "spellcasting.prepared": "",
    "spellcasting.other": "",
    "notes.general": "",
  };

  for (const [id, abilityName] of Object.entries(ABILITY_ID_TO_NAME)) {
    const ability = recordAt(abilities, id);
    const score = typeof ability.value === "number" ? ability.value : 0;
    const modifier = Math.floor((score - 10) / 2);
    const proficient = Number(ability.proficient) > 0;
    const total = modifier + (proficient ? Number(attributes.prof) || 0 : 0);
    values[`ability.${abilityName}`] = text(ability.value);
    values[`save.${abilityName}`] =
      `${proficient ? "Proficient " : ""}${total >= 0 ? "+" : ""}${total}`;
  }

  const skillEntries = Object.entries(recordAt(system, "skills"))
    .filter(([, skill]) => isRecord(skill) && Number(skill.value) > 0)
    .map(([key]) => game.system.config.skills[key]?.label ?? key);
  values["proficiency.skills"] = skillEntries.join(", ");
  values["proficiency.saves"] = Object.entries(ABILITY_ID_TO_NAME)
    .filter(([id]) => Number(recordAt(abilities, id).proficient) > 0)
    .map(([id]) => id.toUpperCase())
    .join(", ");

  const gear = items.filter((item) =>
    ["weapon", "equipment", "loot", "consumable", "tool"].includes(
      text(item.type),
    ),
  );
  values["equipment.weapons"] = gear
    .filter((item) => item.type === "weapon")
    .map((item) => text(item.name))
    .join("\n");
  values["equipment.armor"] = gear
    .filter((item) => item.type === "equipment")
    .map((item) => text(item.name))
    .join("\n");
  values["equipment.other"] = gear
    .filter((item) => item.type !== "weapon" && item.type !== "equipment")
    .map((item) => text(item.name))
    .join("\n");

  const spellItems = items.filter((item) => item.type === "spell");
  values["spellcasting.cantrips"] = spellItems
    .filter((item) => Number(recordAt(item, "system").level) === 0)
    .map((item) => text(item.name))
    .join("\n");
  values["spellcasting.known"] = spellItems
    .filter((item) => Number(recordAt(item, "system").level) > 0)
    .map((item) => text(item.name))
    .join("\n");
  values["spellcasting.prepared"] = spellItems
    .filter((item) => recordAt(recordAt(item, "system"), "preparation").prepared)
    .map((item) => text(item.name))
    .join("\n");
  const spellSlots = recordAt(system, "spells");
  values["spellcasting.slots"] = Object.entries(spellSlots)
    .map(([key, slot]) => {
      const count = text(recordAt(spellSlots, key).max || recordAt(spellSlots, key).value);
      return count ? `${key.replace("spell", "Level ")}: ${count}` : "";
    })
    .filter(Boolean)
    .join(", ");

  return values;
}

export async function exportActorJson(actor: FoundryActor): Promise<string> {
  const json = await actor.exportToJSON();
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new ExportFailure("Foundry returned invalid Actor JSON.");
  }
  if (!isRecord(parsed) || parsed.type !== "character") {
    throw new ExportFailure("Foundry returned an unexpected Actor export.");
  }
  return json;
}

export async function exportActorsJsonZip(
  actors: readonly FoundryActor[],
): Promise<Uint8Array> {
  if (actors.length === 0) {
    throw new ExportFailure("There are no generated Actors to export.");
  }
  const files: Record<string, Uint8Array> = {};
  for (const [index, actor] of actors.entries()) {
    const name = sanitizeFilename(actor.name) || "Actor";
    const id = sanitizeFilename(actor.id) || String(index + 1);
    files[`${name}-${id}.json`] = strToU8(await exportActorJson(actor));
  }
  return zipSync(files, { level: 6 });
}

export async function exportActorPdf(
  actor: FoundryActor,
  template?: Uint8Array,
): Promise<Uint8Array> {
  const source =
    template ??
    (await (async () => {
      const response = await fetch(
        "modules/d-d-character-randomizer/assets/character-sheet-template.pdf",
      );
      if (!response.ok) {
        throw new ExportFailure(
          "The fillable character-sheet template could not be loaded.",
        );
      }
      return new Uint8Array(await response.arrayBuffer());
    })());
  const pdf = await PDFDocument.load(source);
  const form = pdf.getForm();
  const values = actorFieldValues(actor.toObject());
  for (const name of PDF_FIELD_NAMES) {
    let field;
    try {
      field = form.getTextField(name);
    } catch {
      throw new ExportFailure(
        `The fillable character-sheet template is missing the ${name} field.`,
      );
    }
    field.setText(values[name] ?? "");
  }
  try {
    form.updateFieldAppearances(await pdf.embedFont(StandardFonts.Helvetica));
  } catch {
    throw new ExportFailure(
      "The PDF template cannot render one or more character text values.",
    );
  }
  return pdf.save();
}

export function downloadFile(
  filename: string,
  content: string | Uint8Array,
  mimeType: string,
): void {
  const data =
    typeof content === "string"
      ? new Blob([content], { type: mimeType })
      : (() => {
          const buffer = new ArrayBuffer(content.byteLength);
          new Uint8Array(buffer).set(content);
          return new Blob([buffer], { type: mimeType });
        })();
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .trim();
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function sanitizeFilename(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/^\.+$/, "")
    .trim();
}

export function pdfTemplateFieldNames(): readonly string[] {
  return PDF_FIELD_NAMES;
}
