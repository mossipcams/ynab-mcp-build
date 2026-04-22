import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { YnabClient } from "../../platform/ynab/client.js";
import { registerAccountTools } from "./tools.js";

export function registerAccountsSlice(server: McpServer, ynabClient: YnabClient) {
  registerAccountTools(server, ynabClient);
}
