import { z } from "zod";

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

const AccessDiscoveryResponseSchema = z.object({
  authorization_endpoint: z.string(),
  issuer: z.string().optional(),
  jwks_uri: z.string(),
  token_endpoint: z.string(),
});

const AccessTokenResponseSchema = z.object({
  id_token: z.string().min(1),
});

function isJsonWebKey(value: unknown): value is JsonWebKey {
  return (
    typeof value === "object" &&
    value !== null &&
    "kty" in value &&
    typeof value.kty === "string"
  );
}

const JsonWebKeySchema = z.custom<JsonWebKey>(isJsonWebKey);

const AccessJwksSchema = z.object({
  keys: z.array(JsonWebKeySchema),
});

type AccessJwks = z.output<typeof AccessJwksSchema>;

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

  return payload;
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

      const payload = AccessDiscoveryResponseSchema.safeParse(
        await readJsonObject(response),
      );

      if (!payload.success) {
        throw new Error(
          "Access OIDC discovery response is missing required endpoints.",
        );
      }

      return {
        authorizationUrl: payload.data.authorization_endpoint,
        ...(payload.data.issuer ? { issuer: payload.data.issuer } : {}),
        jwksUrl: payload.data.jwks_uri,
        tokenUrl: payload.data.token_endpoint,
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

    const payload = AccessTokenResponseSchema.safeParse(
      await readJsonObject(response),
    );

    if (!payload.success) {
      throw new Error("Access OIDC token exchange did not return an ID token.");
    }

    return payload.data.id_token;
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

        const payload = AccessJwksSchema.safeParse(
          await readJsonObject(response),
        );

        if (!payload.success) {
          throw new Error("Access OIDC JWKS response is missing keys.");
        }

        return payload.data;
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
