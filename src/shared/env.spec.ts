import { describe, expect, it } from "vitest";

import { resolveAppEnv } from "./env.js";

describe("resolveAppEnv", () => {
  it("throws when OAuth is enabled without MCP_PUBLIC_URL", () => {
    expect(() =>
      resolveAppEnv({
        MCP_OAUTH_ENABLED: "true",
      } as Partial<Env> & { MCP_OAUTH_ENABLED: string }),
    ).toThrowError(
      "MCP_PUBLIC_URL is required when MCP_OAUTH_ENABLED is true.",
    );
  });

  it("does not derive OAuth public URL from the request origin", () => {
    expect(() =>
      resolveAppEnv(
        {
          MCP_OAUTH_ENABLED: "true",
          OAUTH_STATE: {} as DurableObjectNamespace,
        } as Partial<Env> & { MCP_OAUTH_ENABLED: string },
        new Request("https://spoof.example.net/mcp"),
      ),
    ).toThrowError(
      "MCP_PUBLIC_URL is required when MCP_OAUTH_ENABLED is true.",
    );
  });

  it("allows OAuth when MCP_PUBLIC_URL and state backing are present", () => {
    const env = resolveAppEnv({
      MCP_OAUTH_ENABLED: "true",
      MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
      OAUTH_STATE: {} as DurableObjectNamespace,
    } as Partial<Env> & { MCP_OAUTH_ENABLED: string; MCP_PUBLIC_URL: string });

    expect(env.oauthEnabled).toBe(true);
    expect(env.publicUrl).toBe("https://mcp.example.com/mcp");
  });

  it("allows explicitly injected KV OAuth state backing for tests", () => {
    const oauthKv = {} as KVNamespace;
    const env = resolveAppEnv({
      MCP_OAUTH_ENABLED: "true",
      MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
      OAUTH_KV: oauthKv,
    } as Partial<Env> & {
      MCP_OAUTH_ENABLED: string;
      MCP_PUBLIC_URL: string;
    });

    expect(env.oauthKvNamespace).toBe(oauthKv);
  });

  it("uses YNAB_API_TOKEN as a fallback alias for YNAB access token", () => {
    const env = resolveAppEnv({
      YNAB_API_BASE_URL: "https://api.ynab.com/v1",
      YNAB_API_TOKEN: "alias-token",
    } as Partial<Env> & { YNAB_API_TOKEN: string });

    expect(env.ynabAccessToken).toBe("alias-token");
  });

  it("prefers YNAB_ACCESS_TOKEN when both secret names are present", () => {
    const env = resolveAppEnv({
      YNAB_ACCESS_TOKEN: "primary-token",
      YNAB_API_BASE_URL: "https://api.ynab.com/v1",
      YNAB_API_TOKEN: "alias-token",
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
    } as Partial<Env> & {
      YNAB_DB: D1Database;
      YNAB_DEFAULT_PLAN_ID: string;
      YNAB_READ_SOURCE: string;
      YNAB_STALE_AFTER_MINUTES: string;
    });

    expect(env.ynabDatabase).toBe(database);
    expect(env.ynabDefaultPlanId).toBe("plan-1");
    expect(env.ynabReadSource).toBe("d1");
    expect(env.ynabStaleAfterMinutes).toBe(120);
    expect(env.ynabAccessToken).toBeUndefined();
  });

  it("defaults to D1 and rejects unsupported read sources", () => {
    expect(resolveAppEnv({}).ynabReadSource).toBe("d1");

    expect(() =>
      resolveAppEnv({
        YNAB_READ_SOURCE: "direct",
      } as Partial<Env> & { YNAB_READ_SOURCE: string }),
    ).toThrowError("YNAB_READ_SOURCE must be d1.");
  });

  it("defaults the read-model freshness warning window to hot-poll expectations", () => {
    expect(resolveAppEnv({}).ynabStaleAfterMinutes).toBe(30);
  });
});
