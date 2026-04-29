import { describe, expect, it } from "vitest";

import { toMcpErrorResult, toMcpTextResult } from "./results.js";

describe("mcp result helpers", () => {
  it("serializes payloads as MCP text content", () => {
    expect(toMcpTextResult({ hello: "world" })).toEqual({
      isError: false,
      structuredContent: {
        hello: "world"
      },
      content: [
        {
          type: "text",
          text: JSON.stringify({ hello: "world" })
        }
      ]
    });
  });

  it("marks error payloads with MCP error metadata", () => {
    expect(toMcpErrorResult(new Error("boom"))).toEqual({
      isError: true,
      structuredContent: {
        success: false,
        error: "boom"
      },
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: "boom"
          })
        }
      ]
    });
  });
});
