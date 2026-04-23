import { describe, expect, it } from "vitest";

import { createOAuthCore } from "../../../src/oauth/core/auth.js";
import { createInMemoryOAuthStore } from "../../../src/oauth/core/store.js";

function decodeJwtPayload(token: string) {
  const [, payload = ""] = token.split(".");

  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
}

function createCore() {
  return createOAuthCore({
    createId: (() => {
      const values = [
        "client-1",
        "auth-code-1",
        "refresh-token-1",
        "refresh-token-2",
        "jti-1",
        "jti-2"
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
}

describe("oauth core resource indicators and jwt access tokens", () => {
  it("rejects authorization requests without a resource parameter", async () => {
    // DEFECT: the authorization flow can mint codes without binding them to a specific protected resource.
    const core = createCore();
    const registration = await core.registerClient({
      clientName: "Claude",
      grantTypes: ["authorization_code", "refresh_token"],
      redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
      responseTypes: ["code"],
      tokenEndpointAuthMethod: "none"
    });

    await expect(
      core.startAuthorization({
        clientId: registration.client_id,
        codeChallenge: "0FLIKahrX7kqxncwhV5WD82lu_wi5GA8FsRSLubaOpU",
        codeChallengeMethod: "S256",
        redirectUri: "https://claude.ai/api/mcp/auth_callback",
        responseType: "code"
      })
    ).rejects.toThrow("resource is required.");
  });

  it("rejects authorization requests for a non-canonical resource", async () => {
    // DEFECT: a client can bind an authorization code to the wrong audience and create token-confusion risk.
    const core = createCore();
    const registration = await core.registerClient({
      clientName: "Claude",
      grantTypes: ["authorization_code", "refresh_token"],
      redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
      responseTypes: ["code"],
      tokenEndpointAuthMethod: "none"
    });

    await expect(
      core.startAuthorization({
        clientId: registration.client_id,
        codeChallenge: "0FLIKahrX7kqxncwhV5WD82lu_wi5GA8FsRSLubaOpU",
        codeChallengeMethod: "S256",
        redirectUri: "https://claude.ai/api/mcp/auth_callback",
        resource: "https://other.example.com/mcp",
        responseType: "code"
      })
    ).rejects.toThrow("resource must match the canonical protected resource.");
  });

  it("rejects token exchange requests without a resource parameter", async () => {
    // DEFECT: the token endpoint can issue bearer tokens whose audience was never explicitly confirmed by the client.
    const core = createCore();
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

    await expect(
      core.exchangeAuthorizationCode({
        clientId: registration.client_id,
        code: "auth-code-1",
        codeVerifier: "test-code-verifier",
        redirectUri: "https://claude.ai/api/mcp/auth_callback"
      })
    ).rejects.toThrow("resource is required.");
  });

  it("issues jwt access tokens with the expected claims", async () => {
    // DEFECT: bearer tokens can be opaque or malformed and fail audience, issuer, expiry, or replay tracking checks downstream.
    const core = createCore();
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

    const tokens = await core.exchangeAuthorizationCode({
      clientId: registration.client_id,
      code: "auth-code-1",
      codeVerifier: "test-code-verifier",
      redirectUri: "https://claude.ai/api/mcp/auth_callback",
      resource: "https://mcp.example.com/mcp"
    });
    const payload = decodeJwtPayload(tokens.access_token);

    expect(tokens.access_token.split(".")).toHaveLength(3);
    expect(payload).toMatchObject({
      aud: "https://mcp.example.com/mcp",
      iss: "https://mcp.example.com/",
      scope: "mcp",
      sub: registration.client_id
    });
    expect(typeof payload.exp).toBe("number");
    expect(typeof payload.iat).toBe("number");
    expect(typeof payload.jti).toBe("string");
    expect((payload.exp as number) > (payload.iat as number)).toBe(true);
  });
});
