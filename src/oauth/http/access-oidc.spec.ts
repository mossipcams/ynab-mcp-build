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

function requestUrl(input: RequestInfo | URL) {
  if (input instanceof Request) {
    return input.url;
  }

  if (input instanceof URL) {
    return input.href;
  }

  return input;
}

function toBase64Url(input: string | Uint8Array) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/u, "");
}

async function createSignedIdToken(payload: Record<string, unknown>) {
  const keyPair = await crypto.subtle.generateKey(
    {
      hash: "SHA-256",
      modulusLength: 2048,
      name: "RSASSA-PKCS1-v1_5",
      publicExponent: new Uint8Array([1, 0, 1])
    },
    true,
    ["sign", "verify"]
  );
  const kid = "access-key-1";
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const header = {
    alg: "RS256",
    kid
  };
  const signingInput = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(payload))}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    new TextEncoder().encode(signingInput)
  );

  return {
    jwks: {
      keys: [
        {
          ...publicJwk,
          alg: "RS256",
          kid,
          use: "sig"
        }
      ]
    },
    token: `${signingInput}.${toBase64Url(new Uint8Array(signature))}`
  };
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
      const url = requestUrl(input);

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

    expect(fetch.mock.calls.filter(([input]) => requestUrl(input) === "https://access.example.com/certs")).toHaveLength(1);
  });

  it("passes the expected issuer into Access ID token validation", async () => {
    const { jwks, token } = await createSignedIdToken({
      aud: "client-1",
      exp: Math.floor(Date.now() / 1000) + 300,
      iss: "https://other-team.example.com",
      sub: "user-1"
    });
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input) => {
      const url = requestUrl(input);

      if (url === "https://access.example.com/token") {
        return Response.json({
          id_token: token
        });
      }

      if (url === "https://access.example.com/issuer-certs") {
        return Response.json(jwks);
      }

      return new Response(null, { status: 404 });
    });
    const client = createAccessOidcClient({
      clientId: "client-1",
      clientSecret: "secret",
      expectedIssuer: "https://access-team.example.com",
      fetch,
      jwksUrl: "https://access.example.com/issuer-certs",
      redirectUri: "https://mcp.example.com/oidc/callback",
      tokenUrl: "https://access.example.com/token"
    });

    await expect(client.authenticate("code-1")).rejects.toThrow(
      "Access OIDC ID token issuer does not match."
    );
  });
});
