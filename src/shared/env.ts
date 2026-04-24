export type AppEnv = {
  cfAccessAudience?: string;
  cfAccessTeamDomain?: string;
  mcpServerName: string;
  mcpServerVersion: string;
  oauthEnabled: boolean;
  oauthKvNamespace?: KVNamespace;
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

export function resolveAppEnv(env: Partial<Env> | undefined, request?: Request): AppEnv {
  const runtimeEnv = env as {
    CF_ACCESS_AUD?: string;
    CF_ACCESS_TEAM_DOMAIN?: string;
    MCP_OAUTH_ENABLED?: string;
    MCP_PUBLIC_URL?: string;
    MCP_SERVER_NAME?: string;
    MCP_SERVER_VERSION?: string;
    OAUTH_KV?: KVNamespace;
    YNAB_ACCESS_TOKEN?: string;
    YNAB_API_BASE_URL?: string;
    YNAB_API_TOKEN?: string;
  } | undefined;
  const derivedPublicUrl = request
    ? `${new URL(request.url).origin}/mcp`
    : undefined;
  const resolvedEnv = {
    cfAccessAudience: runtimeEnv?.CF_ACCESS_AUD,
    cfAccessTeamDomain: runtimeEnv?.CF_ACCESS_TEAM_DOMAIN,
    mcpServerName: runtimeEnv?.MCP_SERVER_NAME ?? DEFAULT_APP_ENV.mcpServerName,
    mcpServerVersion: runtimeEnv?.MCP_SERVER_VERSION ?? DEFAULT_APP_ENV.mcpServerVersion,
    oauthEnabled: runtimeEnv?.MCP_OAUTH_ENABLED === "true",
    oauthKvNamespace: runtimeEnv?.OAUTH_KV,
    publicUrl: runtimeEnv?.MCP_PUBLIC_URL ?? derivedPublicUrl,
    ynabApiBaseUrl: runtimeEnv?.YNAB_API_BASE_URL ?? DEFAULT_APP_ENV.ynabApiBaseUrl,
    ynabAccessToken: runtimeEnv?.YNAB_ACCESS_TOKEN ?? runtimeEnv?.YNAB_API_TOKEN
  };

  if (resolvedEnv.oauthEnabled && !resolvedEnv.publicUrl) {
    throw new Error("MCP_PUBLIC_URL is required when MCP_OAUTH_ENABLED is true.");
  }

  if (resolvedEnv.cfAccessTeamDomain && !resolvedEnv.cfAccessAudience) {
    throw new Error("CF_ACCESS_AUD is required when CF_ACCESS_TEAM_DOMAIN is set.");
  }

  return resolvedEnv;
}
