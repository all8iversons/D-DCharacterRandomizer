import type {
  ArmorRules,
  ClassRules,
  RulesResolution,
  AbilityKey,
} from "../rules/recalculate-stats.js";
import type {
  ClassProgressionSlice,
  EquipmentAndGoldSlice,
} from "../types/character-slices.js";
import { RulesResolutionError } from "../rules/recalculate-stats.js";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valueAt(record: JsonRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }
  return undefined;
}

const ABILITY_ALIASES: Readonly<Record<string, AbilityKey>> = {
  str: "strength",
  strength: "strength",
  dex: "dexterity",
  dexterity: "dexterity",
  con: "constitution",
  constitution: "constitution",
  int: "intelligence",
  intelligence: "intelligence",
  wis: "wisdom",
  wisdom: "wisdom",
  cha: "charisma",
  charisma: "charisma",
};

function readAbility(value: unknown): AbilityKey | null {
  if (typeof value === "string") {
    return ABILITY_ALIASES[value.trim().toLowerCase()] ?? null;
  }
  if (Array.isArray(value) && value.length === 1) {
    return readAbility(value[0]);
  }
  if (isRecord(value)) {
    return readAbility(value.value ?? value.ability);
  }
  return null;
}

function readAbilities(value: unknown): AbilityKey[] {
  const entries = Array.isArray(value) ? value : [value];
  return entries
    .map(readAbility)
    .filter((ability): ability is AbilityKey => ability !== null);
}

function collectCompendiumUuids(value: unknown, output: Set<string>): void {
  if (typeof value === "string") {
    if (/^Compendium\.[\w.-]+\.Item\.[\w-]+$/.test(value)) {
      output.add(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectCompendiumUuids(entry, output);
    }
    return;
  }
  if (isRecord(value)) {
    for (const entry of Object.values(value)) {
      collectCompendiumUuids(entry, output);
    }
  }
}

function descriptionText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function abilityFromFeatureName(value: string): AbilityKey | null {
  const configured = Object.entries(game.system.config.abilities ?? {}).find(
    ([id, ability]) =>
      ability.label?.trim().toLowerCase() === value.trim().toLowerCase() ||
      id.trim().toLowerCase() === value.trim().toLowerCase(),
  );
  return readAbility(configured?.[0] ?? value);
}

function featureUnarmoredDefense(
  feature: FoundryItemDocument,
): ClassRules["unarmoredDefense"] | null {
  if (!feature.name.toLowerCase().includes("unarmored defense")) {
    return null;
  }
  const description = isRecord(feature.system.description)
    ? feature.system.description.value
    : feature.system.description;
  const text = descriptionText(description);
  const formula =
    /armor class (?:equals|is)\s*10\s*\+\s*your\s+([\w ]+?)\s+modifier\s*\+\s*your\s+([\w ]+?)\s+modifier/i.exec(
      text,
    );
  const first = formula?.[1]
    ? abilityFromFeatureName(formula[1])
    : null;
  const second = formula?.[2]
    ? abilityFromFeatureName(formula[2])
    : null;
  if (!first || !second) {
    throw new RulesResolutionError(
      "The D&D 5e Unarmored Defense feature did not expose a recognized armor formula.",
    );
  }
  return {
    abilities: [first, second],
    shieldAllowed:
      /can use a shield and still gain this benefit/i.test(text),
  };
}

async function findUnarmoredDefense(
  item: FoundryItemDocument,
  system: JsonRecord,
): Promise<ClassRules["unarmoredDefense"]> {
  if (isRecord(system.unarmoredDefense)) {
    const abilities = readAbilities(system.unarmoredDefense.abilities);
    if (abilities.length === 2) {
      return {
        abilities: [abilities[0]!, abilities[1]!],
        shieldAllowed: system.unarmoredDefense.shieldAllowed === true,
      };
    }
  }

  const advancementUuids = new Set<string>();
  collectCompendiumUuids(system.advancement, advancementUuids);
  for (const uuid of advancementUuids) {
    const feature = await foundry.fromUuid(uuid);
    if (feature) {
      const rule = featureUnarmoredDefense(feature);
      if (rule) {
        return rule;
      }
    }
  }
  return null;
}

function readHitDie(value: unknown): number | null {
  if (typeof value === "number" && [4, 6, 8, 10, 12].includes(value)) {
    return value;
  }
  if (typeof value === "string") {
    const match = /^1?d(4|6|8|10|12)$/i.exec(value.trim());
    if (match) {
      return Number(match[1]);
    }
  }
  return null;
}

async function readClassRules(
  className: string,
  item: FoundryItemDocument,
  system: JsonRecord,
): Promise<ClassRules> {
  const hitDieData = isRecord(system.hd) ? system.hd : {};
  const hitDie =
    readHitDie(valueAt(system, "hitDice", "hitDie")) ??
    readHitDie(hitDieData.denomination);
  if (!hitDie) {
    throw new RulesResolutionError(
      `D&D 5e system data is incomplete for ${className}.`,
    );
  }
  const spellcasting = isRecord(system.spellcasting)
    ? system.spellcasting
    : {};
  const ability = readAbility(
    valueAt(spellcasting, "ability", "spellcastingAbility"),
  );
  return {
    className,
    hitDie,
    spellcastingAbility: ability,
    unarmoredDefense: await findUnarmoredDefense(item, system),
  };
}

export async function findSystemItem(
  name: string,
  expectedTypes: readonly string[],
): Promise<FoundryItemDocument | null> {
  const matches: FoundryItemDocument[] = [];
  const packs = game.packs
    .filter(
      (pack) =>
        pack.documentName === "Item" &&
        pack.metadata.id.startsWith("dnd5e."),
    )
    .slice()
    .sort((left, right) => left.metadata.id.localeCompare(right.metadata.id));

  for (const pack of packs) {
    const index = await pack.getIndex();
    for (const entry of index) {
      if (entry.name.trim().toLowerCase() !== name.trim().toLowerCase()) {
        continue;
      }
      if (entry.type && !expectedTypes.includes(entry.type)) {
        continue;
      }
      const item = await pack.getDocument(entry._id);
      if (
        item &&
        expectedTypes.includes(item.type) &&
        !matches.some((match) => match.id === item.id)
      ) {
        matches.push(item);
      }
    }
  }

  if (matches.length > 1) {
    throw new RulesResolutionError(
      `More than one D&D 5e compendium entry matches ${name}.`,
    );
  }
  return matches[0] ?? null;
}

function readArmorRules(
  item: FoundryItemDocument,
  equipmentName: string,
  itemId: string | null,
): ArmorRules {
  const system = item.system;
  const armor = isRecord(system.armor) ? system.armor : system;
  const rawCategory = valueAt(
    armor,
    "type",
    "category",
    "equipmentType",
  ) ?? valueAt(system, "type", "equipmentType");
  const categoryValue =
    typeof rawCategory === "string"
      ? rawCategory.toLowerCase()
      : isRecord(rawCategory) && typeof rawCategory.value === "string"
        ? rawCategory.value.toLowerCase()
        : "";
  const category =
    categoryValue.includes("shield")
      ? "shield"
      : categoryValue.includes("light")
        ? "light"
        : categoryValue.includes("medium")
          ? "medium"
          : categoryValue.includes("heavy")
            ? "heavy"
            : null;
  const armorClass = valueAt(armor, "value", "armorClass", "ac");
  const baseArmorClass =
    typeof armorClass === "number" ? armorClass : null;
  const dexterityCap = valueAt(armor, "dex", "dexterityCap");
  const shieldBonus =
    typeof valueAt(armor, "value", "bonus") === "number"
      ? Number(valueAt(armor, "value", "bonus"))
      : 0;
  if (
    !category ||
    baseArmorClass === null ||
    !Number.isFinite(baseArmorClass) ||
    (dexterityCap !== undefined &&
      dexterityCap !== null &&
      (typeof dexterityCap !== "number" || !Number.isFinite(dexterityCap)))
  ) {
    throw new RulesResolutionError(
      `D&D 5e system armor data is incomplete for ${equipmentName}.`,
    );
  }
  return {
    itemId,
    name: equipmentName,
    category,
    baseArmorClass,
    dexterityCap: typeof dexterityCap === "number" ? dexterityCap : null,
    shieldBonus,
  };
}

export async function resolveSystemRules(
  progression: ClassProgressionSlice,
  equipment: EquipmentAndGoldSlice,
): Promise<RulesResolution> {
  const classes: ClassRules[] = [];
  for (const classLevel of progression.classes) {
    const item = await findSystemItem(classLevel.className, ["class"]);
    if (!item) {
      throw new RulesResolutionError(
        `No D&D 5e compendium class matches ${classLevel.className}.`,
      );
    }
    classes.push(
      await readClassRules(classLevel.className, item, item.system),
    );
  }

  const armor: ArmorRules[] = [];
  for (const item of equipment.armor.filter((entry) => entry.equipped)) {
    const systemItem = await findSystemItem(item.name, [
      "equipment",
      "armor",
      "loot",
    ]);
    if (!systemItem) {
      throw new RulesResolutionError(
        `No D&D 5e compendium armor matches ${item.name}.`,
      );
    }
    armor.push(readArmorRules(systemItem, item.name, item.id));
  }
  return { classes, armor };
}
