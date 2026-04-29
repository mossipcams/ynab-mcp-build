function toBase64Url(bytes: Uint8Array) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

export async function createCodeChallenge(codeVerifier: string) {
  const data = new TextEncoder().encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);

  return toBase64Url(new Uint8Array(digest));
}

export async function verifyPkceCodeVerifier(
  codeVerifier: string,
  expectedChallenge: string,
) {
  const actualChallenge = await createCodeChallenge(codeVerifier);

  if (actualChallenge !== expectedChallenge) {
    throw new Error("PKCE code_verifier is invalid.");
  }
}
