import { describe, expect, it } from "vitest";

import { toMcpErrorResult, toMcpTextResult } from "./results.js";

describe("mcp result helpers", () => {
  it("serializes payloads as MCP text content", () => {
    expect(toMcpTextResult({ hello: "world" })).toEqual({
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
