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

  it("allows OAuth when MCP_PUBLIC_URL and state backing are present", () => {
    const env = resolveAppEnv({
      MCP_OAUTH_ENABLED: "true",
      MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
      OAUTH_STATE: {} as DurableObjectNamespace
    } as Partial<Env> & { MCP_OAUTH_ENABLED: string; MCP_PUBLIC_URL: string });

    expect(env.oauthEnabled).toBe(true);
    expect(env.publicUrl).toBe("https://mcp.example.com/mcp");
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

  it("resolves DB-backed read model configuration without requiring a YNAB access token", () => {
    const database = {} as D1Database;

    const env = resolveAppEnv({
      YNAB_DB: database,
      YNAB_DEFAULT_PLAN_ID: "plan-1",
      YNAB_READ_SOURCE: "d1",
      YNAB_STALE_AFTER_MINUTES: "120",
      YNAB_SYNC_MAX_ROWS_PER_RUN: "50"
    } as Partial<Env> & {
      YNAB_DB: D1Database;
      YNAB_DEFAULT_PLAN_ID: string;
      YNAB_READ_SOURCE: string;
      YNAB_STALE_AFTER_MINUTES: string;
      YNAB_SYNC_MAX_ROWS_PER_RUN: string;
    });

    expect(env.ynabDatabase).toBe(database);
    expect(env.ynabDefaultPlanId).toBe("plan-1");
    expect(env.ynabReadSource).toBe("d1");
    expect(env.ynabStaleAfterMinutes).toBe(120);
    expect(env.ynabSyncMaxRowsPerRun).toBe(50);
    expect(env.ynabAccessToken).toBeUndefined();
  });
});
