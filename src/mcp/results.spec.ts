import { describe, expect, it } from "vitest";

import { toErrorResult, toTextResult } from "./results.js";

describe("mcp result helpers", () => {
  it("serializes payloads as MCP text content", () => {
    expect(toTextResult({ hello: "world" })).toEqual({
      isError: false,
      structuredContent: {
        hello: "world",
      },
      content: [
        {
          type: "text",
          text: JSON.stringify({ hello: "world" }),
        },
      ],
    });
  });

  it("marks error payloads with MCP error metadata", () => {
    expect(toErrorResult(new Error("boom"))).toEqual({
      isError: true,
      structuredContent: {
        success: false,
        error: "boom",
      },
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: "boom",
          }),
        },
      ],
    });
  });
});
