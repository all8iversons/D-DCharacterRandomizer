import { ImportFailure } from "./import-errors.js";
import type { ImportKind, ParsedResourceId } from "../types/import-model.js";

const DDB_HOSTS = new Set(["dndbeyond.com", "www.dndbeyond.com"]);

function parsePositiveId(value: string): string {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new ImportFailure({
      category: "invalid-input",
      message: "Enter a positive numeric D&D Beyond identifier.",
      sourceCharacterId: null,
      retryable: false,
    });
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new ImportFailure({
      category: "invalid-input",
      message: "The D&D Beyond identifier is outside the supported range.",
      sourceCharacterId: null,
      retryable: false,
    });
  }

  return value;
}

function parseDdbUrl(value: string, kind: ImportKind): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ImportFailure({
      category: "invalid-input",
      message: "Enter a valid D&D Beyond URL or numeric identifier.",
      sourceCharacterId: null,
      retryable: false,
    });
  }

  const collection = kind === "character" ? "characters" : "campaigns";
  if (
    url.protocol !== "https:" ||
    !DDB_HOSTS.has(url.hostname.toLowerCase()) ||
    (url.port.length > 0 && url.port !== "443") ||
    url.username.length > 0 ||
    url.password.length > 0
  ) {
    throw new ImportFailure({
      category: "invalid-input",
      message: `Enter an HTTPS D&D Beyond ${kind} URL.`,
      sourceCharacterId: null,
      retryable: false,
    });
  }

  const match = new RegExp(`^/${collection}/([1-9]\\d*)(?:/|$)`).exec(
    url.pathname,
  );
  if (!match?.[1]) {
    throw new ImportFailure({
      category: "invalid-input",
      message: `The URL must identify a D&D Beyond ${kind}.`,
      sourceCharacterId: null,
      retryable: false,
    });
  }

  return parsePositiveId(match[1]);
}

export function parseResourceId(
  input: string,
  kind: ImportKind,
): ParsedResourceId {
  const value = input.trim();
  if (value.length === 0) {
    throw new ImportFailure({
      category: "invalid-input",
      message: "Enter a D&D Beyond URL or numeric identifier.",
      sourceCharacterId: null,
      retryable: false,
    });
  }

  const id = /^[1-9]\d*$/.test(value)
    ? parsePositiveId(value)
    : parseDdbUrl(value, kind);

  return { kind, id };
}
