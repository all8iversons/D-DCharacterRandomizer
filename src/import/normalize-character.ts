import type {
  Currency,
  EquipmentEntry,
  FeatEntry,
  ProficiencyEntry,
  SpellEntry,
} from "../types/character-slices.js";
import type { CharacterSliceInput } from "./slice-character.js";
import { ImportFailure } from "./import-errors.js";

type JsonRecord = Record<string, unknown>;
type AbilityKey =
  | "strength"
  | "dexterity"
  | "constitution"
  | "intelligence"
  | "wisdom"
  | "charisma";

const ABILITY_BY_ID: Readonly<Record<number, AbilityKey>> = {
  1: "strength",
  2: "dexterity",
  3: "constitution",
  4: "intelligence",
  5: "wisdom",
  6: "charisma",
};

// Community-observed IDs; the D&D Beyond endpoint does not publish this enum.
const ALIGNMENT_BY_ID: Readonly<Record<number, string>> = {
  1: "Lawful Good",
  2: "Neutral Good",
  3: "Chaotic Good",
  4: "Lawful Neutral",
  5: "Neutral",
  6: "Chaotic Neutral",
  7: "Lawful Evil",
  8: "Neutral Evil",
  9: "Chaotic Evil",
  10: "Unaligned",
};

const SKILLS = new Set([
  "acrobatics",
  "animal-handling",
  "arcana",
  "athletics",
  "deception",
  "history",
  "insight",
  "intimidation",
  "investigation",
  "medicine",
  "nature",
  "perception",
  "performance",
  "persuasion",
  "religion",
  "sleight-of-hand",
  "stealth",
  "survival",
]);

const ARMOR_PROFICIENCIES = new Set([
  "light-armor",
  "medium-armor",
  "heavy-armor",
  "shields",
]);

const WEAPON_PROFICIENCIES = new Set([
  "simple-weapons",
  "martial-weapons",
  "unarmed-strikes",
  "crossbow-hand",
  "longbow",
  "longsword",
  "rapier",
  "shortsword",
  "shortbow",
]);

const SENSES = new Set([
  "blindsight",
  "darkvision",
  "tremorsense",
  "truesight",
]);

const MODIFIER_GROUPS = [
  "background",
  "class",
  "condition",
  "feat",
  "item",
  "race",
] as const;

function readClassSavingThrows(
  modifiersValue: unknown,
  sourceCharacterId: string,
): AbilityKey[] {
  const modifiers = optionalRecord(modifiersValue);
  if (
    modifiersValue !== undefined &&
    modifiersValue !== null &&
    !modifiers
  ) {
    return invalidPayload(
      sourceCharacterId,
      "D&D Beyond returned malformed class proficiency data.",
    );
  }
  const classModifiers = optionalArray(
    modifiers?.class,
    sourceCharacterId,
    "D&D Beyond returned malformed class proficiency data.",
  );
  const knownAbilities = new Set(Object.values(ABILITY_BY_ID));
  const saves = new Set<AbilityKey>();
  for (const rawModifier of classModifiers) {
    const modifier = requiredRecord(
      rawModifier,
      sourceCharacterId,
      "D&D Beyond returned malformed class proficiency data.",
    );
    const type = textValue(
      modifier.type,
      sourceCharacterId,
      "D&D Beyond returned malformed class proficiency data.",
    ).toLowerCase();
    const subtype = textValue(
      modifier.subType,
      sourceCharacterId,
      "D&D Beyond returned malformed class proficiency data.",
    )
      .toLowerCase()
      .replaceAll("_", "-");
    const match =
      type === "proficiency"
        ? /^(strength|dexterity|constitution|intelligence|wisdom|charisma)-saving-throws$/.exec(
            subtype,
          )
        : null;
    const ability = match?.[1];
    if (ability && knownAbilities.has(ability as AbilityKey)) {
      saves.add(ability as AbilityKey);
    }
  }
  if (saves.size === 0) {
    return invalidPayload(
      sourceCharacterId,
      "D&D Beyond did not return class saving throw proficiencies needed for hybrid generation.",
    );
  }
  return [...saves];
}

const EMPTY_CURRENCY: Currency = {
  copper: 0,
  silver: 0,
  electrum: 0,
  gold: 0,
  platinum: 0,
};

function invalidPayload(sourceCharacterId: string, message: string): never {
  throw new ImportFailure({
    category: "invalid-payload",
    message,
    sourceCharacterId,
    retryable: false,
  });
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredRecord(
  value: unknown,
  sourceCharacterId: string,
  message: string,
): JsonRecord {
  if (!isRecord(value)) {
    return invalidPayload(sourceCharacterId, message);
  }
  return value;
}

function optionalRecord(value: unknown): JsonRecord | undefined {
  return isRecord(value) ? value : undefined;
}

function optionalArray(
  value: unknown,
  sourceCharacterId: string,
  message: string,
): readonly unknown[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    return invalidPayload(sourceCharacterId, message);
  }
  return value;
}

function textValue(
  value: unknown,
  sourceCharacterId: string,
  message: string,
  required = false,
): string {
  if (value === undefined || value === null) {
    if (required) {
      return invalidPayload(sourceCharacterId, message);
    }
    return "";
  }
  if (typeof value !== "string") {
    return invalidPayload(sourceCharacterId, message);
  }
  const text = value.trim();
  if (required && text.length === 0) {
    return invalidPayload(sourceCharacterId, message);
  }
  return text;
}

function numericValue(
  value: unknown,
  sourceCharacterId: string,
  message: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    return invalidPayload(sourceCharacterId, message);
  }
  return value;
}

function optionalId(value: unknown): string | null {
  if (
    (typeof value === "string" && value.length > 0) ||
    (typeof value === "number" && Number.isSafeInteger(value))
  ) {
    return String(value);
  }
  return null;
}

function getOptionalText(
  record: JsonRecord | undefined,
  key: string,
  sourceCharacterId: string,
  message: string,
): string {
  return textValue(record?.[key], sourceCharacterId, message);
}

function optionalDescriptionText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// Custom content is player-authored, so tolerate odd shapes instead of failing the import.
function looseText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function looseNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function customItemEntry(raw: unknown): EquipmentEntry | null {
  if (!isRecord(raw)) {
    return null;
  }
  const name = looseText(raw.name);
  if (!name) {
    return null;
  }
  return {
    id: optionalId(raw.id),
    name,
    category: "Custom Item",
    description: looseText(raw.description) || looseText(raw.notes),
    quantity: looseNumber(raw.quantity, 1),
    attuned: raw.isAttuned === true,
    equipped: raw.equipped === true,
    armorClass: null,
    armorTypeId: null,
    damage: "",
    damageType: "",
    weight: looseNumber(raw.weight, 0),
    cost: looseNumber(raw.cost, 0),
    custom: true,
  };
}

function humanize(value: string): string {
  return value
    .split(/[-_ ]+/)
    .filter((part) => part.length > 0)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ");
}

function readAbilityScores(
  value: unknown,
  sourceCharacterId: string,
): Record<AbilityKey, number> {
  const stats = optionalArray(
    value,
    sourceCharacterId,
    "D&D Beyond returned malformed ability score data.",
  );
  const abilities: Partial<Record<AbilityKey, number>> = {};

  for (const rawStat of stats) {
    const stat = requiredRecord(
      rawStat,
      sourceCharacterId,
      "D&D Beyond returned malformed ability score data.",
    );
    const id = numericValue(
      stat.id,
      sourceCharacterId,
      "D&D Beyond returned an unsupported ability score.",
      1,
      6,
    );
    const key = ABILITY_BY_ID[id];
    if (!key || abilities[key] !== undefined) {
      return invalidPayload(
        sourceCharacterId,
        "D&D Beyond returned duplicate or unsupported ability scores.",
      );
    }
    abilities[key] = numericValue(
      stat.value,
      sourceCharacterId,
      "D&D Beyond returned an invalid ability score.",
      1,
      30,
    );
  }

  const result = {} as Record<AbilityKey, number>;
  for (const key of Object.values(ABILITY_BY_ID)) {
    const score = abilities[key];
    if (score === undefined) {
      return invalidPayload(
        sourceCharacterId,
        "D&D Beyond did not return all six ability scores.",
      );
    }
    result[key] = score;
  }
  return result;
}

function readClasses(
  value: unknown,
  sourceCharacterId: string,
  classSavingThrows: readonly AbilityKey[],
): CharacterSliceInput["classProgression"] {
  const classes = optionalArray(
    value,
    sourceCharacterId,
    "D&D Beyond returned malformed class data.",
  );
  if (classes.length === 0) {
    return invalidPayload(
      sourceCharacterId,
      "D&D Beyond did not return class progression.",
    );
  }

  const classNames: string[] = [];
  const subclassNames: string[] = [];
  const hitDice: string[] = [];
  const classLevels: CharacterSliceInput["classProgression"]["classes"][number][] =
    [];
  let totalLevel = 0;

  for (const rawClass of classes) {
    const characterClass = requiredRecord(
      rawClass,
      sourceCharacterId,
      "D&D Beyond returned malformed class data.",
    );
    const definition = requiredRecord(
      characterClass.definition,
      sourceCharacterId,
      "D&D Beyond returned incomplete class data.",
    );
    classNames.push(
      textValue(
        definition.name,
        sourceCharacterId,
        "D&D Beyond returned a class without a name.",
        true,
      ),
    );
    const level = numericValue(
      characterClass.level,
      sourceCharacterId,
      "D&D Beyond returned an invalid class level.",
      1,
      20,
    );
    totalLevel += level;

    const die = numericValue(
      definition.hitDice,
      sourceCharacterId,
      "D&D Beyond returned an unsupported hit die.",
      4,
      12,
    );
    if (![4, 6, 8, 10, 12].includes(die)) {
      return invalidPayload(
        sourceCharacterId,
        "D&D Beyond returned an unsupported hit die.",
      );
    }
    hitDice.push(`d${die}`);

    const subclass = optionalRecord(characterClass.subclassDefinition);
    const subclassName = textValue(
      subclass?.name,
      sourceCharacterId,
      "D&D Beyond returned an invalid subclass name.",
    );
    if (subclassName) {
      subclassNames.push(subclassName);
    }
    classLevels.push({
      className: classNames[classNames.length - 1]!,
      subclass: subclassName,
      level,
      hitDie: die,
      ddbDefinitionId: optionalId(definition.id),
      savingThrowProficiencies:
        classLevels.length === 0 ? classSavingThrows : [],
    });
  }

  if (totalLevel > 20) {
    return invalidPayload(
      sourceCharacterId,
      "D&D Beyond returned a total character level above 20.",
    );
  }

  return {
    className: classNames.join(" / "),
    subclass: subclassNames.join(" / "),
    totalLevel,
    hitDice: hitDice.join(" / "),
    classes: classLevels,
  };
}

function appendUnique(
  collection: ProficiencyEntry[],
  entry: ProficiencyEntry,
): void {
  const key = `${entry.id ?? ""}:${entry.name.toLowerCase()}`;
  if (
    !collection.some(
      (current) =>
        `${current.id ?? ""}:${current.name.toLowerCase()}` === key,
    )
  ) {
    collection.push(entry);
  }
}

function readProficiencies(
  data: JsonRecord,
  sourceCharacterId: string,
): CharacterSliceInput["proficienciesAndFeats"] {
  const result = {
    skills: [] as ProficiencyEntry[],
    savingThrows: [] as ProficiencyEntry[],
    languages: [] as ProficiencyEntry[],
    tools: [] as ProficiencyEntry[],
    armor: [] as ProficiencyEntry[],
    weapons: [] as ProficiencyEntry[],
    feats: [] as FeatEntry[],
    senses: [] as ProficiencyEntry[],
  };
  const modifiers = optionalRecord(data.modifiers);
  if (data.modifiers !== undefined && data.modifiers !== null && !modifiers) {
    return invalidPayload(
      sourceCharacterId,
      "D&D Beyond returned malformed proficiency data.",
    );
  }

  for (const group of MODIFIER_GROUPS) {
    const entries = optionalArray(
      modifiers?.[group],
      sourceCharacterId,
      "D&D Beyond returned malformed proficiency data.",
    );
    for (const rawModifier of entries) {
      const modifier = requiredRecord(
        rawModifier,
        sourceCharacterId,
        "D&D Beyond returned malformed proficiency data.",
      );
      const type = textValue(
        modifier.type,
        sourceCharacterId,
        "D&D Beyond returned a modifier without a type.",
      ).toLowerCase();
      const subType = textValue(
        modifier.subType,
        sourceCharacterId,
        "D&D Beyond returned a modifier without a subtype.",
      ).toLowerCase();
      if (!type || !subType) {
        continue;
      }

      const friendlyName = getOptionalText(
        modifier,
        "friendlySubtypeName",
        sourceCharacterId,
        "D&D Beyond returned an invalid proficiency name.",
      );
      const entry: ProficiencyEntry = {
        id: optionalId(modifier.id),
        name: friendlyName || humanize(subType),
      };

      if (type === "language") {
        appendUnique(result.languages, entry);
      } else if (type === "sense" || SENSES.has(subType)) {
        appendUnique(result.senses, entry);
      } else if (type === "proficiency" || type === "expertise") {
        if (subType.endsWith("-saving-throws")) {
          appendUnique(result.savingThrows, entry);
        } else if (SKILLS.has(subType)) {
          appendUnique(result.skills, entry);
        } else if (ARMOR_PROFICIENCIES.has(subType)) {
          appendUnique(result.armor, entry);
        } else if (WEAPON_PROFICIENCIES.has(subType)) {
          appendUnique(result.weapons, entry);
        } else {
          appendUnique(result.tools, entry);
        }
      }
    }
  }

  const customSenses = optionalArray(
    data.customSenses,
    sourceCharacterId,
    "D&D Beyond returned malformed sense data.",
  );
  for (const rawSense of customSenses) {
    const sense = requiredRecord(
      rawSense,
      sourceCharacterId,
      "D&D Beyond returned malformed sense data.",
    );
    const name = textValue(
      sense.name,
      sourceCharacterId,
      "D&D Beyond returned a sense without a name.",
      true,
    );
    appendUnique(result.senses, {
      id: optionalId(sense.id),
      name,
    });
  }

  const customProficiencies = optionalArray(
    data.customProficiencies,
    sourceCharacterId,
    "D&D Beyond returned malformed custom proficiency data.",
  );
  for (const rawProficiency of customProficiencies) {
    const proficiency = requiredRecord(
      rawProficiency,
      sourceCharacterId,
      "D&D Beyond returned malformed custom proficiency data.",
    );
    const name = textValue(
      proficiency.name,
      sourceCharacterId,
      "D&D Beyond returned a custom proficiency without a name.",
      true,
    );
    const type =
      typeof proficiency.type === "string"
        ? proficiency.type.trim().toLowerCase()
        : "";
    const entry = { id: optionalId(proficiency.id), name };
    if (type.includes("language")) {
      appendUnique(result.languages, entry);
    } else if (type.includes("armor")) {
      appendUnique(result.armor, entry);
    } else if (type.includes("weapon")) {
      appendUnique(result.weapons, entry);
    } else if (type.includes("skill")) {
      appendUnique(result.skills, entry);
    } else {
      appendUnique(result.tools, entry);
    }
  }

  const feats = optionalArray(
    data.feats,
    sourceCharacterId,
    "D&D Beyond returned malformed feat data.",
  );
  for (const rawFeat of feats) {
    const feat = requiredRecord(
      rawFeat,
      sourceCharacterId,
      "D&D Beyond returned malformed feat data.",
    );
    const definition = requiredRecord(
      feat.definition,
      sourceCharacterId,
      "D&D Beyond returned an incomplete feat.",
    );
    const homebrew = definition.isHomebrew === true;
    result.feats.push({
      id: optionalId(definition.id ?? feat.definitionId),
      name: textValue(
        definition.name,
        sourceCharacterId,
        "D&D Beyond returned a feat without a name.",
        true,
      ),
      description: getOptionalText(
        definition,
        "description",
        sourceCharacterId,
        "D&D Beyond returned invalid feat details.",
      ),
      ...(homebrew ? { custom: true } : {}),
    });
  }

  // Player-created actions live outside the feat list; keep them as custom features.
  for (const rawAction of Array.isArray(data.customActions)
    ? (data.customActions as unknown[])
    : []) {
    if (!isRecord(rawAction)) {
      continue;
    }
    const actionName = looseText(rawAction.name);
    if (!actionName) {
      continue;
    }
    const description =
      looseText(rawAction.description) || looseText(rawAction.snippet);
    // D&D Beyond activationType: 1 action, 3 bonus action, 4 reaction.
    const activationType =
      typeof rawAction.activationType === "number"
        ? rawAction.activationType
        : null;
    result.feats.push({
      id: optionalId(rawAction.id),
      name: actionName,
      description,
      custom: true,
      activation:
        activationType === 3
          ? "bonus"
          : activationType === 4
            ? "reaction"
            : "action",
    });
  }
  return result;
}

function readCurrency(
  value: unknown,
  sourceCharacterId: string,
): Currency {
  if (value === undefined || value === null) {
    return { ...EMPTY_CURRENCY };
  }
  const source = requiredRecord(
    value,
    sourceCharacterId,
    "D&D Beyond returned malformed currency data.",
  );
  const readCoin = (key: string): number =>
    source[key] === undefined || source[key] === null
      ? 0
      : numericValue(
          source[key],
          sourceCharacterId,
          "D&D Beyond returned invalid currency data.",
          0,
          Number.MAX_SAFE_INTEGER,
        );
  return {
    copper: readCoin("cp"),
    silver: readCoin("sp"),
    electrum: readCoin("ep"),
    gold: readCoin("gp"),
    platinum: readCoin("pp"),
  };
}

function optionalNumber(
  value: unknown,
  sourceCharacterId: string,
  message: string,
  maximum: number,
): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > maximum
  ) {
    return invalidPayload(sourceCharacterId, message);
  }
  return value;
}

function toEquipmentEntry(
  value: unknown,
  sourceCharacterId: string,
): EquipmentEntry {
  const item = requiredRecord(
    value,
    sourceCharacterId,
    "D&D Beyond returned malformed inventory data.",
  );
  const definition = requiredRecord(
    item.definition,
    sourceCharacterId,
    "D&D Beyond returned an inventory item without a definition.",
  );
  const name = textValue(
    definition.name,
    sourceCharacterId,
    "D&D Beyond returned an inventory item without a name.",
    true,
  );
  const quantity =
    item.quantity === undefined || item.quantity === null
      ? 1
      : numericValue(
          item.quantity,
          sourceCharacterId,
          "D&D Beyond returned an invalid inventory quantity.",
          0,
          Number.MAX_SAFE_INTEGER,
        );
  const attuned = item.isAttuned === true;
  const homebrew = definition.isHomebrew === true;
  return {
    id: optionalId(item.id ?? definition.id),
    name,
    category: textValue(
      definition.filterType,
      sourceCharacterId,
      "D&D Beyond returned an invalid inventory category.",
    ),
    description: getOptionalText(
      definition,
      "description",
      sourceCharacterId,
      "D&D Beyond returned invalid inventory details.",
    ),
    quantity,
    attuned,
    equipped: item.equipped === true,
    armorClass: optionalNumber(
      definition.armorClass,
      sourceCharacterId,
      "D&D Beyond returned invalid armor data.",
      100,
    ),
    armorTypeId:
      definition.armorTypeId === undefined ||
      definition.armorTypeId === null
        ? null
        : numericValue(
            definition.armorTypeId,
            sourceCharacterId,
            "D&D Beyond returned invalid armor data.",
            0,
            100,
          ),
    damage: optionalDescriptionText(definition.damage),
    damageType: optionalDescriptionText(definition.damageType),
    // D&D Beyond reports weight per bundle (for example 2 lb per 1000 ball bearings).
    weight: (() => {
      const bundleWeight = optionalNumber(
        definition.weight,
        sourceCharacterId,
        "D&D Beyond returned invalid inventory weight.",
        Number.MAX_SAFE_INTEGER,
      );
      const bundleSize =
        typeof definition.bundleSize === "number" && definition.bundleSize > 1
          ? definition.bundleSize
          : 1;
      return bundleWeight === null ? null : bundleWeight / bundleSize;
    })(),
    cost: optionalNumber(
      definition.cost,
      sourceCharacterId,
      "D&D Beyond returned invalid inventory cost.",
      Number.MAX_SAFE_INTEGER,
    ),
    ...(homebrew ? { custom: true } : {}),
  };
}

function readEquipment(
  data: JsonRecord,
  sourceCharacterId: string,
): CharacterSliceInput["equipmentAndGold"] {
  const weapons: EquipmentEntry[] = [];
  const armor: EquipmentEntry[] = [];
  const magicItems: EquipmentEntry[] = [];
  const otherItems: EquipmentEntry[] = [];
  const attunedItems: EquipmentEntry[] = [];
  const currency = readCurrency(data.currencies, sourceCharacterId);
  const inventory = optionalArray(
    data.inventory,
    sourceCharacterId,
    "D&D Beyond returned malformed inventory data.",
  );
  for (const rawItem of inventory) {
    const entry = toEquipmentEntry(rawItem, sourceCharacterId);
    const category = entry.category.toLowerCase();
    if (category.includes("weapon")) {
      weapons.push(entry);
    } else if (category.includes("armor") || category.includes("shield")) {
      armor.push(entry);
    } else if (
      entry.attuned ||
      category.includes("wondrous") ||
      category.includes("wand") ||
      category.includes("scroll") ||
      category.includes("potion") ||
      category.includes("magic")
    ) {
      magicItems.push(entry);
    } else {
      otherItems.push(entry);
    }
    if (entry.attuned) {
      attunedItems.push(structuredClone(entry));
    }
  }
  for (const rawCustom of Array.isArray(data.customItems)
    ? (data.customItems as unknown[])
    : []) {
    const entry = customItemEntry(rawCustom);
    if (!entry) {
      continue;
    }
    (entry.attuned ? magicItems : otherItems).push(entry);
    if (entry.attuned) {
      attunedItems.push(structuredClone(entry));
    }
  }
  return { weapons, armor, magicItems, otherItems, attunedItems, currency };
}

function readWalkSpeed(race: JsonRecord | undefined): number {
  const speeds = optionalRecord(race?.weightSpeeds);
  const normal = optionalRecord(speeds?.normal);
  const walk = normal?.walk;
  return typeof walk === "number" && Number.isFinite(walk) && walk > 0
    ? walk
    : 30;
}

function readSpells(
  data: JsonRecord,
  sourceCharacterId: string,
): CharacterSliceInput["spellcasting"] {
  const spells = optionalRecord(data.spells);
  if (data.spells !== undefined && data.spells !== null && !spells) {
    return invalidPayload(
      sourceCharacterId,
      "D&D Beyond returned malformed spell data.",
    );
  }
  const cantrips: SpellEntry[] = [];
  const knownSpells: SpellEntry[] = [];
  const preparedSpells: SpellEntry[] = [];

  const classSpellGroups = optionalArray(
    data.classSpells,
    sourceCharacterId,
    "D&D Beyond returned malformed spell data.",
  ).flatMap((rawGroup) =>
    optionalArray(
      requiredRecord(
        rawGroup,
        sourceCharacterId,
        "D&D Beyond returned malformed spell data.",
      ).spells,
      sourceCharacterId,
      "D&D Beyond returned malformed spell data.",
    ),
  );
  const spellSources: unknown[] = [
    ...["background", "class", "feat", "item", "race"].flatMap((group) =>
      optionalArray(
        spells?.[group],
        sourceCharacterId,
        "D&D Beyond returned malformed spell data.",
      ),
    ),
    ...classSpellGroups,
  ];
  const seenSpells = new Set<string>();

  {
    for (const rawSpell of spellSources) {
      const spell = requiredRecord(
        rawSpell,
        sourceCharacterId,
        "D&D Beyond returned malformed spell data.",
      );
      const definition = requiredRecord(
        spell.definition,
        sourceCharacterId,
        "D&D Beyond returned a spell without a definition.",
      );
      const level = numericValue(
        definition.level,
        sourceCharacterId,
        "D&D Beyond returned an invalid spell level.",
        0,
        10,
      );
      const entry: SpellEntry = {
        id: optionalId(definition.id ?? spell.id),
        name: textValue(
          definition.name,
          sourceCharacterId,
          "D&D Beyond returned a spell without a name.",
          true,
        ),
        level,
        prepared: spell.prepared === true || spell.alwaysPrepared === true,
        ...(definition.isHomebrew === true
          ? {
              custom: true,
              description: looseText(definition.description),
            }
          : {}),
      };
      if (seenSpells.has(`${entry.id ?? ""}:${entry.name.toLowerCase()}`)) {
        continue;
      }
      seenSpells.add(`${entry.id ?? ""}:${entry.name.toLowerCase()}`);
      if (level === 0) {
        cantrips.push(entry);
      } else {
        knownSpells.push(entry);
        if (entry.prepared) {
          preparedSpells.push(structuredClone(entry));
        }
      }
    }
  }

  const spellSlots = optionalArray(
    data.spellSlots,
    sourceCharacterId,
    "D&D Beyond returned malformed spell slot data.",
  ).map((rawSlot) => {
    const slot = requiredRecord(
      rawSlot,
      sourceCharacterId,
      "D&D Beyond returned malformed spell slot data.",
    );
    return {
      level: numericValue(
        slot.level,
        sourceCharacterId,
        "D&D Beyond returned an invalid spell slot level.",
        1,
        9,
      ),
      count:
        slot.available === undefined || slot.available === null
          ? 0
          : numericValue(
              slot.available,
              sourceCharacterId,
              "D&D Beyond returned an invalid spell slot count.",
              0,
              Number.MAX_SAFE_INTEGER,
            ),
    };
  });

  return { cantrips, knownSpells, preparedSpells, spellSlots };
}

export function normalizeCharacterPayload(
  payload: unknown,
  sourceCharacterId: string,
): CharacterSliceInput {
  if (
    !/^[1-9]\d*$/.test(sourceCharacterId) ||
    !Number.isSafeInteger(Number(sourceCharacterId))
  ) {
    return invalidPayload(
      sourceCharacterId,
      "The imported character is missing a valid source identifier.",
    );
  }
  const outer = requiredRecord(
    payload,
    sourceCharacterId,
    "D&D Beyond returned an invalid character payload.",
  );
  const data =
    outer.success === true && isRecord(outer.data)
      ? outer.data
      : outer;
  const name = textValue(
    data.name,
    sourceCharacterId,
    "D&D Beyond returned a character without a name.",
    true,
  );
  const race = optionalRecord(data.race);
  const species =
    getOptionalText(
      race,
      "fullName",
      sourceCharacterId,
      "D&D Beyond returned an invalid species name.",
    ) ||
    getOptionalText(
      race,
      "baseName",
      sourceCharacterId,
      "D&D Beyond returned an invalid species name.",
    );
  if (!species) {
    return invalidPayload(
      sourceCharacterId,
      "D&D Beyond returned a character without species data.",
    );
  }

  const background = optionalRecord(data.background);
  const backgroundDefinition = optionalRecord(background?.definition);
  const customBackground = optionalRecord(background?.customBackground);
  const backgroundName =
    getOptionalText(
      backgroundDefinition,
      "name",
      sourceCharacterId,
      "D&D Beyond returned an invalid background name.",
    ) ||
    getOptionalText(
      customBackground,
      "name",
      sourceCharacterId,
      "D&D Beyond returned an invalid custom background name.",
    );
  if (!backgroundName) {
    return invalidPayload(
      sourceCharacterId,
      "D&D Beyond returned a character without background data.",
    );
  }

  const traits = optionalRecord(data.traits);
  const notes = optionalRecord(data.notes);
  const alignmentId =
    data.alignmentId === undefined || data.alignmentId === null
      ? null
      : numericValue(
          data.alignmentId,
          sourceCharacterId,
          "D&D Beyond returned an invalid alignment.",
          0,
          9,
        );
  const classSavingThrows = readClassSavingThrows(
    data.modifiers,
    sourceCharacterId,
  );

  return {
    sourceCharacterId,
    identityBackground: {
      name,
      species,
      walkSpeed: readWalkSpeed(race),
      appearance: getOptionalText(
        traits,
        "appearance",
        sourceCharacterId,
        "D&D Beyond returned invalid appearance data.",
      ),
      background: backgroundName,
      alignment:
        alignmentId === null || alignmentId === 0
          ? ""
          : (ALIGNMENT_BY_ID[alignmentId] ?? ""),
      personalityTraits: getOptionalText(
        traits,
        "personalityTraits",
        sourceCharacterId,
        "D&D Beyond returned invalid personality data.",
      ),
      ideals: getOptionalText(
        traits,
        "ideals",
        sourceCharacterId,
        "D&D Beyond returned invalid ideals data.",
      ),
      bonds: getOptionalText(
        traits,
        "bonds",
        sourceCharacterId,
        "D&D Beyond returned invalid bonds data.",
      ),
      flaws: getOptionalText(
        traits,
        "flaws",
        sourceCharacterId,
        "D&D Beyond returned invalid flaws data.",
      ),
      backstory: getOptionalText(
        notes,
        "backstory",
        sourceCharacterId,
        "D&D Beyond returned invalid backstory data.",
      ),
    },
    classProgression: readClasses(
      data.classes,
      sourceCharacterId,
      classSavingThrows,
    ),
    coreAbilityScores: readAbilityScores(data.stats, sourceCharacterId),
    proficienciesAndFeats: readProficiencies(data, sourceCharacterId),
    equipmentAndGold: readEquipment(data, sourceCharacterId),
    spellcasting: readSpells(data, sourceCharacterId),
  };
}
