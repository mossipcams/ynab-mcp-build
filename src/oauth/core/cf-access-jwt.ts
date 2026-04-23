type CfAccessJwtHeader = {
  alg: string;
  kid?: string;
};

type CfAccessJwtPayload = {
  aud: string | string[];
  email?: string;
  exp: number;
  iss: string;
  sub: string;
};

type CfAccessJwks = {
  keys: (JsonWebKey & { kid?: string })[];
};

function base64urlDecode(input: string): Uint8Array {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    input.length + (4 - (input.length % 4)) % 4,
    "="
  );
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function parseJsonFromBase64url<T>(input: string): T {
  return JSON.parse(new TextDecoder().decode(base64urlDecode(input))) as T;
}

async function importRsaKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" },
    false,
    ["verify"]
  );
}

async function importEcKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );
}

async function verifyJwtSignature(
  alg: string,
  key: CryptoKey,
  signedData: BufferSource,
  signature: BufferSource
): Promise<boolean> {
  if (alg === "RS256") {
    return crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signedData);
  }
  if (alg === "ES256") {
    return crypto.subtle.verify({ hash: "SHA-256", name: "ECDSA" }, key, signature, signedData);
  }
  throw new Error(`Unsupported JWT algorithm: ${alg}`);
}

export function isCfAccessJwt(token: string): boolean {
  return token.split(".").length === 3;
}

export async function verifyCfAccessJwt(
  token: string,
  teamDomain: string,
  options?: { audience?: string; now?: () => number }
): Promise<{ email?: string; sub: string }> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format.");
  }

  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  const header = parseJsonFromBase64url<CfAccessJwtHeader>(headerB64);
  const payload = parseJsonFromBase64url<CfAccessJwtPayload>(payloadB64);

  const nowSec = Math.floor((options?.now?.() ?? Date.now()) / 1000);
  if (payload.exp <= nowSec) {
    throw new Error("CF Access token has expired.");
  }

  const normalizedDomain = teamDomain.replace(/\/$/, "");
  if (payload.iss !== normalizedDomain) {
    throw new Error(`CF Access token issuer mismatch: expected ${normalizedDomain}, got ${payload.iss}`);
  }

  if (options?.audience) {
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(options.audience)) {
      throw new Error("CF Access token audience does not match.");
    }
  }

  const certsUrl = new URL("/cdn-cgi/access/certs", normalizedDomain).href;
  const certsRes = await fetch(certsUrl);
  if (!certsRes.ok) {
    throw new Error(`Failed to fetch CF Access JWKS: ${certsRes.status}`);
  }

  const jwks = await certsRes.json() as CfAccessJwks;
  const matchingKey = jwks.keys.find(k => !header.kid || k.kid === header.kid);

  if (!matchingKey) {
    throw new Error("No matching key found in CF Access JWKS.");
  }

  const cryptoKey = header.alg === "ES256"
    ? await importEcKey(matchingKey)
    : await importRsaKey(matchingKey);

  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signatureBytes = base64urlDecode(signatureB64);

  const valid = await verifyJwtSignature(header.alg, cryptoKey, signedData, signatureBytes);
  if (!valid) {
    throw new Error("CF Access token signature is invalid.");
  }

  return { email: payload.email, sub: payload.sub };
}
