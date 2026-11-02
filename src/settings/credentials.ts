export const MODULE_ID = "d-d-character-randomizer";

export const SETTING_KEYS = {
  cobaltSession: "cobaltSession",
  proxyUrl: "proxyUrl",
  proxyToken: "proxyToken",
} as const;

export function registerSettings(): void {
  game.settings.register(MODULE_ID, SETTING_KEYS.cobaltSession, {
    name: "D&D Beyond CobaltSession",
    hint: "Password-equivalent session cookie. Stored locally by Foundry and not encrypted; visual masking is not encryption.",
    scope: "client",
    config: true,
    type: String,
    default: "",
    password: true,
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.proxyUrl, {
    name: "Self-hosted D&D Beyond proxy URL",
    hint: "HTTPS URL of your own proxy, for example https://localhost:8787.",
    scope: "client",
    config: true,
    type: String,
    default: "",
  });

  game.settings.register(MODULE_ID, SETTING_KEYS.proxyToken, {
    name: "Self-hosted proxy access token",
    hint: "Shared token configured on your self-hosted proxy. Stored locally and not encrypted; visual masking is not encryption.",
    scope: "client",
    config: true,
    type: String,
    default: "",
    password: true,
  });
}

export function readClientSetting(key: string): string {
  const value = game.settings.get(MODULE_ID, key);
  return typeof value === "string" ? value.trim() : "";
}
