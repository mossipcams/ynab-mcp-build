import { verifyOidcIdToken } from "../core/oidc.js";

export type AccessOidcConfig = {
  authorizationUrl?: string;
  clientId: string;
  clientSecret: string;
  discoveryUrl: string;
  jwksUrl?: string;
  tokenUrl?: string;
};

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

type AccessDiscoveryResponse = {
  authorization_endpoint?: unknown;
  jwks_uri?: unknown;
  token_endpoint?: unknown;
};

export type AccessOidcEndpoints = {
  authorizationUrl: string;
  jwksUrl: string;
  tokenUrl: string;
};

async function readJsonObject(response: Response) {
  const payload = await response.json();

  if (!payload || typeof payload !== "object") {
    throw new Error("Access OIDC returned an invalid JSON response.");
  }

  return payload as Record<string, unknown>;
}

function getEndpointOverrides(config: AccessOidcConfig): AccessOidcEndpoints | undefined {
  if (config.authorizationUrl && config.jwksUrl && config.tokenUrl) {
    return {
      authorizationUrl: config.authorizationUrl,
      jwksUrl: config.jwksUrl,
      tokenUrl: config.tokenUrl
    };
  }

  return undefined;
}

export async function resolveAccessOidcEndpoints(options: {
  config: AccessOidcConfig;
  fetch: typeof fetch;
}): Promise<AccessOidcEndpoints> {
  const overrides = getEndpointOverrides(options.config);

  if (overrides) {
    return overrides;
  }

  const response = await options.fetch(options.config.discoveryUrl, {
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error("Access OIDC discovery request failed.");
  }

  const payload = await readJsonObject(response) as AccessDiscoveryResponse;

  if (
    typeof payload.authorization_endpoint !== "string" ||
    typeof payload.jwks_uri !== "string" ||
    typeof payload.token_endpoint !== "string"
  ) {
    throw new Error("Access OIDC discovery response is missing required endpoints.");
  }

  return {
    authorizationUrl: payload.authorization_endpoint,
    jwksUrl: payload.jwks_uri,
    tokenUrl: payload.token_endpoint
  };
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
