import { describe, expect, it, vi } from "vitest";

const sdkMocks = vi.hoisted(() => ({
  constructedTransportCount: 0,
  registeredToolNames: [] as string[],
}));

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class {
    async connect(transport: { start(): Promise<void> }) {
      await transport.start();
    }

    registerTool(name: string) {
      sdkMocks.registeredToolNames.push(name);
    }
  },
}));

vi.mock(
  "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js",
  () => ({
    WebStandardStreamableHTTPServerTransport: class {
      constructor() {
        sdkMocks.constructedTransportCount += 1;
      }

      async start() {
        return undefined;
      }

      async handleRequest() {
        return Response.json({
          ok: true,
        });
      }
    },
  }),
);

function createEnv(): Env {
  return {
    MCP_SERVER_NAME: "ynab-mcp-build",
    MCP_SERVER_VERSION: "0.1.0",
    YNAB_API_BASE_URL: "https://api.ynab.com/v1",
    YNAB_DB: {
      prepare() {
        throw new Error("The SDK registration test should not query D1.");
      },
    } as unknown as D1Database,
    YNAB_DEFAULT_PLAN_ID: "plan-1",
    YNAB_READ_SOURCE: "d1",
  } as unknown as Env;
}

describe("http mcp route SDK path optimization", () => {
  it("keeps direct tools/call on the SDK path while registering only the called tool", async () => {
    const { createApp } = await import("../../app/create-app.js");
    const app = createApp();

    const response = await app.request(
      "http://localhost/mcp",
      {
        body: JSON.stringify({
          id: "sdk-call-1",
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            arguments: {},
            name: "ynab_list_plans",
          },
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
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(sdkMocks.constructedTransportCount).toBe(1);
    expect(sdkMocks.registeredToolNames).toEqual(["ynab_list_plans"]);
  });
});
