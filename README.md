# D&D Beyond Character Shuffler

Foundry VTT v12 module for shuffling D&D Beyond character components into
hybrid characters, creating native Actors, and exporting fillable PDFs and
Foundry JSON.

## Development status

The module imports individual characters by ID or URL through a user-operated
HTTPS proxy, maps each response into six independent in-memory slices, and
enables shuffling after two valid characters are loaded. It previews a
derangement of each slice category, resolves rules against the installed
D&D 5e system, and preflights the full batch before creating new Actors in the
`Shuffled Characters` folder. Each Actor can be exported individually as a
fillable PDF or Foundry JSON, and all Actors can be downloaded together as a
ZIP containing individual JSON files.

If D&D Beyond omits a spell definition, the import retains any available spell
name or ID and flags it for review. The shuffled Actor and PDF include a
plain-text review entry instead of guessing its level or mechanics. Consult the
original character sheet and add the spell manually.

The D&D Beyond services are unofficial and undocumented. Campaign import uses
the community roster endpoint (`/api/campaign/stt/active-short-characters/<id>`)
through the proxy, then imports each character; it needs the updated proxy and
has not yet been verified against a live campaign. Character mapping, shuffling, calculations, Actor data
construction, and export services have synthetic unit tests; live Foundry v12
integration validation is still required.

The six-page PDF (D&D Beyond-style layout: main sheet, features, equipment, details and spells) is an original fillable template distributed under CC0-1.0,
not an official D&D/Wizards of the Coast sheet. Its license notice is in
`assets/character-sheet-template-license.txt`.

The Foundry settings support a user's own proxy URL and token, plus the
`CobaltSession` cookie. The cookie is sent only over HTTPS to that configured
proxy; it is not logged or sent to a third-party proxy.

## Self-hosted proxy

See [proxy/README.md](./proxy/README.md) for requirements, HTTPS configuration,
run instructions, and current limitations. The proxy must be operated by the
user. Foundry client settings are not encrypted at rest; use a dedicated
D&D Beyond session and revoke it if exposed.

Never commit a session cookie, proxy token, TLS private key, or real character
payload.

## Development checks

Install dependencies and run:

```powershell
npm install
npm run typecheck
npm test
npm run build
npm --prefix proxy install
npm --prefix proxy run build
npm audit --audit-level=low
```

After building and installing the module in a D&D 5e world, open **Configure
Settings** and choose **D&D Beyond Character Importer**. Configure the
self-hosted proxy and client-scoped credentials before importing. Foundry
client settings are not encrypted at rest. Consult
[`specs/001-dndbeyond-import-slicer/quickstart.md`](./specs/001-dndbeyond-import-slicer/quickstart.md)
for automated and manual validation scenarios and known limitations.
