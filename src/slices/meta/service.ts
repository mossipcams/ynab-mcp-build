import type { YnabClient } from "../../platform/ynab/client.js";

export function getMcpVersion(metadata: {
  mcpServerName: string;
  mcpServerVersion: string;
}) {
  return {
    name: metadata.mcpServerName,
    version: metadata.mcpServerVersion
  };
}

export async function getUser(ynabClient: YnabClient) {
  return {
    user: await ynabClient.getUser()
  };
}
