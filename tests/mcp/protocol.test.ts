import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../src/app/create-app.js";
import { DISCOVERY_TOOL_NAMES } from "../../src/mcp/discovery.js";

function createEnv(): Env {
  return {
    MCP_SERVER_NAME: "ynab-mcp-build",
    MCP_SERVER_VERSION: "0.1.0",
    YNAB_API_BASE_URL: "https://api.ynab.com/v1"
  } as unknown as Env;
}

function createRawRpcRequest(body: unknown) {
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
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
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        return app.fetch(request, createEnv());
      }
    });
    const client = new Client({
      name: "ynab-mcp-build-test-client",
      version: "1.0.0"
    });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport);

    const result = await client.listTools();

    expect(result.tools.map((tool) => tool.name).sort()).toEqual([...DISCOVERY_TOOL_NAMES].sort());
    expect(result.tools.every((tool) => typeof tool.description === "string" && tool.description.length > 0)).toBe(true);
    expect(result.tools.every((tool) => typeof tool.inputSchema === "object" && tool.inputSchema !== null)).toBe(true);
    expect(result.tools.find((tool) => tool.name === "ynab_get_account")?.inputSchema).toMatchObject({
      required: ["accountId"],
      type: "object"
    });
  });

  it("formats successful tool results as non-error text content blocks", async () => {
    // DEFECT: successful slice outputs can be wrapped in malformed MCP result envelopes and become unreadable to clients.
    const app = createApp();
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        return app.fetch(request, createEnv());
      }
    });
    const client = new Client({
      name: "ynab-mcp-build-test-client",
      version: "1.0.0"
    });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport);

    const result = await client.callTool({
      name: "ynab_get_mcp_version",
      arguments: {}
    });

    expect(result.isError).toBe(false);
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toMatchObject({
      type: "text"
    });
  });

  it("formats thrown tool errors as MCP error results with a human-readable message", async () => {
    // DEFECT: slice failures can escape as transport exceptions instead of structured MCP tool errors.
    const app = createApp({
      ynabClient: {
        getUser: async () => {
          throw new Error("Upstream auth_client failure");
        },
        listPlans: async () => [],
        getPlan: async () => ({ id: "plan-1", name: "Plan" }),
        listCategories: async () => [],
        getCategory: async () => ({ id: "category-1", hidden: false, name: "Category" }),
        getMonthCategory: async () => ({ id: "category-1", hidden: false, name: "Category" }),
        getPlanSettings: async () => ({}),
        listPlanMonths: async () => [],
        getPlanMonth: async () => ({ month: "2026-04-01" }),
        listAccounts: async () => [],
        getAccount: async () => ({ closed: false, id: "account-1", name: "Checking", type: "checking" }),
        listTransactions: async () => [],
        getTransaction: async () => ({ amount: 0, date: "2026-04-01", id: "txn-1" }),
        listScheduledTransactions: async () => [],
        getScheduledTransaction: async () => ({ amount: 0, dateFirst: "2026-04-01", id: "sched-1" }),
        listPayees: async () => [],
        getPayee: async () => ({ id: "payee-1", name: "Payee" }),
        listPayeeLocations: async () => [],
        getPayeeLocation: async () => ({ id: "location-1" }),
        getPayeeLocationsByPayee: async () => []
      }
    });
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        return app.fetch(request, createEnv());
      }
    });
    const client = new Client({
      name: "ynab-mcp-build-test-client",
      version: "1.0.0"
    });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport);

    const result = await client.callTool({
      name: "ynab_get_user",
      arguments: {}
    });
    const textContent = result.content.find((entry) => entry.type === "text");

    expect(result.isError).toBe(true);
    expect(textContent).toBeDefined();
    expect((textContent as { text: string }).text).toContain("Upstream auth_client failure");
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
          arguments: {}
        }
      }),
      createEnv()
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
        params: {}
      }),
      createEnv()
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
          name: "ynab_get_mcp_version",
          arguments: {}
        }
      }),
      createEnv()
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
          arguments: {}
        }
      }),
      createEnv()
    );
    const payload = parseFirstSseMessagePayload(await response.text());

    expect(payload.jsonrpc).toBe("2.0");
    expect(payload.id).toBe(9);
    expect(payload.error?.code).toBe(-32602);
    expect((payload.error as { message?: string } | undefined)?.message).toContain("accountId");
  });
});
