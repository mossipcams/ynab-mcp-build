import { describe, expect, it } from "vitest";

import {
  createOAuthEnv,
  fetchWorker,
  MCP_ORIGIN,
  MCP_RESOURCE,
} from "../../helpers/oauth-provider.js";

describe("oauth http resource metadata", () => {
  it("describes /mcp as the protected resource guarded by the provider", async () => {
    const response = await fetchWorker(
      new Request(`${MCP_ORIGIN}/.well-known/oauth-protected-resource/mcp`),
      createOAuthEnv(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      authorization_servers: [MCP_ORIGIN],
      bearer_methods_supported: ["header"],
      resource: MCP_RESOURCE,
      scopes_supported: ["mcp"],
    });
  });

  it("points unauthenticated MCP clients at that protected-resource metadata", async () => {
    const response = await fetchWorker(
      new Request(MCP_RESOURCE, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "tools/list",
          params: {},
        }),
      }),
      createOAuthEnv(),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      `resource_metadata="${MCP_ORIGIN}/.well-known/oauth-protected-resource/mcp"`,
    );
  });
});
