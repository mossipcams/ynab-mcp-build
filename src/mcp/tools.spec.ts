import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import type { SliceToolDefinition } from "../shared/tool-definition.js";
import { registerToolDefinitions } from "./tool-registry.js";

describe("registerToolDefinitions", () => {
  it("registers tool definitions with MCP handlers", async () => {
    const registerTool = vi.fn();
    const server = { registerTool };
    const definitions: SliceToolDefinition[] = [
      {
        name: "demo_tool",
        title: "Demo Tool",
        description: "Does demo work.",
        inputSchema: {
          query: z.string(),
        },
        execute: async ({ query }) => ({ echoed: query }),
      },
    ];

    registerToolDefinitions(server as never, definitions);

    expect(registerTool).toHaveBeenCalledTimes(1);

    const [name, config, handler] = registerTool.mock.calls[0]!;
    expect(name).toBe("demo_tool");
    expect(config).toMatchObject({
      title: "Demo Tool",
      description: "Does demo work.",
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
    });
    await expect(handler({ query: "hello" })).resolves.toEqual({
      isError: false,
      structuredContent: {
        echoed: "hello",
      },
      content: [
        {
          type: "text",
          text: JSON.stringify({ echoed: "hello" }),
        },
      ],
    });
  });

  it("wraps handler failures as MCP errors", async () => {
    const registerTool = vi.fn();
    const server = { registerTool };
    const definitions: SliceToolDefinition[] = [
      {
        name: "failing_tool",
        title: "Failing Tool",
        description: "Fails on purpose.",
        inputSchema: {},
        execute: async () => {
          throw new Error("broken");
        },
      },
    ];

    registerToolDefinitions(server as never, definitions);

    const [, , handler] = registerTool.mock.calls[0]!;
    await expect(handler({})).resolves.toEqual({
      isError: true,
      structuredContent: {
        success: false,
        error: "broken",
      },
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: "broken",
          }),
        },
      ],
    });
  });
});
