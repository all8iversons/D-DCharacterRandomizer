import type { CharacterSlices } from "./character-slices.js";
import type { ImportError } from "../import/import-errors.js";

export type ImportKind = "character" | "campaign";

export interface ImportRequest {
  kind: ImportKind;
  sourceValue: string;
  submittedAt: number;
}

export type ImportStatus =
  | "validating"
  | "authenticating"
  | "fetching"
  | "slicing"
  | "complete"
  | "failed";

export interface ImportedCharacter {
  sourceCharacterId: string;
  sourceCampaignId: string | null;
  name: string;
  slices: CharacterSlices;
}

export interface ImportBatch {
  id: string;
  source: ImportRequest;
  status: ImportStatus;
  characters: readonly ImportedCharacter[];
  error: ImportError | null;
}

export interface ParsedResourceId {
  kind: ImportKind;
  id: string;
}
