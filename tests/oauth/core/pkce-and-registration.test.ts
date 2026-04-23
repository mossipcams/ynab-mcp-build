import { describe, expect, it } from "vitest";

import { createOAuthCore } from "../../../src/oauth/core/auth.js";
import { createInMemoryOAuthStore } from "../../../src/oauth/core/store.js";

function createCore() {
  return createOAuthCore({
    createId: (() => {
      const values = [
        "client-1",
        "auth-code-1",
        "refresh-token-1",
        "jti-1"
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

describe("oauth core pkce and client registration", () => {
  it("rejects authorization code exchange when the PKCE verifier does not match the stored challenge", async () => {
    // DEFECT: an attacker can redeem an intercepted authorization code without proving possession of the original PKCE verifier.
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
        codeVerifier: "wrong-code-verifier",
        redirectUri: "https://claude.ai/api/mcp/auth_callback",
        resource: "https://mcp.example.com/mcp"
      })
    ).rejects.toThrow("PKCE code_verifier is invalid.");
  });

  it("rejects requested scopes that are not part of the client's registered scopes", async () => {
    // DEFECT: a public client can escalate its permissions by requesting scopes that were never granted at registration time.
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
        resource: "https://mcp.example.com/mcp",
        responseType: "code",
        scope: "mcp admin"
      })
    ).rejects.toThrow("Requested scope is not supported: admin");
  });

  it("allows loopback http redirect URIs for local development clients", async () => {
    // DEFECT: standards-compliant loopback redirect URIs can be rejected and block local MCP client development.
    const core = createCore();

    await expect(
      core.registerClient({
        clientName: "Local Claude",
        grantTypes: ["authorization_code", "refresh_token"],
        redirectUris: ["http://localhost:8788/callback"],
        responseTypes: ["code"],
        tokenEndpointAuthMethod: "none"
      })
    ).resolves.toMatchObject({
      redirect_uris: ["http://localhost:8788/callback"]
    });
  });

  it("rejects loopback redirect URIs that use non-http schemes", async () => {
    // DEFECT: loopback exceptions can accidentally permit arbitrary redirect URI schemes and weaken client registration constraints.
    const core = createCore();

    await expect(
      core.registerClient({
        clientName: "Local Claude",
        grantTypes: ["authorization_code", "refresh_token"],
        redirectUris: ["ftp://localhost/callback"],
        responseTypes: ["code"],
        tokenEndpointAuthMethod: "none"
      })
    ).rejects.toThrow("redirect_uris must use https unless they target a loopback host over http.");
  });
});
