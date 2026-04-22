import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { YnabClient } from "../../platform/ynab/client.js";
import { registerPlanTools } from "./tools.js";

export function registerPlansSlice(server: McpServer, ynabClient: YnabClient) {
  registerPlanTools(server, ynabClient);
}
