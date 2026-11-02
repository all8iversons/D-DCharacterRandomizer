# Self-hosted D&D Beyond proxy

This service is intended to run under the Foundry user's control. The Foundry
module sends the session cookie to this service only over HTTPS. Do not expose
the service publicly or use a third-party hosted proxy.

## Requirements

- Node.js 20 or later.
- A TLS certificate trusted by the machine running the Foundry client.
- A long random proxy token (at least 32 characters).
- The exact Foundry browser origin (scheme, host, and port) for CORS.

The server binds to `127.0.0.1` by default. If Foundry is on another machine,
bind only to a trusted private interface, use a certificate valid for that
proxy host, and firewall the port to the Foundry host. The service refuses to
start without TLS configuration and an exact allowed origin.

## Configure and run (PowerShell)

From this directory, install the declared development dependencies and compile:

```powershell
npm install
npm run build
```

Set environment variables in the same shell before starting the service:

```powershell
$env:HOST = "127.0.0.1"
$env:PORT = "8787"
$env:ALLOWED_ORIGIN = "https://your-foundry-host.example"
$env:PROXY_TOKEN = "<generate-at-least-32-random-characters>"
$env:TLS_CERT_PATH = "C:\path\to\trusted-proxy.crt"
$env:TLS_KEY_PATH = "C:\path\to\proxy-private.key"
npm start
```

Do not commit proxy tokens, TLS private keys, or certificates containing
private key material. `proxy/.env.example` is a variable-name reference only;
the service does not load `.env` files.

## Available endpoints

- `POST /api/import/character`: exchanges the submitted `CobaltSession` for a
  short-lived D&D Beyond bearer token and requests one character payload. The
  raw cookie and bearer token are not written to logs or persistent storage.
- `POST /api/import/campaign`: deliberately returns `roster-unverified` until
  an authenticated campaign roster response has been inspected and its schema
  is covered by a sanitized fixture. It does not guess the roster fields.
- `POST /health`: returns a minimal health status after proxy-token and origin
  checks.

Every endpoint requires an `Authorization: Bearer <proxy-token>` header, an
exact `Origin` match, and JSON. Responses use `Cache-Control: no-store`; remote
redirects are rejected. The service does not log request bodies or upstream
response bodies.

## Foundry settings

Set the self-hosted proxy URL to `https://localhost:8787` when running on the
same machine, then enter the same proxy token and the D&D Beyond
`CobaltSession`. The Foundry browser must trust the TLS certificate and the
certificate host must match the configured URL. Foundry client settings are
not encrypted at rest; use a dedicated account/session and revoke it if
exposed.

## Current limitation

D&D Beyond's services are unofficial and undocumented. Individual character
retrieval is wired to the observed community endpoint, but campaign import is
disabled until its roster format is verified. No live credentials are needed
for tests; use synthetic fixtures only.
