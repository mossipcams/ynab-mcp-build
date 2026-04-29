import { describe, expect, it } from "vitest";

import { verifyOidcIdToken } from "./oidc.js";

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

async function createOidcToken(options: {
  alg?: string;
  kid?: string;
  payload: Record<string, unknown>;
}) {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256"
    },
    true,
    ["sign", "verify"]
  );
  const publicJwk = {
    ...await crypto.subtle.exportKey("jwk", keyPair.publicKey),
    alg: "RS256",
    kid: options.kid ?? "key-1",
    use: "sig"
  };
  const headerSegment = toBase64Url(JSON.stringify({
    ...(options.alg ? { alg: options.alg } : {}),
    kid: options.kid ?? "key-1"
  }));
  const payloadSegment = toBase64Url(JSON.stringify(options.payload));
  const signedData = new TextEncoder().encode(`${headerSegment}.${payloadSegment}`);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keyPair.privateKey, signedData);

  return {
    jwks: {
      keys: [publicJwk]
    },
    token: `${headerSegment}.${payloadSegment}.${toBase64Url(new Uint8Array(signature))}`
  };
}

describe("OIDC ID token verifier", () => {
  it("verifies a signed RS256 ID token and returns identity claims", async () => {
    const { jwks, token } = await createOidcToken({
      alg: "RS256",
      payload: {
        aud: ["other-client", "client-1"],
        email: "user@example.com",
        exp: 1_700_000_300,
        sub: "user-1"
      }
    });

    await expect(
      verifyOidcIdToken({
        expectedAudience: "client-1",
        jwks,
        now: () => 1_700_000_000_000,
        token
      })
    ).resolves.toEqual({
      email: "user@example.com",
      sub: "user-1"
    });
  });

  it("rejects malformed claims and unsupported token headers", async () => {
    const missingAlg = await createOidcToken({
      payload: {
        aud: "client-1",
        exp: 1_700_000_300,
        sub: "user-1"
      }
    });
    const expired = await createOidcToken({
      alg: "RS256",
      payload: {
        aud: "client-1",
        exp: 1_700_000_000,
        sub: "user-1"
      }
    });
    const wrongAudience = await createOidcToken({
      alg: "RS256",
      payload: {
        aud: "other-client",
        exp: 1_700_000_300,
        sub: "user-1"
      }
    });

    await expect(
      verifyOidcIdToken({
        expectedAudience: "client-1",
        jwks: missingAlg.jwks,
        token: missingAlg.token
      })
    ).rejects.toThrow("Access OIDC ID token is missing an algorithm.");
    await expect(
      verifyOidcIdToken({
        expectedAudience: "client-1",
        jwks: expired.jwks,
        now: () => 1_700_000_001_000,
        token: expired.token
      })
    ).rejects.toThrow("Access OIDC ID token has expired.");
    await expect(
      verifyOidcIdToken({
        expectedAudience: "client-1",
        jwks: wrongAudience.jwks,
        now: () => 1_700_000_000_000,
        token: wrongAudience.token
      })
    ).rejects.toThrow("Access OIDC ID token audience does not match.");
  });

  it("rejects ID tokens without the expected issuer", async () => {
    const missingIssuer = await createOidcToken({
      alg: "RS256",
      payload: {
        aud: "client-1",
        exp: 1_700_000_300,
        sub: "user-1"
      }
    });
    const wrongIssuer = await createOidcToken({
      alg: "RS256",
      payload: {
        aud: "client-1",
        exp: 1_700_000_300,
        iss: "https://other-team.example.com",
        sub: "user-1"
      }
    });

    await expect(
      verifyOidcIdToken({
        expectedAudience: "client-1",
        expectedIssuer: "https://access-team.example.com",
        jwks: missingIssuer.jwks,
        now: () => 1_700_000_000_000,
        token: missingIssuer.token
      })
    ).rejects.toThrow("Access OIDC ID token issuer does not match.");
    await expect(
      verifyOidcIdToken({
        expectedAudience: "client-1",
        expectedIssuer: "https://access-team.example.com",
        jwks: wrongIssuer.jwks,
        now: () => 1_700_000_000_000,
        token: wrongIssuer.token
      })
    ).rejects.toThrow("Access OIDC ID token issuer does not match.");
  });
});
