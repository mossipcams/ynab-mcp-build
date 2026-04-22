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

export function resolveAppEnv(env: Partial<Env> | undefined): AppEnv {
  return {
    mcpServerName: env?.MCP_SERVER_NAME ?? DEFAULT_APP_ENV.mcpServerName,
    mcpServerVersion: env?.MCP_SERVER_VERSION ?? DEFAULT_APP_ENV.mcpServerVersion,
    oauthEnabled:
      (env as { MCP_OAUTH_ENABLED?: string } | undefined)?.MCP_OAUTH_ENABLED === "true",
    publicUrl: (env as { MCP_PUBLIC_URL?: string } | undefined)?.MCP_PUBLIC_URL,
    oauthStateNamespace: (env as { OAUTH_STATE?: DurableObjectNamespace } | undefined)?.OAUTH_STATE,
    ynabApiBaseUrl: env?.YNAB_API_BASE_URL ?? DEFAULT_APP_ENV.ynabApiBaseUrl,
    ynabAccessToken:
      (env as { YNAB_ACCESS_TOKEN?: string; YNAB_API_TOKEN?: string } | undefined)?.YNAB_ACCESS_TOKEN
      ?? (env as { YNAB_ACCESS_TOKEN?: string; YNAB_API_TOKEN?: string } | undefined)?.YNAB_API_TOKEN
  };
}
