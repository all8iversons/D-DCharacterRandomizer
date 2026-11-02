import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchCampaignPayload,
  fetchCharacterPayload,
} from "../../src/import/remote-transport.js";
import { ImportFailure } from "../../src/import/import-errors.js";
import { MODULE_ID, SETTING_KEYS } from "../../src/settings/credentials.js";

const settings = new Map<string, string>([
  [SETTING_KEYS.proxyUrl, "https://localhost:8787"],
  [SETTING_KEYS.proxyToken, "p".repeat(40)],
  [SETTING_KEYS.cobaltSession, "test-session-cookie"],
]);

beforeEach(() => {
  settings.set(SETTING_KEYS.proxyUrl, "https://localhost:8787");
  settings.set(SETTING_KEYS.proxyToken, "p".repeat(40));
  settings.set(SETTING_KEYS.cobaltSession, "test-session-cookie");
  vi.mocked(game.settings.get).mockImplementation((_namespace, key) => {
    return settings.get(key) ?? "";
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { id: 123, name: "Test" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
});

describe("self-hosted remote transport", () => {
  it("sends the credential only to the configured HTTPS proxy", async () => {
    await fetchCharacterPayload("123");

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(String(url)).toBe("https://localhost:8787/api/import/character");
    expect(init?.credentials).toBe("omit");
    expect(init?.redirect).toBe("error");
    expect(init?.headers).toMatchObject({
      Authorization: `Bearer ${"p".repeat(40)}`,
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      id: "123",
      cobaltSession: "test-session-cookie",
    });
    expect(String(init?.body)).not.toContain("characterId");
    expect(String(url)).not.toContain("dndbeyond.com");
  });

  it("does not make a network request if credentials or proxy config are missing", async () => {
    settings.set(SETTING_KEYS.cobaltSession, "");

    await expect(fetchCharacterPayload("123")).rejects.toMatchObject({
      details: { category: "missing-credential" },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects an HTTP proxy URL before sending credentials", async () => {
    settings.set(SETTING_KEYS.proxyUrl, "http://localhost:8787");

    await expect(fetchCharacterPayload("123")).rejects.toBeInstanceOf(
      ImportFailure,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the proxy's expected character ID field", async () => {
    await fetchCharacterPayload("98765");

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({
      id: "98765",
      cobaltSession: "test-session-cookie",
    });
  });

  it("does not display untrusted proxy response messages", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: "unexpected-error",
          message: "test-session-cookie was leaked",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      ),
    );

    const failure = await fetchCharacterPayload("123").catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ImportFailure);
    if (!(failure instanceof ImportFailure)) {
      throw new Error("Expected an import failure");
    }
    expect(failure.message).not.toContain("test-session-cookie");
    expect(failure.message).not.toContain("leaked");
  });

  it.each([
    ["authentication-failed", "authentication-failed"],
    ["character-inaccessible", "character-inaccessible"],
    ["rate-limited", "rate-limited"],
  ])("maps %s to a safe import error", async (code, category) => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: code,
          message: "untrusted upstream response with test-session-cookie",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    );

    const failure = await fetchCharacterPayload("123").catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ImportFailure);
    if (!(failure instanceof ImportFailure)) {
      throw new Error("Expected an import failure");
    }
    expect(failure.details.category).toBe(category);
    expect(failure.details.message).not.toContain("test-session-cookie");
    expect(failure.details.message).not.toContain("upstream response");
  });

  it("fails closed for campaign import without sending credentials", async () => {
    await expect(fetchCampaignPayload("456")).rejects.toMatchObject({
      details: { category: "roster-unverified" },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("registers proxy and credential settings as client-scoped", async () => {
    const { registerSettings } = await import(
      "../../src/settings/credentials.js"
    );
    registerSettings();

    expect(game.settings.register).toHaveBeenCalledTimes(3);
    for (const key of Object.values(SETTING_KEYS)) {
      expect(game.settings.register).toHaveBeenCalledWith(
        MODULE_ID,
        key,
        expect.objectContaining({ scope: "client", config: true }),
      );
    }
  });
});
