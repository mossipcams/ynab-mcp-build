import { describe, expect, it } from "vitest";

import { createApp } from "../../../src/app/create-app.js";
import { createInMemoryOAuthStore } from "../../../src/oauth/core/store.js";

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

function createRegisterRequest(redirectUris: string[]) {
  return new Request("http://localhost/register", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      client_name: "Claude",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: redirectUris,
      response_types: ["code"],
      token_endpoint_auth_method: "none"
    })
  });
}

describe("oauth http register and metadata", () => {
  it("stores a valid client registration and returns the issued client identifier", async () => {
    // DEFECT: the registration endpoint can return success without persisting the client metadata that authorize depends on.
    const app = createApp({
      createId: (() => {
        const values = ["client-1"];

        return () => values.shift() ?? crypto.randomUUID();
      })(),
      oauthStore: createInMemoryOAuthStore()
    });

    const registerResponse = await app.fetch(
      createRegisterRequest(["https://claude.ai/api/mcp/auth_callback"]),
      createOAuthEnv()
    );
    const registration = await registerResponse.json() as { client_id: string };
    const authorizeResponse = await app.request(
      `http://localhost/authorize?client_id=${encodeURIComponent(registration.client_id)}&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&response_type=code&resource=${encodeURIComponent("https://mcp.example.com/mcp")}&code_challenge=${encodeURIComponent("0FLIKahrX7kqxncwhV5WD82lu_wi5GA8FsRSLubaOpU")}&code_challenge_method=S256`,
      undefined,
      createOAuthEnv()
    );

    expect(registerResponse.status).toBe(201);
    expect(registration.client_id).toBe("client-1");
    expect(authorizeResponse.status).toBe(302);
  });

  it("rejects malformed redirect URIs during client registration", async () => {
    // DEFECT: the registration endpoint can accept syntactically invalid redirect URIs and persist unusable client metadata.
    const app = createApp({
      oauthStore: createInMemoryOAuthStore()
    });

    const response = await app.fetch(
      createRegisterRequest(["not-a-valid-uri"]),
      createOAuthEnv()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_client_metadata",
      error_description: "Invalid URL"
    });
  });

  it("rejects non-https redirect URIs for non-loopback hosts", async () => {
    // DEFECT: the registration endpoint can allow insecure remote redirect URIs and leak authorization codes in transit.
    const app = createApp({
      oauthStore: createInMemoryOAuthStore()
    });

    const response = await app.fetch(
      createRegisterRequest(["http://example.com/callback"]),
      createOAuthEnv()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_client_metadata",
      error_description: "redirect_uris must use https unless they target a loopback host over http."
    });
  });

  it("allows localhost http redirect URIs for local client development", async () => {
    // DEFECT: the registration endpoint can reject standards-compliant loopback callbacks and break local OAuth development flows.
    const app = createApp({
      oauthStore: createInMemoryOAuthStore()
    });

    const response = await app.fetch(
      createRegisterRequest(["http://localhost:8788/callback"]),
      createOAuthEnv()
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      redirect_uris: ["http://localhost:8788/callback"]
    });
  });

  it("publishes S256 support in authorization-server metadata", async () => {
    // DEFECT: OAuth discovery metadata can omit the mandatory PKCE method and mislead clients into unsupported code flows.
    const app = createApp({
      oauthStore: createInMemoryOAuthStore()
    });

    const response = await app.request(
      "http://localhost/.well-known/oauth-authorization-server",
      undefined,
      createOAuthEnv()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      code_challenge_methods_supported: ["S256"]
    });
  });

  it("publishes header bearer support in protected-resource metadata", async () => {
    // DEFECT: protected resource metadata can advertise the wrong bearer transport and cause clients to send tokens in unsupported locations.
    const app = createApp({
      oauthStore: createInMemoryOAuthStore()
    });

    const response = await app.request(
      "http://localhost/.well-known/oauth-protected-resource/mcp",
      undefined,
      createOAuthEnv()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      bearer_methods_supported: ["header"]
    });
  });
});
