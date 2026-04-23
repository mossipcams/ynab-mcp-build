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

async function issueAuthorizationCode(app: ReturnType<typeof createApp>, clientId: string) {
  const response = await app.request(
    `http://localhost/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&response_type=code&resource=${encodeURIComponent("https://mcp.example.com/mcp")}&code_challenge=${encodeURIComponent("0FLIKahrX7kqxncwhV5WD82lu_wi5GA8FsRSLubaOpU")}&code_challenge_method=S256`,
    undefined,
    createOauthEnv()
  );
  const location = response.headers.get("location");

  if (!location) {
    throw new Error("authorize did not redirect with a code");
  }

  return new URL(location).searchParams.get("code") ?? "";
}

describe("oauth http token", () => {
  it("rejects reused authorization codes after a successful exchange", async () => {
    // DEFECT: the token adapter can allow an authorization code to be redeemed multiple times after a successful exchange.
    const app = createApp({
      createId: (() => {
        const values = ["client-1", "auth-code-1", "jti-1", "refresh-token-1"];

        return () => values.shift() ?? crypto.randomUUID();
      })(),
      oauthStore: createInMemoryOAuthStore()
    });
    const registration = await registerClient(app);
    const code = await issueAuthorizationCode(app, registration.client_id);

    const firstResponse = await app.request(
      "http://localhost/token",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: registration.client_id,
          code,
          code_verifier: "test-code-verifier",
          grant_type: "authorization_code",
          redirect_uri: "https://claude.ai/api/mcp/auth_callback",
          resource: "https://mcp.example.com/mcp"
        }).toString()
      },
      createOauthEnv()
    );
    const replayResponse = await app.request(
      "http://localhost/token",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: registration.client_id,
          code,
          code_verifier: "test-code-verifier",
          grant_type: "authorization_code",
          redirect_uri: "https://claude.ai/api/mcp/auth_callback",
          resource: "https://mcp.example.com/mcp"
        }).toString()
      },
      createOauthEnv()
    );

    expect(firstResponse.status).toBe(200);
    expect(replayResponse.status).toBe(400);
    await expect(replayResponse.json()).resolves.toMatchObject({
      error: "invalid_grant",
      error_description: "Authorization code is invalid or has already been used."
    });
  });

  it("rejects expired authorization codes", async () => {
    // DEFECT: the token adapter can mint tokens from authorization codes after their TTL has elapsed.
    let now = Date.UTC(2026, 3, 22, 12, 0, 0);
    const app = createApp({
      createId: (() => {
        const values = ["client-1", "auth-code-1", "jti-1", "refresh-token-1"];

        return () => values.shift() ?? crypto.randomUUID();
      })(),
      now: () => now,
      oauthStore: createInMemoryOAuthStore()
    });
    const registration = await registerClient(app);
    const code = await issueAuthorizationCode(app, registration.client_id);

    now += 5 * 60 * 1000 + 1;

    const response = await app.request(
      "http://localhost/token",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: registration.client_id,
          code,
          code_verifier: "test-code-verifier",
          grant_type: "authorization_code",
          redirect_uri: "https://claude.ai/api/mcp/auth_callback",
          resource: "https://mcp.example.com/mcp"
        }).toString()
      },
      createOauthEnv()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_grant",
      error_description: "Authorization code has expired."
    });
  });

  it("rejects authorization_code exchanges with the wrong code_verifier", async () => {
    // DEFECT: the token adapter can redeem authorization codes even when the PKCE verifier does not match the original challenge.
    const app = createApp({
      createId: (() => {
        const values = ["client-1", "auth-code-1", "family-1", "refresh-token-1", "jti-1"];

        return () => values.shift() ?? crypto.randomUUID();
      })(),
      oauthStore: createInMemoryOAuthStore()
    });
    const registration = await registerClient(app);
    const code = await issueAuthorizationCode(app, registration.client_id);
    const response = await app.request(
      "http://localhost/token",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: registration.client_id,
          code,
          code_verifier: "wrong-verifier",
          grant_type: "authorization_code",
          redirect_uri: "https://claude.ai/api/mcp/auth_callback",
          resource: "https://mcp.example.com/mcp"
        }).toString()
      },
      createOauthEnv()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_grant",
      error_description: "PKCE code_verifier is invalid."
    });
  });

  it("rejects authorization_code exchanges with the wrong redirect_uri", async () => {
    // DEFECT: the token adapter can redeem a code from a different redirect URI than the one bound at authorization time.
    const app = createApp({
      createId: (() => {
        const values = ["client-1", "auth-code-1", "family-1", "refresh-token-1", "jti-1"];

        return () => values.shift() ?? crypto.randomUUID();
      })(),
      oauthStore: createInMemoryOAuthStore()
    });
    const registration = await registerClient(app);
    const code = await issueAuthorizationCode(app, registration.client_id);
    const response = await app.request(
      "http://localhost/token",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: registration.client_id,
          code,
          code_verifier: "test-code-verifier",
          grant_type: "authorization_code",
          redirect_uri: "https://claude.ai/api/mcp/other_callback",
          resource: "https://mcp.example.com/mcp"
        }).toString()
      },
      createOauthEnv()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_grant",
      error_description: "redirect_uri does not match the authorization request."
    });
  });

  it("rejects authorization_code exchanges with the wrong resource", async () => {
    // DEFECT: the token adapter can mint a bearer token for a different protected resource than the one bound during authorization.
    const app = createApp({
      createId: (() => {
        const values = ["client-1", "auth-code-1", "jti-1", "refresh-token-1"];

        return () => values.shift() ?? crypto.randomUUID();
      })(),
      oauthStore: createInMemoryOAuthStore()
    });
    const registration = await registerClient(app);
    const code = await issueAuthorizationCode(app, registration.client_id);
    const response = await app.request(
      "http://localhost/token",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: registration.client_id,
          code,
          code_verifier: "test-code-verifier",
          grant_type: "authorization_code",
          redirect_uri: "https://claude.ai/api/mcp/auth_callback",
          resource: "https://other.example.com/mcp"
        }).toString()
      },
      createOauthEnv()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_grant",
      error_description: "resource must match the canonical protected resource."
    });
  });

  it("rejects authorization_code exchanges for the wrong client", async () => {
    // DEFECT: the token adapter can let one registered client redeem another client's authorization code.
    const app = createApp({
      createId: (() => {
        const values = ["client-1", "client-2", "auth-code-1", "jti-1", "refresh-token-1"];

        return () => values.shift() ?? crypto.randomUUID();
      })(),
      oauthStore: createInMemoryOAuthStore()
    });
    const registrationOne = await registerClient(app);
    const registrationTwo = await registerClient(app);
    const code = await issueAuthorizationCode(app, registrationOne.client_id);
    const response = await app.request(
      "http://localhost/token",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: registrationTwo.client_id,
          code,
          code_verifier: "test-code-verifier",
          grant_type: "authorization_code",
          redirect_uri: "https://claude.ai/api/mcp/auth_callback",
          resource: "https://mcp.example.com/mcp"
        }).toString()
      },
      createOauthEnv()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_grant",
      error_description: "Authorization code does not belong to this client."
    });
  });

  it("rejects refresh_token exchanges for the wrong client", async () => {
    // DEFECT: the token adapter can let one client reuse another client's refresh token and mint bearer tokens.
    const app = createApp({
      createId: (() => {
        const values = [
          "client-1",
          "client-2",
          "auth-code-1",
          "family-1",
          "refresh-token-1",
          "jti-1"
        ];

        return () => values.shift() ?? crypto.randomUUID();
      })(),
      oauthStore: createInMemoryOAuthStore()
    });
    const registrationOne = await registerClient(app);
    const registrationTwo = await registerClient(app);
    const code = await issueAuthorizationCode(app, registrationOne.client_id);
    const tokenResponse = await app.request(
      "http://localhost/token",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: registrationOne.client_id,
          code,
          code_verifier: "test-code-verifier",
          grant_type: "authorization_code",
          redirect_uri: "https://claude.ai/api/mcp/auth_callback",
          resource: "https://mcp.example.com/mcp"
        }).toString()
      },
      createOauthEnv()
    );
    const tokenPayload = await tokenResponse.json() as { refresh_token: string };
    const response = await app.request(
      "http://localhost/token",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: registrationTwo.client_id,
          grant_type: "refresh_token",
          refresh_token: tokenPayload.refresh_token,
          resource: "https://mcp.example.com/mcp"
        }).toString()
      },
      createOauthEnv()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_grant",
      error_description: "Refresh token does not belong to this client."
    });
  });

  it("rejects unsupported grant types", async () => {
    // DEFECT: the token adapter can accept unsupported grant types and expose flows that the deployment never intended to support.
    const app = createApp({
      oauthStore: createInMemoryOAuthStore()
    });
    const response = await app.request(
      "http://localhost/token",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: "client-1",
          grant_type: "password"
        }).toString()
      },
      createOauthEnv()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "unsupported_grant_type",
      error_description: "grant_type must be authorization_code or refresh_token."
    });
  });

  it("revokes the refresh token family after replay of an old refresh token", async () => {
    // DEFECT: the HTTP token adapter can rotate a refresh token but fail to poison the family when the old token is replayed.
    const app = createApp({
      createId: (() => {
        const values = [
          "client-1",
          "auth-code-1",
          "jti-1",
          "refresh-token-1",
          "jti-2",
          "refresh-token-2",
          "jti-3",
          "refresh-token-3"
        ];

        return () => values.shift() ?? crypto.randomUUID();
      })(),
      oauthStore: createInMemoryOAuthStore()
    });
    const registration = await registerClient(app);
    const code = await issueAuthorizationCode(app, registration.client_id);
    const initialTokenResponse = await app.request(
      "http://localhost/token",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: registration.client_id,
          code,
          code_verifier: "test-code-verifier",
          grant_type: "authorization_code",
          redirect_uri: "https://claude.ai/api/mcp/auth_callback",
          resource: "https://mcp.example.com/mcp"
        }).toString()
      },
      createOauthEnv()
    );
    const initialTokens = await initialTokenResponse.json() as { refresh_token: string };
    const rotatedTokenResponse = await app.request(
      "http://localhost/token",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: registration.client_id,
          grant_type: "refresh_token",
          refresh_token: initialTokens.refresh_token,
          resource: "https://mcp.example.com/mcp"
        }).toString()
      },
      createOauthEnv()
    );
    const rotatedTokens = await rotatedTokenResponse.json() as { refresh_token: string };
    const replayedOldTokenResponse = await app.request(
      "http://localhost/token",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: registration.client_id,
          grant_type: "refresh_token",
          refresh_token: initialTokens.refresh_token,
          resource: "https://mcp.example.com/mcp"
        }).toString()
      },
      createOauthEnv()
    );
    const familyRevokedResponse = await app.request(
      "http://localhost/token",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: registration.client_id,
          grant_type: "refresh_token",
          refresh_token: rotatedTokens.refresh_token,
          resource: "https://mcp.example.com/mcp"
        }).toString()
      },
      createOauthEnv()
    );

    expect(rotatedTokenResponse.status).toBe(200);
    expect(rotatedTokens.refresh_token).not.toBe(initialTokens.refresh_token);
    expect(replayedOldTokenResponse.status).toBe(400);
    await expect(replayedOldTokenResponse.json()).resolves.toMatchObject({
      error: "invalid_grant",
      error_description: "Refresh token replay detected; token family revoked."
    });
    expect(familyRevokedResponse.status).toBe(400);
    await expect(familyRevokedResponse.json()).resolves.toMatchObject({
      error: "invalid_grant",
      error_description: "Refresh token replay detected; token family revoked."
    });
  });

  it("rejects refresh_token exchanges with the wrong resource", async () => {
    // DEFECT: the token adapter can rotate a refresh token into a bearer token for a different protected resource.
    const app = createApp({
      createId: (() => {
        const values = [
          "client-1",
          "auth-code-1",
          "jti-1",
          "refresh-token-1"
        ];

        return () => values.shift() ?? crypto.randomUUID();
      })(),
      oauthStore: createInMemoryOAuthStore()
    });
    const registration = await registerClient(app);
    const code = await issueAuthorizationCode(app, registration.client_id);
    const initialTokenResponse = await app.request(
      "http://localhost/token",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: registration.client_id,
          code,
          code_verifier: "test-code-verifier",
          grant_type: "authorization_code",
          redirect_uri: "https://claude.ai/api/mcp/auth_callback",
          resource: "https://mcp.example.com/mcp"
        }).toString()
      },
      createOauthEnv()
    );
    const tokenPayload = await initialTokenResponse.json() as { refresh_token: string };
    const response = await app.request(
      "http://localhost/token",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: registration.client_id,
          grant_type: "refresh_token",
          refresh_token: tokenPayload.refresh_token,
          resource: "https://other.example.com/mcp"
        }).toString()
      },
      createOauthEnv()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_grant",
      error_description: "resource must match the canonical protected resource."
    });
  });
});
