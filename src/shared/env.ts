export type AppEnv = {
  mcpServerName: string;
  mcpServerVersion: string;
  oauthEnabled: boolean;
  publicUrl?: string;
  oauthStateNamespace?: DurableObjectNamespace;
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
    MCP_OAUTH_ENABLED?: string;
    MCP_PUBLIC_URL?: string;
    MCP_SERVER_NAME?: string;
    MCP_SERVER_VERSION?: string;
    OAUTH_STATE?: DurableObjectNamespace;
    YNAB_ACCESS_TOKEN?: string;
    YNAB_API_BASE_URL?: string;
    YNAB_API_TOKEN?: string;
  } | undefined;

  const derivedPublicUrl = request
    ? `${new URL(request.url).origin}/mcp`
    : undefined;

  const resolvedEnv = {
    mcpServerName: runtimeEnv?.MCP_SERVER_NAME ?? DEFAULT_APP_ENV.mcpServerName,
    mcpServerVersion: runtimeEnv?.MCP_SERVER_VERSION ?? DEFAULT_APP_ENV.mcpServerVersion,
    oauthEnabled: runtimeEnv?.MCP_OAUTH_ENABLED === "true",
    publicUrl: runtimeEnv?.MCP_PUBLIC_URL ?? derivedPublicUrl,
    oauthStateNamespace: runtimeEnv?.OAUTH_STATE,
    ynabApiBaseUrl: runtimeEnv?.YNAB_API_BASE_URL ?? DEFAULT_APP_ENV.ynabApiBaseUrl,
    ynabAccessToken: runtimeEnv?.YNAB_ACCESS_TOKEN ?? runtimeEnv?.YNAB_API_TOKEN
  };

  if (resolvedEnv.oauthEnabled && !resolvedEnv.publicUrl) {
    throw new Error("MCP_PUBLIC_URL is required when MCP_OAUTH_ENABLED is true.");
  }

  return resolvedEnv;
}
