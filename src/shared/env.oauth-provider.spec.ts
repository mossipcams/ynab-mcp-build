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
});
