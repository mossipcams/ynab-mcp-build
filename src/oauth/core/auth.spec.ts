import { describe, expect, it } from "vitest";

import { createOAuthCore } from "./auth.js";
import { createCodeChallenge } from "./pkce.js";
import { createInMemoryOAuthStore } from "./store.js";

const protectedResource = "https://mcp.example.com/mcp";

function createCore(
  options: {
    ids?: string[];
    now?: number;
    store?: ReturnType<typeof createInMemoryOAuthStore>;
  } = {},
) {
  const ids = [
    ...(options.ids ?? [
      "client-1",
      "code-1",
      "access-jti-1",
      "refresh-family-1",
      "refresh-token-1",
      "access-jti-2",
      "refresh-token-2",
    ]),
  ];

  return createOAuthCore({
    createId: () => ids.shift() ?? "fallback-id",
    issuer: "https://mcp.example.com/oauth",
    jwtSigningKey: "test-signing-key",
    now: () => options.now ?? 1_700_000_000_000,
    protectedResource,
    scopesSupported: ["mcp", "offline_access"],
    store: options.store ?? createInMemoryOAuthStore(),
  });
}

async function registerClient(core = createCore()) {
  return core.registerClient({
    clientName: "Local MCP client",
    grantTypes: ["authorization_code", "refresh_token"],
    redirectUris: ["http://localhost:3000/callback"],
    responseTypes: ["code"],
    tokenEndpointAuthMethod: "none",
  });
}

describe("OAuth core", () => {
  it("registers public clients with validated redirect and metadata fields", async () => {
    const core = createCore();

    await expect(registerClient(core)).resolves.toEqual({
      client_id: "client-1",
      client_id_issued_at: 1_700_000_000,
      client_name: "Local MCP client",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: ["http://localhost:3000/callback"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
  });

  it("rejects insecure non-loopback redirect URIs during client registration", async () => {
    const core = createCore();

    await expect(
      core.registerClient({
        grantTypes: ["authorization_code"],
        redirectUris: ["http://example.com/callback"],
        responseTypes: ["code"],
        tokenEndpointAuthMethod: "none",
      }),
    ).rejects.toThrow(
      "redirect_uris must use https unless they target a loopback host over http.",
    );
  });

  it("issues authorization codes with requested scopes and preserves redirect state", async () => {
    const codeVerifier = "verifier-1";
    const codeChallenge = await createCodeChallenge(codeVerifier);
    const core = createCore();
    const client = await registerClient(core);

    await expect(
      core.startAuthorization({
        clientId: client.client_id,
        codeChallenge,
        codeChallengeMethod: "S256",
        redirectUri: client.redirect_uris[0]!,
        resource: protectedResource,
        responseType: "code",
        scope: "mcp",
        state: "state-1",
      }),
    ).resolves.toEqual({
      code: "code-1",
      redirectTo: "http://localhost:3000/callback?code=code-1&state=state-1",
    });
  });

  it("exchanges authorization codes once and verifies the issued access token", async () => {
    const store = createInMemoryOAuthStore();
    const codeVerifier = "verifier-1";
    const codeChallenge = await createCodeChallenge(codeVerifier);
    const core = createCore({ store });
    const client = await registerClient(core);
    const authorization = await core.startAuthorization({
      clientId: client.client_id,
      codeChallenge,
      codeChallengeMethod: "S256",
      redirectUri: client.redirect_uris[0]!,
      resource: protectedResource,
      responseType: "code",
      scope: "mcp offline_access",
    });

    const token = await core.exchangeAuthorizationCode({
      clientId: client.client_id,
      code: authorization.code,
      codeVerifier,
      redirectUri: client.redirect_uris[0]!,
      resource: protectedResource,
    });

    expect(token).toMatchObject({
      expires_in: 86_400,
      scope: "mcp offline_access",
      token_type: "Bearer",
    });
    expect(token.access_token).toEqual(expect.any(String));
    expect(token.refresh_token).toBe("refresh-token-1");
    await expect(core.verifyAccessToken(token.access_token)).resolves.toEqual({
      clientId: client.client_id,
      scopes: ["mcp", "offline_access"],
      token: token.access_token,
    });
    await expect(
      core.exchangeAuthorizationCode({
        clientId: client.client_id,
        code: authorization.code,
        codeVerifier,
        redirectUri: client.redirect_uris[0]!,
        resource: protectedResource,
      }),
    ).rejects.toThrow(
      "Authorization code is invalid or has already been used.",
    );
  });

  it("rotates refresh tokens and rejects replayed token families", async () => {
    const store = createInMemoryOAuthStore();
    const codeVerifier = "verifier-1";
    const codeChallenge = await createCodeChallenge(codeVerifier);
    const core = createCore({ store });
    const client = await registerClient(core);
    const authorization = await core.startAuthorization({
      clientId: client.client_id,
      codeChallenge,
      codeChallengeMethod: "S256",
      redirectUri: client.redirect_uris[0]!,
      resource: protectedResource,
      responseType: "code",
    });
    const initial = await core.exchangeAuthorizationCode({
      clientId: client.client_id,
      code: authorization.code,
      codeVerifier,
      redirectUri: client.redirect_uris[0]!,
      resource: protectedResource,
    });

    const refreshed = await core.refreshAccessToken({
      clientId: client.client_id,
      refreshToken: initial.refresh_token,
      resource: protectedResource,
    });

    expect(refreshed).toMatchObject({
      refresh_token: "refresh-token-2",
      scope: "mcp offline_access",
      token_type: "Bearer",
    });
    await expect(
      core.refreshAccessToken({
        clientId: client.client_id,
        refreshToken: initial.refresh_token,
        resource: protectedResource,
      }),
    ).rejects.toThrow("Refresh token replay detected; token family revoked.");
    await expect(
      core.refreshAccessToken({
        clientId: client.client_id,
        refreshToken: refreshed.refresh_token,
        resource: protectedResource,
      }),
    ).rejects.toThrow("Refresh token replay detected; token family revoked.");
  });

  it("publishes OAuth metadata from the configured issuer and resource", () => {
    const core = createCore();

    expect(core.getAuthorizationServerMetadata()).toMatchObject({
      authorization_endpoint: "https://mcp.example.com/authorize",
      code_challenge_methods_supported: ["S256"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      issuer: "https://mcp.example.com/",
      registration_endpoint: "https://mcp.example.com/register",
      response_types_supported: ["code"],
      scopes_supported: ["mcp", "offline_access"],
      token_endpoint: "https://mcp.example.com/token",
      token_endpoint_auth_methods_supported: ["none"],
    });
    expect(core.getOpenIdConfiguration()).toMatchObject({
      issuer: "https://mcp.example.com/",
      subject_types_supported: ["public"],
    });
    expect(core.getProtectedResourceMetadata()).toEqual({
      authorization_servers: ["https://mcp.example.com/"],
      bearer_methods_supported: ["header"],
      resource: protectedResource,
    });
  });
});
