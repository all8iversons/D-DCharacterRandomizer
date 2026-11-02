import type {
  ClassProgressionSlice,
  CoreAbilityScoresSlice,
  EquipmentAndGoldSlice,
} from "../types/character-slices.js";

export type AbilityKey = keyof CoreAbilityScoresSlice;

export interface ClassRules {
  className: string;
  hitDie: number;
  spellcastingAbility: AbilityKey | null;
  unarmoredDefense: {
    abilities: readonly [AbilityKey, AbilityKey];
    shieldAllowed: boolean;
  } | null;
}

export type ArmorCategory = "light" | "medium" | "heavy" | "shield";

export interface ArmorRules {
  itemId: string | null;
  name: string;
  category: ArmorCategory;
  baseArmorClass: number;
  dexterityCap: number | null;
  shieldBonus: number;
}

export interface DerivedSavingThrow {
  abilityModifier: number;
  proficient: boolean;
  total: number;
}

export interface DerivedSpellcasting {
  ability: AbilityKey;
  saveDc: number;
  attackBonus: number;
}

export interface DerivedStatistics {
  proficiencyBonus: number;
  maxHitPoints: number;
  armorClass: number;
  abilityModifiers: Record<AbilityKey, number>;
  savingThrows: Record<AbilityKey, DerivedSavingThrow>;
  spellcasting: DerivedSpellcasting | null;
}

export interface RulesResolution {
  classes: readonly ClassRules[];
  armor: readonly ArmorRules[];
}

export class RulesResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RulesResolutionError";
  }
}

const ABILITIES: readonly AbilityKey[] = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
];

function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

function classRuleFor(
  className: string,
  classes: readonly ClassRules[],
): ClassRules {
  const rule = classes.find(
    (candidate) =>
      candidate.className.trim().toLowerCase() ===
      className.trim().toLowerCase(),
  );
  if (!rule) {
    throw new RulesResolutionError(
      `D&D 5e system data is missing class rules for ${className}.`,
    );
  }
  return rule;
}

function calculateHitPoints(
  progression: ClassProgressionSlice,
  constitutionModifier: number,
  classRules: readonly ClassRules[],
): number {
  if (
    progression.classes.length === 0 ||
    progression.classes.reduce((total, entry) => total + entry.level, 0) !==
      progression.totalLevel
  ) {
    throw new RulesResolutionError(
      "Class levels do not match the character's total level.",
    );
  }

  let averageHitPoints = 0;
  let firstLevelAdjustment = 0;
  for (const [index, classLevel] of progression.classes.entries()) {
    const rules = classRuleFor(classLevel.className, classRules);
    if (rules.hitDie !== classLevel.hitDie) {
      throw new RulesResolutionError(
        `D&D 5e system hit die data conflicts with ${classLevel.className}.`,
      );
    }
    const average = Math.floor(rules.hitDie / 2) + 1;
    averageHitPoints += average * classLevel.level;
    if (index === 0) {
      firstLevelAdjustment = rules.hitDie - average;
    }
  }

  return Math.max(
    1,
    averageHitPoints +
      firstLevelAdjustment +
      constitutionModifier * progression.totalLevel,
  );
}

function calculateArmorClass(
  dexterityModifier: number,
  constitutionModifier: number,
  wisdomModifier: number,
  equipment: EquipmentAndGoldSlice,
  classRules: readonly ClassRules[],
  armorRules: readonly ArmorRules[],
): number {
  const equipped = equipment.armor.filter((item) => item.equipped);
  const bodyArmor: ArmorRules[] = [];
  const shields: ArmorRules[] = [];

  for (const item of equipped) {
    const rule = armorRules.find(
      (candidate) =>
        (item.id !== null && candidate.itemId === item.id) ||
        candidate.name.trim().toLowerCase() === item.name.trim().toLowerCase(),
    );
    if (!rule) {
      throw new RulesResolutionError(
        `D&D 5e system armor data is missing for ${item.name}.`,
      );
    }
    if (rule.category === "shield") {
      shields.push(rule);
    } else {
      bodyArmor.push(rule);
    }
  }

  if (bodyArmor.length > 1 || shields.length > 1) {
    throw new RulesResolutionError(
      "Equipped armor contains combinations that cannot be calculated safely.",
    );
  }

  const shield = shields[0];
  if (bodyArmor.length === 0) {
    const unarmoredRules = classRules.filter(
      (rule) => rule.unarmoredDefense !== null,
    );
    if (unarmoredRules.length > 1) {
      throw new RulesResolutionError(
        "Multiple Unarmored Defense features require a manual rules choice.",
      );
    }
    const unarmored = unarmoredRules[0]?.unarmoredDefense;
    if (unarmored && shield && !unarmored.shieldAllowed) {
      return 10 + dexterityModifier;
    }
    if (unarmored) {
      const [first, second] = unarmored.abilities;
      const modifiers: Record<AbilityKey, number> = {
        strength: 0,
        dexterity: dexterityModifier,
        constitution: constitutionModifier,
        intelligence: 0,
        wisdom: wisdomModifier,
        charisma: 0,
      };
      return (
        10 + modifiers[first] + modifiers[second] + (shield?.shieldBonus ?? 0)
      );
    }
    return 10 + dexterityModifier + (shield?.shieldBonus ?? 0);
  }

  const armor = bodyArmor[0]!;
  const dexterityBonus =
    armor.category === "heavy"
      ? 0
      : armor.dexterityCap === null
        ? dexterityModifier
        : Math.min(dexterityModifier, armor.dexterityCap);
  return (
    armor.baseArmorClass +
    dexterityBonus +
    (shield?.shieldBonus ?? 0)
  );
}

export function recalculateDerivedStatistics(
  progression: ClassProgressionSlice,
  abilities: CoreAbilityScoresSlice,
  equipment: EquipmentAndGoldSlice,
  rules: RulesResolution,
  hasSpells: boolean,
): DerivedStatistics {
  const abilityModifiers: Record<AbilityKey, number> = {
    strength: abilityModifier(abilities.strength),
    dexterity: abilityModifier(abilities.dexterity),
    constitution: abilityModifier(abilities.constitution),
    intelligence: abilityModifier(abilities.intelligence),
    wisdom: abilityModifier(abilities.wisdom),
    charisma: abilityModifier(abilities.charisma),
  };
  const proficiencyBonus =
    2 + Math.floor((progression.totalLevel - 1) / 4);
  const resolvedClasses = progression.classes.map((classLevel) => ({
    level: classLevel,
    rules: classRuleFor(classLevel.className, rules.classes),
  }));
  const savingThrowProficiencies = new Set(
    progression.classes[0]?.savingThrowProficiencies ?? [],
  );
  const savingThrows = Object.fromEntries(
    ABILITIES.map((ability) => {
      const proficient = savingThrowProficiencies.has(ability);
      const modifier = abilityModifiers[ability];
      return [
        ability,
        {
          abilityModifier: modifier,
          proficient,
          total: modifier + (proficient ? proficiencyBonus : 0),
        },
      ];
    }),
  ) as Record<AbilityKey, DerivedSavingThrow>;

  const castingAbilities = [
    ...new Set(
      resolvedClasses.flatMap(({ rules: classRule }) =>
        classRule.spellcastingAbility === null
          ? []
          : [classRule.spellcastingAbility],
      ),
    ),
  ];
  // Zero casting abilities is valid after a shuffle: spells are kept without a save DC.
  if (hasSpells && castingAbilities.length > 1) {
    throw new RulesResolutionError(
      "Spellcasting ability is ambiguous for the assigned class progression.",
    );
  }
  // Non-casting classes fall back to the best mental ability so DC and attack are always shown.
  const castingAbility: AbilityKey =
    castingAbilities[0] ??
    (["intelligence", "wisdom", "charisma"] as const).reduce((best, key) =>
      abilityModifiers[key] > abilityModifiers[best] ? key : best,
    );

  return {
    proficiencyBonus,
    maxHitPoints: calculateHitPoints(
      progression,
      abilityModifiers.constitution,
      rules.classes,
    ),
    armorClass: calculateArmorClass(
      abilityModifiers.dexterity,
      abilityModifiers.constitution,
      abilityModifiers.wisdom,
      equipment,
      rules.classes,
      rules.armor,
    ),
    abilityModifiers,
    savingThrows,
    spellcasting: {
      ability: castingAbility,
      saveDc: 8 + proficiencyBonus + abilityModifiers[castingAbility],
      attackBonus: proficiencyBonus + abilityModifiers[castingAbility],
    },
  };
}
