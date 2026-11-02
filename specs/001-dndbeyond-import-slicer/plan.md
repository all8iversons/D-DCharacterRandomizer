# Implementation Plan: D&D Beyond Character Shuffler

**Branch**: `001-dndbeyond-import-slicer` | **Date**: 2026-11-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-dndbeyond-import-slicer/spec.md`

## Summary

Import individual D&D Beyond characters through the user's self-hosted HTTPS
proxy, normalize each into six independent in-memory slices, shuffle every
category as a randomized derangement, calculate hybrid stats from available
D&D 5e system data, and create new native Actors only after a complete batch
passes preflight validation. Provide native Actor JSON exports (individually
and as a ZIP) and fillable PDF exports from an original CC0-licensed template.
Campaign import remains fail-closed until its roster response shape is
verified.

## Technical Context

**Language/Version**: Strict TypeScript, ES2022; Foundry server runtime Node.js 20+

**Primary Dependencies**: Foundry VTT v12, D&D 5e system; D&D Beyond internal
services (unofficial and undocumented); `pdf-lib` for AcroForm output and
`fflate` for batch JSON ZIP archives

**Storage**: No imported characters or slices persisted by this feature.
`CobaltSession` follows the constitution's client-scoped Foundry setting
requirement; the raw value is sent only for backend-mediated requests and must
never be logged or included in character data.

**Testing**: Vitest unit tests with mocked Foundry globals and synthetic
response fixtures; TypeScript strict typecheck and esbuild bundle. Manual
Foundry v12/D&D 5e integration checks remain required for live compendium
metadata, Actor creation, and export behavior.

**Target Platform**: Foundry VTT v12 browser client with the user's self-hosted
Node.js 20+ HTTPS proxy

**Project Type**: Foundry VTT v12 module with an optional self-hosted Node.js
HTTPS proxy

**Performance Goals**: Import a typical four-character campaign without
unnecessary repeated campaign discovery; present progress and actionable errors
while remote requests are in flight. No strict latency target is specified.

**Constraints**: Do not issue direct browser requests to D&D Beyond. The client
may send the CobaltSession only to the user's own HTTPS proxy; the proxy must
not persist or log it. Keep imported slices transient. Never update existing
Actors; preflight every result before creating a new batch. Reject malformed
identifiers before network access. Treat D&D Beyond endpoints and response
shapes as unstable; stop on authentication, access, or roster validation
failures rather than silently dropping characters. Resolve essential class
and armor rules from the installed D&D 5e system and fail clearly when they
cannot be resolved. Store no raw credential in logs, exported data, or
long-lived backend state.

**Scale/Scope**: One GM-driven import and shuffle at a time, typically a small
party. Outputs retain one result per input. The campaign roster endpoint
remains intentionally disabled pending a verified response fixture.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Design Gate

- **Foundry v12 integration**: Pass. The feature targets Foundry v12 and the
  D&D 5e system, with v12-compatible UI patterns.
- **Secure ingestion**: Pass with a design constraint. Remote calls must be
  backend-mediated; the client setting is constitution-mandated. Client-scoped
  settings are not encrypted by Foundry and are accessible to the local user
  environment, so the UI must identify the value as a password-equivalent
  credential and avoid logging or redisclosing it.
- **Six buckets and shuffle cardinality**: Pass. The shuffler requires at
  least two characters and deranges each of the six buckets independently.
- **Normalization and export**: Pass with a strict boundary: derived rules
  must be resolved from system data, Actor creation is preflighted, and PDF
  exports use the original licensed template.
- **Quality gates**: Pass. The design includes focused validation for
  identifiers, slices, deep-copy isolation, batch completeness, and failure
  handling.

No constitution violations require an exception.

### Post-Design Gate

- **v12 models and UI**: Pass. The design uses a transient typed data model and
  plans for a v12-compatible `ApplicationV2` UI; it does not depend on
  deprecated APIs.
- **Credential handling and backend-mediated access**: Pass with the same
  documented client-setting-at-rest risk. The remote contract excludes
  credentials from imported entities and prohibits direct browser requests.
- **Six slices and isolation**: Pass. The data model requires exactly six
  independent copies with defined missing-value behavior.
- **Shuffle, recalculation, and Actor creation**: Pass. Every output is
  recalculated and preflighted before any new Actor is created; unknown
  essential mechanics stop the batch instead of guessing.
- **Validation**: Pass. The research, contract, and quickstart artifacts define
  input, batch atomicity, credential/access failure, and non-mutation checks.

The campaign roster shape remains an external integration risk, not an
unresolved product requirement: the design fails closed until an authenticated
response fixture verifies the source contract.

## Project Structure

### Documentation (this feature)

```text
specs/001-dndbeyond-import-slicer/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── remote-import.md
└── tasks.md
```

### Source Code (repository root)

The implemented single-module layout is organized by import, shuffle, rules,
Foundry document generation, and export boundaries:

```text
src/
├── module.ts
├── applications/
│   └── importer.ts
├── export/
│   └── export-service.ts
├── foundry/
│   ├── actor-generator.ts
│   └── system-rules.ts
├── settings/
│   └── credentials.ts
├── import/
│   ├── input-validation.ts
│   ├── ddb-client.ts
│   ├── normalize-character.ts
│   └── slice-character.ts
├── rules/
│   └── recalculate-stats.ts
├── shuffle/
│   └── shuffle-characters.ts
└── types/
    ├── ddb-payload.ts
    ├── character-slices.ts
    └── shuffle-model.ts

    proxy/
    ├── src/
    │   └── server.ts
    └── tsconfig.json

tests/
├── unit/
└── integration/
```

**Structure Decision**: Keep remote ingestion isolated from pure slice,
shuffle, and calculation logic. Resolve game-specific metadata through the
installed D&D 5e compendiums. Stage complete Actor source data before calling
Foundry's batch document creation API; never touch existing Actor documents.
Use client-side `pdf-lib` for form filling and `fflate` to create one
downloadable archive containing individual native Actor JSON files.

## Complexity Tracking

No constitution violations or additional project structures are proposed.
