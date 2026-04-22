import { describe, expect, it } from "vitest";

import { resolveOAuthCore } from "./dependencies.js";

describe("resolveOAuthCore", () => {
  it("rejects enabled OAuth when no durable state backing is configured", () => {
    expect(() =>
      resolveOAuthCore(
        {
          mcpServerName: "ynab-mcp-build",
          mcpServerVersion: "0.1.0",
          oauthEnabled: true,
          publicUrl: "https://example.com/mcp",
          ynabApiBaseUrl: "https://api.ynab.com/v1"
        },
        {}
      )
    ).toThrowError(
      "OAuth requires a Durable Object namespace or an injected OAuth store when MCP_OAUTH_ENABLED is true."
    );
  });
});
