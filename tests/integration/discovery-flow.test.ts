import { describe, expect, it } from "vitest";

import { createApp } from "../../src/app/create-app.js";
import { createInMemoryOAuthStore } from "../../src/oauth/core/store.js";

function createOAuthEnv(): Env {
  return {
    JWT_SIGNING_KEY: "test-signing-key",
    MCP_OAUTH_ENABLED: "true",
    MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
    MCP_SERVER_NAME: "ynab-mcp-build",
    MCP_SERVER_VERSION: "0.1.0",
    YNAB_API_BASE_URL: "https://api.ynab.com/v1"
  } as unknown as Env;
}

describe("discovery integration", () => {
  it("serves protected-resource and authorization-server discovery metadata", async () => {
    // DEFECT: OAuth discovery endpoints can drift apart and leave clients without a valid bootstrap path into the worker.
    const app = createApp({
      oauthStore: createInMemoryOAuthStore()
    });

    const protectedResourceResponse = await app.request(
      "http://localhost/.well-known/oauth-protected-resource/mcp",
      undefined,
      createOAuthEnv()
    );
    const authorizationServerResponse = await app.request(
      "http://localhost/.well-known/oauth-authorization-server",
      undefined,
      createOAuthEnv()
    );

    expect(protectedResourceResponse.status).toBe(200);
    expect(authorizationServerResponse.status).toBe(200);
    await expect(protectedResourceResponse.json()).resolves.toMatchObject({
      authorization_servers: ["https://mcp.example.com/"],
      bearer_methods_supported: ["header"],
      resource: "https://mcp.example.com/mcp"
    });
    await expect(authorizationServerResponse.json()).resolves.toMatchObject({
      authorization_endpoint: "https://mcp.example.com/authorize",
      code_challenge_methods_supported: ["S256"],
      issuer: "https://mcp.example.com/",
      registration_endpoint: "https://mcp.example.com/register",
      token_endpoint: "https://mcp.example.com/token"
    });
  });
});
