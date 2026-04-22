import type { YnabClient } from "../../platform/ynab/client.js";

export function getMcpVersion(metadata: {
  name: string;
  version: string;
}) {
  return {
    name: metadata.name,
    version: metadata.version
  };
}

export async function getUser(ynabClient: YnabClient) {
  return {
    user: await ynabClient.getUser()
  };
}
