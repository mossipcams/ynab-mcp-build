import { describe, expect, it } from "vitest";

import { createApp } from "../app/create-app.js";

describe("MCP route chaos", () => {
  it("returns a stable JSON error when route dependencies cannot be created", async () => {
    const app = createApp();
    const response = await app.request(
      "http://localhost/mcp",
      {
        body: JSON.stringify({
          id: "call-1",
          jsonrpc: "2.0",
          method: "tools/list",
          params: {}
        }),
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json"
        },
        method: "POST"
      },
      {
        MCP_SERVER_NAME: "ynab-mcp-build",
        MCP_SERVER_VERSION: "0.1.0",
        YNAB_API_BASE_URL: "https://api.ynab.com/v1",
        YNAB_READ_SOURCE: "d1"
      } as unknown as Env
    );

    await expect(response.json()).resolves.toEqual({
      error: "mcp_request_failed",
      error_description: "YNAB_DB is required when YNAB_READ_SOURCE=d1."
    });
    expect(response.status).toBe(500);
  });
});
