import { z } from "zod";

function toBase64Url(input: string | Uint8Array) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

function fromBase64Url(input: string) {
  const padded = input
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(input.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function importSigningKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign", "verify"]
  );
}

export type JwtPayload = {
  aud: string;
  exp: number;
  iat: number;
  iss: string;
  jti: string;
  scope: string;
  sub: string;
};

const JwtHeaderSchema = z.object({
  alg: z.string().optional()
}).passthrough();

const JwtPayloadSchema = z.object({
  aud: z.string(),
  exp: z.number(),
  iat: z.number(),
  iss: z.string(),
  jti: z.string(),
  scope: z.string(),
  sub: z.string()
});

async function parseBase64UrlJson<T>(input: string, schema: z.ZodType<T>) {
  const rawPayload: unknown = await new Response(new TextDecoder().decode(fromBase64Url(input))).json();

  return schema.parse(rawPayload);
}

export async function signJwt(payload: JwtPayload, secret: string) {
  const headerSegment = toBase64Url(JSON.stringify({
    alg: "HS256",
    typ: "JWT"
  }));
  const payloadSegment = toBase64Url(JSON.stringify(payload));
  const signingInput = `${headerSegment}.${payloadSegment}`;
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importSigningKey(secret),
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyJwt(token: string, secret: string) {
  const [headerSegment, payloadSegment, signatureSegment] = token.split(".");

  if (!headerSegment || !payloadSegment || !signatureSegment) {
    throw new Error("Bearer token is invalid or expired.");
  }

  const header = await parseBase64UrlJson(headerSegment, JwtHeaderSchema);

  if (header.alg !== "HS256") {
    throw new Error("Bearer token is invalid or expired.");
  }

  const verified = await crypto.subtle.verify(
    "HMAC",
    await importSigningKey(secret),
    fromBase64Url(signatureSegment),
    new TextEncoder().encode(`${headerSegment}.${payloadSegment}`)
  );

  if (!verified) {
    throw new Error("Bearer token is invalid or expired.");
  }

  return parseBase64UrlJson(payloadSegment, JwtPayloadSchema);
}
