import { fetchCampaign, fetchCharacter } from "./ddb-client.js";
import { parseResourceId } from "./input-validation.js";
import { normalizeCharacterPayload } from "./normalize-character.js";
import { sliceCharacter } from "./slice-character.js";
import { ImportFailure } from "./import-errors.js";
import type { ImportedCharacter } from "../types/import-model.js";

export type CharacterPayloadFetcher = (
  characterId: string,
) => Promise<unknown>;

export type CampaignRosterFetcher = (
  campaignId: string,
) => Promise<readonly string[]>;

export interface CampaignImportResult {
  imported: ImportedCharacter[];
  skipped: string[];
  failed: { id: string; message: string }[];
}

export class ImportService {
  private loadedCharacters: ImportedCharacter[] = [];

  constructor(
    private readonly fetchCharacterPayload: CharacterPayloadFetcher =
      fetchCharacter,
    private readonly fetchCampaignRoster: CampaignRosterFetcher =
      fetchCampaign,
  ) {}

  get characters(): readonly ImportedCharacter[] {
    return structuredClone(this.loadedCharacters);
  }

  get canShuffle(): boolean {
    return this.loadedCharacters.length >= 2;
  }

  async importCharacter(sourceValue: string): Promise<ImportedCharacter> {
    const parsed = parseResourceId(sourceValue, "character");
    const payload = await this.fetchCharacterPayload(parsed.id);
    const input = normalizeCharacterPayload(payload, parsed.id);
    const character = sliceCharacter(input);
    this.loadedCharacters = [...this.loadedCharacters, character];
    return structuredClone(character);
  }

  async importCampaign(sourceValue: string): Promise<CampaignImportResult> {
    const parsed = parseResourceId(sourceValue, "campaign");
    const characterIds = await this.fetchCampaignRoster(parsed.id);
    const result: CampaignImportResult = {
      imported: [],
      skipped: [],
      failed: [],
    };
    for (const id of characterIds) {
      if (this.loadedCharacters.some((c) => c.sourceCharacterId === id)) {
        result.skipped.push(id);
        continue;
      }
      try {
        result.imported.push(await this.importCharacter(id));
      } catch (error) {
        result.failed.push({
          id,
          message:
            error instanceof ImportFailure
              ? error.message
              : "The character could not be imported.",
        });
      }
    }
    return result;
  }
}

export const importService = new ImportService();
