# Feature Specification: D&D Beyond Character Shuffler

**Feature Branch**: `not-created`

**Created**: 2026-11-01

**Status**: Expanded

**Input**: Import D&D Beyond characters individually or by campaign, separate each into six reusable slices, shuffle those slices into the same number of hybrids, recalculate character statistics, create Foundry Actors, and export fillable PDFs and Foundry JSON.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Import a Campaign Roster (Priority: P1)

A Dungeon Master provides a campaign link and imports its player characters as a
batch. The tool retrieves every accessible character and creates six reusable
slices for each one, so the batch is ready for a later shuffling step.

**Why this priority**: Campaign import is the fastest way to prepare a group and
is the primary batch workflow.

**Independent Test**: Import a campaign with four accessible player characters
and verify that four character records are loaded, each with all six slices.

**Acceptance Scenarios**:

1. **Given** a valid campaign link and an authorized session, **When** the
   Dungeon Master imports a campaign with four accessible player characters,
   **Then** all four are represented and each contains exactly six slices.
2. **Given** a campaign whose roster contains a character the session cannot
   access, **When** the Dungeon Master imports it, **Then** the import stops
   with an alert identifying the inaccessible character and no partial batch
   is presented as successfully imported.
3. **Given** an accessible character with sample identity, class, ability,
   proficiency, equipment, and spell data, **When** the Dungeon Master imports
   it, **Then** each value appears in its corresponding slice and none is
   omitted or assigned to another category.

---

### User Story 2 - Import One Character (Priority: P2)

A Dungeon Master provides a character link or ID to load one specific
character, without needing to import a campaign roster.

**Why this priority**: Individual import supports small groups, targeted
re-imports, and campaign-independent workflows.

**Independent Test**: Import an accessible character by link and by ID in
separate runs, verifying that each run creates that character's six slices.

**Acceptance Scenarios**:

1. **Given** a valid character link or ID and an authorized session, **When**
   the Dungeon Master imports it, **Then** the character is loaded with all six
   slices.
2. **Given** an invalid link or malformed ID, **When** the Dungeon Master
   submits it, **Then** the tool warns about the invalid input without making
   a request for that input.
3. **Given** one valid character is loaded, **When** the Dungeon Master checks
   the later shuffle operation, **Then** it is unavailable; after a second
   valid character is loaded, **Then** the operation becomes available.

---

### User Story 3 - Protect Access and Source Data (Priority: P1)

A Dungeon Master can tell whether credentials or access prevent import, and
can rely on slicing not changing the original character or existing Foundry
actors.

**Why this priority**: Clear failure behavior and data isolation are essential
to trust when handling campaign characters.

**Independent Test**: Attempt an import with an expired session and an
inaccessible character, then compare source character data and existing actors
before and after a successful slicing run.

**Acceptance Scenarios**:

1. **Given** an expired session, **When** the Dungeon Master attempts import,
   **Then** the operation stops and an alert explains that the session must be
   renewed.
2. **Given** a character that is private or otherwise inaccessible, **When**
   the Dungeon Master attempts import, **Then** the operation stops and an
   alert explains that the character cannot be accessed.
3. **Given** a successful import and slicing operation, **When** the Dungeon
   Master compares the source characters and existing Foundry actors with
   their prior state, **Then** neither has been modified.
4. **Given** optional character details such as backstory or personality traits
   are absent, **When** the character is sliced, **Then** those fields are
   represented as blank values and the other slices are still available.
5. **Given** the Dungeon Master has entered a session cookie in module settings,
   **When** a later import is started, **Then** that saved credential is used
   without requiring the Dungeon Master to enter it again, and the credential
   does not appear in alerts, logs, slices, or exports.

### User Story 4 - Shuffle Character Components (Priority: P1)

The Dungeon Master shuffles a loaded group into the same number of hybrid
characters. Each of the six component categories is independently reassigned
so every original component is used once and no component stays with its
original character.

**Independent Test**: Shuffle two or more synthetic characters using a
deterministic test random source and verify cardinality, per-category
permutation, derangement, and source-data isolation.

### User Story 5 - Recalculate and Create Hybrid Actors (Priority: P1)

The Dungeon Master reviews the hybrid results and creates them as native
D&D 5e Actors in a dedicated `Shuffled Characters` folder. Before creation,
the tool recalculates hit points, armor class, proficiency bonus, saving throws,
and spellcasting values, and validates all generated data.

**Independent Test**: Generate a known hybrid fixture, assert derived values
against the specified rules, and verify that failed validation creates no
partial Actors and never overwrites existing Actors.

### User Story 6 - Export Hybrids (Priority: P2)

The Dungeon Master downloads each generated Actor as Foundry JSON or fills and
downloads a three-page 5e PDF. The module uses an original, openly licensed
fillable template and does not bundle an unlicensed official sheet.

**Independent Test**: Verify each JSON export is valid Foundry Actor JSON and
each PDF export fills mapped AcroForm fields in the bundled template without
including credentials or unrelated source data.

---

### Edge Cases

- An input contains an empty value, malformed URL, or non-numeric character or
  campaign ID; reject it before attempting access.
- A campaign has fewer than two accessible player characters; import may
  complete for inspection, but the batch is not eligible for a later shuffle
  until at least two valid characters are loaded.
- A campaign roster includes a character that is private, deleted, or no
  longer available; stop the batch and report the affected character rather
  than silently omitting it.
- A character payload lacks required information needed to identify or
  categorize its character; report the invalid character and do not claim a
  complete slice set.
- Optional narrative information is absent; use blank values rather than
  failing the import.
- Two characters have similar names or details; retain their source identity
  so their slices remain distinguishable.
- Re-importing a character does not overwrite existing Foundry actors or
  mutate slices created during an earlier import.
- A batch has only two characters; each bucket still must use a valid
  derangement with no fixed point.
- Random shuffling must not mutate loaded source slices, and a failed shuffle
  or validation must not replace the last successful output.
- An equipment or spell entry cannot be matched to a system compendium; create
  a clearly identified custom item only from verified source data and report
  absent mechanics instead of inventing rules.
- A class or armor combination cannot be resolved from system data; do not
  silently guess a casting ability or armor calculation.
- Repeated generation must create new Actors and must not overwrite previously
  generated or user-owned Actors.
- PDF creation fails if the template is missing, malformed, or lacks a mapped
  field; do not emit a success-shaped empty PDF.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The tool MUST allow the Dungeon Master to save a D&D Beyond
  `CobaltSession` session cookie in module settings for use when importing
  characters.
- **FR-002**: The tool MUST allow import of an individual character by a
  D&D Beyond character URL or character ID.
- **FR-003**: The tool MUST allow import of player characters from a D&D Beyond
  campaign URL.
- **FR-004**: The tool MUST validate submitted links and IDs before attempting
  to access the corresponding character or campaign.
- **FR-005**: The tool MUST stop an import and show a clear alert when the
  session is expired or a requested character cannot be accessed.
- **FR-006**: A campaign import MUST either present the complete requested
  roster or report failure; it MUST NOT present an incomplete batch as a
  successful complete import.
- **FR-007**: For each valid imported character, the tool MUST create exactly
  six distinct slices: Identity & Background; Class & Progression; Core Ability
  Scores; Proficiencies & Feats; Equipment & Gold; and Spellcasting.
- **FR-008**: The Identity & Background slice MUST include name, race/species,
  appearance, background, alignment, personality traits, and backstory.
- **FR-009**: The Class & Progression slice MUST include class, subclass, total
  level, and hit dice.
- **FR-010**: The Core Ability Scores slice MUST include raw Strength,
  Dexterity, Constitution, Intelligence, Wisdom, and Charisma scores before
  equipment and temporary effects.
- **FR-011**: The Proficiencies & Feats slice MUST include skill and saving
  throw proficiencies, languages, tool proficiencies, armor and weapon
  proficiencies, and feats.
- **FR-012**: The Equipment & Gold slice MUST include weapons, armor, magic
  items, currency denominations, and attuned items.
- **FR-013**: The Spellcasting slice MUST include cantrips, known spells,
  prepared spells, and spell slots.
- **FR-014**: Each slice MUST be an independent copy; changing a slice MUST NOT
  change the source character, another slice, or an existing Foundry actor.
- **FR-015**: Missing non-essential narrative details MUST be represented as
  blank values without preventing the remaining slices from being created.
- **FR-016**: The tool MUST require at least two valid loaded characters before
  enabling the later shuffle operation.
- **FR-017**: Imported credentials MUST NOT appear in alerts, logs, character
  slices, or exported character data.
- **FR-018**: For each slice category, the shuffler MUST independently assign a
  randomized derangement of all loaded components to the same number of output
  characters; no input component may be lost, duplicated, or remain in its
  original character when a derangement is mathematically possible.
- **FR-019**: Shuffling MUST require at least two valid characters, produce
  exactly one output per input, and leave all imported slices unchanged.
- **FR-020**: The rules engine MUST calculate proficiency bonus from total
  character level as `2 + floor((level - 1) / 4)` and maximum hit points using
  the class hit die, level, and Constitution modifier using the formula defined
  by the project constitution.
- **FR-021**: The rules engine MUST calculate armor class from equipped armor
  and relevant ability modifiers, including Barbarian and Monk Unarmored
  Defense, and calculate spell save DC and spell attack from the selected
  class's primary casting ability and proficiency bonus. It MUST obtain class
  and item rules metadata from the D&D 5e system/compendiums where available
  and MUST fail validation instead of guessing when essential metadata is
  unavailable.
- **FR-022**: Saving throw proficiencies for each hybrid MUST come from its
  assigned class progression and MUST be combined with the hybrid ability
  modifiers; they MUST NOT be copied from an unrelated proficiency slice.
- **FR-023**: The tool MUST validate every generated Actor before creating any
  Actor. Successful batch creation MUST create exactly N native D&D 5e Actors
  in a dedicated `Shuffled Characters` folder without updating or overwriting
  existing Actors.
- **FR-024**: The tool MUST map weapons, armor, spells, and features to native
  Foundry items using system compendium entries where possible. Unmatched items
  MAY be created as clearly identified custom items using only verified
  available fields; missing mechanics MUST be reported and never fabricated.
- **FR-025**: The tool MUST provide one Foundry JSON export per generated Actor
  using native Actor JSON export data, with no imported credentials or raw
  payloads.
- **FR-026**: The tool MUST provide a client-side fillable PDF export using
  `pdf-lib` and a bundled three-page, openly licensed 5e character sheet
  template. The template's license MUST be included; no unlicensed official
  artwork, branding, or sheet may be bundled.

### Key Entities *(include if feature involves data)*

- **Imported Character**: A character retrieved from an individual link/ID or
  campaign roster, retaining enough source identity to distinguish it from
  other imported characters.
- **Shuffled Character**: An independent six-slice hybrid with validated
  derived statistics, suitable for Actor creation and export.
- **Shuffle Result**: A batch of exactly N shuffled characters and the
  per-slice derangements used to produce them.
- **Generated Actor**: A native D&D 5e Actor created in the dedicated output
  folder from a validated shuffled character.
- **Campaign Roster**: The player characters associated with the submitted
  campaign link and the outcome of accessing each character.
- **Character Slice**: One independent, reusable category of a character's
  data; each valid imported character has exactly six slices.
- **Session Credential**: The Dungeon Master's saved session cookie used to
  access characters they are permitted to view.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a successful import of a campaign with four accessible player
  characters, 4 of 4 characters are represented, each with exactly six slices
  containing their corresponding source data (blank permitted for missing
  optional narrative fields).
- **SC-002**: In valid individual imports submitted by URL and ID, 100% produce
  one character record with all six slices.
- **SC-003**: 100% of malformed URLs and IDs are rejected before a character
  or campaign access attempt is made.
- **SC-004**: In tests with expired credentials or inaccessible characters,
  100% of the affected import attempts stop with a user-facing explanation and
  do not report a complete successful batch.
- **SC-005**: In before-and-after comparisons, 100% of source character data
  and existing Foundry actors remain unchanged by importing and slicing.
- **SC-006**: At least 90% of representative Dungeon Masters can complete a
  valid individual import or campaign import without assistance on their first
  attempt.
- **SC-007**: Every successful shuffle of N >= 2 characters returns exactly N
  results, and each of the six buckets is a complete derangement containing
  each input component exactly once.
- **SC-008**: All required derived-stat test cases match the specified rules,
  and missing essential class/item metadata causes a clear validation error
  before Actor creation.
- **SC-009**: A successful Actor batch creates N new Actors in the dedicated
  folder; any pre-creation validation failure creates zero Actors and leaves
  all existing Actors unchanged.
- **SC-010**: Every generated Actor can be downloaded as valid Foundry JSON,
  and every PDF export contains mapped AcroForm values and no credentials.

## Assumptions

- The Dungeon Master is authorized to use the saved session cookie and to view
  the characters they request.
- A campaign roster means its player characters, not non-player characters.
- A character must contain enough required data to be identified and divided
  into the six categories; optional narrative details may be blank.
- Campaign roster import remains fail-closed until its roster response schema
  is verified against an authorized sample. The shuffle, calculation, Actor
  creation, and export workflows do not depend on guessing that schema.
- A single character may be imported and sliced for inspection, but the
  separate shuffling workflow remains unavailable until at least two valid
  characters are loaded.
- If any requested campaign character is inaccessible, the safe default is to
  stop the entire batch and report the issue rather than silently omit a
  character.
- Import requires an active internet connection and continued availability of
  the external character service.
