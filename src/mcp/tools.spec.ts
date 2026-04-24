import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import { registerMcpToolDefinitions, type McpToolDefinition } from "./tools.js";

describe("registerMcpToolDefinitions", () => {
  it("registers tool definitions with MCP handlers", async () => {
    const registerTool = vi.fn();
    const server = { registerTool };
    const definitions: McpToolDefinition[] = [
      {
        name: "demo_tool",
        title: "Demo Tool",
        description: "Does demo work.",
        inputSchema: {
          query: z.string()
        },
        execute: async ({ query }) => ({ echoed: query })
      }
    ];

    registerMcpToolDefinitions(server, definitions);

    expect(registerTool).toHaveBeenCalledTimes(1);

    const [name, config, handler] = registerTool.mock.calls[0]!;
    expect(name).toBe("demo_tool");
    expect(config).toMatchObject({
      title: "Demo Tool",
      description: "Does demo work."
    });
    await expect(handler({ query: "hello" })).resolves.toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({ echoed: "hello" })
        }
      ]
    });
  });

  it("wraps handler failures as MCP errors", async () => {
    const registerTool = vi.fn();
    const server = { registerTool };
    const definitions: McpToolDefinition[] = [
      {
        name: "failing_tool",
        title: "Failing Tool",
        description: "Fails on purpose.",
        inputSchema: {},
        execute: async () => {
          throw new Error("broken");
        }
      }
    ];

    registerMcpToolDefinitions(server, definitions);

    const [, , handler] = registerTool.mock.calls[0]!;
    await expect(handler({})).resolves.toEqual({
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: "broken"
          })
        }
      ]
    });
  });
});
