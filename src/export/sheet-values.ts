type JsonRecord = Record<string, unknown>;
export type Measure = (text: string, size: number) => number;

export const ABILITIES = [
  ["str", "strength", "STR"],
  ["dex", "dexterity", "DEX"],
  ["con", "constitution", "CON"],
  ["int", "intelligence", "INT"],
  ["wis", "wisdom", "WIS"],
  ["cha", "charisma", "CHA"],
] as const;

export const SKILLS = [
  ["acr", "Acrobatics", "dex"],
  ["ani", "Animal Handling", "wis"],
  ["arc", "Arcana", "int"],
  ["ath", "Athletics", "str"],
  ["dec", "Deception", "cha"],
  ["his", "History", "int"],
  ["ins", "Insight", "wis"],
  ["itm", "Intimidation", "cha"],
  ["inv", "Investigation", "int"],
  ["med", "Medicine", "wis"],
  ["nat", "Nature", "int"],
  ["prc", "Perception", "wis"],
  ["prf", "Performance", "cha"],
  ["per", "Persuasion", "cha"],
  ["rel", "Religion", "int"],
  ["slt", "Sleight of Hand", "dex"],
  ["ste", "Stealth", "dex"],
  ["sur", "Survival", "wis"],
] as const;

export const SPELL_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export interface ColumnGeometry {
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

const FEATURE_PAGES = ["p2", "p3", "p4"] as const;
const EQUIPMENT_PAGES = [
  ["equipment.col1", "equipment.col2", 140],
  ["equipment.add1", "equipment.add2", 240],
  ["equipment.more1", "equipment.more2", 240],
] as const;

export const FEATURE_COLUMNS: readonly ColumnGeometry[] = FEATURE_PAGES.flatMap(
  (page) =>
    [1, 2, 3].map((column) => ({
      name: `features.${page}c${column}`,
      width: 180,
      height: 366,
    })),
);

export const EQUIPMENT_COLUMNS: readonly ColumnGeometry[] =
  EQUIPMENT_PAGES.flatMap(([left, right, height]) => [
    { name: left, width: 272, height },
    { name: right, width: 272, height },
  ]);

export const PDF_FIELD_NAMES: readonly string[] = [
  "identity.name",
  "identity.class",
  "identity.subclass",
  "identity.level",
  "identity.xp",
  "identity.player",
  "identity.species",
  "identity.background",
  "identity.alignment",
  ...ABILITIES.flatMap(([, name]) => [`ability.${name}`, `mod.${name}`, `save.${name}`]),
  ...SKILLS.map(([key]) => `skill.${key}`),
  "stats.initiative",
  "stats.ac",
  "stats.speed",
  "stats.inspiration",
  "stats.prof",
  "stats.hp",
  "stats.hpcurrent",
  "stats.hptemp",
  "stats.hitdice",
  "passive.perception",
  "passive.insight",
  "passive.investigation",
  "senses.list",
  "proficiency.armor",
  "proficiency.weapons",
  "proficiency.tools",
  "proficiency.languages",
  "actions.list",
  "attacks.name",
  "attacks.hit",
  "attacks.damage",
  "attacks.notes",
  ...FEATURE_COLUMNS.map((column) => column.name),
  "equipment.cp",
  "equipment.sp",
  "equipment.ep",
  "equipment.gp",
  "equipment.pp",
  "equipment.weight",
  ...EQUIPMENT_COLUMNS.map((column) => column.name),
  "equipment.attuned",
  "details.gender",
  "details.age",
  "details.size",
  "details.height",
  "details.weight",
  "details.faith",
  "details.skin",
  "details.eyes",
  "details.hair",
  "details.allies",
  "identity.appearance",
  "identity.personality",
  "identity.ideals",
  "identity.bonds",
  "identity.flaws",
  "identity.backstory",
  "notes.general",
  "spellcasting.class",
  "spellcasting.ability",
  "spellcasting.dc",
  "spellcasting.attack",
  "spellcasting.slots",
  ...SPELL_LEVELS.map((level) => `spells.level${level}`),
];

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

function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function entries(value: unknown): readonly JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function listText(value: unknown): string {
  if (value instanceof Set) {
    return [...value].map(text).filter(Boolean).join(", ");
  }
  if (!Array.isArray(value)) {
    return "";
  }
  return value.map(text).filter(Boolean).join(", ");
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value}`;
}

function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

const WIN_ANSI_EXTRAS = new Set(
  "\u2022\u2013\u2014\u2018\u2019\u201a\u201c\u201d\u201e\u2026\u20ac\u2122\u2030\u2020\u2021\u02c6\u2039\u203a\u0152\u0153\u0160\u0161\u017d\u017e\u0178\u0192",
);

export function toWinAnsi(value: string): string {
  let result = "";
  for (const char of value.replace(/\r/g, "").replace(/\t/g, " ")) {
    const code = char.codePointAt(0) ?? 0;
    result +=
      char === "\n" || (code >= 32 && code <= 255) || WIN_ANSI_EXTRAS.has(char)
        ? char
        : "?";
  }
  return result;
}

function plain(html: string, limit: number): string {
  const cleaned = html
    .replace(/@[A-Za-z]+\[[^\]]*\]\{([^}]*)\}/g, "$1")
    .replace(/@[A-Za-z]+\[[^\]]*\]/g, "")
    .replace(/\[\[[^\]]*\]\]\{([^}]*)\}/g, "$1")
    .replace(/\[\[\/?[^\]]*\]\]/g, "")
    .replace(/<\/(p|div|li|h\d)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > limit
    ? `${cleaned.slice(0, limit - 3).trimEnd()}...`
    : cleaned;
}

export function wrapLineCount(
  value: string,
  width: number,
  size: number,
  measure: Measure = (line, fontSize) => line.length * fontSize * 0.52,
): number {
  let total = 0;
  for (const paragraph of value.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let lines = 1;
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && measure(candidate, size) > width) {
        lines += 1;
        current = word;
      } else {
        current = candidate;
      }
    }
    total += lines;
  }
  return total;
}

function distribute(
  blocks: readonly string[],
  columns: readonly ColumnGeometry[],
  size: number,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const column of columns) {
    result[column.name] = "";
  }
  let index = 0;
  let used = 0;
  for (const block of blocks) {
    let column = columns[index];
    if (!column) {
      break;
    }
    const lines = wrapLineCount(block, column.width - 6, size);
    const capacity = Math.floor((column.height - 6) / (size * 1.2));
    if (used > 0 && used + lines > capacity && index < columns.length - 1) {
      index += 1;
      used = 0;
      column = columns[index] ?? column;
    }
    const current = result[column.name] ?? "";
    result[column.name] = current ? `${current}\n${block}` : block;
    used += lines;
  }
  return result;
}

const FEATURE_GROUPS: Readonly<Record<string, string>> = {
  class: "CLASS FEATURES",
  race: "SPECIES TRAITS",
  background: "BACKGROUND FEATURES",
  feat: "FEATS",
};

function featureBlocks(items: readonly JsonRecord[]): string[] {
  const groups = new Map<string, string[]>();
  for (const item of items) {
    if (item.type !== "feat") {
      continue;
    }
    const system = recordAt(item, "system");
    const kind = text(recordAt(system, "type").value);
    const group = FEATURE_GROUPS[kind] ?? "OTHER FEATURES";
    const description = plain(text(recordAt(system, "description").value), 600);
    const entry = `* ${text(item.name)}${description ? `\n${description}` : ""}`;
    groups.set(group, [...(groups.get(group) ?? []), entry]);
  }
  const blocks: string[] = [];
  for (const [group, group_entries] of groups) {
    group_entries.forEach((entry, index) => {
      blocks.push(index === 0 ? `=== ${group} ===\n${entry}` : entry);
    });
  }
  return blocks;
}

function itemWeight(item: JsonRecord): number {
  const weight = recordAt(item, "system").weight;
  return isRecord(weight) ? num(weight.value) : num(weight);
}

const GEAR_TYPES = [
  "weapon",
  "equipment",
  "loot",
  "consumable",
  "tool",
  "container",
  "backpack",
];

function equipmentLines(gear: readonly JsonRecord[]): string[] {
  return gear.map((item) => {
    const system = recordAt(item, "system");
    const quantity = num(system.quantity) || 1;
    const weight = itemWeight(item) * quantity;
    const flags = [
      system.equipped === true ? "E" : "",
      system.attuned === true ? "A" : "",
    ].filter(Boolean);
    return [
      text(item.name),
      quantity > 1 ? `x${quantity}` : "",
      weight > 0 ? `${Math.round(weight * 100) / 100} lb` : "",
      flags.length > 0 ? `[${flags.join("")}]` : "",
    ]
      .filter(Boolean)
      .join("  ");
  });
}

function damageText(system: JsonRecord, modifier: number): string {
  const damage = recordAt(system, "damage");
  const parts = Array.isArray(damage.parts) ? damage.parts : [];
  const firstPart: unknown = parts[0];
  if (Array.isArray(firstPart) && typeof firstPart[0] === "string") {
    const formula = firstPart[0].replace(/@mod/g, String(modifier));
    return `${formula} ${text(firstPart[1])}`.trim();
  }
  const base = recordAt(damage, "base");
  if (num(base.number) > 0 && num(base.denomination) > 0) {
    const bonus = text(base.bonus).replace(/@mod/g, String(modifier));
    const types = listText(base.types);
    return `${num(base.number)}d${num(base.denomination)}${bonus ? ` + ${bonus}` : modifier ? signed(modifier) : ""} ${types}`.trim();
  }
  return "";
}

function activationAbbreviation(system: JsonRecord): string {
  const activation = recordAt(system, "activation");
  const cost = num(activation.cost) || 1;
  switch (text(activation.type)) {
    case "action":
      return `${cost}A`;
    case "bonus":
      return `${cost}BA`;
    case "reaction":
      return `${cost}R`;
    case "minute":
      return `${cost}m`;
    case "hour":
      return `${cost}h`;
    default:
      return "";
  }
}

function spellLine(item: JsonRecord): string {
  const system = recordAt(item, "system");
  const preparation = recordAt(system, "preparation");
  const prepared =
    preparation.prepared === true ||
    preparation.mode === "always" ||
    num(system.prepared) > 0;
  const range = recordAt(system, "range");
  const duration = recordAt(system, "duration");
  const rangeText = num(range.value)
    ? `${num(range.value)}${text(range.units)}`
    : text(range.units);
  const durationText = num(duration.value)
    ? `${num(duration.value)}${text(duration.units).slice(0, 1)}`
    : text(duration.units);
  const details = [activationAbbreviation(system), rangeText, durationText]
    .filter(Boolean)
    .join(" | ");
  const marker = num(system.level) > 0 ? (prepared ? "[P] " : "[ ] ") : "";
  return `${marker}${text(item.name)}${details ? ` (${details})` : ""}`;
}

function activationNames(
  items: readonly JsonRecord[],
  wanted: string,
): string[] {
  return items
    .filter((item) => item.type === "feat")
    .filter((item) => {
      const system = recordAt(item, "system");
      const types = [
        text(recordAt(system, "activation").type),
        ...Object.values(recordAt(system, "activities")).map((activity) =>
          text(recordAt(recordAt(activity, "activation"), "type")),
        ),
      ];
      return types.includes(wanted);
    })
    .map((item) => `* ${text(item.name)}`);
}

export function actorFieldValues(actorData: JsonRecord): Record<string, string> {
  const system = recordAt(actorData, "system");
  const details = recordAt(system, "details");
  const attributes = recordAt(system, "attributes");
  const hp = recordAt(attributes, "hp");
  const ac = recordAt(attributes, "ac");
  const abilities = recordAt(system, "abilities");
  const traits = recordAt(system, "traits");
  const currency = recordAt(system, "currency");
  const biography = recordAt(details, "biography");
  const narrative = recordAt(
    recordAt(recordAt(actorData, "flags"), "d-d-character-randomizer"),
    "narrative",
  );
  const items = entries(actorData.items);
  const derivedFlags = recordAt(
    recordAt(recordAt(actorData, "flags"), "d-d-character-randomizer"),
    "derived",
  );
  const classItems = items.filter((item) => item.type === "class");
  const classLevels = classItems.reduce(
    (sum, item) => sum + num(recordAt(item, "system").levels),
    0,
  );
  const level = num(details.level) || num(derivedFlags.level) || classLevels;
  const className =
    classItems.map((item) => text(item.name)).join(" / ") ||
    text(details.class) ||
    text(derivedFlags.className);
  const subclassName =
    items
      .filter((item) => item.type === "subclass")
      .map((item) => text(item.name))
      .join(" / ") ||
    text(details.subclass) ||
    text(derivedFlags.subclass);
  const proficiency =
    num(attributes.prof) ||
    num(derivedFlags.proficiencyBonus) ||
    (level > 0 ? 2 + Math.floor((level - 1) / 4) : 0);
  const armorClass = num(ac.value) || num(derivedFlags.armorClass);
  const maxHp = num(hp.max) || num(derivedFlags.maxHitPoints) || num(hp.value);
  const spellAbility =
    text(attributes.spellcasting) || text(derivedFlags.spellAbility);
  const spellDc = num(attributes.spelldc) || num(derivedFlags.spellSaveDc);
  const spellAttack =
    num(attributes.spellattack) || num(derivedFlags.spellAttack);
  const hasSpellcasting = spellAbility !== "";
  const skills = recordAt(system, "skills");
  const modifiers: Record<string, number> = {};

  const profText = (key: string): string =>
    text(recordAt(traits, key).custom) || listText(recordAt(traits, key).value);

  const values: Record<string, string> = {};
  for (const name of PDF_FIELD_NAMES) {
    values[name] = "";
  }
  Object.assign(values, {
    "identity.name": text(actorData.name),
    "identity.class": className,
    "identity.subclass": subclassName,
    "identity.level": level > 0 ? String(level) : "",
    "identity.xp": text(recordAt(details, "xp").value),
    "identity.species": text(details.race),
    "identity.background": text(details.background),
    "identity.alignment": text(details.alignment),
    "stats.ac": armorClass > 0 ? String(armorClass) : "",
    "stats.prof": signed(proficiency),
    "stats.hp": maxHp > 0 ? String(maxHp) : "",
    "stats.hpcurrent": text(hp.value) || (maxHp > 0 ? String(maxHp) : ""),
    "stats.hptemp": text(hp.temp),
    "stats.inspiration": attributes.inspiration === true ? "Yes" : "",
    "proficiency.armor": profText("armorProf"),
    "proficiency.weapons": profText("weaponProf"),
    "proficiency.tools": profText("toolProf"),
    "proficiency.languages": profText("languages"),
    "details.gender": text(details.gender),
    "details.age": text(details.age),
    "details.size": text(traits.size),
    "details.height": text(details.height),
    "details.weight": text(details.weight),
    "details.faith": text(details.faith),
    "details.skin": text(details.skin),
    "details.eyes": text(details.eyes),
    "details.hair": text(details.hair),
    "identity.appearance": text(narrative.appearance),
    "identity.personality": text(narrative.personalityTraits),
    "identity.ideals": text(narrative.ideals),
    "identity.bonds": text(narrative.bonds),
    "identity.flaws": text(narrative.flaws),
    "identity.backstory": text(narrative.backstory) || text(biography.value),
    "spellcasting.class": className,
    "spellcasting.ability": hasSpellcasting
      ? spellAbility.slice(0, 3).toUpperCase()
      : "",
    "spellcasting.dc": hasSpellcasting ? String(spellDc) : "",
    "spellcasting.attack": hasSpellcasting ? signed(spellAttack) : "",
    "equipment.cp": text(currency.cp),
    "equipment.sp": text(currency.sp),
    "equipment.ep": text(currency.ep),
    "equipment.gp": text(currency.gp),
    "equipment.pp": text(currency.pp),
  });

  for (const [id, name] of ABILITIES) {
    const ability = recordAt(abilities, id);
    const modifier = abilityModifier(num(ability.value));
    const proficient = num(ability.proficient) > 0;
    modifiers[id] = modifier;
    values[`ability.${name}`] = text(ability.value);
    values[`mod.${name}`] = signed(modifier);
    values[`save.${name}`] =
      `${proficient ? "P " : ""}${signed(modifier + (proficient ? proficiency : 0))}`;
  }

  const skillTotals: Record<string, number> = {};
  for (const [key, , defaultAbility] of SKILLS) {
    const skill = recordAt(skills, key);
    const rank = num(skill.value);
    const ability = text(skill.ability) || defaultAbility;
    const total = (modifiers[ability] ?? 0) + Math.floor(proficiency * rank);
    skillTotals[key] = total;
    const marker = rank >= 2 ? "E " : rank >= 1 ? "P " : rank > 0 ? "H " : "";
    values[`skill.${key}`] = `${marker}${signed(total)}`;
  }

  const dexModifier = modifiers.dex ?? 0;
  values["stats.initiative"] = signed(dexModifier + num(recordAt(attributes, "init").bonus));
  const movement = recordAt(attributes, "movement");
  values["stats.speed"] = num(movement.walk)
    ? `${num(movement.walk)} ${text(movement.units) || "ft"}`
    : "";
  values["passive.perception"] = String(10 + (skillTotals.prc ?? 0));
  values["passive.insight"] = String(10 + (skillTotals.ins ?? 0));
  values["passive.investigation"] = String(10 + (skillTotals.inv ?? 0));

  const senses = recordAt(attributes, "senses");
  values["senses.list"] = [
    ...Object.entries(senses)
      .filter(([key, value]) => key !== "special" && key !== "units" && num(value) > 0)
      .map(([key, value]) => `${key[0]?.toUpperCase() ?? ""}${key.slice(1)} ${num(value)} ${text(senses.units) || "ft"}`),
    text(senses.special),
  ]
    .filter(Boolean)
    .join("\n");

  values["stats.hitdice"] = items
    .filter((item) => item.type === "class")
    .map((item) => {
      const classSystem = recordAt(item, "system");
      const denomination = text(recordAt(classSystem, "hd").denomination) || text(classSystem.hitDice);
      return `${num(classSystem.levels)}${denomination.startsWith("d") ? denomination : denomination ? `d${denomination}` : ""}`;
    })
    .join(" + ");

  const standardActions =
    "Attack, Dash, Disengage, Dodge, Help, Hide, Influence, Magic, Ready, Search, Study, Utilize";
  const section = (title: string, lines: readonly string[]): string =>
    lines.length > 0 ? `=== ${title} ===\n${lines.join("\n")}` : "";
  values["actions.list"] = [
    section("ACTIONS", [standardActions, ...activationNames(items, "action")]),
    section("BONUS ACTIONS", activationNames(items, "bonus")),
    section("REACTIONS", activationNames(items, "reaction")),
  ]
    .filter(Boolean)
    .join("\n");

  const attackRows: { name: string; hit: string; damage: string; notes: string }[] = [];
  for (const item of items) {
    const itemSystem = recordAt(item, "system");
    if (item.type === "weapon") {
      const properties = listText(itemSystem.properties);
      const ranged = ["rwak"].includes(text(itemSystem.actionType));
      const finesse = properties.split(", ").includes("fin");
      const strength = modifiers.str ?? 0;
      const modifier = ranged
        ? dexModifier
        : finesse
          ? Math.max(strength, dexModifier)
          : strength;
      attackRows.push({
        name: text(item.name),
        hit: signed(modifier + proficiency),
        damage: damageText(itemSystem, modifier),
        notes: properties,
      });
    } else if (
      item.type === "spell" &&
      num(itemSystem.level) === 0 &&
      damageText(itemSystem, 0)
    ) {
      const saves = text(recordAt(itemSystem, "save").ability);
      attackRows.push({
        name: text(item.name),
        hit: saves ? `DC ${spellDc}` : spellAttack ? signed(spellAttack) : "",
        damage: damageText(itemSystem, 0),
        notes: "Cantrip",
      });
    }
  }
  values["attacks.name"] = attackRows.map((row) => row.name).join("\n");
  values["attacks.hit"] = attackRows.map((row) => row.hit).join("\n");
  values["attacks.damage"] = attackRows.map((row) => row.damage).join("\n");
  values["attacks.notes"] = attackRows.map((row) => row.notes).join("\n");

  Object.assign(
    values,
    distribute(featureBlocks(items), FEATURE_COLUMNS, 8),
  );

  const gear = items.filter((item) => GEAR_TYPES.includes(text(item.type)));
  const carried = gear.reduce(
    (sum, item) =>
      sum + itemWeight(item) * (num(recordAt(item, "system").quantity) || 1),
    0,
  );
  values["equipment.weight"] = carried > 0 ? `${Math.round(carried * 100) / 100} lb` : "";
  Object.assign(
    values,
    distribute(equipmentLines(gear), EQUIPMENT_COLUMNS, 8),
  );
  values["equipment.attuned"] = gear
    .filter((item) => recordAt(item, "system").attuned === true)
    .map((item) => text(item.name))
    .join(", ");

  const spellSlots = recordAt(system, "spells");
  const slotSummary: string[] = [];
  for (const level of SPELL_LEVELS) {
    const spellItems = items.filter(
      (item) =>
        item.type === "spell" && num(recordAt(item, "system").level) === level,
    );
    const slot = recordAt(spellSlots, `spell${level}`);
    const slotCount = num(slot.max) || num(slot.value);
    if (level > 0 && slotCount > 0) {
      slotSummary.push(`L${level}: ${slotCount}`);
    }
    values[`spells.level${level}`] = [
      level > 0 && slotCount > 0 ? `Slots: ${slotCount}` : "",
      ...spellItems.map(spellLine),
    ]
      .filter(Boolean)
      .join("\n");
  }
  values["spellcasting.slots"] = slotSummary.join("   ");

  for (const name of Object.keys(values)) {
    values[name] = toWinAnsi(values[name] ?? "");
  }
  return values;
}
