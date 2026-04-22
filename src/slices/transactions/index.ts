import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { YnabClient } from "../../platform/ynab/client.js";
import { registerTransactionTools } from "./tools.js";

export function registerTransactionsSlice(server: McpServer, ynabClient: YnabClient) {
  registerTransactionTools(server, ynabClient);
}
