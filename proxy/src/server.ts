import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { type IncomingMessage, type ServerResponse } from "node:http";
import { createServer } from "node:https";
import { isIP } from "node:net";

const CHARACTER_HOST =
  "https://character-service.dndbeyond.com/character/v5/character";
const CAMPAIGN_HOST =
  "https://www.dndbeyond.com/api/campaign/stt/active-short-characters";
const AUTH_URL = "https://auth-service.dndbeyond.com/v1/cobalt-token";
const MAX_BODY_BYTES = 16 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;

interface Config {
  host: string;
  port: number;
  allowedOrigin: string;
  proxyToken: string;
  tlsCertPath: string;
  tlsKeyPath: string;
}

interface ImportRequestBody {
  cobaltSession: string;
  id: string;
}

interface SafeError {
  error: string;
  message: string;
}

class ProxyError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ProxyError";
  }
}

function readConfig(): Config {
  const allowedOrigin = process.env.ALLOWED_ORIGIN;
  const proxyToken = process.env.PROXY_TOKEN;
  const tlsCertPath = process.env.TLS_CERT_PATH;
  const tlsKeyPath = process.env.TLS_KEY_PATH;
  const host = process.env.HOST ?? "127.0.0.1";
  const port = Number(process.env.PORT ?? "8787");

  if (!allowedOrigin || !proxyToken || !tlsCertPath || !tlsKeyPath) {
    throw new Error(
      "ALLOWED_ORIGIN, PROXY_TOKEN, TLS_CERT_PATH, and TLS_KEY_PATH are required.",
    );
  }
  if (allowedOrigin === "*" || new URL(allowedOrigin).origin !== allowedOrigin) {
    throw new Error("ALLOWED_ORIGIN must be one exact origin, not a wildcard.");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be a valid TCP port.");
  }
  if (!isPrivateBindAddress(host)) {
    throw new Error("HOST must be a loopback or private IPv4/IPv6 address.");
  }
  if (proxyToken.length < 32) {
    throw new Error("PROXY_TOKEN must contain at least 32 characters.");
  }

  return { host, port, allowedOrigin, proxyToken, tlsCertPath, tlsKeyPath };
}

function isPrivateBindAddress(host: string): boolean {
  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    const octets = host.split(".").map(Number);
    const first = octets[0];
    const second = octets[1];
    if (first === undefined || second === undefined) {
      return false;
    }
    return (
      first === 10 ||
      first === 127 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  }
  if (ipVersion === 6) {
    const normalized = host.toLowerCase();
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    );
  }
  return false;
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: object,
  origin: string | undefined,
  config: Config,
): void {
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    Vary: "Origin",
  };
  if (origin === config.allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  response.writeHead(status, headers);
  response.end(JSON.stringify(body));
}

function tokenMatches(candidate: string | undefined, expected: string): boolean {
  if (!candidate) {
    return false;
  }
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return (
    candidateBuffer.length === expectedBuffer.length &&
    timingSafeEqual(candidateBuffer, expectedBuffer)
  );
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > MAX_BODY_BYTES) {
      throw new ProxyError(413, "request-too-large", "Request body is too large.");
    }
    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new ProxyError(400, "invalid-json", "Request body must be valid JSON.");
  }
}

function validateBody(value: unknown): ImportRequestBody {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ProxyError(400, "invalid-request", "Invalid request body.");
  }

  const body = value as Record<string, unknown>;
  if (
    typeof body.cobaltSession !== "string" ||
    body.cobaltSession.trim().length === 0 ||
    body.cobaltSession.length > 4096 ||
    typeof body.id !== "string" ||
    !/^[1-9]\d{0,15}$/.test(body.id)
  ) {
    throw new ProxyError(400, "invalid-request", "Invalid import request.");
  }

  return { cobaltSession: body.cobaltSession, id: body.id };
}

async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit,
): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    redirect: "error",
  });
}

async function getBearerToken(cobaltSession: string): Promise<string> {
  let response: Response;
  try {
    response = await fetchWithTimeout(AUTH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Cookie: `CobaltSession=${cobaltSession}`,
      },
    });
  } catch {
    throw new ProxyError(
      502,
      "authentication-service-unavailable",
      "D&D Beyond authentication could not be reached. Try again later.",
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new ProxyError(
      401,
      "authentication-failed",
      "The D&D Beyond session was rejected. Replace it with a current session cookie.",
    );
  }
  if (!response.ok) {
    throw new ProxyError(
      502,
      "authentication-service-error",
      "D&D Beyond authentication failed. Try again later.",
    );
  }

  let payload: unknown;
  try {
    payload = (await response.json()) as unknown;
  } catch {
    throw new ProxyError(
      502,
      "invalid-auth-response",
      "D&D Beyond returned an unreadable authentication response.",
    );
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    !("token" in payload) ||
    typeof payload.token !== "string" ||
    payload.token.length === 0
  ) {
    throw new ProxyError(
      401,
      "authentication-failed",
      "The D&D Beyond session could not be authenticated. Replace it with a current session cookie.",
    );
  }
  return payload.token;
}

async function getCharacter(
  id: string,
  cobaltSession: string,
): Promise<unknown> {
  const bearer = await getBearerToken(cobaltSession);
  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${CHARACTER_HOST}/${encodeURIComponent(id)}?includeCustomItems=true`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${bearer}`,
        },
      },
    );
  } catch {
    throw new ProxyError(
      502,
      "character-service-unavailable",
      "D&D Beyond character data could not be reached. Try again later.",
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new ProxyError(
      403,
      "character-inaccessible",
      "This character is private or unavailable to the current D&D Beyond session.",
    );
  }
  if (response.status === 404) {
    throw new ProxyError(
      404,
      "character-inaccessible",
      "This character could not be found or accessed.",
    );
  }
  if (response.status === 429) {
    throw new ProxyError(
      429,
      "rate-limited",
      "D&D Beyond temporarily limited requests. Wait before trying again.",
    );
  }
  if (!response.ok) {
    throw new ProxyError(
      502,
      "character-service-error",
      "D&D Beyond did not return character data. Try again later.",
    );
  }

  let payload: unknown;
  try {
    payload = (await response.json()) as unknown;
  } catch {
    throw new ProxyError(
      502,
      "invalid-character-response",
      "D&D Beyond returned unreadable character data.",
    );
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("success" in payload) ||
    payload.success !== true ||
    !("data" in payload) ||
    typeof payload.data !== "object" ||
    payload.data === null
  ) {
    throw new ProxyError(
      502,
      "invalid-character-response",
      "D&D Beyond returned an unexpected character response.",
    );
  }
  return payload.data;
}

function readRosterIds(payload: unknown): string[] {
  const list =
    typeof payload === "object" && payload !== null && "data" in payload
      ? payload.data
      : undefined;
  if (!Array.isArray(list)) {
    throw new ProxyError(
      502,
      "invalid-roster-response",
      "D&D Beyond returned an unexpected campaign roster response.",
    );
  }
  const ids = new Set<string>();
  for (const entry of list as unknown[]) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const raw = record.characterId ?? record.id;
    const id =
      typeof raw === "number" || typeof raw === "string" ? String(raw) : "";
    if (/^[1-9]\d{0,15}$/.test(id)) {
      ids.add(id);
    }
  }
  return [...ids];
}

async function getCampaignCharacterIds(
  id: string,
  cobaltSession: string,
): Promise<string[]> {
  const bearer = await getBearerToken(cobaltSession);
  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${CAMPAIGN_HOST}/${encodeURIComponent(id)}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${bearer}`,
          Cookie: `CobaltSession=${cobaltSession}`,
        },
      },
    );
  } catch {
    throw new ProxyError(
      502,
      "campaign-service-unavailable",
      "D&D Beyond campaign data could not be reached. Try again later.",
    );
  }
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    throw new ProxyError(
      403,
      "campaign-unavailable",
      "This campaign is unavailable to the current D&D Beyond session.",
    );
  }
  if (response.status === 429) {
    throw new ProxyError(
      429,
      "rate-limited",
      "D&D Beyond temporarily limited requests. Wait before trying again.",
    );
  }
  if (!response.ok) {
    throw new ProxyError(
      502,
      "campaign-service-error",
      "D&D Beyond did not return campaign data. Try again later.",
    );
  }
  let payload: unknown;
  try {
    payload = (await response.json()) as unknown;
  } catch {
    throw new ProxyError(
      502,
      "invalid-roster-response",
      "D&D Beyond returned an unreadable campaign roster response.",
    );
  }
  return readRosterIds(payload);
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  config: Config,
): Promise<void> {
  const origin = request.headers.origin;
  const path = new URL(request.url ?? "/", "https://proxy.invalid").pathname;

  if (origin !== config.allowedOrigin) {
    sendJson(response, 403, { error: "origin-denied", message: "Origin not allowed." }, origin, config);
    return;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": config.allowedOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "300",
      Vary: "Origin",
    });
    response.end();
    return;
  }

  if (
    !tokenMatches(
      request.headers.authorization?.startsWith("Bearer ")
        ? request.headers.authorization.slice(7)
        : undefined,
      config.proxyToken,
    )
  ) {
    sendJson(response, 401, { error: "proxy-auth-failed", message: "Proxy authorization failed." }, origin, config);
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "method-not-allowed", message: "Method not allowed." }, origin, config);
    return;
  }

  if (path === "/health") {
    sendJson(response, 200, { status: "ok" }, origin, config);
    return;
  }

  if (path !== "/api/import/character" && path !== "/api/import/campaign") {
    sendJson(response, 404, { error: "not-found", message: "Endpoint not found." }, origin, config);
    return;
  }

  try {
    const body = validateBody(await readJsonBody(request));
    if (path === "/api/import/campaign") {
      const characterIds = await getCampaignCharacterIds(
        body.id,
        body.cobaltSession,
      );
      sendJson(response, 200, { characterIds }, origin, config);
      return;
    }
    const character = await getCharacter(body.id, body.cobaltSession);
    sendJson(response, 200, { data: character }, origin, config);
  } catch (error) {
    if (error instanceof ProxyError) {
      sendJson(
        response,
        error.status,
        { error: error.code, message: error.message } satisfies SafeError,
        origin,
        config,
      );
      return;
    }
    sendJson(
      response,
      500,
      { error: "internal-error", message: "The proxy could not complete the request." },
      origin,
      config,
    );
  }
}

async function main(): Promise<void> {
  const config = readConfig();
  const [cert, key] = await Promise.all([
    readFile(config.tlsCertPath),
    readFile(config.tlsKeyPath),
  ]);
  const server = createServer({ cert, key }, (request, response) => {
    void handleRequest(request, response, config).catch(() => {
      sendJson(
        response,
        500,
        { error: "internal-error", message: "The proxy could not complete the request." },
        request.headers.origin,
        config,
      );
    });
  });

  server.on("error", (error: Error) => {
    console.error(`D&D Beyond proxy server failed: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(config.port, config.host);
}

void main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : "Unknown startup error.";
  console.error(`D&D Beyond proxy configuration or TLS initialization failed: ${detail}`);
  process.exitCode = 1;
});
