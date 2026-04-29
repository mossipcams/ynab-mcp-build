import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AppEnv } from "../shared/env.js";
import type { SliceToolDefinition } from "../shared/tool-definition.js";
import { registerSlices } from "./register-slices.js";

export function createMcpServer(
  env: AppEnv,
  toolDefinitions: SliceToolDefinition[],
) {
  const server = new McpServer({
    name: env.mcpServerName,
    version: env.mcpServerVersion,
  });

  registerSlices(server, toolDefinitions);

  return server;
}
