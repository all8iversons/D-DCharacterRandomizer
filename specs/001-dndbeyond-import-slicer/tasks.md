---
description: "Implementation tasks for D&D Beyond import and slicing"
---

# Tasks: D&D Beyond Import and Slicing

**Input**: Design documents from `specs/001-dndbeyond-import-slicer/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/remote-import.md`, `quickstart.md`

**Tests**: Included because the specification defines campaign, invalid input,
credential, slicing, and non-mutation validation scenarios.

**Execution scope**: The individual-character proxy/import flow, six-slice
normalization, shuffling, derived-stat calculation, native Actor construction,
and individual/batch exports are implemented with synthetic unit tests.
Campaign import remains fail-closed until its roster response schema is
verified. Live Foundry v12 integration checks remain outstanding.

**Organization**: Tasks are grouped by user story. User-story labels retain
their numbers from `spec.md`; phases follow priority order.

## Phase 1: Setup

**Purpose**: Establish a strict TypeScript Foundry module and repeatable tests.

- [X] T001 [P] Create `package.json` with ES2022 strict TypeScript build and test scripts, Foundry v12 module metadata, and Vitest development dependencies.
- [X] T002 [P] Create `module.json` with the module id, Foundry v12 compatibility, D&D 5e system dependency, and `dist/module.js` entry point.
- [X] T003 [P] Create `tsconfig.json` with strict type checking, ES2022 target, module resolution, and no implicit `any`.
- [X] T004 Create `vitest.config.ts` with a Foundry-global test setup at `tests/setup/foundry.ts` and test discovery under `tests/`.
- [X] T005 Create `src/module.ts` and `src/types/index.ts` as the module bootstrap and type-module entry points defined in `plan.md`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the shared domain, error, credential, and remote-access boundaries required by every story.

- [X] T006 [P] Create `src/types/character-slices.ts` with the `identityBackground` fields “Name, species/race, appearance, background, alignment, personality traits, ideals, bonds, flaws, backstory”; `classProgression` fields “Class, subclass, total level, hit dice”; all six raw ability scores; all proficiencies/feats; equipment and currency; and cantrips, known/prepared spells, and spell slots; missing narrative fields become blank strings and each slice is an independent copy.
- [X] T007 [P] Create `src/types/import-model.ts` with data-model constraints verbatim: character IDs are “numeric and positive after parsing”; URLs use “HTTPS and an approved D&D Beyond host/path”; `sourceCharacterId` is “Required, stable source identity; not inferred from character name”; `sourceCampaignId` is “string | null”; `name` is “Required”; `slices` are “Exactly six independent values”; batch statuses are `validating`, `authenticating`, `fetching`, `slicing`, `complete`, or `failed`; and a campaign batch is “complete batch only”.
- [X] T008 [P] Create `src/import/import-errors.ts` with the data-model error categories `invalid-input`, `missing-credential`, `authentication-failed`, `character-inaccessible`, `campaign-unavailable`, `roster-unverified`, `rate-limited`, `invalid-payload`, and `network-failure`; user messages MUST NOT contain credentials or raw remote response bodies.
- [X] T009 Define and implement `src/import/remote-transport.ts` and `proxy/src/server.ts` as an HTTPS-only, user-operated proxy boundary; do not issue browser-side D&D Beyond requests or send credentials to a third-party hosted proxy.
- [X] T010 Implement `src/settings/credentials.ts` registering the constitution-required client-scoped configurable string setting for `CobaltSession`, plus the self-hosted proxy URL/token settings; mask secret inputs and document that masking is not encryption.
- [X] T011 Implement module initialization in `src/module.ts` to register settings and initialize the module without creating or updating any Foundry Actor.
- [X] T012 Create `tests/fixtures/ddb-character.json` as a synthetic, sanitized D&D Beyond-shaped character fixture with representative values for all six slices; include no real credentials or personal character data.
- [ ] T013 Create `tests/fixtures/ddb-campaign-roster.json` as a synthetic campaign response fixture only after the actual campaign roster schema has been verified; until then the campaign adapter MUST return `roster-unverified` instead of guessing response fields.

**Checkpoint**: Shared types, safe transport boundary, credential setting, and synthetic test fixtures are ready before story work begins.

---

## Phase 3: User Story 1 - Import a Campaign Roster (Priority: P1) 🎯 MVP

**Goal**: Import a campaign's complete player-character roster and create six correctly categorized slices for each character.

**Independent Test**: With a verified synthetic roster fixture of four accessible characters, import all four; assert four distinct character records, exactly six mapped slices each, and no partial success when a roster member fails.

### Tests for User Story 1

- [ ] T014 [P] [US1] Create `tests/unit/campaign-import.test.ts` covering a four-character complete roster, six-category mapping, inaccessible member atomic failure, and unverified roster rejection using sanitized fixtures.

### Implementation for User Story 1

- [X] T015 [US1] Implement campaign URL validation in `src/import/input-validation.ts`; accept only HTTPS D&D Beyond campaign URLs with a positive numeric campaign ID and reject malformed input before transport access.
- [ ] T016 [US1] Implement `src/import/ddb-campaign-client.ts` behind `src/import/remote-transport.ts`; enumerate the verified roster, cache campaign discovery to avoid unnecessary repeated calls, and return `roster-unverified` for any unrecognized roster shape.
- [X] T017 [US1] Implement D&D Beyond payload validation and field normalization in `src/import/normalize-character.ts`; require identity, class progression, and all six raw ability scores, while representing missing optional narrative fields as blank strings.
- [X] T018 [US1] Implement independent slice construction in `src/import/slice-character.ts`; create exactly the six slices specified by FR-008 through FR-013 using deep copies so slice edits cannot mutate source payload or adjacent slices.
- [ ] T019 [US1] Implement atomic campaign import orchestration in `src/import/import-service.ts`; fetch, validate, and slice every roster member before publishing a batch, and fail without exposing partial results if any character is inaccessible or invalid.
- [ ] T020 [US1] Implement campaign import and progress/error display in `src/applications/importer.ts`; show completion only after a complete batch and present safe, actionable messages for invalid input, inaccessible characters, and unverified rosters.
- [ ] T021 [US1] Complete `tests/unit/campaign-import.test.ts` assertions for four characters with all six correctly populated slices, matching IDs despite duplicate names, blank optional narrative fields, and all-or-fail roster behavior.

**Checkpoint**: The campaign story can be demonstrated independently with a verified fixture; live campaign import remains gated on a sanitized, verified roster schema.

---

## Phase 4: User Story 3 - Protect Access and Source Data (Priority: P1)

**Goal**: Make authentication/access failures clear and ensure credentials, source data, existing actors, and other slices remain protected.

**Independent Test**: Use expired-session, inaccessible-character, and malformed-payload fixtures; verify an actionable error without credential disclosure, and compare source/sibling slices and existing Actor state before and after slicing.

### Tests for User Story 3

- [X] T022 [P] [US3] Create `tests/unit/import-safety.test.ts` asserting source/slice isolation and unchanged Actors; remote error mapping and loaded-batch preservation are covered by adjacent focused tests.

### Implementation for User Story 3

- [X] T023 [US3] Implement credential exchange and authenticated requests in `proxy/src/server.ts`, `src/import/ddb-client.ts`, and `src/import/remote-transport.ts`; keep raw and derived credentials out of domain models, logs, alerts, and durable backend state, and stop on authentication failure without anonymous fallback.
- [X] T024 [US3] Implement sanitized error mapping in `src/import/remote-transport.ts` and `src/applications/importer.ts`; distinguish session renewal, inaccessible character, rate limiting, invalid payload, and transient network guidance without exposing raw response bodies.
- [X] T025 [US3] Add a password-equivalent credential explanation and save/reuse interaction to `src/settings/credentials.ts`; make clear that client-scoped settings are not encrypted at rest and that visual masking does not encrypt the saved value.
- [X] T026 [US3] Implement fail-closed commit behavior in `src/import/import-service.ts`; preserve existing actors and previously loaded batches on any failed operation and ensure only complete independent slices enter the in-memory collection.
- [X] T027 [US3] Complete safety tests across `tests/unit/remote-transport.test.ts`, `tests/unit/slice-character.test.ts`, and `tests/unit/character-import.test.ts` for sanitized errors, immutable source payload, independent sibling slices, and unchanged Actor collection.

**Checkpoint**: Import/access failures are clear and safe; successful slicing is demonstrably non-destructive.

---

## Phase 5: User Story 2 - Import One Character (Priority: P2)

**Goal**: Import one character by numeric ID or character URL and gate later shuffle eligibility on two valid loaded characters.

**Independent Test**: Import a valid character by ID and URL in separate runs; reject malformed IDs and URLs before transport access; verify the shuffle control is unavailable with one character and available with two.

### Tests for User Story 2

- [X] T028 [P] [US2] Create `tests/unit/character-import.test.ts` covering ID/URL parsing, invalid-input rejection before network access, single-character six-slice results, and one-versus-two-character shuffle eligibility.

### Implementation for User Story 2

- [X] T029 [US2] Extend `src/import/input-validation.ts` to accept a positive numeric character ID or HTTPS D&D Beyond `/characters/{numeric-id}` URL, rejecting unsupported hosts, paths, and malformed IDs before any remote request.
- [X] T030 [US2] Implement individual-character retrieval in `src/import/ddb-client.ts` using the shared backend transport and credential flow; map inaccessible and invalid responses to the shared safe error categories.
- [X] T031 [US2] Add individual character import mode to `src/import/import-service.ts`, reusing the shared normalization and six-slice construction while retaining stable source character identity.
- [X] T032 [US2] Add the individual ID/URL input flow to `src/applications/importer.ts`, displaying one imported character without replacing prior loaded characters or actors.
- [X] T033 [US2] Implement shuffle-control eligibility in `src/applications/importer.ts`; keep the later shuffle operation unavailable below two valid loaded characters and enable it at two without implementing shuffling itself.
- [X] T034 [US2] Complete `tests/unit/character-import.test.ts` assertions for URL and ID success, no transport calls on invalid inputs, preservation of earlier imports, and the two-character eligibility threshold.

**Checkpoint**: Individual import is independently usable and correctly enables the subsequent shuffle workflow only at the required threshold.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate the full feature against project guidance and the implementation quickstart.

- [X] T035 [P] Update `README.md` with the importer workflow, supported inputs, credential-storage limitation, and campaign roster integration caveat.
- [X] T036 Run the project type-check and unit test scripts from `package.json`; resolve failures in the corresponding `src/` and `tests/` files without adding placeholder implementations.
- [ ] T037 Run the v12 manual scenarios in `specs/001-dndbeyond-import-slicer/quickstart.md` and record results in `specs/001-dndbeyond-import-slicer/quickstart.md` without including real cookies or personal character data.
- [X] T038 Review the import code under `src/` and tests under `tests/` for accidental actor creation/update, direct browser D&D Beyond requests, credential logging, and persistence of raw payloads; correct any violation in the offending file.

---

## Phase 7: User Story 4 - Shuffle Character Components (Priority: P1)

**Goal**: Produce N hybrids from N characters using six independent
derangements without mutating imported slices.

- [X] T039 [P] [US4] Implement per-category randomized derangements and source-origin tracking in `src/shuffle/shuffle-characters.ts` and `src/types/shuffle-model.ts`.
- [X] T040 [P] [US4] Test cardinality, no fixed points, exact component usage, and source isolation in `tests/unit/shuffle-characters.test.ts`.
- [X] T041 [US4] Wire shuffle preview and the two-character gate into `src/applications/importer.ts` and `templates/importer.hbs`.

## Phase 8: User Story 5 - Recalculate and Create Hybrid Actors (Priority: P1)

**Goal**: Resolve system rules, preflight the complete output batch, and create
new native Actors without changing existing Actors.

- [X] T042 [P] [US5] Implement derived-stat calculations and failure checks in `src/rules/recalculate-stats.ts`; cover levels, hit points, AC, saves, and spellcasting in `tests/unit/recalculate-stats.test.ts`.
- [X] T043 [P] [US5] Resolve class, armor, and linked feature metadata from the installed D&D 5e system in `src/foundry/system-rules.ts`; test system schema fields and Unarmored Defense resolution in `tests/unit/system-rules.test.ts`.
- [X] T044 [US5] Build and validate Actor/item source data, then create the complete new batch in the `Shuffled Characters` folder in `src/foundry/actor-generator.ts`; test compendium matching, custom fallbacks, and zero creation on preflight failure in `tests/unit/actor-generator.test.ts`.
- [ ] T045 [US5] Verify system class/armor feature references and Actor document creation in a live Foundry v12 D&D 5e world; record observed limitations in `quickstart.md`.

## Phase 9: User Story 6 - Export Hybrids (Priority: P2)

**Goal**: Export native Actor JSON and a fillable three-page PDF without
including credentials or unverified source data.

- [X] T046 [US6] Implement native Actor JSON validation, client-side PDF field mapping, and batch ZIP creation in `src/export/export-service.ts`; cover output shape and PDF fields in `tests/unit/export-service.test.ts`.
- [X] T047 [US6] Add individual PDF/JSON and batch JSON ZIP controls to the importer UI in `src/applications/importer.ts` and `templates/importer.hbs`.
- [X] T048 [US6] Generate the original fillable three-page template and include its CC0-1.0 notice in `scripts/generate-pdf-template.mjs`, `assets/character-sheet-template.pdf`, and `assets/character-sheet-template-license.txt`.
- [ ] T049 [US6] Verify batch JSON import and PDF rendering in a live Foundry v12 D&D 5e world; record results in `quickstart.md`.

## Phase 10: Final Validation and Documentation

- [X] T050 Update the specification, plan, data model, quickstart, and README to include shuffling, rules recalculation, Actor creation, and export behavior.
- [X] T051 Run the full root test suite, typecheck, production build, proxy build, dependency audit, and `git diff --check`; resolve all failures and record the results.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; T001-T003 can run in parallel. T004
  follows T001; T005 follows module metadata and directory setup.
- **Foundational (Phase 2)**: Depends on Setup. T006-T010 and fixture work can
  be parallelized when files differ; T011 depends on settings and shared types.
  T013 is conditional on roster schema verification; campaign implementation
  must fail closed until it is complete.
- **User Stories (Phase 3+)**: Depend on the foundational phase. P1 stories
  precede P2 for delivery priority; US2 reuses the shared normalizer and
  import service.
- **Polish (Phase 6)**: Depends on the desired user stories being implemented.
- **US4 (Phase 7)**: Depends on successful individual imports and stable slice
  types; each bucket is shuffled independently.
- **US5 (Phase 8)**: Depends on US4 output and installed D&D 5e system
  compendiums. Live world validation is required for Foundry-specific data.
- **US6 (Phase 9)**: Depends on valid generated Actor documents.
- **Final validation (Phase 10)**: Depends on the implementation and docs for
  the available stories. Campaign roster tasks remain blocked pending schema
  evidence; live Foundry checks remain manual prerequisites.

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 shared transport, types, settings, and
  verified roster fixture. Does not depend on US2.
- **US3 (P1)**: Depends on Phase 2 shared error and credential boundaries.
  Its safety checks apply to both import paths; its independent fixture-based
  tests can be developed without completing either UI workflow.
- **US2 (P2)**: Depends on Phase 2 and reuses the normalization, slicing,
  credential, and error handling introduced for the campaign workflow. It does
  not depend on live campaign roster discovery.

### Parallel Opportunities

- Setup: T001, T002, and T003 modify different files and can proceed in parallel.
- Foundation: T006, T007, T008, T010, T012 can proceed in parallel after the
  module skeleton exists; T009 and T013 require confirmation of their external
  integration prerequisites.
- US1: T014 can be drafted alongside T015-T018; T017 and T018 touch different
  files once shared types are stable.
- US3: T022 can be drafted alongside T023-T026; credential UI and error mapping
  are parallel only when editing distinct files.
- US2: T028 can be drafted alongside T029-T033; input validation, client fetch,
  and UI changes are distinct files except where explicitly listed.
- Story phases may be staffed in parallel after shared foundations, but US2
  should not duplicate the shared implementation planned for US1.

## Parallel Examples

### User Story 1

```text
Task: T014 tests/unit/campaign-import.test.ts
Task: T015 src/import/input-validation.ts
Task: T017 src/import/normalize-character.ts
Task: T018 src/import/slice-character.ts
```

### User Story 3

```text
Task: T022 tests/unit/import-safety.test.ts
Task: T023 src/import/ddb-client.ts
Task: T025 src/settings/credentials.ts
```

### User Story 2

```text
Task: T028 tests/unit/character-import.test.ts
Task: T029 src/import/input-validation.ts
Task: T030 src/import/ddb-client.ts
Task: T032 src/applications/importer.ts
```

## Implementation Strategy

### MVP First (User Story 1)

1. Complete Setup and shared foundations.
2. Verify and sanitize a representative campaign roster response before relying
   on its shape. If not available, keep campaign import explicitly blocked with
   `roster-unverified`; do not fabricate a successful roster.
3. Implement the campaign import, six-slice mapping, and atomic batch handling.
4. Validate the four-character fixture journey and confirm no Actor mutation.

### Incremental Delivery

1. Setup and foundation establish the typed model, credentials, safe transport,
   and error boundaries.
2. US1 delivers a verified campaign roster import MVP.
3. US3 completes/validates the cross-cutting credential, error, and
   non-destructive guarantees.
4. US2 adds individual character ID/URL imports and shuffle eligibility.
5. Polish validates the quickstart and security boundaries.

## Format Validation

All task entries use `- [ ] T###`, include a `[US#]` label only in story phases,
include `[P]` only where tasks can work on separate files, and name concrete
file paths. Test tasks are included because the feature specification provides
explicit test scenarios.
