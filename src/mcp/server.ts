import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AppDependencies } from "../app/dependencies.js";
import type { AppEnv } from "../shared/env.js";
import { registerSlices } from "./register-slices.js";

export function createMcpServer(env: AppEnv, dependencies: AppDependencies = {}) {
  const server = new McpServer({
    name: env.mcpServerName,
    version: env.mcpServerVersion
  });

  registerSlices(server, env, dependencies);

  return server;
}
