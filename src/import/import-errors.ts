export type ImportErrorCategory =
  | "invalid-input"
  | "missing-credential"
  | "authentication-failed"
  | "character-inaccessible"
  | "campaign-unavailable"
  | "roster-unverified"
  | "rate-limited"
  | "invalid-payload"
  | "network-failure";

export interface ImportError {
  category: ImportErrorCategory;
  message: string;
  sourceCharacterId: string | null;
  retryable: boolean;
}

export class ImportFailure extends Error {
  readonly details: ImportError;

  constructor(details: ImportError) {
    super(details.message);
    this.name = "ImportFailure";
    this.details = details;
  }
}
