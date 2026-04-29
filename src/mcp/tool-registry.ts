import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { SliceToolDefinition } from "../shared/tool-definition.js";
import { toErrorResult, toTextResult } from "./results.js";

export function registerToolDefinitions(
  server: McpServer,
  definitions: SliceToolDefinition[],
) {
  for (const definition of definitions) {
    server.registerTool(
      definition.name,
      {
        title: definition.title,
        description: definition.description,
        inputSchema: definition.inputSchema,
        annotations: {
          readOnlyHint: true,
        },
      },
      async (input) => {
        try {
          return toTextResult(await definition.execute(input as never));
        } catch (error) {
          return toErrorResult(error);
        }
      },
    );
  }
}
