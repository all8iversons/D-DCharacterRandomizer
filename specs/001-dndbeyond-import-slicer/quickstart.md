# Quickstart: Import and Slice Validation

This guide describes the implemented validation scenarios and the remaining
manual integration checks. Automated checks use the repository's npm scripts;
live Foundry and D&D Beyond checks still require an authorized local test setup.

**Manual validation status**: Not run in this development environment. A live
Foundry v12 world and authorized proxy/session are not available here; record
the outcomes below when those checks can be performed.

## Prerequisites

- Foundry Virtual Tabletop v12 with the D&D 5e system installed.
- A GM account authorized to access the test character.
- A configured self-hosted HTTPS proxy and its trusted TLS certificate.
- A development build of the module.
- The synthetic sanitized character fixture under `tests/fixtures/` for
  automated tests. No live cookie or response is needed for routine tests.

## Preparing a sanitized character fixture

The character endpoint is undocumented, so do not implement field mapping from
an assumed schema. To prepare a local fixture from a character you are
authorized to access:

1. Open that character in D&D Beyond while signed in.
2. Open browser developer tools, select **Network**, and reload the character
   page. Filter requests for `character/v5/character`.
3. Save only its response JSON to a temporary file outside the repository. Do
   not copy request headers, cookies, authorization values, or the browser's
   full network log.
4. Create a separate sanitized copy for `tests/fixtures/ddb-character.json`.
   Replace the character's name, real IDs, personal narrative, URLs, account
   identifiers, and actual gameplay values with synthetic values. Preserve JSON
   keys, nesting, and value types so the fixture remains useful for schema
   mapping. Never place the unredacted response inside the repository.
5. Check the sanitized copy locally for session tokens, bearer tokens, real
   names, and personal details. Keep the unredacted response on your machine
   only; never paste it into chat or commit it.

If the browser does not show a matching request, do not try to extract the
session cookie or share credentials. The fixture in this repository is
synthetic: it preserves the response shape while replacing character details,
IDs, narrative, and gameplay values.

## Manual end-to-end scenarios

### Campaign import (currently unavailable)

1. Open a Foundry v12 world as GM and configure the D&D Beyond session setting.
2. Enter a valid campaign URL and select **Check Campaign**.
3. Confirm the UI reports that roster import is unavailable until its response
   format is verified. It must not report an empty or complete campaign.

**Expected**: A safe `roster-unverified` failure, no partial result, and no
change to loaded characters or Actors. Do not mark campaign import complete
until an authorized roster sample and fixture are available.

### Individual import and input validation

1. Import an accessible character once by numeric ID and once by its supported
   D&D Beyond character URL using the importer menu.
2. Submit a malformed ID, unrelated host, and malformed URL.
3. Observe whether each invalid input is rejected before a remote access
   attempt.

**Expected**: Both valid inputs produce one complete six-slice character in
memory. Invalid inputs produce a clear warning without a request to the proxy.
The shuffle control is unavailable with one character and enabled with two.

### Credential and access failures

1. Attempt an import with an expired session.
2. Attempt an import for a private or inaccessible character.
3. Inspect user-facing messages and sanitized logs for credential leakage.

**Expected**: Each attempt stops with a specific safe explanation; the session
failure prompts renewal; no cookie or bearer token appears in UI/log output.

### Non-destructive isolation

1. Record the data of an existing Foundry actor and representative source
   character data.
2. Import and slice the character; modify a local slice in the test session.
3. Compare the source payload, other slices, and existing actor with the
   recorded state.

**Expected**: Changes to a slice do not affect any other slice, the source
payload, or an existing Foundry actor. Importing creates or updates no actor.

### Missing optional narrative data

1. Use a sanitized fixture with missing backstory and personality fields.
2. Import and inspect the slices.

**Expected**: Optional narrative fields are blank, and the other slices remain
complete.

### Shuffle and rules validation

1. Import at least two valid synthetic or authorized characters.
2. Select **Shuffle Characters** and inspect the six assigned components for
   each preview character.
3. Generate Actors only after confirming the preview. Test an unsupported
   class/armor combination in a disposable world to confirm preflight stops
   before creating any Actor.

**Expected**: Each output has six components from different source
characters; every input component is used once per category, with no fixed
points. The imported slices stay unchanged. Proficiency bonus, hit points,
armor class, saving throws, and spellcasting values are recalculated or the
operation fails explicitly when required system rules cannot be resolved.

### Actor creation and exports

1. In a disposable Foundry v12 world with the D&D 5e system and its standard
   compendiums installed, create a shuffled batch.
2. Confirm exactly one new Actor per result appears in `Shuffled Characters`;
   confirm pre-existing Actors were not modified.
3. Review any custom-item warnings and inspect the fallback items for invented
   mechanics; only source-verified fields should be present.
4. Download one Actor as JSON, download the batch ZIP, and download an
   individual fillable PDF.
5. Import a JSON export into a disposable world and inspect representative PDF
   fields and pages.

**Expected**: Each JSON file in the ZIP is a native Actor export; the PDF has
three pages and populated mapped AcroForm fields. The bundled original template
is CC0-1.0; it is not an official D&D/Wizards of the Coast character sheet.
Do not treat unit tests as a substitute for this live Foundry validation.

## Automated checks

- Run `npm run typecheck`, `npm test`, `npm run build`,
  `npm --prefix proxy run build`, and `npm audit --audit-level=low`.
- Unit tests cover URL/ID parsing, normalization, all six slice mappings,
  deep-copy isolation, defaults, import failure atomicity, safe proxy errors,
  derangement/cardinality, rules calculations, Actor preflight and construction,
  PDF form mapping, and individual/batch JSON output.
- Integration checks in a v12 world must cover session settings, actual D&D 5e
  compendium metadata, new Actor creation, and JSON/PDF imports/exports.

**Latest automated validation**: `npm test` passed (48 tests across 10 files);
`npm run build` passed (including strict typecheck); `npm --prefix proxy run
build` passed; `npm audit --audit-level=low` reported zero vulnerabilities;
`git diff --check` reported no whitespace errors. These checks do not replace
the outstanding live Foundry checks above.
- Use fixtures only in routine tests; a live D&D Beyond smoke test is optional
  and must use a dedicated authorized test account.
