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
  expectedIssuer?: string;
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
  issuer?: unknown;
  jwks_uri?: unknown;
  token_endpoint?: unknown;
};

export type AccessOidcEndpoints = {
  authorizationUrl: string;
  issuer?: string;
  jwksUrl: string;
  tokenUrl: string;
};

type CacheEntry<T> = {
  expiresAt: number;
  value: Promise<T>;
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const discoveryEndpointCache = new Map<
  string,
  CacheEntry<AccessOidcEndpoints>
>();
const jwksCache = new Map<string, CacheEntry<AccessJwks>>();

function readCached<T>(cache: Map<string, CacheEntry<T>>, key: string) {
  const entry = cache.get(key);

  if (!entry || entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }

  return entry.value;
}

function writeCached<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: Promise<T>,
) {
  cache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value,
  });

  value.catch(() => {
    if (cache.get(key)?.value === value) {
      cache.delete(key);
    }
  });

  return value;
}

async function readJsonObject(response: Response) {
  const payload = await response.json();

  if (!payload || typeof payload !== "object") {
    throw new Error("Access OIDC returned an invalid JSON response.");
  }

  return payload as Record<string, unknown>;
}

function getEndpointOverrides(
  config: AccessOidcConfig,
): AccessOidcEndpoints | undefined {
  if (config.authorizationUrl && config.jwksUrl && config.tokenUrl) {
    return {
      authorizationUrl: config.authorizationUrl,
      jwksUrl: config.jwksUrl,
      tokenUrl: config.tokenUrl,
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

  const cachedEndpoints = readCached(
    discoveryEndpointCache,
    options.config.discoveryUrl,
  );

  if (cachedEndpoints) {
    return cachedEndpoints;
  }

  return writeCached(
    discoveryEndpointCache,
    options.config.discoveryUrl,
    (async () => {
      const response = await options.fetch(options.config.discoveryUrl, {
        headers: {
          accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Access OIDC discovery request failed.");
      }

      const payload = (await readJsonObject(
        response,
      )) as AccessDiscoveryResponse;

      if (
        typeof payload.authorization_endpoint !== "string" ||
        typeof payload.jwks_uri !== "string" ||
        typeof payload.token_endpoint !== "string"
      ) {
        throw new Error(
          "Access OIDC discovery response is missing required endpoints.",
        );
      }

      return {
        authorizationUrl: payload.authorization_endpoint,
        ...(typeof payload.issuer === "string"
          ? { issuer: payload.issuer }
          : {}),
        jwksUrl: payload.jwks_uri,
        tokenUrl: payload.token_endpoint,
      };
    })(),
  );
}

export function createAccessOidcClient(options: AccessOidcClientOptions) {
  async function exchangeCode(code: string) {
    const response = await options.fetch(options.tokenUrl, {
      body: new URLSearchParams({
        client_id: options.clientId,
        client_secret: options.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: options.redirectUri,
      }).toString(),
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error("Access OIDC token exchange failed.");
    }

    const payload = (await readJsonObject(response)) as AccessTokenResponse;

    if (typeof payload.id_token !== "string" || payload.id_token.length === 0) {
      throw new Error("Access OIDC token exchange did not return an ID token.");
    }

    return payload.id_token;
  }

  async function fetchJwks() {
    const cachedJwks = readCached(jwksCache, options.jwksUrl);

    if (cachedJwks) {
      return cachedJwks;
    }

    return writeCached(
      jwksCache,
      options.jwksUrl,
      (async () => {
        const response = await options.fetch(options.jwksUrl, {
          headers: {
            accept: "application/json",
          },
        });

        if (!response.ok) {
          throw new Error("Access OIDC JWKS request failed.");
        }

        return readJsonObject(response) as Promise<AccessJwks>;
      })(),
    );
  }

  return {
    async authenticate(code: string) {
      const token = await exchangeCode(code);

      return verifyOidcIdToken({
        expectedAudience: options.clientId,
        ...(options.expectedIssuer
          ? { expectedIssuer: options.expectedIssuer }
          : {}),
        jwks: await fetchJwks(),
        token,
      });
    },
  };
}
