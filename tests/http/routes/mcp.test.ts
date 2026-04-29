import { describe, expect, it } from "vitest";

import { createApp } from "../../../src/app/create-app.js";

function createEnv(): Env {
  return {
    MCP_SERVER_NAME: "ynab-mcp-build",
    MCP_SERVER_VERSION: "0.1.0",
    YNAB_API_BASE_URL: "https://api.ynab.com/v1",
    YNAB_DB: {} as D1Database,
    YNAB_READ_SOURCE: "d1"
  } as unknown as Env;
}

function parseSseDataMessages(body: string) {
  return body
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice("data: ".length)) as { jsonrpc?: string });
}

describe("http mcp route", () => {
  it("establishes a stream on GET /mcp when the client accepts event streams", async () => {
    // DEFECT: the route can stop exposing the streamable HTTP entrypoint and break clients before any JSON-RPC exchange happens.
    const app = createApp();

    const response = await app.request(
      "http://localhost/mcp",
      {
        headers: {
          accept: "text/event-stream"
        },
        method: "GET"
      },
      createEnv()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
  });

  it("returns an event-stream JSON-RPC message for direct POST tool requests", async () => {
    // DEFECT: direct POST handling can stop emitting complete JSON-RPC stream frames and break non-SDK MCP clients.
    const app = createApp();

    const response = await app.request(
      "http://localhost/mcp",
      {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          id: "route-check-1",
          jsonrpc: "2.0",
          method: "tools/list",
          params: {}
        })
      },
      createEnv()
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(body).toContain("event: message");
    expect(body).toContain('"jsonrpc":"2.0"');
    expect(body).toContain('"id":"route-check-1"');
  });

  it("emits complete parseable JSON-RPC payloads in each SSE data chunk", async () => {
    // DEFECT: the streamable transport can split JSON-RPC frames across chunks and leave clients with unparseable partial messages.
    const app = createApp();

    const response = await app.request(
      "http://localhost/mcp",
      {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          id: "route-check-2",
          jsonrpc: "2.0",
          method: "tools/list",
          params: {}
        })
      },
      createEnv()
    );
    const body = await response.text();
    const messages = parseSseDataMessages(body);

    expect(response.status).toBe(200);
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.every((message) => message.jsonrpc === "2.0")).toBe(true);
  });

  it("returns a JSON-RPC parse error for malformed POST bodies", async () => {
    // DEFECT: malformed JSON can escape route-level validation and fail as an opaque transport exception instead of a JSON-RPC parse error.
    const app = createApp();

    const response = await app.request(
      "http://localhost/mcp",
      {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json"
        },
        body: "{not-json"
      },
      createEnv()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: -32700
      },
      id: null,
      jsonrpc: "2.0"
    });
  });

  it("rejects GET /mcp when the client does not accept event streams", async () => {
    // DEFECT: GET stream setup can proceed without the required Accept header and leave clients in an invalid half-negotiated state.
    const app = createApp();

    const response = await app.request(
      "http://localhost/mcp",
      {
        headers: {
          accept: "application/json"
        },
        method: "GET"
      },
      createEnv()
    );

    expect(response.status).toBe(406);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: -32000
      },
      id: null,
      jsonrpc: "2.0"
    });
  });
});
