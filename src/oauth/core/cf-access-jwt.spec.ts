import { afterEach, describe, expect, it, vi } from "vitest";

import { isCfAccessJwt, verifyCfAccessJwt } from "./cf-access-jwt.js";

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

async function createSignedAccessJwt(payload: Record<string, unknown>) {
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
    kid: "key-1",
    use: "sig"
  };
  const headerSegment = toBase64Url(JSON.stringify({
    alg: "RS256",
    kid: "key-1"
  }));
  const payloadSegment = toBase64Url(JSON.stringify(payload));
  const signedData = new TextEncoder().encode(`${headerSegment}.${payloadSegment}`);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keyPair.privateKey, signedData);

  return {
    jwks: {
      keys: [publicJwk]
    },
    token: `${headerSegment}.${payloadSegment}.${toBase64Url(new Uint8Array(signature))}`
  };
}

describe("Cloudflare Access JWT verifier", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects JWT-shaped bearer tokens", () => {
    expect(isCfAccessJwt("header.payload.signature")).toBe(true);
    expect(isCfAccessJwt("opaque-token")).toBe(false);
  });

  it("verifies a signed Access JWT with issuer and audience checks", async () => {
    const { jwks, token } = await createSignedAccessJwt({
      aud: ["aud-1", "aud-2"],
      email: "user@example.com",
      exp: 1_700_000_300,
      iss: "https://team.example.com",
      sub: "user-1"
    });
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(jwks));
    vi.stubGlobal("fetch", fetch);

    await expect(
      verifyCfAccessJwt(token, "https://team.example.com/", {
        audience: "aud-2",
        now: () => 1_700_000_000_000
      })
    ).resolves.toEqual({
      email: "user@example.com",
      sub: "user-1"
    });
    expect(fetch).toHaveBeenCalledWith("https://team.example.com/cdn-cgi/access/certs");
  });

  it("rejects expired, wrong issuer, and wrong audience Access JWTs before trusting them", async () => {
    const { token } = await createSignedAccessJwt({
      aud: "aud-1",
      exp: 1_700_000_000,
      iss: "https://team.example.com",
      sub: "user-1"
    });

    await expect(
      verifyCfAccessJwt(token, "https://team.example.com", {
        audience: "aud-1",
        now: () => 1_700_000_001_000
      })
    ).rejects.toThrow("CF Access token has expired.");
    await expect(
      verifyCfAccessJwt(token, "https://other-team.example.com", {
        now: () => 1_699_999_999_000
      })
    ).rejects.toThrow("CF Access token issuer mismatch");
    await expect(
      verifyCfAccessJwt(token, "https://team.example.com", {
        audience: "other-aud",
        now: () => 1_699_999_999_000
      })
    ).rejects.toThrow("CF Access token audience does not match.");
  });
});
