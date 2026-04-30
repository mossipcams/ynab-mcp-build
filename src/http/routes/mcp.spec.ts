import { describe, expect, it, vi } from "vitest";

import { createApp } from "../../app/create-app.js";

function createEnv(): Env {
  return {
    MCP_SERVER_NAME: "ynab-mcp-build",
    MCP_SERVER_VERSION: "0.1.0",
    YNAB_API_BASE_URL: "https://api.ynab.com/v1",
    YNAB_DB: {} as D1Database,
    YNAB_READ_SOURCE: "d1",
  } as unknown as Env;
}

async function readFirstChunk(response: Response) {
  const reader = response.body?.getReader();

  if (!reader) {
    return "";
  }

  const result = await Promise.race([
    reader.read(),
    new Promise<ReadableStreamReadResult<Uint8Array>>((resolve) => {
      setTimeout(() => resolve({ done: true, value: undefined }), 25);
    }),
  ]);

  await reader.cancel();

  return result.done ? "" : new TextDecoder().decode(result.value);
}

describe("http mcp route optimization", () => {
  it("emits an immediate SSE heartbeat for standalone GET streams", async () => {
    const app = createApp();

    const response = await app.request(
      "http://localhost/mcp",
      {
        headers: {
          accept: "text/event-stream",
        },
        method: "GET",
      },
      createEnv(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    await expect(readFirstChunk(response)).resolves.toBe(": connected\n\n");
  });

  it("reuses tool definitions between route validation and MCP server registration", async () => {
    const now = vi.fn(() => 1777406400000);
    const app = createApp({ now });

    const response = await app.request(
      "http://localhost/mcp",
      {
        body: JSON.stringify({
          id: "call-1",
          jsonrpc: "2.0",
          method: "tools/list",
        }),
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        method: "POST",
      },
      createEnv(),
    );

    expect(response.status).toBe(200);
    expect(now).not.toHaveBeenCalled();
  });

  it("rejects oversized JSON bodies before creating MCP dependencies", async () => {
    const now = vi.fn(() => 1777406400000);
    const app = createApp({ now });
    const response = await app.request(
      "http://localhost/mcp",
      {
        body: JSON.stringify({
          id: "oversized-call",
          jsonrpc: "2.0",
          method: "tools/list",
          padding: "x".repeat(1024 * 1024 + 1),
          params: {},
        }),
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        method: "POST",
      },
      createEnv(),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: "request_too_large",
    });
    expect(now).not.toHaveBeenCalled();
  });
});
