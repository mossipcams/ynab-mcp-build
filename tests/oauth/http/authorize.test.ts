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

async function registerClient(app: ReturnType<typeof createApp>) {
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
    createOauthEnv()
  );

  return response.json() as Promise<{ client_id: string }>;
}

describe("oauth http authorize", () => {
  it("redirects to the registered callback with code and state on the happy path", async () => {
    // DEFECT: the authorize adapter can complete successfully but fail to return the code and state to the registered redirect URI.
    const app = createApp({
      createId: (() => {
        const values = ["client-1", "auth-code-1"];

        return () => values.shift() ?? crypto.randomUUID();
      })(),
      oauthStore: createInMemoryOAuthStore()
    });
    const registration = await registerClient(app);
    const response = await app.request(
      `http://localhost/authorize?client_id=${encodeURIComponent(registration.client_id)}&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&response_type=code&resource=${encodeURIComponent("https://mcp.example.com/mcp")}&code_challenge=${encodeURIComponent("0FLIKahrX7kqxncwhV5WD82lu_wi5GA8FsRSLubaOpU")}&code_challenge_method=S256&state=client-state-1`,
      undefined,
      createOauthEnv()
    );
    const location = response.headers.get("location");

    expect(response.status).toBe(302);
    expect(location).toBe(
      "https://claude.ai/api/mcp/auth_callback?code=auth-code-1&state=client-state-1"
    );
  });

  it("rejects authorize requests with response_type other than code", async () => {
    // DEFECT: the authorize adapter can accept unsupported response types and open unintended grant flows.
    const app = createApp({
      createId: (() => {
        const values = ["client-1"];

        return () => values.shift() ?? crypto.randomUUID();
      })(),
      oauthStore: createInMemoryOAuthStore()
    });
    const registration = await registerClient(app);
    const response = await app.request(
      `http://localhost/authorize?client_id=${encodeURIComponent(registration.client_id)}&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&response_type=token&resource=${encodeURIComponent("https://mcp.example.com/mcp")}&code_challenge=${encodeURIComponent("0FLIKahrX7kqxncwhV5WD82lu_wi5GA8FsRSLubaOpU")}&code_challenge_method=S256`,
      undefined,
      createOauthEnv()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_request",
      error_description: "response_type must be code."
    });
  });

  it("rejects authorize requests without a code_challenge", async () => {
    // DEFECT: the authorize adapter can mint codes without a PKCE challenge when the client omits the parameter.
    const app = createApp({
      createId: (() => {
        const values = ["client-1"];

        return () => values.shift() ?? crypto.randomUUID();
      })(),
      oauthStore: createInMemoryOAuthStore()
    });
    const registration = await registerClient(app);
    const response = await app.request(
      `http://localhost/authorize?client_id=${encodeURIComponent(registration.client_id)}&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&response_type=code&resource=${encodeURIComponent("https://mcp.example.com/mcp")}&code_challenge_method=S256`,
      undefined,
      createOauthEnv()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_request",
      error_description: "code_challenge is required."
    });
  });

  it("rejects authorize requests with a code_challenge_method other than S256", async () => {
    // DEFECT: the authorize adapter can allow weaker PKCE methods even though the deployment requires S256.
    const app = createApp({
      createId: (() => {
        const values = ["client-1"];

        return () => values.shift() ?? crypto.randomUUID();
      })(),
      oauthStore: createInMemoryOAuthStore()
    });
    const registration = await registerClient(app);
    const response = await app.request(
      `http://localhost/authorize?client_id=${encodeURIComponent(registration.client_id)}&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&response_type=code&resource=${encodeURIComponent("https://mcp.example.com/mcp")}&code_challenge=test-challenge&code_challenge_method=plain`,
      undefined,
      createOauthEnv()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_request",
      error_description: "code_challenge_method must be S256."
    });
  });

  it("rejects authorize requests for unknown clients", async () => {
    // DEFECT: the authorize adapter can proceed with unregistered client ids and bypass client registration controls.
    const app = createApp({
      oauthStore: createInMemoryOAuthStore()
    });
    const response = await app.request(
      `http://localhost/authorize?client_id=${encodeURIComponent("missing-client")}&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&response_type=code&resource=${encodeURIComponent("https://mcp.example.com/mcp")}&code_challenge=test-challenge&code_challenge_method=S256`,
      undefined,
      createOauthEnv()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_request",
      error_description: "Unknown OAuth client."
    });
  });

  it("rejects authorize requests whose redirect_uri does not exactly match the registration", async () => {
    // DEFECT: the authorize adapter can allow redirect URI mismatches and leak codes to unauthorized callback URLs.
    const app = createApp({
      createId: (() => {
        const values = ["client-1"];

        return () => values.shift() ?? crypto.randomUUID();
      })(),
      oauthStore: createInMemoryOAuthStore()
    });
    const registration = await registerClient(app);
    const response = await app.request(
      `http://localhost/authorize?client_id=${encodeURIComponent(registration.client_id)}&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/other_callback")}&response_type=code&resource=${encodeURIComponent("https://mcp.example.com/mcp")}&code_challenge=test-challenge&code_challenge_method=S256`,
      undefined,
      createOauthEnv()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_request",
      error_description: "redirect_uri is not registered for this client."
    });
  });
});
