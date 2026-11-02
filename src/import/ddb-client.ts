import type { DdbCharacterPayload } from "../types/character-slices.js";
import {
  fetchCharacterPayload,
  fetchCampaignPayload,
} from "./remote-transport.js";
import { ImportFailure } from "./import-errors.js";

function isCharacterPayload(value: unknown): value is DdbCharacterPayload {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function fetchCharacter(
  characterId: string,
): Promise<DdbCharacterPayload> {
  const payload = await fetchCharacterPayload(characterId);
  if (!isCharacterPayload(payload)) {
    throw new ImportFailure({
      category: "invalid-payload",
      message: "D&D Beyond returned an invalid character payload.",
      sourceCharacterId: characterId,
      retryable: false,
    });
  }
  return payload;
}

export function fetchCampaign(campaignId: string): Promise<string[]> {
  return fetchCampaignPayload(campaignId);
}
