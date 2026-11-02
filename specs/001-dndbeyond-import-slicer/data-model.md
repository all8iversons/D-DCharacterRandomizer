# Data Model: D&D Beyond Import and Slicing

The import pipeline uses transient data only. It MUST NOT persist remote
payloads, create/update Foundry Actors, or retain mutable references into the
remote response.

## Entities

### Import Request

Represents one user-initiated import.

| Field | Type | Constraints |
|---|---|---|
| `kind` | `character` or `campaign` | Required; selects one input mode |
| `sourceValue` | string | Required; a character URL/ID or campaign URL |
| `submittedAt` | timestamp | Captured for progress/error context; contains no credential |

Validation:

- Character IDs MUST be numeric and positive after parsing.
- URLs MUST use HTTPS and an approved D&D Beyond host/path for the requested
  resource type.
- Invalid inputs MUST be rejected before remote access.

### Session Credential

The GM's `CobaltSession` setting, referenced by the request path but never
copied into a domain entity.

| Field | Type | Constraints |
|---|---|---|
| `value` | secret string | Stored only in the constitution-mandated client-scoped setting; never logged or serialized with imported data |

The raw value is sent only through backend-mediated remote authentication and
campaign access when required. Any derived bearer token is short-lived,
ephemeral, and also excluded from logs and character models. Client-scoped
settings are not encrypted at rest by Foundry.

### Import Batch

An in-memory result of a single character or campaign import.

| Field | Type | Constraints |
|---|---|---|
| `id` | string | Unique per import operation |
| `source` | `Import Request` | Required |
| `status` | enum | `validating`, `authenticating`, `fetching`, `slicing`, `complete`, `failed` |
| `characters` | `Imported Character[]` | Empty until successful commit; complete batch only |
| `error` | `Import Error \| null` | Set on failure; MUST NOT include credentials |

State transitions:

`validating -> authenticating -> fetching -> slicing -> complete`

Any non-terminal state may transition to `failed`. A campaign batch MUST NOT
publish a partial character list as complete. A failed operation leaves
existing Foundry actors and previously loaded batches unchanged.

### Imported Character

One successfully retrieved character, kept in memory for slicing and later
shuffle eligibility.

| Field | Type | Constraints |
|---|---|---|
| `sourceCharacterId` | string | Required, stable source identity; not inferred from character name |
| `sourceCampaignId` | string \| null | Set for campaign imports when known |
| `name` | string | Required; may be used for display, not identity |
| `slices` | `Character Slices` | Exactly six independent values |

The full raw response may be held only as a short-lived local parsing value
while normalization runs. It is not persisted or exposed to the UI after the
six slices are built.

### Character Slices

An exact six-member record. Every value is an independent copy of the
corresponding source data.

| Slice | Required data | Missing data behavior |
|---|---|---|
| `identityBackground` | Name, species/race, appearance, background, alignment, personality traits, ideals, bonds, flaws, backstory | Missing non-essential narrative fields become blank strings |
| `classProgression` | Class, subclass, total level, hit dice | Required data missing or invalid makes the character invalid |
| `coreAbilityScores` | Raw STR, DEX, CON, INT, WIS, CHA scores before equipment or temporary effects | All six values required and validated |
| `proficienciesAndFeats` | Skills, saving throw proficiencies, languages, tools, armor/weapon proficiencies, feats | Empty collection when absent; malformed values fail validation |
| `equipmentAndGold` | Weapons, armor, magic items, other gear, currency denominations, attuned items | Empty collections and zero currency where source explicitly has none |
| `spellcasting` | Cantrips, known/prepared spells, spell slots | Empty collections/slots when source explicitly has none |

Where source data does not distinguish an absent collection from an intentionally
empty collection, preserve the normalized empty representation and record the
source mapping rule in the payload adapter.

### Shuffled Character and Shuffle Result

A `Shuffled Character` contains exactly one independently assigned instance of
each of the six slices and retains source-origin metadata for preview and
testing. A `Shuffle Result` contains exactly N shuffled characters for N loaded
characters. Each category is a permutation with no fixed points; input slices
remain unchanged. The current algorithm samples single-cycle derangements
(Sattolo's algorithm), not all possible derangements uniformly.

### Derived Statistics and System Rules

Derived statistics include total-level proficiency bonus, maximum hit points,
armor class, saving throw modifiers and proficiency, and spell save DC/attack
when applicable. Class, armor, and feature metadata are resolved from the
installed D&D 5e system compendiums. Missing or ambiguous essential metadata
fails validation before Actor creation; the rules engine does not infer a
missing mechanic.

### Generated Actor and Export

A `Generated Actor` is a new native D&D 5e character Actor created from a
validated shuffled character in the dedicated `Shuffled Characters` folder.
Existing Actors are never updated or overwritten. Item data uses matching
system compendium documents where resolvable; custom fallback items use only
verified source fields and are accompanied by user-visible warnings.

An export is either native Actor JSON or a fillable PDF generated client-side
from the bundled, original CC0-1.0 three-page template. Batch JSON export is a
ZIP archive containing one JSON file per Actor. Exports never contain the
session credential or raw D&D Beyond response.

### Import Error

User-safe error summary for a failed operation.

| Field | Type | Constraints |
|---|---|---|
| `category` | enum | `invalid-input`, `missing-credential`, `authentication-failed`, `character-inaccessible`, `campaign-unavailable`, `roster-unverified`, `rate-limited`, `invalid-payload`, `network-failure` |
| `message` | string | Clear next step; must not contain raw response bodies or credentials |
| `sourceCharacterId` | string \| null | Optional context for a character-level failure |
| `retryable` | boolean | True only for transient network/rate-limit failures where retry is safe |

## Relationships and Invariants

- One `Import Request` yields one `Import Batch`.
- A successful character request yields one `Imported Character`; a successful
  campaign request yields all requested characters or no committed batch.
- Every `Imported Character` has exactly six slices and a stable source ID.
- The six slices are independent copies and cannot mutate each other or the raw
  source response.
- Shuffle eligibility is false for fewer than two valid loaded characters and
  true once at least two are available.
- Import and slicing do not create or update Foundry Actors.
- Actor generation creates only new Actors after every member of the batch
  passes validation.
- A failed preflight creates no Actor; a database failure during Foundry's
  batch creation call remains subject to Foundry's document API behavior.
- No credential or bearer token is part of an `Import Request`, `Import Batch`,
  `Imported Character`, or `Import Error`.
