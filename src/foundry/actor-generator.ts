import type { EquipmentEntry, SpellEntry } from "../types/character-slices.js";
import type { ImportedCharacter } from "../types/import-model.js";
import type { ShuffledCharacter } from "../types/shuffle-model.js";
import {
  recalculateDerivedStatistics,
  RulesResolutionError,
  type DerivedStatistics,
} from "../rules/recalculate-stats.js";
import { shuffleCharacters } from "../shuffle/shuffle-characters.js";
import { findArmorItem, findSystemItem, resolveSystemRules } from "./system-rules.js";

type JsonRecord = Record<string, unknown>;

export interface GeneratedActorBatch {
  actors: readonly FoundryActor[];
  warnings: readonly string[];
}

interface ResolvedActorData {
  data: JsonRecord;
  warnings: string[];
}

const ABILITY_ID: Readonly<Record<string, string>> = {
  strength: "str",
  dexterity: "dex",
  constitution: "con",
  intelligence: "int",
  wisdom: "wis",
  charisma: "cha",
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getSystemRecord(value: JsonRecord): JsonRecord {
  if (!isRecord(value.system)) {
    throw new RulesResolutionError("A compendium item has invalid system data.");
  }
  return value.system;
}

function getConfigName(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (isRecord(value) && typeof value.label === "string") {
    return value.label;
  }
  if (isRecord(value) && typeof value.name === "string") {
    return value.name;
  }
  return "";
}

function matchConfigKeys(
  config: Record<string, unknown> | undefined,
  entries: readonly { name: string }[],
): { values: string[]; custom: string[] } {
  const values: string[] = [];
  const custom: string[] = [];
  for (const entry of entries) {
    const key = Object.entries(config ?? {}).find(
      ([, value]) =>
        getConfigName(value).trim().toLowerCase() ===
        entry.name.trim().toLowerCase(),
    )?.[0];
    if (key) {
      values.push(key);
    } else {
      custom.push(entry.name);
    }
  }
  return { values: [...new Set(values)], custom: [...new Set(custom)] };
}

function cloneCompendiumItem(item: FoundryItemDocument): JsonRecord {
  const data = item.toObject();
  if (!isRecord(data) || typeof data.name !== "string") {
    throw new RulesResolutionError(
      `The D&D 5e compendium entry ${item.name} is malformed.`,
    );
  }
  return structuredClone(data);
}

function customLootItem(
  entry: EquipmentEntry,
  warnings: string[],
): JsonRecord {
  const detail = [
    entry.description,
    entry.damage ? `Damage: ${entry.damage}` : "",
    entry.damageType ? `Damage type: ${entry.damageType}` : "",
  ]
    .filter((value) => value.length > 0)
    .join("\n");
  if (entry.custom !== true) {
    warnings.push(
      `${entry.name} was added as custom loot; Foundry mechanics were not available.`,
    );
  }
  return {
    name: entry.name,
    type: "loot",
    system: {
      description: { value: detail },
      quantity: entry.quantity,
      weight: entry.weight ?? 0,
      price: { value: entry.cost ?? 0 },
      identified: true,
      equipped: entry.equipped,
      attuned: entry.attuned,
    },
    flags: {
      "d-d-character-randomizer": {
        sourceItemId: entry.id,
        attuned: entry.attuned,
        customDataOnly: true,
      },
    },
  };
}

async function findOptionalItem(
  name: string,
  expectedTypes: readonly string[],
): Promise<FoundryItemDocument | null> {
  try {
    return await findSystemItem(name, expectedTypes);
  } catch (error) {
    // Ambiguous non-class entries fall back to custom items instead of aborting the batch.
    if (error instanceof RulesResolutionError) {
      return null;
    }
    throw error;
  }
}

async function equipmentItem(
  entry: EquipmentEntry,
  warnings: string[],
): Promise<JsonRecord> {
  if (entry.custom === true) {
    // Homebrew and custom items must never be swapped for a similarly named official item.
    return customLootItem(entry, warnings);
  }
  const item =
    entry.armorTypeId !== null
      ? await findArmorItem(entry.name).catch((error: unknown) => {
          if (error instanceof RulesResolutionError) {
            return null;
          }
          throw error;
        })
      : await findOptionalItem(
          entry.name,
          entry.category.toLowerCase().includes("weapon")
            ? ["weapon"]
            : ["equipment", "loot", "consumable", "tool"],
        );
  if (!item) {
    return customLootItem(entry, warnings);
  }
  const data = cloneCompendiumItem(item);
  const system = getSystemRecord(data);
  if ("quantity" in system) {
    system.quantity = entry.quantity;
  }
  if (entry.weight !== null && "weight" in system) {
    if (isRecord(system.weight)) {
      system.weight.value = entry.weight;
    } else {
      system.weight = entry.weight;
    }
  }
  system.equipped = entry.equipped;
  if (entry.attuned) {
    system.attuned = true;
  }
  return data;
}

// Resolves compendium items granted by an item's ItemGrant advancements up to a level.
async function grantedItems(
  data: JsonRecord,
  level: number,
  seen: Set<string>,
): Promise<JsonRecord[]> {
  const system = getSystemRecord(data);
  const advancements = Array.isArray(system.advancement)
    ? system.advancement
    : isRecord(system.advancement)
      ? Object.values(system.advancement)
      : [];
  const granted: JsonRecord[] = [];
  for (const advancement of advancements) {
    if (
      !isRecord(advancement) ||
      advancement.type !== "ItemGrant" ||
      (typeof advancement.level === "number" && advancement.level > level)
    ) {
      continue;
    }
    const configuration = isRecord(advancement.configuration)
      ? advancement.configuration
      : {};
    const entries = Array.isArray(configuration.items)
      ? configuration.items
      : [];
    for (const entry of entries) {
      const uuid =
        typeof entry === "string"
          ? entry
          : isRecord(entry) && typeof entry.uuid === "string"
            ? entry.uuid
            : "";
      if (!uuid || seen.has(uuid)) {
        continue;
      }
      seen.add(uuid);
      const item = await fromUuid(uuid);
      if (item) {
        granted.push(cloneCompendiumItem(item));
      }
    }
  }
  return granted;
}

async function spellItem(
  entry: SpellEntry,
  warnings: string[],
): Promise<JsonRecord> {
  if (entry.custom === true) {
    return {
      name: entry.name,
      type: "spell",
      system: {
        level: entry.level,
        description: { value: entry.description ?? "" },
        preparation: { mode: "prepared", prepared: entry.prepared },
      },
      flags: {
        "d-d-character-randomizer": { customDataOnly: true },
      },
    };
  }
  const item = await findOptionalItem(entry.name, ["spell"]);
  if (item) {
    const data = cloneCompendiumItem(item);
    const system = getSystemRecord(data);
    if (isRecord(system.preparation)) {
      system.preparation.prepared = entry.prepared;
    }
    return data;
  }

  warnings.push(
    `${entry.name} was added as a custom spell without compendium mechanics.`,
  );
  return {
    name: entry.name,
    type: "spell",
    system: {
      level: entry.level,
      description: { value: "" },
      preparation: { mode: "prepared", prepared: entry.prepared },
    },
    flags: {
      "d-d-character-randomizer": { customDataOnly: true },
    },
  };
}

async function featureItem(
  name: string,
  description: string,
  expectedTypes: readonly string[],
  warnings: string[],
  custom?: { activation?: "action" | "bonus" | "reaction" },
): Promise<JsonRecord> {
  if (!custom) {
    const item = await findOptionalItem(name, expectedTypes);
    if (item) {
      return cloneCompendiumItem(item);
    }
    warnings.push(`${name} was added as a custom feature without system mechanics.`);
  }
  return {
    name,
    type: "feat",
    system: {
      description: { value: description },
      type: { value: "feat" },
      ...(custom?.activation
        ? { activation: { type: custom.activation, cost: 1 } }
        : {}),
    },
    flags: {
      "d-d-character-randomizer": {
        customDataOnly: true,
        ...(custom?.activation ? { activation: custom.activation } : {}),
      },
    },
  };
}

async function resolveActorItems(
  character: ShuffledCharacter,
  warnings: string[],
): Promise<JsonRecord[]> {
  const items: JsonRecord[] = [];
  const seenGrants = new Set<string>();
  for (const classLevel of character.slices.classProgression.classes) {
    const classItem = await findSystemItem(classLevel.className, ["class"]);
    if (!classItem) {
      throw new RulesResolutionError(
        `No D&D 5e compendium class matches ${classLevel.className}.`,
      );
    }
    const classData = cloneCompendiumItem(classItem);
    const classSystem = getSystemRecord(classData);
    classSystem.levels = classLevel.level;
    items.push(classData);
    items.push(...(await grantedItems(classData, classLevel.level, seenGrants)));
    if (classLevel.subclass) {
      const subclassData = await featureItem(
        classLevel.subclass,
        "",
        ["subclass"],
        warnings,
      );
      items.push(subclassData);
      items.push(
        ...(await grantedItems(subclassData, classLevel.level, seenGrants)),
      );
    }
  }

  const identity = character.slices.identityBackground;
  for (const [name, type] of [
    [identity.species, "race"],
    [identity.background, "background"],
  ] as const) {
    if (!name) {
      continue;
    }
    const origin = await findOptionalItem(name, [type]);
    if (origin) {
      const originData = cloneCompendiumItem(origin);
      items.push(originData);
      items.push(...(await grantedItems(originData, 20, seenGrants)));
    }
  }

  for (const feat of character.slices.proficienciesAndFeats.feats) {
    items.push(
      await featureItem(
        feat.name,
        feat.description,
        ["feat"],
        warnings,
        feat.custom
          ? feat.activation
            ? { activation: feat.activation }
            : {}
          : undefined,
      ),
    );
  }

  const equipment = character.slices.equipmentAndGold;
  const gear = [
    ...equipment.weapons,
    ...equipment.armor,
    ...equipment.magicItems,
    ...equipment.otherItems,
  ];
  for (const entry of gear) {
    items.push(await equipmentItem(entry, warnings));
  }

  const spells = [
    ...character.slices.spellcasting.cantrips,
    ...character.slices.spellcasting.knownSpells,
  ];
  const uniqueSpells = new Map<string, SpellEntry>();
  for (const spell of spells) {
    uniqueSpells.set(
      `${spell.id ?? ""}:${spell.name.toLowerCase()}`,
      spell,
    );
  }
  for (const spell of uniqueSpells.values()) {
    items.push(await spellItem(spell, warnings));
  }
  return items;
}

function actorSystemData(
  character: ShuffledCharacter,
  derived: DerivedStatistics,
): JsonRecord {
  const scores = character.slices.coreAbilityScores;
  const proficiencies = character.slices.proficienciesAndFeats;
  const abilities: JsonRecord = {};
  for (const [ability, score] of Object.entries(scores)) {
    const id = ABILITY_ID[ability];
    if (id) {
      abilities[id] = {
        value: score,
        proficient: derived.savingThrows[ability as keyof typeof scores]
          .proficient
          ? 1
          : 0,
      };
    }
  }

  const skills: JsonRecord = {};
  for (const skill of proficiencies.skills) {
    const key = Object.entries(game.system.config.skills).find(
      ([, config]) =>
        config.label?.trim().toLowerCase() === skill.name.trim().toLowerCase(),
    )?.[0];
    if (key) {
      skills[key] = { value: 1 };
    }
  }

  const languages = matchConfigKeys(
    game.system.config.languages,
    proficiencies.languages,
  );
  const armor = matchConfigKeys(
    game.system.config.armorProficiencies,
    proficiencies.armor,
  );
  const weapons = matchConfigKeys(
    game.system.config.weaponProficiencies,
    proficiencies.weapons,
  );
  const tools = matchConfigKeys(
    game.system.config.toolProficiencies,
    proficiencies.tools,
  );
  const identity = character.slices.identityBackground;
  const biography = [
    identity.appearance,
    identity.personalityTraits,
    identity.ideals,
    identity.bonds,
    identity.flaws,
    identity.backstory,
  ]
    .filter(Boolean)
    .join("\n\n");
  const spells: JsonRecord = {};
  for (const slot of character.slices.spellcasting.spellSlots) {
    spells[`spell${slot.level}`] = {
      value: slot.count,
      max: String(slot.count),
      override: "",
    };
  }
  const customProficiencies = [
    ...languages.custom,
    ...armor.custom,
    ...weapons.custom,
    ...tools.custom,
  ];

  return {
    abilities,
    attributes: {
      hp: { value: derived.maxHitPoints, max: derived.maxHitPoints, temp: 0 },
      ac: { value: derived.armorClass },
      prof: derived.proficiencyBonus,
      movement: { walk: identity.walkSpeed ?? 30, units: "ft" },
      spellcasting: derived.spellcasting
        ? ABILITY_ID[derived.spellcasting.ability]
        : "",
      spelldc: derived.spellcasting?.saveDc ?? 0,
      spellattack: derived.spellcasting?.attackBonus ?? 0,
    },
    details: {
      level: character.slices.classProgression.totalLevel,
      class: character.slices.classProgression.className,
      subclass: character.slices.classProgression.subclass,
      race: identity.species,
      background: identity.background,
      alignment: identity.alignment,
      biography: { value: biography },
    },
    traits: {
      languages: { value: languages.values, custom: languages.custom.join(", ") },
      armorProf: { value: armor.values, custom: armor.custom.join(", ") },
      weaponProf: { value: weapons.values, custom: weapons.custom.join(", ") },
      toolProf: { value: tools.values, custom: tools.custom.join(", ") },
      custom: customProficiencies.join(", "),
    },
    skills,
    currency: {
      pp: character.slices.equipmentAndGold.currency.platinum,
      gp: character.slices.equipmentAndGold.currency.gold,
      ep: character.slices.equipmentAndGold.currency.electrum,
      sp: character.slices.equipmentAndGold.currency.silver,
      cp: character.slices.equipmentAndGold.currency.copper,
    },
    spells,
  };
}

async function buildActorData(
  character: ShuffledCharacter,
  index: number,
  folderId: string,
): Promise<ResolvedActorData> {
  const hasSpells =
    character.slices.spellcasting.cantrips.length > 0 ||
    character.slices.spellcasting.knownSpells.length > 0;
  const rules = await resolveSystemRules(
    character.slices.classProgression,
    character.slices.equipmentAndGold,
  );
  const derived = recalculateDerivedStatistics(
    character.slices.classProgression,
    character.slices.coreAbilityScores,
    character.slices.equipmentAndGold,
    rules,
    hasSpells,
  );
  const warnings: string[] = [];
  const items = await resolveActorItems(character, warnings);
  const outputName = `${character.name} (Shuffled ${index + 1})`;
  return {
    data: {
      name: outputName,
      type: "character",
      folder: folderId,
      system: actorSystemData(character, derived),
      items,
      flags: {
        "d-d-character-randomizer": {
          generated: true,
          derived: {
            armorClass: derived.armorClass,
            maxHitPoints: derived.maxHitPoints,
            proficiencyBonus: derived.proficiencyBonus,
            className: character.slices.classProgression.className,
            subclass: character.slices.classProgression.subclass,
            level: character.slices.classProgression.totalLevel,
            hitDice: character.slices.classProgression.hitDice,
            spellAbility: derived.spellcasting?.ability ?? "",
            spellSaveDc: derived.spellcasting?.saveDc ?? 0,
            spellAttack: derived.spellcasting?.attackBonus ?? 0,
          },
          componentOrigins: structuredClone(character.origins),
          narrative: {
            appearance: character.slices.identityBackground.appearance,
            personalityTraits:
              character.slices.identityBackground.personalityTraits,
            ideals: character.slices.identityBackground.ideals,
            bonds: character.slices.identityBackground.bonds,
            flaws: character.slices.identityBackground.flaws,
            backstory: character.slices.identityBackground.backstory,
          },
        },
      },
    },
    warnings,
  };
}

function uniqueActorName(name: string, reserved: Set<string>): string {
  const base = name;
  let suffix = 2;
  while (reserved.has(name.toLocaleLowerCase())) {
    name = `${base} ${suffix}`;
    suffix += 1;
  }
  reserved.add(name.toLocaleLowerCase());
  return name;
}

export async function createShuffledActors(
  characters: readonly ImportedCharacter[],
  random: () => number = Math.random,
): Promise<GeneratedActorBatch> {
  if (game.system.id !== "dnd5e") {
    throw new Error("Actor generation requires the D&D 5e system.");
  }
  const shuffled = shuffleCharacters(characters, random);
  return createActorsFromShuffle(shuffled);
}

export async function createActorsFromShuffle(
  shuffled: readonly ShuffledCharacter[],
): Promise<GeneratedActorBatch> {
  if (game.system.id !== "dnd5e") {
    throw new Error("Actor generation requires the D&D 5e system.");
  }
  if (shuffled.length < 2) {
    throw new RangeError("At least two shuffled characters are required.");
  }
  const staged = await Promise.all(
    shuffled.map((character, index) => buildActorData(character, index, "")),
  );

  let folder = game.folders.contents.find(
    (candidate) =>
      candidate.name === "Shuffled Characters" &&
      candidate.type === "Actor",
  );
  if (!folder) {
    folder = await CONFIG.Folder.documentClass.create({
      name: "Shuffled Characters",
      type: "Actor",
    });
  }

  const reservedNames = new Set(
    game.actors.contents.map((actor) => actor.name.toLocaleLowerCase()),
  );
  const actorData = staged.map(({ data }) => ({
    ...data,
    name: uniqueActorName(String(data.name), reservedNames),
    folder: folder.id,
  }));
  const actors =
    await CONFIG.Actor.documentClass.createDocuments(actorData);
  if (actors.length !== shuffled.length) {
    throw new Error(
      `Foundry created ${actors.length} of ${shuffled.length} requested Actors.`,
    );
  }
  return {
    actors,
    warnings: [...new Set(staged.flatMap(({ warnings }) => warnings))],
  };
}
