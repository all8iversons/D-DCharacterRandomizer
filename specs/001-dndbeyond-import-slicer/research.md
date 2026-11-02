# Research: D&D Beyond Import and Slicing

**Date**: 2026-11-01

## Decisions

### D&D Beyond authentication and character retrieval

**Decision**: Treat `CobaltSession` as an opaque, password-equivalent
credential. Send it only over HTTPS to the user's self-hosted proxy, exchange it
for a short-lived bearer token server-side where supported, and never write it
to logs or character data. Parse an individual character ID from either a
numeric ID or a validated D&D Beyond character URL before making any request.
Fail an import on authentication failure; do not silently retry anonymously.

**Rationale**: Community-maintained `MrPrimate/ddb-proxy` source documents a
two-step token exchange and bearer-authenticated character service. The exact
endpoints are unofficial and may change. Direct browser requests are likely to
be blocked by CORS and would expose credential handling to the browser request
path.

**Alternatives considered**: Call D&D Beyond directly from the browser (rejected
because of CORS and credential exposure); use a third-party hosted proxy
(rejected because it receives a credential equivalent to an account password);
attempt anonymous fallback (rejected because it can return incomplete/public
data while appearing successful).

The current proxy implementation requires TLS, exact-origin CORS, a configured
shared token, bounded input size, and refuses upstream redirects. Credentials
are sent in a request body to the self-hosted proxy only over HTTPS, then used
only in the upstream authentication exchange.

Individual character payload normalization is now covered by a synthetic
fixture based on an authorized local response's structure. The fixture
replaces the character's identifying, narrative, and gameplay values.
Campaign roster discovery remains unverified, and the client now rejects
campaign import locally without sending credentials.

### Campaign roster discovery

**Decision**: Isolate campaign discovery and roster enumeration behind a
replaceable remote-service boundary. The known community endpoint
`/api/campaign/stt/user-campaigns` can return the user's campaigns, but the
roster field and its shape are not verified. Do not rely on an assumed
`characters` property. Before implementation treats a roster shape as
supported, verify it against a representative authenticated response and add a
sanitized fixture/contract test. If the roster cannot be enumerated or any
requested character cannot be fetched, fail the campaign import as a whole,
consistent with the feature specification.

**Rationale**: Available source verifies campaign discovery, not the exact
campaign-to-character roster payload. Treating an inferred schema as fact risks
silently omitting party members.

**Alternatives considered**: Assume a nested campaign `characters` array
(rejected as unverified); silently skip inaccessible characters (rejected by
the feature's all-or-fail batch requirement); use a public shared proxy
(rejected due to credential trust).

### Transient character data

**Decision**: Normalize remote payloads into plain, explicitly typed,
independent in-memory slice data. Do not instantiate or update persistent
Foundry Actors for import/slicing. Deep-copy each slice from the source
payload, fill missing optional narrative values with empty strings, and retain
source identity separately so similarly named characters remain distinguishable.

**Rationale**: The requested behavior is non-destructive preparation, not actor
creation. A plain transient model avoids document lifecycle side effects and
prevents import from mutating a world actor.

**Alternatives considered**: Create temporary or persistent `Actor5e`
documents (rejected because the feature does not need actor lifecycle behavior
and must not alter existing actors); keep references into the raw payload
(rejected because edits could mutate the source or adjacent slices).

### Foundry UI and validation strategy

**Decision**: Use Foundry v12 `ApplicationV2`-compatible UI. Use isolated unit
tests with mocked Foundry globals and response fixtures for parsing,
normalization, slicing, isolation, and error mapping; add manual live checks
inside a v12 world for settings and backend-mediated access.

**Rationale**: The repository has no source or existing test runner. Research
found that Foundry v12's `ApplicationV2` is the current UI direction and that
mocking Foundry globals enables pure transformation tests without a live world.

**Alternatives considered**: Deprecated `FormApplication` (rejected by the
constitution); test only against live D&D Beyond (rejected because tests would
be credential-dependent, brittle, and unsuitable for routine validation).

### Credential setting limitation

**Decision**: Follow the constitution's requirement to store the user-supplied
value in a client-scoped Foundry setting, but disclose that client settings
are not encrypted storage. Mask the input in the settings UI where possible;
masking is a presentation measure only and does not encrypt the saved value.
Do not copy the setting into logs, imported models, alerts, or exports.

**Rationale**: Foundry's built-in client settings persist in the local browser
profile. The project constitution currently requires this storage scope; the
security tradeoff must be explicit to users and reviewers.

**Alternatives considered**: Store it in world settings (rejected because that
persists it server-side and can expose it to other world users); use an
external proxy that alone holds the credential (not chosen because the project
has no proxy service and this would add an operational dependency).

## Endpoint Evidence and Limitations

Community implementation reference: [MrPrimate/ddb-proxy](https://github.com/MrPrimate/ddb-proxy)
(source files `config.js`, `auth.js`, `character.js`, and `campaign.js`).
These endpoints are reverse-engineered and are **not an official D&D Beyond
API contract**:

- Cookie-to-token exchange:
  `POST https://auth-service.dndbeyond.com/v1/cobalt-token`
- Character data:
  `GET https://character-service.dndbeyond.com/character/v5/character/{id}?includeCustomItems=true`
- User campaign discovery:
  `GET https://www.dndbeyond.com/api/campaign/stt/user-campaigns`
- The community client also calls
  `POST https://www.dndbeyond.com/mobile/api/v6/user-data` for account data /
  credential validation.

The cited implementation observes bot-detection responses for campaign
discovery and caches campaign calls. Exact response shapes, status mappings,
rate limits, and terms of service were not independently verified. Do not
poll campaign discovery unnecessarily, and confirm current acceptable-use
requirements before release.

## Foundry References

- [Foundry VTT DataModel API](https://foundryvtt.com/api/classes/foundry.abstract.DataModel.html)
- [Foundry VTT ApplicationV2 API](https://foundryvtt.com/api/classes/foundry.applications.api.ApplicationV2.html)
- [Foundry VTT Settings API](https://foundryvtt.com/api/classes/client.Game.html)
- [Foundry VTT Wiki: DataModel](https://foundryvtt.wiki/en/development/api/DataModel)
- [Foundry VTT Wiki: Settings](https://foundryvtt.wiki/en/development/api/settings)

The plain transient model recommendation is based on the DataModel/Document
distinction; the remote import-to-slices flow has no single verified public
module implementation to copy.

## Remaining Risks

- D&D Beyond may alter or disable the undocumented services without notice.
- Campaign roster enumeration and its JSON shape require an authenticated
  response fixture before coding a parser.
- Campaign discovery may trigger bot detection or rate limits; exact limits
  are unknown.
- Client-scoped credential settings are readable within the local browser
  profile and are not encrypted by Foundry.
- D&D Beyond's acceptable-use terms for this unofficial integration were not
  established by this research.
