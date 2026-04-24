import { describe, expect, it } from "vitest";

import { createApp } from "../../../src/app/create-app.js";
import { createInMemoryOAuthStore } from "../../../src/oauth/core/store.js";

function createOAuthEnvWithoutStore(): Env {
  return {
    JWT_SIGNING_KEY: "test-signing-key",
    MCP_OAUTH_ENABLED: "true",
    MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
    MCP_SERVER_NAME: "ynab-mcp-build",
    MCP_SERVER_VERSION: "0.1.0",
    YNAB_API_BASE_URL: "https://api.ynab.com/v1"
  } as unknown as Env;
}

function createCfAccessEnv(): Env {
  return {
    ...createOAuthEnvWithoutStore(),
    CF_ACCESS_AUD: "access-app-audience",
    CF_ACCESS_TEAM_DOMAIN: "https://access-team.example.com"
  } as unknown as Env;
}

describe("oauth store configuration", () => {
  it("returns a configuration error when oauth is enabled without a DO binding or injected store", async () => {
    // DEFECT: OAuth can silently fall back to in-memory state and mask a catastrophic production misconfiguration.
    const app = createApp();

    const response = await app.request(
      "http://localhost/register",
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          client_name: "Claude",
          grant_types: ["authorization_code", "refresh_token"],
          redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
          response_types: ["code"],
          token_endpoint_auth_method: "none"
        })
      },
      createOAuthEnvWithoutStore()
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "server_error",
      error_description: "OAuth state storage is not configured."
    });
  });

  it("sets Cache-Control on authorization-server metadata responses", async () => {
    // DEFECT: OAuth metadata can be served without explicit cache policy and create avoidable client and intermediary inconsistency.
    const app = createApp({
      oauthStore: createInMemoryOAuthStore()
    });

    const response = await app.request(
      "http://localhost/.well-known/oauth-authorization-server",
      undefined,
      createOAuthEnvWithoutStore()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
  });

  it("does not expose custom OAuth discovery metadata when self-hosted Access manages oauth", async () => {
    // DEFECT: a self-hosted Access deployment can advertise an app-owned OAuth server and send clients into the wrong authorization flow.
    const app = createApp({
      oauthStore: createInMemoryOAuthStore()
    });

    const authorizationServerResponse = await app.request(
      "http://localhost/.well-known/oauth-authorization-server",
      undefined,
      createCfAccessEnv()
    );
    const openIdConfigurationResponse = await app.request(
      "http://localhost/.well-known/openid-configuration",
      undefined,
      createCfAccessEnv()
    );
    const protectedResourceResponse = await app.request(
      "http://localhost/.well-known/oauth-protected-resource/mcp",
      undefined,
      createCfAccessEnv()
    );

    expect(authorizationServerResponse.status).toBe(404);
    expect(openIdConfigurationResponse.status).toBe(404);
    expect(protectedResourceResponse.status).toBe(404);
  });

  it("sets Cache-Control on protected-resource metadata responses", async () => {
    // DEFECT: protected resource metadata can be served without explicit cache policy and force unnecessary rediscovery churn.
    const app = createApp({
      oauthStore: createInMemoryOAuthStore()
    });

    const response = await app.request(
      "http://localhost/.well-known/oauth-protected-resource/mcp",
      undefined,
      createOAuthEnvWithoutStore()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
  });

  it("routes oauth registration through an injected store when one is provided", async () => {
    // DEFECT: test-mode OAuth can ignore an injected store and silently exercise the wrong persistence path.
    let registeredClientId: string | undefined;
    const app = createApp({
      oauthStore: {
        async getAccessToken() {
          return undefined;
        },
        async getAuthorizationCode() {
          return undefined;
        },
        async getRegisteredClient() {
          return undefined;
        },
        async issueAccessToken() {},
        async issueAuthorizationCode() {},
        async issueRefreshToken() {},
        async registerClient(record) {
          registeredClientId = record.clientId;
        },
        async rotateRefreshToken() {
          return {
            status: "not_found" as const
          };
        },
        async useAuthorizationCode() {
          return undefined;
        }
      }
    });

    const response = await app.request(
      "http://localhost/register",
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          client_name: "Claude",
          grant_types: ["authorization_code", "refresh_token"],
          redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
          response_types: ["code"],
          token_endpoint_auth_method: "none"
        })
      },
      createOAuthEnvWithoutStore()
    );

    expect(response.status).toBe(201);
    expect(registeredClientId).toBeTruthy();
  });
});
