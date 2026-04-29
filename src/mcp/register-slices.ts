import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { SliceToolDefinition } from "../shared/tool-definition.js";
import { registerToolDefinitions } from "./tool-registry.js";

export function registerSlices(server: McpServer, definitions: SliceToolDefinition[]) {
  registerToolDefinitions(server, definitions);
}
