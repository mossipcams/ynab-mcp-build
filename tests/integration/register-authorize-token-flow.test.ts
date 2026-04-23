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

describe("register-authorize-token integration", () => {
  it("registers a client and completes the oauth code exchange", async () => {
    // DEFECT: individually passing OAuth endpoints can still fail to compose into a valid bearer-token flow.
    const app = createApp({
      createId: (() => {
        const values = [
          "client-1",
          "auth-code-1",
          "refresh-token-1",
          "jti-1"
        ];

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
      createOAuthEnv()
    );
    const registration = await registrationResponse.json() as {
      client_id: string;
    };
    const authorizeResponse = await app.request(
      `http://localhost/authorize?client_id=${encodeURIComponent(registration.client_id)}&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&response_type=code&resource=${encodeURIComponent("https://mcp.example.com/mcp")}&code_challenge=${encodeURIComponent("0FLIKahrX7kqxncwhV5WD82lu_wi5GA8FsRSLubaOpU")}&code_challenge_method=S256&state=client-state-1`,
      undefined,
      createOAuthEnv()
    );
    const redirectLocation = authorizeResponse.headers.get("location");
    const code = redirectLocation ? new URL(redirectLocation).searchParams.get("code") : null;
    const tokenResponse = await app.request(
      "http://localhost/token",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: registration.client_id,
          code: code ?? "",
          code_verifier: "test-code-verifier",
          grant_type: "authorization_code",
          redirect_uri: "https://claude.ai/api/mcp/auth_callback",
          resource: "https://mcp.example.com/mcp"
        }).toString()
      },
      createOAuthEnv()
    );
    const tokenPayload = await tokenResponse.json() as {
      access_token: string;
      refresh_token: string;
      token_type: string;
    };

    expect(registrationResponse.status).toBe(201);
    expect(authorizeResponse.status).toBe(302);
    expect(tokenResponse.status).toBe(200);
    expect(tokenPayload.access_token).toBeTruthy();
    expect(tokenPayload.refresh_token).toBeTruthy();
    expect(tokenPayload.token_type).toBe("Bearer");
  });
});
