<!--
Sync Impact Report
Version change: 1.0.0 -> 1.1.0 (MINOR: expanded secure ingestion to authorize
  transient HTTPS transfer to the user's self-hosted proxy)
Modified principles: Secure D&D Beyond Ingestion (credential transport boundary)
Added sections: none
Removed sections: none
Follow-up TODO: establish the original ratification date.
-->
# D&D Beyond Character Shuffler Constitution

## Core Principles

### I. Foundry v12 Native Integration
The module MUST target Foundry Virtual Tabletop v12 and the D&D 5e system
(`game.system.id === "dnd5e"`). It MUST use v12 document models, native `Actor5e`
and `Item5e` documents, and `ApplicationV2` or v12-compatible Handlebars
applications. Deprecated v10/v11 APIs MUST NOT be used unless a documented
compatibility requirement makes them necessary.

### II. Secure D&D Beyond Ingestion
The module MUST support campaign URL discovery and direct character URL ingestion,
retrieving character payloads from D&D Beyond services through a backend
controlled by the user. Requests requiring authentication MUST use the
user-provided `CobaltSession`, held in a client-scoped Foundry setting. The
module MAY transmit this credential over HTTPS directly to the user's
self-hosted proxy solely to fulfill the requested import. The proxy MUST NOT
persist or log the raw credential, and MUST exchange it server-side for a
short-lived token where supported. The credential MUST NOT be sent to a
third-party hosted proxy, included in character data, or exposed in logs.
Browser requests MUST NOT call D&D Beyond directly.

### III. Balanced Component Shuffling
The shuffler MUST accept at least two valid character sheets and produce exactly
the same number of hybrid characters. Each sheet MUST be decomposed into exactly
six buckets: `Identity` (species/race, background, alignment, appearance,
backstory, personality traits, ideals, bonds, flaws); `ClassProgression` (class,
subclass, level, hit dice); `BaseAbilityScores` (STR, DEX, CON, INT, WIS, CHA);
`ProficienciesAndFeats` (skills, tools, languages, feats, senses);
`EquipmentInventory` (weapons, armor, magic items, currency, attunement slots);
and `Spellcasting` (known and prepared spells, cantrips, spell slots).

For every bucket, the module MUST apply a randomized derangement across the batch
so no component remains with its original character. Every input component MUST
be used exactly once: no component may be duplicated or lost.

### IV. Rules-Correct Character Normalization
Before document generation, the module MUST recalculate derived statistics for
each hybrid. Maximum HP MUST use the class hit die, level, and Constitution
modifier: hit die base at level 1, plus `(level - 1) * (floor(hit die / 2) + 1)`,
plus Constitution modifier times level. AC MUST reflect the assigned equipment
and applicable ability modifiers, including Barbarian or Monk Unarmored Defense.
Spell save DC and spell attack MUST use the new class's primary casting ability
and proficiency bonus. Saving throws MUST combine the new class's save
proficiencies with the new ability modifiers. Proficiency bonus MUST be based on
total level: `2 + floor((level - 1) / 4)`.

Rules data MUST be derived from the D&D 5e system or official SRD data where
available; rules tables MUST NOT be hardcoded when they can be obtained from
those sources.

### V. Native Foundry and Portable Exports
The module MUST be able to create the batch as native `Actor5e` documents in a
dedicated `Shuffled Characters` folder and map weapons, armor, spells, and
features to Foundry items, linking compendium entries where possible. It MUST
also support downloadable fillable standard 5e PDFs, filled client-side with
`pdf-lib` from a bundled three-page template in `assets/`, and individual
Foundry `Actor5e` JSON exports using `actor.exportToJSON()`.

## Engineering and Security Constraints

The runtime MUST support Node.js 20 or later and modern browsers. TypeScript
MUST use strict checking, target ES2022, and disallow implicit `any`. The
implementation MUST define explicit interfaces for D&D Beyond payloads,
component buckets, and Foundry document data; TypeScript `any` MUST NOT be used.

The `CobaltSession` token MUST be registered with `game.settings.register` as a
client-scoped, configurable string setting. Authenticated requests MUST pass
the token as a cookie through Foundry's backend fetching mechanisms to avoid
browser CORS restrictions.

## Validation and Quality Gates

Shuffle controls MUST remain unavailable until at least two valid character
sheets are loaded. Validation MUST confirm the output count equals the input
count and that each bucket is a complete permutation of its input components.
Stat recalculation and generated actor data MUST be validated before export or
creation so malformed hybrids are not presented as successful outputs.

Implementation changes MUST NOT leave placeholder comments in place of required
logic. Changes to shuffling, recalculation, ingestion, or export behavior MUST
be covered by focused automated checks for their stated requirements.

## Governance

This constitution governs project implementation and review. Amendments MUST be
proposed as documented changes with their rationale and impact on existing
requirements. Maintainers MUST review amendments for consistency and update the
version and amendment date when they are accepted. Implementation reviews MUST
verify compliance with applicable principles and quality gates; any exception
MUST be documented with its rationale.

Constitution versions use semantic versioning: MAJOR for backward-incompatible
governance changes or principle removal/redefinition, MINOR for new principles
or materially expanded requirements, and PATCH for clarifications and
non-semantic refinements.

**Version**: 1.1.0 | **Ratified**: TODO(RATIFICATION_DATE): Original adoption date was not provided and could not be established. | **Last Amended**: 2026-11-01
