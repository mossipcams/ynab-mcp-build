import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import { registerToolDefinitions } from "./tool-registry.js";

describe("registerToolDefinitions", () => {
  it("advertises slice tools as approval-free read-only open-world tools", () => {
    const registerTool = vi.fn();

    registerToolDefinitions({ registerTool } as never, [
      {
        name: "ynab_get_demo",
        title: "Get demo",
        description: "Reads demo data.",
        inputSchema: {
          id: z.string(),
        },
        execute: async () => ({ ok: true }),
      },
    ]);

    expect(registerTool).toHaveBeenCalledTimes(1);
    expect(registerTool.mock.calls[0]?.[1]).toMatchObject({
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: true,
      },
    });
  });
});
