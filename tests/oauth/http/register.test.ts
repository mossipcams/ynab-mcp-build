import { describe, expect, it } from "vitest";

import {
  createOAuthEnv,
  fetchWorker,
  MCP_ORIGIN,
  MCP_RESOURCE,
  REDIRECT_URI,
  registerClient
} from "../../helpers/oauth-provider.js";

describe("oauth http register and metadata", () => {
  it("exposes dynamic client registration for public OAuth clients", async () => {
    const env = createOAuthEnv();
    const { registration, response } = await registerClient(env);

    expect(response.status).toBe(201);
    expect(registration.client_id).toEqual(expect.any(String));
    expect(registration.client_id).not.toHaveLength(0);
    expect(registration).toMatchObject({
      client_name: "Claude",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: [REDIRECT_URI],
      response_types: ["code"],
      token_endpoint_auth_method: "none"
    });
  });

  it("publishes the authorization server endpoints MCP clients need", async () => {
    const response = await fetchWorker(
      new Request(`${MCP_ORIGIN}/.well-known/oauth-authorization-server`),
      createOAuthEnv()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      authorization_endpoint: `${MCP_ORIGIN}/authorize`,
      code_challenge_methods_supported: ["S256"],
      registration_endpoint: `${MCP_ORIGIN}/register`,
      scopes_supported: ["mcp"],
      token_endpoint: `${MCP_ORIGIN}/token`
    });
  });

  it("publishes MCP protected-resource metadata for bearer-token clients", async () => {
    const response = await fetchWorker(
      new Request(`${MCP_ORIGIN}/.well-known/oauth-protected-resource/mcp`),
      createOAuthEnv()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      authorization_servers: [MCP_ORIGIN],
      bearer_methods_supported: ["header"],
      resource: MCP_RESOURCE
    });
  });
});
