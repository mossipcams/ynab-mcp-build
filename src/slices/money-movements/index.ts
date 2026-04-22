import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { YnabClient } from "../../platform/ynab/client.js";
import { registerMoneyMovementTools } from "./tools.js";

export function registerMoneyMovementsSlice(server: McpServer, ynabClient: YnabClient) {
  registerMoneyMovementTools(server, ynabClient);
}
