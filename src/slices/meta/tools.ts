import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { YnabClient } from "../../platform/ynab/client.js";
import type { AppEnv } from "../../shared/env.js";
import { toErrorResult, toTextResult } from "../../shared/results.js";
import { getMcpVersion, getUser } from "./service.js";

export function registerMetaTools(server: McpServer, env: AppEnv, ynabClient: YnabClient) {
  server.registerTool(
    "ynab_get_mcp_version",
    {
      title: "YNAB MCP Version",
      description: "Returns the MCP server name and version for this deployment.",
      inputSchema: {}
    },
    async () => toTextResult(getMcpVersion(env))
  );

  server.registerTool(
    "ynab_get_user",
    {
      title: "Get YNAB User",
      description: "Returns the authenticated YNAB user.",
      inputSchema: {}
    },
    async () => {
      try {
        return toTextResult(await getUser(ynabClient));
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );
}
