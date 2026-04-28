import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AppDependencies } from "../app/dependencies.js";
import type { AppEnv } from "../shared/env.js";
import type { SliceToolDefinition } from "../shared/tool-definition.js";
import { registerSlices } from "./register-slices.js";
import { registerToolDefinitions } from "./tool-registry.js";

export function createMcpServer(
  env: AppEnv,
  dependencies: AppDependencies = {},
  toolDefinitions?: SliceToolDefinition[]
) {
  const server = new McpServer({
    name: env.mcpServerName,
    version: env.mcpServerVersion
  });

  if (toolDefinitions) {
    registerToolDefinitions(server, toolDefinitions);
  } else {
    registerSlices(server, env, dependencies);
  }

  return server;
}
