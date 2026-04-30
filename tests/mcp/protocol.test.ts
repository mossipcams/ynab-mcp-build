import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../src/app/create-app.js";
import { DISCOVERY_TOOL_NAMES } from "../../src/mcp/discovery.js";

function createFailingD1Database(message: string): D1Database {
  return {
    prepare() {
      const statement = {
        async all() {
          throw new Error(message);
        },
        bind() {
          return statement;
        },
      };

      return statement;
    },
  } as unknown as D1Database;
}

function createPlanD1Database(): D1Database {
  return {
    prepare(sql: string) {
      return {
        bind() {
          return this;
        },
        async all() {
          if (sql.includes("FROM ynab_plans")) {
            return {
              results: [
                {
                  id: "plan-1",
                  name: "Household",
                  last_modified_on: "2026-04-01T00:00:00.000Z",
                  deleted: 0,
                },
              ],
            };
          }

          return { results: [] };
        },
      };
    },
  } as unknown as D1Database;
}

function createEnv(overrides: Partial<Env> = {}): Env {
  return {
    MCP_SERVER_NAME: "ynab-mcp-build",
    MCP_SERVER_VERSION: "0.1.0",
    YNAB_API_BASE_URL: "https://api.ynab.com/v1",
    YNAB_DB: createPlanD1Database(),
    YNAB_READ_SOURCE: "d1",
    ...overrides,
  } as unknown as Env;
}

function createRawRpcRequest(body: unknown) {
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function parseFirstSseMessagePayload(rawBody: string) {
  const trimmed = rawBody.trim();

  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed) as {
      error?: {
        code?: number;
      };
      id?: number | string | null;
      jsonrpc?: string;
      result?: unknown;
    };
  }

  const dataLine = rawBody
    .split("\n")
    .find((line) => line.startsWith("data: "));

  if (!dataLine) {
    throw new Error(`Missing SSE data line in response body: ${rawBody}`);
  }

  return JSON.parse(dataLine.slice("data: ".length)) as {
    error?: {
      code?: number;
    };
    id?: number | string | null;
    jsonrpc?: string;
    result?: unknown;
  };
}

describe("mcp protocol", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("lists every registered slice tool with name, description, and input schema", async () => {
    // DEFECT: slice tools can drift out of MCP registration and silently disappear from discovery.
    const app = createApp();
    const transport = new StreamableHTTPClientTransport(
      new URL("http://localhost/mcp"),
      {
        fetch: async (input, init) => {
          const request =
            input instanceof Request ? input : new Request(input, init);
          return app.fetch(request, createEnv());
        },
      },
    );
    const client = new Client({
      name: "ynab-mcp-build-test-client",
      version: "1.0.0",
    });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport);

    const result = await client.listTools();

    expect(result.tools.map((tool) => tool.name).sort()).toEqual(
      [...DISCOVERY_TOOL_NAMES].sort(),
    );
    expect(
      result.tools.every(
        (tool) =>
          typeof tool.description === "string" && tool.description.length > 0,
      ),
    ).toBe(true);
    expect(
      result.tools.every(
        (tool) =>
          typeof tool.inputSchema === "object" && tool.inputSchema !== null,
      ),
    ).toBe(true);
    expect(
      result.tools.find((tool) => tool.name === "ynab_get_account")
        ?.inputSchema,
    ).toMatchObject({
      required: ["accountId"],
      type: "object",
    });
  });

  it("formats successful tool results as non-error text content blocks", async () => {
    // DEFECT: successful slice outputs can be wrapped in malformed MCP result envelopes and become unreadable to clients.
    const app = createApp();
    const transport = new StreamableHTTPClientTransport(
      new URL("http://localhost/mcp"),
      {
        fetch: async (input, init) => {
          const request =
            input instanceof Request ? input : new Request(input, init);
          return app.fetch(request, createEnv());
        },
      },
    );
    const client = new Client({
      name: "ynab-mcp-build-test-client",
      version: "1.0.0",
    });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport);

    const result = await client.callTool({
      name: "ynab_list_plans",
      arguments: {},
    });

    expect(result.isError).toBe(false);
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toMatchObject({
      type: "text",
    });
  });

  it("formats thrown tool errors as MCP error results with a human-readable message", async () => {
    // DEFECT: slice failures can escape as transport exceptions instead of structured MCP tool errors.
    const app = createApp();
    const transport = new StreamableHTTPClientTransport(
      new URL("http://localhost/mcp"),
      {
        fetch: async (input, init) => {
          const request =
            input instanceof Request ? input : new Request(input, init);
          return app.fetch(
            request,
            createEnv({
              YNAB_DB: createFailingD1Database("Upstream auth_client failure"),
            }),
          );
        },
      },
    );
    const client = new Client({
      name: "ynab-mcp-build-test-client",
      version: "1.0.0",
    });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport);

    const result = await client.callTool({
      name: "ynab_list_plans",
      arguments: {},
    });
    const textContent = result.content.find((entry) => entry.type === "text");

    expect(result.isError).toBe(true);
    expect(textContent).toBeDefined();
    expect((textContent as { text: string }).text).toContain(
      "Upstream auth_client failure",
    );
  });

  it("returns a JSON-RPC error when the client calls an unknown tool name", async () => {
    // DEFECT: invalid tool names can bypass JSON-RPC validation and fail with ambiguous transport errors.
    const app = createApp();
    const response = await app.fetch(
      createRawRpcRequest({
        id: 7,
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "ynab_missing_tool",
          arguments: {},
        },
      }),
      createEnv(),
    );
    const payload = parseFirstSseMessagePayload(await response.text());

    expect(payload.jsonrpc).toBe("2.0");
    expect(payload.id).toBe(7);
    expect(payload.error?.code).toBe(-32602);
  });

  it("echoes string JSON-RPC ids unchanged in direct tool calls", async () => {
    // DEFECT: JSON-RPC ids can be normalized or dropped, breaking client request correlation.
    const app = createApp();
    const response = await app.fetch(
      createRawRpcRequest({
        id: "request-123",
        jsonrpc: "2.0",
        method: "tools/list",
        params: {},
      }),
      createEnv(),
    );
    const payload = parseFirstSseMessagePayload(await response.text());

    expect(payload.jsonrpc).toBe("2.0");
    expect(payload.id).toBe("request-123");
    expect(payload.result).toBeDefined();
  });

  it("echoes numeric JSON-RPC ids unchanged in successful direct tool calls", async () => {
    // DEFECT: numeric JSON-RPC ids can be normalized during successful tool execution and break response correlation for non-string clients.
    const app = createApp();
    const response = await app.fetch(
      createRawRpcRequest({
        id: 42,
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "ynab_list_plans",
          arguments: {},
        },
      }),
      createEnv(),
    );
    const payload = parseFirstSseMessagePayload(await response.text());

    expect(payload.jsonrpc).toBe("2.0");
    expect(payload.id).toBe(42);
    expect(payload.result).toBeDefined();
  });

  it("returns a JSON-RPC invalid-params error when tool arguments fail the input schema", async () => {
    // DEFECT: malformed tool arguments can bypass schema validation and reach slice handlers with missing required fields.
    const app = createApp();
    const response = await app.fetch(
      createRawRpcRequest({
        id: 9,
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "ynab_get_account",
          arguments: {},
        },
      }),
      createEnv(),
    );
    const payload = parseFirstSseMessagePayload(await response.text());

    expect(payload.jsonrpc).toBe("2.0");
    expect(payload.id).toBe(9);
    expect(payload.error?.code).toBe(-32602);
    expect(
      (payload.error as { message?: string } | undefined)?.message,
    ).toContain("accountId");
  });
});
