import { describe, expect, it } from "vitest";
import wranglerConfig from "../wrangler.jsonc?raw";

import { createApp } from "./app/create-app.js";
import { createInMemoryOAuthStore } from "./oauth/core/store.js";

function createOAuthEnv(): Env {
  return {
    JWT_SIGNING_KEY: "test-signing-key",
    MCP_OAUTH_ENABLED: "true",
    MCP_PUBLIC_URL: "https://ynab-mcp-build.mossipcams.workers.dev/mcp",
    MCP_SERVER_NAME: "ynab-mcp-build",
    MCP_SERVER_VERSION: "0.1.0",
    YNAB_API_BASE_URL: "https://api.ynab.com/v1"
  } as unknown as Env;
}

describe("custom-domain oauth metadata", () => {
  it("serves oauth discovery from the incoming request origin", async () => {
    // DEFECT: a custom-domain deployment can advertise the checked-in workers.dev host and break OAuth bootstrap for MCP clients.
    const app = createApp({
      oauthStore: createInMemoryOAuthStore()
    });
    const env = createOAuthEnv();

    const protectedResourceResponse = await app.request(
      "https://hub.mossyhome.net/.well-known/oauth-protected-resource/mcp",
      undefined,
      env
    );
    const authorizationServerResponse = await app.request(
      "https://hub.mossyhome.net/.well-known/oauth-authorization-server",
      undefined,
      env
    );

    await expect(protectedResourceResponse.json()).resolves.toMatchObject({
      authorization_servers: ["https://hub.mossyhome.net/"],
      resource: "https://hub.mossyhome.net/mcp"
    });
    await expect(authorizationServerResponse.json()).resolves.toMatchObject({
      authorization_endpoint: "https://hub.mossyhome.net/authorize",
      issuer: "https://hub.mossyhome.net/",
      registration_endpoint: "https://hub.mossyhome.net/register",
      token_endpoint: "https://hub.mossyhome.net/token"
    });
  });

  it("uses the incoming request origin for unauthorized mcp metadata", async () => {
    // DEFECT: unauthenticated MCP responses can point clients at the wrong protected-resource metadata endpoint for a custom host.
    const app = createApp({
      oauthStore: createInMemoryOAuthStore()
    });

    const response = await app.request(
      "https://hub.mossyhome.net/mcp",
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "tools/list",
          params: {}
        })
      },
      createOAuthEnv()
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      'resource_metadata="https://hub.mossyhome.net/.well-known/oauth-protected-resource/mcp"'
    );
  });
});

describe("deployment config defaults", () => {
  it("does not hardcode the workers.dev public url in checked-in wrangler config", () => {
    // DEFECT: checked-in deployment config can overwrite the canonical custom-domain origin and advertise the wrong OAuth base URL after deploys.
    expect(wranglerConfig).not.toContain('"MCP_PUBLIC_URL": "https://ynab-mcp-build.mossipcams.workers.dev/mcp"');
  });
});
