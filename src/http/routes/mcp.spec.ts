import { describe, expect, it, vi } from "vitest";

import { createApp } from "../../app/create-app.js";
import type { YnabClient } from "../../platform/ynab/client.js";

function createEnv(): Env {
  return {
    MCP_SERVER_NAME: "ynab-mcp-build",
    MCP_SERVER_VERSION: "0.1.0",
    YNAB_API_BASE_URL: "https://api.ynab.com/v1"
  } as unknown as Env;
}

describe("http mcp route optimization", () => {
  it("reuses tool definitions between route validation and MCP server registration", async () => {
    const resolveClient = vi.fn(() => ({}) as YnabClient);
    const app = createApp({
      get ynabClient() {
        return resolveClient();
      }
    });

    const response = await app.request(
      "http://localhost/mcp",
      {
        body: JSON.stringify({
          id: "call-1",
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            arguments: {},
            name: "ynab_get_mcp_version"
          }
        }),
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json"
        },
        method: "POST"
      },
      createEnv()
    );

    expect(response.status).toBe(200);
    expect(resolveClient).toHaveBeenCalledTimes(1);
  });
});
