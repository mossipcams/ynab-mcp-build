import { describe, expect, it, vi } from "vitest";

import { createAccessOidcClient, resolveAccessOidcEndpoints } from "./access-oidc.js";

function base64urlJson(value: unknown) {
  return btoa(JSON.stringify(value)).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

function unsignedIdToken(kid: string) {
  return [
    base64urlJson({ alg: "RS256", kid }),
    base64urlJson({
      aud: "client-1",
      exp: Math.floor(Date.now() / 1000) + 300,
      sub: "user-1"
    }),
    "signature"
  ].join(".");
}

describe("Access OIDC HTTP caching", () => {
  it("caches discovery endpoints for the same discovery URL", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () =>
      Response.json({
        authorization_endpoint: "https://access.example.com/authorize",
        jwks_uri: "https://access.example.com/certs",
        token_endpoint: "https://access.example.com/token"
      })
    );
    const config = {
      clientId: "client-1",
      clientSecret: "secret",
      discoveryUrl: "https://team.example.com/.well-known/openid-configuration"
    };

    await expect(resolveAccessOidcEndpoints({ config, fetch })).resolves.toMatchObject({
      authorizationUrl: "https://access.example.com/authorize",
      jwksUrl: "https://access.example.com/certs",
      tokenUrl: "https://access.example.com/token"
    });
    await resolveAccessOidcEndpoints({ config, fetch });

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("caches JWKS responses for the same JWKS URL", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input) => {
      const url = String(input);

      if (url === "https://access.example.com/token") {
        return Response.json({
          id_token: unsignedIdToken("missing-key")
        });
      }

      if (url === "https://access.example.com/certs") {
        return Response.json({
          keys: []
        });
      }

      return new Response(null, { status: 404 });
    });
    const client = createAccessOidcClient({
      clientId: "client-1",
      clientSecret: "secret",
      fetch,
      jwksUrl: "https://access.example.com/certs",
      redirectUri: "https://mcp.example.com/oidc/callback",
      tokenUrl: "https://access.example.com/token"
    });

    await expect(client.authenticate("code-1")).rejects.toThrow("No matching key");
    await expect(client.authenticate("code-2")).rejects.toThrow("No matching key");

    expect(fetch.mock.calls.filter(([input]) => String(input) === "https://access.example.com/certs")).toHaveLength(1);
  });
});
