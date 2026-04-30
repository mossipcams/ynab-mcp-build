import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const mcpRoutePath = fileURLToPath(
  new URL("../http/routes/mcp.ts", import.meta.url),
);

describe("MCP HTTP boundary", () => {
  it("keeps streamable transport ownership in the HTTP route", async () => {
    const source = await readFile(mcpRoutePath, "utf8");

    expect(source).toContain("WebStandardStreamableHTTPServerTransport");
  });
});
