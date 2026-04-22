import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { YnabClient } from "../../platform/ynab/client.js";
import { registerFinancialHealthTools } from "./tools.js";

export function registerFinancialHealthSlice(server: McpServer, ynabClient: YnabClient) {
  registerFinancialHealthTools(server, ynabClient);
}
