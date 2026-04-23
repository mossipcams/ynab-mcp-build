import { describe, expect, it } from "vitest";

import { createOAuthCore } from "../../../src/oauth/core/auth.js";
import { createInMemoryOAuthStore } from "../../../src/oauth/core/store.js";

describe("oauth core refresh token rotation", () => {
  it("revokes the whole refresh token family after replay of an old token", async () => {
    // DEFECT: replaying an old refresh token can leave its descendants usable and allow session fixation after theft.
    const core = createOAuthCore({
      createId: (() => {
        const values = [
          "client-1",
          "auth-code-1",
          "jti-1",
          "refresh-token-1",
          "jti-2",
          "refresh-token-2"
        ];

        return () => values.shift() ?? crypto.randomUUID();
      })(),
      issuer: "https://mcp.example.com/",
      jwtSigningKey: "test-signing-key",
      now: () => Date.UTC(2026, 3, 22, 12, 0, 0),
      protectedResource: "https://mcp.example.com/mcp",
      scopesSupported: ["mcp"],
      store: createInMemoryOAuthStore()
    });

    const registration = await core.registerClient({
      clientName: "Claude",
      grantTypes: ["authorization_code", "refresh_token"],
      redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
      responseTypes: ["code"],
      tokenEndpointAuthMethod: "none"
    });

    await core.startAuthorization({
      clientId: registration.client_id,
      codeChallenge: "0FLIKahrX7kqxncwhV5WD82lu_wi5GA8FsRSLubaOpU",
      codeChallengeMethod: "S256",
      redirectUri: "https://claude.ai/api/mcp/auth_callback",
      resource: "https://mcp.example.com/mcp",
      responseType: "code"
    });

    const initialTokens = await core.exchangeAuthorizationCode({
      clientId: registration.client_id,
      code: "auth-code-1",
      codeVerifier: "test-code-verifier",
      redirectUri: "https://claude.ai/api/mcp/auth_callback",
      resource: "https://mcp.example.com/mcp"
    });

    const rotatedTokens = await core.refreshAccessToken({
      clientId: registration.client_id,
      refreshToken: initialTokens.refresh_token,
      resource: "https://mcp.example.com/mcp"
    });

    expect(rotatedTokens.refresh_token).not.toBe(initialTokens.refresh_token);

    await expect(
      core.refreshAccessToken({
        clientId: registration.client_id,
        refreshToken: initialTokens.refresh_token,
        resource: "https://mcp.example.com/mcp"
      })
    ).rejects.toThrow("Refresh token replay detected; token family revoked.");

    await expect(
      core.refreshAccessToken({
        clientId: registration.client_id,
        refreshToken: rotatedTokens.refresh_token,
        resource: "https://mcp.example.com/mcp"
      })
    ).rejects.toThrow("Refresh token replay detected; token family revoked.");
  });
});
