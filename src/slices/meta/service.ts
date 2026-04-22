import type { YnabClient } from "../../platform/ynab/client.js";
import type { AppEnv } from "../../shared/env.js";

export function getMcpVersion(env: AppEnv) {
  return {
    name: env.mcpServerName,
    version: env.mcpServerVersion
  };
}

export async function getUser(ynabClient: YnabClient) {
  return {
    user: await ynabClient.getUser()
  };
}
