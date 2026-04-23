import { describe, expect, it } from "vitest";

import { createOAuthCore } from "./auth.js";
import { createInMemoryOAuthStore } from "./store.js";

describe("oauth core", () => {
  it("registers clients and completes a PKCE authorization-code exchange", async () => {
    const core = createOAuthCore({
      createId: (() => {
        const values = [
          "client-1",
          "auth-code-1",
          "access-token-1",
          "refresh-token-1"
        ];

        return () => values.shift() ?? crypto.randomUUID();
      })(),
      issuer: "https://mcp.example.com/",
      now: () => Date.UTC(2026, 3, 22, 12, 0, 0),
      protectedResource: "https://mcp.example.com/mcp",
      scopesSupported: ["mcp"],
      store: createInMemoryOAuthStore()
    });
    const codeChallenge = "0FLIKahrX7kqxncwhV5WD82lu_wi5GA8FsRSLubaOpU";

    const registration = await core.registerClient({
      clientName: "Claude",
      grantTypes: ["authorization_code", "refresh_token"],
      redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
      responseTypes: ["code"],
      tokenEndpointAuthMethod: "none"
    });
    const authorization = await core.startAuthorization({
      clientId: registration.client_id,
      codeChallenge,
      codeChallengeMethod: "S256",
      redirectUri: "https://claude.ai/api/mcp/auth_callback",
      responseType: "code",
      state: "client-state-1"
    });

    expect(authorization.redirectTo).toBe(
      "https://claude.ai/api/mcp/auth_callback?code=auth-code-1&state=client-state-1"
    );

    const tokens = await core.exchangeAuthorizationCode({
      clientId: registration.client_id,
      code: "auth-code-1",
      codeVerifier: "test-code-verifier",
      redirectUri: "https://claude.ai/api/mcp/auth_callback"
    });

    expect(tokens).toMatchObject({
      access_token: "access-token-1",
      expires_in: 86400,
      refresh_token: "refresh-token-1",
      scope: "mcp",
      token_type: "Bearer"
    });

    await expect(core.verifyAccessToken("access-token-1")).resolves.toMatchObject({
      clientId: registration.client_id,
      scopes: ["mcp"]
    });
  });

  it("rejects reused authorization codes and rotates refresh tokens", async () => {
    const core = createOAuthCore({
      createId: (() => {
        const values = [
          "client-1",
          "auth-code-1",
          "access-token-1",
          "refresh-token-1",
          "access-token-2",
          "refresh-token-2"
        ];

        return () => values.shift() ?? crypto.randomUUID();
      })(),
      issuer: "https://mcp.example.com/",
      now: () => Date.UTC(2026, 3, 22, 12, 0, 0),
      protectedResource: "https://mcp.example.com/mcp",
      scopesSupported: ["mcp"],
      store: createInMemoryOAuthStore()
    });
    const codeChallenge = "0FLIKahrX7kqxncwhV5WD82lu_wi5GA8FsRSLubaOpU";

    const registration = await core.registerClient({
      clientName: "Claude",
      grantTypes: ["authorization_code", "refresh_token"],
      redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
      responseTypes: ["code"],
      tokenEndpointAuthMethod: "none"
    });

    await core.startAuthorization({
      clientId: registration.client_id,
      codeChallenge,
      codeChallengeMethod: "S256",
      redirectUri: "https://claude.ai/api/mcp/auth_callback",
      responseType: "code"
    });

    const initialTokens = await core.exchangeAuthorizationCode({
      clientId: registration.client_id,
      code: "auth-code-1",
      codeVerifier: "test-code-verifier",
      redirectUri: "https://claude.ai/api/mcp/auth_callback"
    });

    await expect(
      core.exchangeAuthorizationCode({
        clientId: registration.client_id,
        code: "auth-code-1",
        codeVerifier: "test-code-verifier",
        redirectUri: "https://claude.ai/api/mcp/auth_callback"
      })
    ).rejects.toThrow("Authorization code is invalid or has already been used.");

    const refreshedTokens = await core.refreshAccessToken({
      clientId: registration.client_id,
      refreshToken: initialTokens.refresh_token
    });

    expect(refreshedTokens).toMatchObject({
      access_token: "access-token-2",
      refresh_token: "refresh-token-2"
    });

    await expect(
      core.refreshAccessToken({
        clientId: registration.client_id,
        refreshToken: initialTokens.refresh_token
      })
    ).rejects.toThrow("Refresh token is invalid or has already been used.");
  });
});
