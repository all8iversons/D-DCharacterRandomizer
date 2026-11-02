# Remote Import Contract

This is the module's boundary contract with D&D Beyond services. The services
are unofficial and undocumented; this document records observed community
behavior, not a guarantee by D&D Beyond. Response parsing MUST be isolated so
service changes do not silently corrupt slice assignment.

## User-Facing Inputs

### Individual character

- Accept a positive numeric character ID or an HTTPS D&D Beyond character URL
  whose path contains `/characters/{numeric-id}`.
- Reject malformed IDs, unsupported hosts, and unrelated URL paths before any
  remote request.
- Fetch only the requested character.

### Campaign

- Accept an HTTPS D&D Beyond campaign URL whose path contains
  `/campaigns/{numeric-id}`.
- Resolve the campaign and enumerate its player-character roster.
- Treat the roster shape as unverified until a representative authenticated
  response is captured and covered by a sanitized fixture test.
- Do not infer a character list from names or silently skip roster members.

## Authentication and Transport

- All D&D Beyond requests MUST be made through the user's self-hosted HTTPS
  proxy; the browser MUST NOT call D&D Beyond directly.
- The client supplies the raw `CobaltSession` only from the client-scoped module
  setting. It MAY send the credential transiently over HTTPS to the user's own
  proxy only for the requested import.
- A successful authentication exchange yields a short-lived bearer credential
  for subsequent requests where supported. The proxy MUST NOT persist either
  credential; both raw and derived credentials MUST be excluded from logs,
  errors, and character payloads.
- Authentication failure MUST stop the operation and ask the GM to renew the
  session. The client MUST NOT fall back to anonymous access.
- The client setting is not encrypted at rest; UI masking MUST NOT be
  represented as encryption or secure vault storage.

  The proxy MUST require a long random shared access token, exact configured
  Foundry origin, HTTPS, bounded JSON request bodies, and a loopback/private
  network bind. It MUST reject redirects to avoid forwarding credentials across
  origins.

  The current character adapter maps the observed v5 payload fields for identity,
  classes, stats, modifiers, inventory, currency, spells, and spell slots. D&D
  Beyond does not publish this schema as a stable contract; changes or missing
  required data MUST fail validation instead of producing partial slices.
  Campaign requests fail locally with `roster-unverified` and MUST NOT transmit
  the session cookie until roster discovery is implemented.

## Observed Service Patterns

| Purpose | Observed request | Evidence status |
|---|---|---|
| Cookie exchange | `POST https://auth-service.dndbeyond.com/v1/cobalt-token` with `CobaltSession` cookie | Observed in community `ddb-proxy`; unofficial |
| Character detail | `GET https://character-service.dndbeyond.com/character/v5/character/{id}?includeCustomItems=true` | Observed in community `ddb-proxy`; response expected as `{ success: true, data: ... }` |
| Campaign discovery | `GET https://www.dndbeyond.com/api/campaign/stt/user-campaigns` | Observed in community `ddb-proxy`; user campaign response shape only partially understood |
| User validation | `POST https://www.dndbeyond.com/mobile/api/v6/user-data` | Observed in community `ddb-proxy`; not required unless needed by verified auth flow |

Reference: [MrPrimate/ddb-proxy](https://github.com/MrPrimate/ddb-proxy)
(`config.js`, `auth.js`, `character.js`, `campaign.js`). Do not treat endpoint
paths or response fields as stable public APIs.

## Result Contract

A successful import result MUST contain:

- The source character ID and campaign ID when applicable.
- Exactly six independent slices per character.
- No bearer token, session cookie, unrelated response fields, or raw payload.

Campaign import is atomic: either all roster members are successfully fetched,
validated, and sliced, or the operation fails without exposing a partial batch
as complete. Existing Foundry actors and other loaded batches remain unchanged.

## Error Mapping

| Remote/validation outcome | User-safe category | Required behavior |
|---|---|---|
| Invalid URL or identifier | `invalid-input` | Reject before network access |
| Missing, expired, or rejected session | `authentication-failed` | Stop and prompt for a fresh session |
| Character 401/403/404 or inaccessible response | `character-inaccessible` | Stop single-character import or fail campaign batch with affected ID |
| Unrecognized campaign roster shape | `roster-unverified` | Fail closed; do not guess fields or report an empty successful roster |
| Bot detection or rate limiting | `rate-limited` | Stop, explain temporary block, avoid immediate repeated campaign calls |
| Invalid or incomplete required character data | `invalid-payload` | Reject affected character; do not emit incomplete slices |
| Transient network failure | `network-failure` | Report safe retry guidance; do not claim success |

Do not expose raw remote error bodies or request headers to users. Preserve
diagnostic details only in sanitized developer logs without credentials.
