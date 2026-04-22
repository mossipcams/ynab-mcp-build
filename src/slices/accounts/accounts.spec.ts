import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../../app/create-app.js";

function createTestEnv(): Env {
  return {
    MCP_SERVER_NAME: "ynab-mcp-build",
    MCP_SERVER_VERSION: "0.1.0",
    YNAB_API_BASE_URL: "https://api.ynab.com/v1"
  } as Env;
}

describe("accounts slice", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("lists accounts using the default plan when planId is omitted", async () => {
    const ynabClient = {
      listPlans: vi.fn().mockResolvedValue({
        plans: [{ id: "plan-1", name: "Household" }],
        defaultPlan: { id: "plan-1", name: "Household" }
      }),
      getUser: vi.fn(),
      getPlan: vi.fn(),
      listCategories: vi.fn(),
      getCategory: vi.fn(),
      getMonthCategory: vi.fn(),
      getPlanSettings: vi.fn(),
      listPlanMonths: vi.fn(),
      getPlanMonth: vi.fn(),
      listAccounts: vi.fn().mockResolvedValue([
        {
          id: "account-1",
          name: "Checking",
          type: "checking",
          closed: false,
          deleted: false,
          balance: 123450
        },
        {
          id: "account-2",
          name: "Savings",
          type: "savings",
          closed: false,
          deleted: false,
          balance: 999000
        }
      ]),
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
      name: "ynab_list_accounts",
      arguments: {}
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(ynabClient.listAccounts).toHaveBeenCalledWith("plan-1");
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      accounts: [
        {
          id: "account-1",
          name: "Checking",
          type: "checking",
          closed: false,
          balance: "123.45"
        },
        {
          id: "account-2",
          name: "Savings",
          type: "savings",
          closed: false,
          balance: "999.00"
        }
      ],
      account_count: 2
    });
  });

  it("supports pagination and field projection for account lists", async () => {
    const ynabClient = {
      listPlans: vi.fn(),
      getUser: vi.fn(),
      getPlan: vi.fn(),
      listCategories: vi.fn(),
      getCategory: vi.fn(),
      getMonthCategory: vi.fn(),
      getPlanSettings: vi.fn(),
      listPlanMonths: vi.fn(),
      getPlanMonth: vi.fn(),
      listAccounts: vi.fn().mockResolvedValue([
        {
          id: "account-1",
          name: "Checking",
          type: "checking",
          closed: false,
          deleted: false,
          balance: 123450
        },
        {
          id: "account-2",
          name: "Savings",
          type: "savings",
          closed: false,
          deleted: false,
          balance: 999000
        },
        {
          id: "account-3",
          name: "Credit Card",
          type: "creditCard",
          closed: true,
          deleted: false,
          balance: -45000
        }
      ]),
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
      name: "ynab_list_accounts",
      arguments: {
        planId: "plan-1",
        limit: 1,
        offset: 1,
        fields: ["name", "balance"],
        includeIds: false
      }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(JSON.parse(textContent!.text!)).toMatchObject({
      accounts: [
        {
          name: "Savings",
          balance: "999.00"
        }
      ],
      account_count: 3,
      limit: 1,
      offset: 1,
      returned_count: 1,
      has_more: true
    });
  });

  it("returns a compact single-account summary", async () => {
    const ynabClient = {
      listPlans: vi.fn().mockResolvedValue({
        plans: [{ id: "plan-1", name: "Household" }],
        defaultPlan: { id: "plan-1", name: "Household" }
      }),
      getUser: vi.fn(),
      getPlan: vi.fn(),
      listCategories: vi.fn(),
      getCategory: vi.fn(),
      getMonthCategory: vi.fn(),
      getPlanSettings: vi.fn(),
      listPlanMonths: vi.fn(),
      getPlanMonth: vi.fn(),
      listAccounts: vi.fn(),
      listTransactions: vi.fn(),
      getTransaction: vi.fn(),
      listScheduledTransactions: vi.fn(),
      getScheduledTransaction: vi.fn(),
      listPayees: vi.fn(),
      getPayee: vi.fn(),
      listPayeeLocations: vi.fn(),
      getPayeeLocation: vi.fn(),
      getPayeeLocationsByPayee: vi.fn(),
      getAccount: vi.fn().mockResolvedValue({
        id: "account-1",
        name: "Checking",
        type: "checking",
        onBudget: true,
        closed: false,
        balance: 123450
      })
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
      name: "ynab_get_account",
      arguments: {
        accountId: "account-1"
      }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(ynabClient.getAccount).toHaveBeenCalledWith("plan-1", "account-1");
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      account: {
        id: "account-1",
        name: "Checking",
        type: "checking",
        on_budget: true,
        closed: false,
        balance: "123.45"
      }
    });
  });
});
