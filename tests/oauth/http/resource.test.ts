import { describe, expect, it } from "vitest";

import { createApp } from "../../../src/app/create-app.js";
import { createInMemoryOAuthStore } from "../../../src/oauth/core/store.js";

function createOauthEnv(): Env {
  return {
    JWT_SIGNING_KEY: "test-signing-key",
    MCP_OAUTH_ENABLED: "true",
    MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
    MCP_SERVER_NAME: "ynab-mcp-build",
    MCP_SERVER_VERSION: "0.1.0",
    YNAB_API_BASE_URL: "https://api.ynab.com/v1"
  } as unknown as Env;
}

describe("oauth http resource indicators", () => {
  it("rejects authorize requests without a resource parameter", async () => {
    // DEFECT: the HTTP adapter can omit resource binding even when the OAuth core requires an audience-specific authorization flow.
    const app = createApp({
      createId: (() => {
        const values = ["client-1"];

        return () => values.shift() ?? crypto.randomUUID();
      })(),
      oauthStore: createInMemoryOAuthStore()
    });
    const registrationResponse = await app.request(
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
      createOauthEnv()
    );
    const registration = await registrationResponse.json() as { client_id: string };
    const response = await app.request(
      `http://localhost/authorize?client_id=${encodeURIComponent(registration.client_id)}&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&response_type=code&code_challenge=${encodeURIComponent("0FLIKahrX7kqxncwhV5WD82lu_wi5GA8FsRSLubaOpU")}&code_challenge_method=S256`,
      undefined,
      createOauthEnv()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_request",
      error_description: "resource is required."
    });
  });

  it("rejects token exchanges without a resource parameter", async () => {
    // DEFECT: the token adapter can issue bearer tokens without requiring the client to restate the intended audience.
    const app = createApp({
      createId: (() => {
        const values = ["client-1", "auth-code-1", "jti-1", "refresh-token-1"];

        return () => values.shift() ?? crypto.randomUUID();
      })(),
      oauthStore: createInMemoryOAuthStore()
    });
    const registrationResponse = await app.request(
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
      createOauthEnv()
    );
    const registration = await registrationResponse.json() as { client_id: string };

    await app.request(
      `http://localhost/authorize?client_id=${encodeURIComponent(registration.client_id)}&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&response_type=code&resource=${encodeURIComponent("https://mcp.example.com/mcp")}&code_challenge=${encodeURIComponent("0FLIKahrX7kqxncwhV5WD82lu_wi5GA8FsRSLubaOpU")}&code_challenge_method=S256`,
      undefined,
      createOauthEnv()
    );

    const response = await app.request(
      "http://localhost/token",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: registration.client_id,
          code: "auth-code-1",
          code_verifier: "test-code-verifier",
          grant_type: "authorization_code",
          redirect_uri: "https://claude.ai/api/mcp/auth_callback"
        }).toString()
      },
      createOauthEnv()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_grant",
      error_description: "resource is required."
    });
  });
});
