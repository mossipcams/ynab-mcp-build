import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { YnabClient } from "../../platform/ynab/client.js";
import { registerPayeeTools } from "./tools.js";

export function registerPayeesSlice(server: McpServer, ynabClient: YnabClient) {
  registerPayeeTools(server, ynabClient);
}
