import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { YnabClient } from "../../platform/ynab/client.js";
import type { AppEnv } from "../../shared/env.js";
import { registerMetaTools } from "./tools.js";

export function registerMetaSlice(server: McpServer, env: AppEnv, ynabClient: YnabClient) {
  registerMetaTools(server, env, ynabClient);
}
