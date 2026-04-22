import { createCodeChallenge, verifyPkceCodeVerifier } from "./pkce.js";
import type {
  OAuthAccessToken,
  OAuthAuthorizationCode,
  OAuthRefreshToken,
  OAuthRegisteredClient,
  OAuthStore
} from "./store.js";

const DEFAULT_ACCESS_TOKEN_TTL_SEC = 60 * 60;
const DEFAULT_AUTHORIZATION_CODE_TTL_SEC = 5 * 60;
const DEFAULT_REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60;

type CreateOAuthCoreOptions = {
  accessTokenTtlSec?: number;
  authorizationCodeTtlSec?: number;
  createId: () => string;
  issuer: string;
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
  responseType: string;
  scope?: string;
  state?: string;
};

type AuthorizationCodeExchangeInput = {
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
};

type RefreshTokenExchangeInput = {
  clientId: string;
  refreshToken: string;
};

function getIssuer(input: string) {
  return new URL("/", input).href;
}

function getOrigin(input: string) {
  return new URL(input).origin;
}

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function validateRegisteredRedirectUri(redirectUri: string) {
  const parsed = new URL(redirectUri);

  if (parsed.protocol === "https:" || isLoopbackHost(parsed.hostname)) {
    return;
  }

  throw new Error("redirect_uris must use https unless they target a loopback host.");
}

function getRedirectUriWithParams(redirectUri: string, params: Record<string, string | undefined>) {
  const url = new URL(redirectUri);

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value.length > 0) {
      url.searchParams.set(key, value);
    }
  }

  return url.href;
}

function getRequestedScopes(scope: string | undefined, scopesSupported: string[]) {
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
    token_endpoint_auth_method: record.tokenEndpointAuthMethod
  };
}

function createAccessTokenRecord(options: CreateOAuthCoreOptions, input: {
  clientId: string;
  scopes: string[];
}): OAuthAccessToken {
  return {
    clientId: input.clientId,
    expiresAt: options.now() + (options.accessTokenTtlSec ?? DEFAULT_ACCESS_TOKEN_TTL_SEC) * 1000,
    scopes: input.scopes,
    token: options.createId()
  };
}

function createRefreshTokenRecord(options: CreateOAuthCoreOptions, input: {
  clientId: string;
  scopes: string[];
}): OAuthRefreshToken {
  return {
    clientId: input.clientId,
    expiresAt: options.now() + (options.refreshTokenTtlSec ?? DEFAULT_REFRESH_TOKEN_TTL_SEC) * 1000,
    scopes: input.scopes,
    token: options.createId(),
    used: false
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
    origin
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
      tokenEndpointAuthMethod: "none"
    };

    await options.store.registerClient(record);

    return toClientResponse(record);
  }

  async function startAuthorization(input: AuthorizationInput) {
    if (input.responseType !== "code") {
      throw new Error("response_type must be code.");
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

    const scopes = getRequestedScopes(input.scope, client.scopes);
    const record: OAuthAuthorizationCode = {
      clientId: client.clientId,
      code: options.createId(),
      codeChallenge: input.codeChallenge,
      expiresAt: options.now() + (options.authorizationCodeTtlSec ?? DEFAULT_AUTHORIZATION_CODE_TTL_SEC) * 1000,
      redirectUri: input.redirectUri,
      scopes,
      used: false
    };

    await options.store.issueAuthorizationCode(record);

    return {
      code: record.code,
      redirectTo: getRedirectUriWithParams(input.redirectUri, {
        code: record.code,
        state: input.state
      })
    };
  }

  async function exchangeAuthorizationCode(input: AuthorizationCodeExchangeInput) {
    const code = await options.store.useAuthorizationCode(input.code);

    if (!code) {
      throw new Error("Authorization code is invalid or has already been used.");
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

    await verifyPkceCodeVerifier(input.codeVerifier, code.codeChallenge);

    const accessToken = createAccessTokenRecord(options, {
      clientId: code.clientId,
      scopes: code.scopes
    });
    const refreshToken = createRefreshTokenRecord(options, {
      clientId: code.clientId,
      scopes: code.scopes
    });

    await options.store.issueAccessToken(accessToken);
    await options.store.issueRefreshToken(refreshToken);

    return {
      access_token: accessToken.token,
      expires_in: Math.floor((accessToken.expiresAt - options.now()) / 1000),
      refresh_token: refreshToken.token,
      scope: code.scopes.join(" "),
      token_type: "Bearer" as const
    };
  }

  async function refreshAccessToken(input: RefreshTokenExchangeInput) {
    const refreshToken = await options.store.rotateRefreshToken(input.refreshToken);

    if (!refreshToken) {
      throw new Error("Refresh token is invalid or has already been used.");
    }

    if (refreshToken.expiresAt <= options.now()) {
      throw new Error("Refresh token has expired.");
    }

    if (refreshToken.clientId !== input.clientId) {
      throw new Error("Refresh token does not belong to this client.");
    }

    const accessToken = createAccessTokenRecord(options, {
      clientId: refreshToken.clientId,
      scopes: refreshToken.scopes
    });
    const nextRefreshToken = createRefreshTokenRecord(options, {
      clientId: refreshToken.clientId,
      scopes: refreshToken.scopes
    });

    await options.store.issueAccessToken(accessToken);
    await options.store.issueRefreshToken(nextRefreshToken);

    return {
      access_token: accessToken.token,
      expires_in: Math.floor((accessToken.expiresAt - options.now()) / 1000),
      refresh_token: nextRefreshToken.token,
      scope: refreshToken.scopes.join(" "),
      token_type: "Bearer" as const
    };
  }

  async function verifyAccessToken(token: string) {
    const accessToken = await options.store.getAccessToken(token);

    if (!accessToken || accessToken.expiresAt <= options.now()) {
      throw new Error("Bearer token is invalid or expired.");
    }

    return {
      clientId: accessToken.clientId,
      scopes: accessToken.scopes,
      token: accessToken.token
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
      token_endpoint_auth_methods_supported: ["none"]
    };
  }

  function getOpenIdConfiguration() {
    return {
      ...getAuthorizationServerMetadata(),
      subject_types_supported: ["public"]
    };
  }

  function getProtectedResourceMetadata() {
    return {
      authorization_servers: [issuer],
      bearer_methods_supported: ["header"],
      resource: options.protectedResource
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
    verifyAccessToken
  };
}
