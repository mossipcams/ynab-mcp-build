import { describe, expect, it } from "vitest";

import {
  createOAuthEnv,
  fetchWorker,
  MCP_ORIGIN,
  MCP_RESOURCE,
} from "../helpers/oauth-provider.js";

describe("discovery integration", () => {
  it("serves the provider discovery documents MCP clients use to bootstrap OAuth", async () => {
    const env = createOAuthEnv();
    const protectedResourceResponse = await fetchWorker(
      new Request(`${MCP_ORIGIN}/.well-known/oauth-protected-resource/mcp`),
      env,
    );
    const authorizationServerResponse = await fetchWorker(
      new Request(`${MCP_ORIGIN}/.well-known/oauth-authorization-server`),
      env,
    );

    expect(protectedResourceResponse.status).toBe(200);
    expect(authorizationServerResponse.status).toBe(200);
    await expect(protectedResourceResponse.json()).resolves.toMatchObject({
      authorization_servers: [MCP_ORIGIN],
      bearer_methods_supported: ["header"],
      resource: MCP_RESOURCE,
    });
    await expect(authorizationServerResponse.json()).resolves.toMatchObject({
      authorization_endpoint: `${MCP_ORIGIN}/authorize`,
      issuer: MCP_ORIGIN,
      registration_endpoint: `${MCP_ORIGIN}/register`,
      token_endpoint: `${MCP_ORIGIN}/token`,
    });
  });
});
