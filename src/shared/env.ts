export type AppEnv = {
  accessOidc?: {
    authorizationUrl?: string;
    clientId: string;
    clientSecret: string;
    discoveryUrl: string;
    jwksUrl?: string;
    teamDomain: string;
    tokenUrl?: string;
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
  ynabDatabase?: D1Database;
  ynabDefaultPlanId?: string;
  ynabReadSource: "live" | "d1";
  ynabStaleAfterMinutes: number;
  ynabSyncMaxRowsPerRun: number;
};

const DEFAULT_APP_ENV: AppEnv = {
  mcpServerName: "ynab-mcp-build",
  mcpServerVersion: "0.1.0",
  oauthEnabled: false,
  ynabApiBaseUrl: "https://api.ynab.com/v1",
  ynabReadSource: "live",
  ynabStaleAfterMinutes: 360,
  ynabSyncMaxRowsPerRun: 100
};

function getOptionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeAccessTeamDomain(value: string) {
  return value.replace(/^https?:\/\//u, "").replace(/\/+$/u, "");
}

function getOptionalPositiveInteger(value: unknown, fallback: number) {
  if (typeof value !== "string" || value.length === 0) {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveYnabReadSource(value: unknown) {
  return value === "d1" ? "d1" : DEFAULT_APP_ENV.ynabReadSource;
}

function getAccessOidcDiscoveryUrl(teamDomain: string, clientId: string) {
  return `https://${teamDomain}/cdn-cgi/access/sso/oidc/${encodeURIComponent(clientId)}/.well-known/openid-configuration`;
}

type Compact<T extends Record<string, unknown>> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K];
} & {
  [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<T[K], undefined>;
};

function compact<T extends Record<string, unknown>>(entry: T): Compact<T> {
  return Object.fromEntries(
    Object.entries(entry).filter(([, value]) => value !== undefined)
  ) as Compact<T>;
}

export function resolveAppEnv(env: Partial<Env> | undefined, request?: Request): AppEnv {
  const runtimeEnv = env as {
    ACCESS_AUTHORIZATION_URL?: string;
    ACCESS_CLIENT_ID?: string;
    ACCESS_CLIENT_SECRET?: string;
    ACCESS_JWKS_URL?: string;
    ACCESS_TEAM_DOMAIN?: string;
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
    YNAB_DB?: D1Database;
    YNAB_DEFAULT_PLAN_ID?: string;
    YNAB_READ_SOURCE?: string;
    YNAB_STALE_AFTER_MINUTES?: string;
    YNAB_SYNC_MAX_ROWS_PER_RUN?: string;
  } | undefined;
  const accessOidcValues = {
    authorizationUrl: getOptionalString(runtimeEnv?.ACCESS_AUTHORIZATION_URL),
    clientId: getOptionalString(runtimeEnv?.ACCESS_CLIENT_ID),
    clientSecret: getOptionalString(runtimeEnv?.ACCESS_CLIENT_SECRET),
    jwksUrl: getOptionalString(runtimeEnv?.ACCESS_JWKS_URL),
    teamDomain: getOptionalString(runtimeEnv?.ACCESS_TEAM_DOMAIN),
    tokenUrl: getOptionalString(runtimeEnv?.ACCESS_TOKEN_URL)
  };
  const accessOidcRequiredValueCount = [
    accessOidcValues.clientId,
    accessOidcValues.clientSecret,
    accessOidcValues.teamDomain
  ].filter(Boolean).length;
  const accessOidcOverrideValueCount = [
    accessOidcValues.authorizationUrl,
    accessOidcValues.jwksUrl,
    accessOidcValues.tokenUrl
  ].filter(Boolean).length;
  const hasAccessOidcValues = accessOidcRequiredValueCount > 0 || accessOidcOverrideValueCount > 0;
  const accessTeamDomain = accessOidcValues.teamDomain
    ? normalizeAccessTeamDomain(accessOidcValues.teamDomain)
    : undefined;
  const derivedPublicUrl = request
    ? `${new URL(request.url).origin}/mcp`
    : undefined;
  const resolvedEnv = compact({
    ...(accessOidcRequiredValueCount === 3
      ? {
          accessOidc: {
            clientId: accessOidcValues.clientId!,
            clientSecret: accessOidcValues.clientSecret!,
            discoveryUrl: getAccessOidcDiscoveryUrl(accessTeamDomain!, accessOidcValues.clientId!),
            teamDomain: accessTeamDomain!,
            ...(accessOidcValues.authorizationUrl ? { authorizationUrl: accessOidcValues.authorizationUrl } : {}),
            ...(accessOidcValues.jwksUrl ? { jwksUrl: accessOidcValues.jwksUrl } : {}),
            ...(accessOidcValues.tokenUrl ? { tokenUrl: accessOidcValues.tokenUrl } : {})
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
    ynabAccessToken: runtimeEnv?.YNAB_ACCESS_TOKEN ?? runtimeEnv?.YNAB_API_TOKEN,
    ynabDatabase: runtimeEnv?.YNAB_DB,
    ynabDefaultPlanId: getOptionalString(runtimeEnv?.YNAB_DEFAULT_PLAN_ID),
    ynabReadSource: resolveYnabReadSource(runtimeEnv?.YNAB_READ_SOURCE),
    ynabStaleAfterMinutes: getOptionalPositiveInteger(
      runtimeEnv?.YNAB_STALE_AFTER_MINUTES,
      DEFAULT_APP_ENV.ynabStaleAfterMinutes
    ),
    ynabSyncMaxRowsPerRun: getOptionalPositiveInteger(
      runtimeEnv?.YNAB_SYNC_MAX_ROWS_PER_RUN,
      DEFAULT_APP_ENV.ynabSyncMaxRowsPerRun
    )
  });

  if (resolvedEnv.oauthEnabled && !resolvedEnv.publicUrl) {
    throw new Error("MCP_PUBLIC_URL is required when MCP_OAUTH_ENABLED is true.");
  }

  if (resolvedEnv.oauthEnabled && !resolvedEnv.oauthStateNamespace && !resolvedEnv.oauthKvNamespace) {
    throw new Error("OAuth requires a Durable Object namespace or an injected OAuth KV store when MCP_OAUTH_ENABLED is true.");
  }

  if (resolvedEnv.cfAccessTeamDomain && !resolvedEnv.cfAccessAudience) {
    throw new Error("CF_ACCESS_AUD is required when CF_ACCESS_TEAM_DOMAIN is set.");
  }

  if (hasAccessOidcValues && accessOidcRequiredValueCount < 3) {
    throw new Error("Access OIDC requires ACCESS_TEAM_DOMAIN, ACCESS_CLIENT_ID, and ACCESS_CLIENT_SECRET.");
  }

  return resolvedEnv;
}
