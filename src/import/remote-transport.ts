import { ImportFailure } from "./import-errors.js";
import type { ImportErrorCategory } from "./import-errors.js";
import {
  readClientSetting,
  SETTING_KEYS,
} from "../settings/credentials.js";

export interface CharacterRequest {
  id: string;
}

interface SafeProxyError {
  category: ImportErrorCategory;
  message: string;
  retryable: boolean;
}

function mapProxyError(code: string): SafeProxyError {
  switch (code) {
    case "authentication-failed":
      return {
        category: "authentication-failed",
        message:
          "The D&D Beyond session was rejected. Replace it with a current session cookie.",
        retryable: false,
      };
    case "character-inaccessible":
      return {
        category: "character-inaccessible",
        message:
          "This character is private or unavailable to the current D&D Beyond session.",
        retryable: false,
      };
    case "rate-limited":
      return {
        category: "rate-limited",
        message: "D&D Beyond temporarily limited requests. Wait before trying again.",
        retryable: true,
      };
    case "roster-unverified":
      return {
        category: "roster-unverified",
        message:
          "Campaign roster import is unavailable until the D&D Beyond response format is verified.",
        retryable: false,
      };
    case "campaign-unavailable":
      return {
        category: "campaign-unavailable",
        message:
          "This campaign is unavailable to the current D&D Beyond session.",
        retryable: false,
      };
    case "invalid-character-response":
      return {
        category: "invalid-payload",
        message: "D&D Beyond returned an unexpected character response.",
        retryable: false,
      };
    default:
      return {
        category: "network-failure",
        message:
          "The self-hosted proxy could not complete the import. Check its configuration and try again later.",
        retryable: true,
      };
  }
}

function getProxyConfig(): { url: URL; token: string; cobaltSession: string } {
  const proxyUrlValue = readClientSetting(SETTING_KEYS.proxyUrl);
  const proxyToken = readClientSetting(SETTING_KEYS.proxyToken);
  const cobaltSession = readClientSetting(SETTING_KEYS.cobaltSession);

  if (!proxyUrlValue || !proxyToken || !cobaltSession) {
    throw new ImportFailure({
      category: "missing-credential",
      message:
        "Configure your self-hosted HTTPS proxy and D&D Beyond session in module settings.",
      sourceCharacterId: null,
      retryable: false,
    });
  }

  let url: URL;
  try {
    url = new URL(proxyUrlValue);
  } catch {
    throw new ImportFailure({
      category: "invalid-input",
      message: "The self-hosted proxy URL is invalid.",
      sourceCharacterId: null,
      retryable: false,
    });
  }

  if (url.protocol !== "https:" || url.username || url.password) {
    throw new ImportFailure({
      category: "invalid-input",
      message: "The self-hosted proxy URL must use HTTPS and contain no credentials.",
      sourceCharacterId: null,
      retryable: false,
    });
  }

  return { url, token: proxyToken, cobaltSession };
}

async function postImport<TBody extends CharacterRequest>(
  route: "character",
  body: TBody,
): Promise<unknown> {
  const config = getProxyConfig();
  const endpoint = new URL(`/api/import/${route}`, config.url);
  const sourceCharacterId = body.id;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify({
        ...body,
        cobaltSession: config.cobaltSession,
      }),
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
    });
  } catch {
    throw new ImportFailure({
      category: "network-failure",
      message: "The self-hosted proxy could not be reached securely.",
      sourceCharacterId,
      retryable: true,
    });
  }

  let payload: unknown;
  try {
    payload = (await response.json()) as unknown;
  } catch {
    throw new ImportFailure({
      category: "network-failure",
      message: "The self-hosted proxy returned an unreadable response.",
      sourceCharacterId,
      retryable: true,
    });
  }

  if (!response.ok) {
    const errorCode =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "proxy-error";
    const safeError = mapProxyError(errorCode);

    throw new ImportFailure({
      category: safeError.category,
      message: safeError.message,
      sourceCharacterId,
      retryable: safeError.retryable,
    });
  }

  return payload;
}

export async function fetchCharacterPayload(
  characterId: string,
): Promise<unknown> {
  const result = await postImport("character", { id: characterId });
  if (
    typeof result !== "object" ||
    result === null ||
    !("data" in result) ||
    typeof result.data !== "object" ||
    result.data === null ||
    Array.isArray(result.data)
  ) {
    throw new ImportFailure({
      category: "invalid-payload",
      message: "The proxy returned an invalid character payload.",
      sourceCharacterId: characterId,
      retryable: false,
    });
  }
  return result.data;
}

export async function fetchCampaignPayload(
  _campaignId: string,
): Promise<never> {
  throw new ImportFailure({
    category: "roster-unverified",
    message:
      "Campaign roster import is unavailable until the D&D Beyond response format is verified.",
    sourceCharacterId: null,
    retryable: false,
  });
}
