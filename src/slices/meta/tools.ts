import type { YnabClient } from "../../platform/ynab/client.js";
import type { AppEnv } from "../../shared/env.js";
import type { SliceToolDefinition } from "../../shared/tool-definition.js";
import { getMcpVersion, getUser } from "./service.js";

export function getMetaToolDefinitions(env: AppEnv, ynabClient: YnabClient): SliceToolDefinition[] {
  return [
    {
      name: "ynab_get_mcp_version",
      title: "YNAB MCP Version",
      description: "Returns the MCP server name and version for this deployment.",
      inputSchema: {},
      execute: () => Promise.resolve(getMcpVersion(env))
    },
    {
      name: "ynab_get_user",
      title: "Get YNAB User",
      description: "Returns the authenticated YNAB user.",
      inputSchema: {},
      execute: async () => getUser(ynabClient)
    }
  ];
}
