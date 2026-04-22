import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../../app/create-app.js";

function createTestEnv(): Env {
  return {
    MCP_SERVER_NAME: "ynab-mcp-build",
    MCP_SERVER_VERSION: "0.1.0",
    YNAB_API_BASE_URL: "https://api.ynab.com/v1"
  } as unknown as Env;
}

describe("meta slice", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("returns the authenticated YNAB user", async () => {
    const ynabClient = {
      getUser: vi.fn().mockResolvedValue({
        id: "user-1",
        name: "Casey Budgeter"
      }),
      listPlans: vi.fn(),
      getPlan: vi.fn(),
      listCategories: vi.fn(),
      getCategory: vi.fn(),
      getMonthCategory: vi.fn(),
      getPlanSettings: vi.fn(),
      listPlanMonths: vi.fn(),
      getPlanMonth: vi.fn(),
      listAccounts: vi.fn(),
      getAccount: vi.fn(),
      listTransactions: vi.fn(),
      getTransaction: vi.fn(),
      listScheduledTransactions: vi.fn(),
      getScheduledTransaction: vi.fn(),
      listPayees: vi.fn(),
      getPayee: vi.fn(),
      listPayeeLocations: vi.fn(),
      getPayeeLocation: vi.fn(),
      getPayeeLocationsByPayee: vi.fn()
    };
    const app = createApp({ ynabClient });
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        return app.fetch(request, createTestEnv());
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
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(ynabClient.getUser).toHaveBeenCalledOnce();
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      user: {
        id: "user-1",
        name: "Casey Budgeter"
      }
    });
  });
});
