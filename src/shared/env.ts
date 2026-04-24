export type AppEnv = {
  accessOidc?: {
    authorizationUrl: string;
    clientId: string;
    clientSecret: string;
    jwksUrl: string;
    tokenUrl: string;
  };
  cfAccessAudience?: string;
  cfAccessTeamDomain?: string;
  mcpServerName: string;
  mcpServerVersion: string;
  oauthEnabled: boolean;
  oauthKvNamespace?: KVNamespace;
  oauthStateNamespace?: DurableObjectNamespace;
  publicUrl?: string;
  ynabApiBaseUrl: string;
  ynabAccessToken?: string;
};

const DEFAULT_APP_ENV: AppEnv = {
  mcpServerName: "ynab-mcp-build",
  mcpServerVersion: "0.1.0",
  oauthEnabled: false,
  ynabApiBaseUrl: "https://api.ynab.com/v1"
};

function getOptionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function resolveAppEnv(env: Partial<Env> | undefined, request?: Request): AppEnv {
  const runtimeEnv = env as {
    ACCESS_AUTHORIZATION_URL?: string;
    ACCESS_CLIENT_ID?: string;
    ACCESS_CLIENT_SECRET?: string;
    ACCESS_JWKS_URL?: string;
    ACCESS_TOKEN_URL?: string;
    CF_ACCESS_AUD?: string;
    CF_ACCESS_TEAM_DOMAIN?: string;
    MCP_OAUTH_ENABLED?: string;
    MCP_PUBLIC_URL?: string;
    MCP_SERVER_NAME?: string;
    MCP_SERVER_VERSION?: string;
    OAUTH_KV?: KVNamespace;
    OAUTH_STATE?: DurableObjectNamespace;
    YNAB_ACCESS_TOKEN?: string;
    YNAB_API_BASE_URL?: string;
    YNAB_API_TOKEN?: string;
  } | undefined;
  const accessOidcValues = {
    authorizationUrl: getOptionalString(runtimeEnv?.ACCESS_AUTHORIZATION_URL),
    clientId: getOptionalString(runtimeEnv?.ACCESS_CLIENT_ID),
    clientSecret: getOptionalString(runtimeEnv?.ACCESS_CLIENT_SECRET),
    jwksUrl: getOptionalString(runtimeEnv?.ACCESS_JWKS_URL),
    tokenUrl: getOptionalString(runtimeEnv?.ACCESS_TOKEN_URL)
  };
  const accessOidcValueCount = Object.values(accessOidcValues).filter(Boolean).length;
  const derivedPublicUrl = request
    ? `${new URL(request.url).origin}/mcp`
    : undefined;
  const resolvedEnv = {
    ...(accessOidcValueCount === 5
      ? {
          accessOidc: {
            authorizationUrl: accessOidcValues.authorizationUrl!,
            clientId: accessOidcValues.clientId!,
            clientSecret: accessOidcValues.clientSecret!,
            jwksUrl: accessOidcValues.jwksUrl!,
            tokenUrl: accessOidcValues.tokenUrl!
          }
        }
      : {}),
    cfAccessAudience: runtimeEnv?.CF_ACCESS_AUD,
    cfAccessTeamDomain: runtimeEnv?.CF_ACCESS_TEAM_DOMAIN,
    mcpServerName: runtimeEnv?.MCP_SERVER_NAME ?? DEFAULT_APP_ENV.mcpServerName,
    mcpServerVersion: runtimeEnv?.MCP_SERVER_VERSION ?? DEFAULT_APP_ENV.mcpServerVersion,
    oauthEnabled: runtimeEnv?.MCP_OAUTH_ENABLED === "true",
    oauthKvNamespace: runtimeEnv?.OAUTH_KV,
    oauthStateNamespace: runtimeEnv?.OAUTH_STATE,
    publicUrl: runtimeEnv?.MCP_PUBLIC_URL ?? derivedPublicUrl,
    ynabApiBaseUrl: runtimeEnv?.YNAB_API_BASE_URL ?? DEFAULT_APP_ENV.ynabApiBaseUrl,
    ynabAccessToken: runtimeEnv?.YNAB_ACCESS_TOKEN ?? runtimeEnv?.YNAB_API_TOKEN
  };

  if (resolvedEnv.oauthEnabled && !resolvedEnv.publicUrl) {
    throw new Error("MCP_PUBLIC_URL is required when MCP_OAUTH_ENABLED is true.");
  }

  if (resolvedEnv.oauthEnabled && !resolvedEnv.oauthStateNamespace && !resolvedEnv.oauthKvNamespace) {
    throw new Error("OAuth requires a Durable Object namespace or an injected OAuth KV store when MCP_OAUTH_ENABLED is true.");
  }

  if (resolvedEnv.cfAccessTeamDomain && !resolvedEnv.cfAccessAudience) {
    throw new Error("CF_ACCESS_AUD is required when CF_ACCESS_TEAM_DOMAIN is set.");
  }

  if (accessOidcValueCount > 0 && accessOidcValueCount < 5) {
    throw new Error("Access OIDC requires ACCESS_CLIENT_ID, ACCESS_CLIENT_SECRET, ACCESS_AUTHORIZATION_URL, ACCESS_TOKEN_URL, and ACCESS_JWKS_URL.");
  }

  return resolvedEnv;
}
