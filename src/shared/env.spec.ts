import { describe, expect, it } from "vitest";

import { resolveAppEnv } from "./env.js";

describe("resolveAppEnv", () => {
  it("throws when OAuth is enabled without MCP_PUBLIC_URL", () => {
    expect(() =>
      resolveAppEnv({
        MCP_OAUTH_ENABLED: "true"
      } as Partial<Env> & { MCP_OAUTH_ENABLED: string })
    ).toThrowError("MCP_PUBLIC_URL is required when MCP_OAUTH_ENABLED is true.");
  });

  it("allows OAuth when MCP_PUBLIC_URL is present", () => {
    const env = resolveAppEnv({
      MCP_OAUTH_ENABLED: "true",
      MCP_PUBLIC_URL: "https://your-worker.workers.dev/mcp"
    } as Partial<Env> & { MCP_OAUTH_ENABLED: string; MCP_PUBLIC_URL: string });

    expect(env.oauthEnabled).toBe(true);
    expect(env.publicUrl).toBe("https://your-worker.workers.dev/mcp");
  });

  it("uses YNAB_API_TOKEN as a fallback alias for YNAB access token", () => {
    const env = resolveAppEnv({
      YNAB_API_BASE_URL: "https://api.ynab.com/v1",
      YNAB_API_TOKEN: "alias-token"
    } as Partial<Env> & { YNAB_API_TOKEN: string });

    expect(env.ynabAccessToken).toBe("alias-token");
  });

  it("prefers YNAB_ACCESS_TOKEN when both secret names are present", () => {
    const env = resolveAppEnv({
      YNAB_ACCESS_TOKEN: "primary-token",
      YNAB_API_BASE_URL: "https://api.ynab.com/v1",
      YNAB_API_TOKEN: "alias-token"
    } as Partial<Env> & { YNAB_API_TOKEN: string });

    expect(env.ynabAccessToken).toBe("primary-token");
  });
});
