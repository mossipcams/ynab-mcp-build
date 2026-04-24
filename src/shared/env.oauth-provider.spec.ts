import { describe, expect, it } from "vitest";

import { resolveAppEnv } from "./env.js";

describe("OAuth provider environment", () => {
  it("resolves the Cloudflare OAuth provider KV namespace binding", () => {
    const oauthKv = {} as KVNamespace;

    const env = resolveAppEnv({
      MCP_OAUTH_ENABLED: "true",
      MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
      OAUTH_KV: oauthKv,
      YNAB_API_BASE_URL: "https://api.ynab.com/v1"
    } as unknown as Env);

    expect(env.oauthKvNamespace).toBe(oauthKv);
  });

  it("requires DO-backed OAuth state unless a test KV store is injected", () => {
    expect(() =>
      resolveAppEnv({
        MCP_OAUTH_ENABLED: "true",
        MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
        YNAB_API_BASE_URL: "https://api.ynab.com/v1"
      } as unknown as Env)
    ).toThrowError(
      "OAuth requires a Durable Object namespace or an injected OAuth KV store when MCP_OAUTH_ENABLED is true."
    );
  });

  it("resolves the canonical Durable Object OAuth state binding", () => {
    const oauthState = {} as DurableObjectNamespace;

    const env = resolveAppEnv({
      MCP_OAUTH_ENABLED: "true",
      MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
      OAUTH_STATE: oauthState,
      YNAB_API_BASE_URL: "https://api.ynab.com/v1"
    } as unknown as Env);

    expect(env.oauthStateNamespace).toBe(oauthState);
  });
});
