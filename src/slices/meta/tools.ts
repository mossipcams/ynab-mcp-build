import type { McpToolDefinition } from "../../mcp/tools.js";
import type { YnabClient } from "../../platform/ynab/client.js";
import { getMcpVersion, getUser } from "./service.js";

export function getMetaToolDefinitions(
  metadata: {
    name: string;
    version: string;
  },
  ynabClient: YnabClient
): McpToolDefinition[] {
  return [
    {
      name: "ynab_get_mcp_version",
      title: "YNAB MCP Version",
      description: "Returns the MCP server name and version for this deployment.",
      inputSchema: {},
      execute: async () => getMcpVersion(metadata)
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
