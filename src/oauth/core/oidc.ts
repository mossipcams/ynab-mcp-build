import { z } from "zod";

type OidcJwtHeader = {
  alg?: string;
  kid?: string;
};

type OidcJwtPayload = {
  aud?: string | string[];
  email?: string;
  exp?: number;
  sub?: string;
};

type OidcJwks = {
  keys?: (JsonWebKey & { kid?: string })[];
};

const OidcJwtHeaderSchema = z.object({
  alg: z.string().optional(),
  kid: z.string().optional()
}).passthrough();

const OidcJwtPayloadSchema = z.object({
  aud: z.union([z.string(), z.array(z.string())]).optional(),
  email: z.string().optional(),
  exp: z.number().optional(),
  sub: z.string().optional()
}).passthrough();

function base64urlDecode(input: string): Uint8Array {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    input.length + (4 - (input.length % 4)) % 4,
    "="
  );
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function parseJsonFromBase64url<T>(input: string, schema: z.ZodType<unknown>): Promise<T> {
  const rawPayload: unknown = await new Response(new TextDecoder().decode(base64urlDecode(input))).json();

  return schema.parse(rawPayload) as T;
}

async function importRsaKey(jwk: JsonWebKey) {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" },
    false,
    ["verify"]
  );
}

async function verifySignature(options: {
  alg: string;
  jwk: JsonWebKey;
  signature: Uint8Array;
  signedData: Uint8Array;
}) {
  if (options.alg !== "RS256") {
    throw new Error(`Unsupported OIDC JWT algorithm: ${options.alg}`);
  }

  return crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    await importRsaKey(options.jwk),
    options.signature as Uint8Array<ArrayBuffer>,
    options.signedData as Uint8Array<ArrayBuffer>
  );
}

function validateAudience(audience: string | string[] | undefined, expectedAudience: string) {
  const audiences = Array.isArray(audience)
    ? audience
    : typeof audience === "string"
      ? [audience]
      : [];

  if (!audiences.includes(expectedAudience)) {
    throw new Error("Access OIDC ID token audience does not match.");
  }
}

export async function verifyOidcIdToken(input: {
  expectedAudience: string;
  jwks: OidcJwks;
  now?: () => number;
  token: string;
}) {
  const parts = input.token.split(".");

  if (parts.length !== 3) {
    throw new Error("Access OIDC ID token is invalid.");
  }

  const [headerSegment, payloadSegment, signatureSegment] = parts as [string, string, string];
  const header = await parseJsonFromBase64url<OidcJwtHeader>(headerSegment, OidcJwtHeaderSchema);
  const payload = await parseJsonFromBase64url<OidcJwtPayload>(payloadSegment, OidcJwtPayloadSchema);

  if (!header.alg) {
    throw new Error("Access OIDC ID token is missing an algorithm.");
  }

  const matchingKey = input.jwks.keys?.find((key) => !header.kid || key.kid === header.kid);

  if (!matchingKey) {
    throw new Error("No matching key found in Access OIDC JWKS.");
  }

  const valid = await verifySignature({
    alg: header.alg,
    jwk: matchingKey,
    signature: base64urlDecode(signatureSegment),
    signedData: new TextEncoder().encode(`${headerSegment}.${payloadSegment}`)
  });

  if (!valid) {
    throw new Error("Access OIDC ID token signature is invalid.");
  }

  const nowSec = Math.floor((input.now?.() ?? Date.now()) / 1000);

  if (typeof payload.exp !== "number" || payload.exp <= nowSec) {
    throw new Error("Access OIDC ID token has expired.");
  }

  if (!payload.sub) {
    throw new Error("Access OIDC ID token is missing a subject.");
  }

  validateAudience(payload.aud, input.expectedAudience);

  return {
    email: payload.email,
    sub: payload.sub
  };
}
