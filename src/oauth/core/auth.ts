import { verifyPkceCodeVerifier } from "./pkce.js";
import { signJwt, verifyJwt } from "./jwt.js";
import type {
  OAuthAccessToken,
  OAuthAuthorizationCode,
  OAuthRefreshToken,
  OAuthRegisteredClient,
  OAuthStore,
} from "./store.js";

const DEFAULT_ACCESS_TOKEN_TTL_SEC = 24 * 60 * 60;
const DEFAULT_AUTHORIZATION_CODE_TTL_SEC = 5 * 60;
const DEFAULT_REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60;

type CreateOAuthCoreOptions = {
  accessTokenTtlSec?: number;
  authorizationCodeTtlSec?: number;
  createId: () => string;
  issuer: string;
  jwtSigningKey: string;
  now: () => number;
  protectedResource: string;
  refreshTokenTtlSec?: number;
  scopesSupported: string[];
  store: OAuthStore;
};

type ClientRegistrationInput = {
  clientName?: string;
  grantTypes: string[];
  redirectUris: string[];
  responseTypes: string[];
  tokenEndpointAuthMethod: string;
};

type AuthorizationInput = {
  clientId: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  redirectUri: string;
  resource?: string;
  responseType: string;
  scope?: string;
  state?: string;
};

type AuthorizationCodeExchangeInput = {
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  resource?: string;
};

type RefreshTokenExchangeInput = {
  clientId: string;
  refreshToken: string;
  resource?: string;
};

function getIssuer(input: string) {
  return new URL("/", input).href;
}

function getOrigin(input: string) {
  return new URL(input).origin;
}

function isLoopbackHost(hostname: string) {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
  );
}

function validateRegisteredRedirectUri(redirectUri: string) {
  const parsed = new URL(redirectUri);

  if (parsed.protocol === "https:") {
    return;
  }

  if (parsed.protocol === "http:" && isLoopbackHost(parsed.hostname)) {
    return;
  }

  throw new Error(
    "redirect_uris must use https unless they target a loopback host over http.",
  );
}

function getRedirectUriWithParams(
  redirectUri: string,
  params: Record<string, string | undefined>,
) {
  const url = new URL(redirectUri);

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value.length > 0) {
      url.searchParams.set(key, value);
    }
  }

  return url.href;
}

function getRequestedScopes(
  scope: string | undefined,
  scopesSupported: string[],
) {
  const requested = scope
    ? scope.split(/\s+/u).filter(Boolean)
    : [...scopesSupported];

  for (const entry of requested) {
    if (!scopesSupported.includes(entry)) {
      throw new Error(`Requested scope is not supported: ${entry}`);
    }
  }

  return requested;
}

function toClientResponse(record: OAuthRegisteredClient) {
  return {
    client_id: record.clientId,
    client_id_issued_at: record.clientIdIssuedAt,
    ...(record.clientName ? { client_name: record.clientName } : {}),
    grant_types: [...record.grantTypes],
    redirect_uris: [...record.redirectUris],
    response_types: [...record.responseTypes],
    token_endpoint_auth_method: record.tokenEndpointAuthMethod,
  };
}

function validateResource(
  resource: string | undefined,
  protectedResource: string,
) {
  if (!resource) {
    throw new Error("resource is required.");
  }

  if (resource !== protectedResource) {
    throw new Error("resource must match the canonical protected resource.");
  }

  return resource;
}

async function createAccessTokenRecord(
  options: CreateOAuthCoreOptions,
  input: {
    clientId: string;
    resource: string;
    scopes: string[];
  },
): Promise<OAuthAccessToken> {
  const issuedAt = Math.floor(options.now() / 1000);
  const expiresAt =
    options.now() +
    (options.accessTokenTtlSec ?? DEFAULT_ACCESS_TOKEN_TTL_SEC) * 1000;
  const jti = options.createId();
  const issuer = getIssuer(options.issuer);
  const token = await signJwt(
    {
      aud: input.resource,
      exp: Math.floor(expiresAt / 1000),
      iat: issuedAt,
      iss: issuer,
      jti,
      scope: input.scopes.join(" "),
      sub: input.clientId,
    },
    options.jwtSigningKey,
  );

  return {
    audience: input.resource,
    clientId: input.clientId,
    expiresAt,
    issuedAt,
    issuer,
    jti,
    scopes: input.scopes,
    token,
  };
}

function createRefreshTokenRecord(
  options: CreateOAuthCoreOptions,
  input: {
    clientId: string;
    familyId?: string;
    resource: string;
    scopes: string[];
  },
): OAuthRefreshToken {
  return {
    clientId: input.clientId,
    expiresAt:
      options.now() +
      (options.refreshTokenTtlSec ?? DEFAULT_REFRESH_TOKEN_TTL_SEC) * 1000,
    familyId: input.familyId ?? options.createId(),
    resource: input.resource,
    scopes: input.scopes,
    token: options.createId(),
    used: false,
  };
}

export function createOAuthCore(options: CreateOAuthCoreOptions) {
  const origin = getOrigin(options.protectedResource);
  const issuer = getIssuer(options.issuer);
  const authorizationEndpoint = new URL("/authorize", origin).href;
  const registrationEndpoint = new URL("/register", origin).href;
  const tokenEndpoint = new URL("/token", origin).href;
  const protectedResourceMetadataEndpoint = new URL(
    "/.well-known/oauth-protected-resource/mcp",
    origin,
  ).href;

  async function registerClient(input: ClientRegistrationInput) {
    if (input.redirectUris.length !== 1) {
      throw new Error("redirect_uris must contain exactly one redirect URI.");
    }

    if (!input.grantTypes.includes("authorization_code")) {
      throw new Error("grant_types must include authorization_code.");
    }

    if (!input.responseTypes.includes("code")) {
      throw new Error("response_types must include code.");
    }

    if (input.tokenEndpointAuthMethod !== "none") {
      throw new Error("token_endpoint_auth_method must be none.");
    }

    validateRegisteredRedirectUri(input.redirectUris[0]!);

    const record: OAuthRegisteredClient = {
      clientId: options.createId(),
      clientIdIssuedAt: Math.floor(options.now() / 1000),
      ...(input.clientName ? { clientName: input.clientName } : {}),
      grantTypes: [...input.grantTypes],
      redirectUris: [...input.redirectUris],
      responseTypes: [...input.responseTypes],
      scopes: [...options.scopesSupported],
      tokenEndpointAuthMethod: "none",
    };

    await options.store.registerClient(record);

    return toClientResponse(record);
  }

  async function startAuthorization(input: AuthorizationInput) {
    if (input.responseType !== "code") {
      throw new Error("response_type must be code.");
    }

    if (input.codeChallenge.length === 0) {
      throw new Error("code_challenge is required.");
    }

    if (input.codeChallengeMethod !== "S256") {
      throw new Error("code_challenge_method must be S256.");
    }

    const client = await options.store.getRegisteredClient(input.clientId);

    if (!client) {
      throw new Error("Unknown OAuth client.");
    }

    if (!client.redirectUris.includes(input.redirectUri)) {
      throw new Error("redirect_uri is not registered for this client.");
    }

    const resource = validateResource(
      input.resource,
      options.protectedResource,
    );
    const scopes = getRequestedScopes(input.scope, client.scopes);
    const record: OAuthAuthorizationCode = {
      clientId: client.clientId,
      code: options.createId(),
      codeChallenge: input.codeChallenge,
      expiresAt:
        options.now() +
        (options.authorizationCodeTtlSec ??
          DEFAULT_AUTHORIZATION_CODE_TTL_SEC) *
          1000,
      resource,
      redirectUri: input.redirectUri,
      scopes,
      used: false,
    };

    await options.store.issueAuthorizationCode(record);

    return {
      code: record.code,
      redirectTo: getRedirectUriWithParams(input.redirectUri, {
        code: record.code,
        state: input.state,
      }),
    };
  }

  async function exchangeAuthorizationCode(
    input: AuthorizationCodeExchangeInput,
  ) {
    const code = await options.store.getAuthorizationCode(input.code);

    if (!code || code.used) {
      throw new Error(
        "Authorization code is invalid or has already been used.",
      );
    }

    if (code.expiresAt <= options.now()) {
      throw new Error("Authorization code has expired.");
    }

    if (code.clientId !== input.clientId) {
      throw new Error("Authorization code does not belong to this client.");
    }

    if (code.redirectUri !== input.redirectUri) {
      throw new Error("redirect_uri does not match the authorization request.");
    }

    const resource = validateResource(
      input.resource,
      options.protectedResource,
    );

    if (code.resource !== resource) {
      throw new Error("resource does not match the authorization request.");
    }

    await verifyPkceCodeVerifier(input.codeVerifier, code.codeChallenge);

    const usedCode = await options.store.useAuthorizationCode(input.code);

    if (!usedCode) {
      throw new Error(
        "Authorization code is invalid or has already been used.",
      );
    }

    const accessToken = await createAccessTokenRecord(options, {
      clientId: code.clientId,
      resource,
      scopes: code.scopes,
    });
    const refreshToken = createRefreshTokenRecord(options, {
      clientId: code.clientId,
      resource,
      scopes: code.scopes,
    });

    await options.store.issueAccessToken(accessToken);
    await options.store.issueRefreshToken(refreshToken);

    return {
      access_token: accessToken.token,
      expires_in: Math.floor((accessToken.expiresAt - options.now()) / 1000),
      refresh_token: refreshToken.token,
      scope: code.scopes.join(" "),
      token_type: "Bearer" as const,
    };
  }

  async function refreshAccessToken(input: RefreshTokenExchangeInput) {
    const resource = validateResource(
      input.resource ?? options.protectedResource,
      options.protectedResource,
    );
    const rotation = await options.store.rotateRefreshToken({
      clientId: input.clientId,
      now: options.now(),
      resource,
      token: input.refreshToken,
    });

    if (rotation.status !== "rotated") {
      if (rotation.status === "not_found") {
        throw new Error("Refresh token is invalid or has already been used.");
      }

      if (rotation.status === "expired") {
        throw new Error("Refresh token has expired.");
      }

      if (rotation.status === "invalid_client") {
        throw new Error("Refresh token does not belong to this client.");
      }

      if (rotation.status === "invalid_resource") {
        throw new Error("resource does not match the refresh token.");
      }

      throw new Error("Refresh token replay detected; token family revoked.");
    }

    const refreshToken = rotation.record;

    const accessToken = await createAccessTokenRecord(options, {
      clientId: refreshToken.clientId,
      resource,
      scopes: refreshToken.scopes,
    });
    const nextRefreshToken = createRefreshTokenRecord(options, {
      clientId: refreshToken.clientId,
      familyId: refreshToken.familyId,
      resource,
      scopes: refreshToken.scopes,
    });

    await options.store.issueAccessToken(accessToken);
    await options.store.issueRefreshToken(nextRefreshToken);

    return {
      access_token: accessToken.token,
      expires_in: Math.floor((accessToken.expiresAt - options.now()) / 1000),
      refresh_token: nextRefreshToken.token,
      scope: refreshToken.scopes.join(" "),
      token_type: "Bearer" as const,
    };
  }

  async function verifyAccessToken(token: string) {
    const payload = await verifyJwt(token, options.jwtSigningKey);

    if (payload.exp * 1000 <= options.now()) {
      throw new Error("Bearer token is invalid or expired.");
    }

    if (payload.aud !== options.protectedResource || payload.iss !== issuer) {
      throw new Error("Bearer token is invalid or expired.");
    }

    return {
      clientId: payload.sub,
      scopes: payload.scope.split(/\s+/u).filter(Boolean),
      token,
    };
  }

  function getAuthorizationServerMetadata() {
    return {
      authorization_endpoint: authorizationEndpoint,
      code_challenge_methods_supported: ["S256"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      issuer,
      registration_endpoint: registrationEndpoint,
      response_types_supported: ["code"],
      scopes_supported: [...options.scopesSupported],
      token_endpoint: tokenEndpoint,
      token_endpoint_auth_methods_supported: ["none"],
    };
  }

  function getOpenIdConfiguration() {
    return {
      ...getAuthorizationServerMetadata(),
      subject_types_supported: ["public"],
    };
  }

  function getProtectedResourceMetadata() {
    return {
      authorization_servers: [issuer],
      bearer_methods_supported: ["header"],
      resource: options.protectedResource,
    };
  }

  return {
    exchangeAuthorizationCode,
    getAuthorizationServerMetadata,
    getOpenIdConfiguration,
    getProtectedResourceMetadata,
    protectedResourceMetadataEndpoint,
    refreshAccessToken,
    registerClient,
    startAuthorization,
    verifyAccessToken,
  };
}
