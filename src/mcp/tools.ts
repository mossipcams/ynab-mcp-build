import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { toMcpErrorResult, toMcpTextResult } from "./results.js";

export type McpToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: any;
  execute: (input: any) => Promise<unknown>;
};

export function registerMcpToolDefinitions(
  server: Pick<McpServer, "registerTool">,
  definitions: McpToolDefinition[]
) {
  for (const definition of definitions) {
    server.registerTool(
      definition.name,
      {
        title: definition.title,
        description: definition.description,
        inputSchema: definition.inputSchema
      },
      async (input: any) => {
        try {
          return toMcpTextResult(await definition.execute(input));
        } catch (error) {
          return toMcpErrorResult(error);
        }
      }
    );
  }
}
