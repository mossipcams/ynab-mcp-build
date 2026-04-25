import { verifyOidcIdToken } from "../core/oidc.js";

type AccessOidcClientOptions = {
  clientId: string;
  clientSecret: string;
  fetch: typeof fetch;
  jwksUrl: string;
  redirectUri: string;
  tokenUrl: string;
};

type AccessTokenResponse = {
  id_token?: unknown;
};

type AccessJwks = {
  keys?: JsonWebKey[];
};

async function readJsonObject(response: Response) {
  const payload = await response.json();

  if (!payload || typeof payload !== "object") {
    throw new Error("Access OIDC returned an invalid JSON response.");
  }

  return payload as Record<string, unknown>;
}

export function createAccessOidcClient(options: AccessOidcClientOptions) {
  async function exchangeCode(code: string) {
    const response = await options.fetch(options.tokenUrl, {
      body: new URLSearchParams({
        client_id: options.clientId,
        client_secret: options.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: options.redirectUri
      }).toString(),
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded"
      },
      method: "POST"
    });

    if (!response.ok) {
      throw new Error("Access OIDC token exchange failed.");
    }

    const payload = await readJsonObject(response) as AccessTokenResponse;

    if (typeof payload.id_token !== "string" || payload.id_token.length === 0) {
      throw new Error("Access OIDC token exchange did not return an ID token.");
    }

    return payload.id_token;
  }

  async function fetchJwks() {
    const response = await options.fetch(options.jwksUrl, {
      headers: {
        accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error("Access OIDC JWKS request failed.");
    }

    return readJsonObject(response) as Promise<AccessJwks>;
  }

  return {
    async authenticate(code: string) {
      const token = await exchangeCode(code);

      return verifyOidcIdToken({
        expectedAudience: options.clientId,
        jwks: await fetchJwks(),
        token
      });
    }
  };
}
