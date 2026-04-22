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

function createBaseClient() {
  return {
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
        id: "account-checking",
        name: "Checking",
        type: "checking",
        closed: false,
        deleted: false,
        balance: 1250000
      },
      {
        id: "account-savings",
        name: "Savings",
        type: "savings",
        closed: false,
        deleted: false,
        balance: 8400000
      },
      {
        id: "account-visa",
        name: "Visa",
        type: "creditCard",
        closed: false,
        deleted: false,
        balance: -240000
      }
    ]),
    getAccount: vi.fn(),
    listTransactions: vi.fn().mockResolvedValue([
      {
        id: "txn-paycheck",
        date: "2026-03-25",
        amount: 2500000,
        payeeId: "payee-employer",
        payeeName: "Employer",
        accountId: "account-checking",
        accountName: "Checking",
        approved: true,
        cleared: "cleared",
        deleted: false,
        transferAccountId: null
      },
      {
        id: "txn-savings-out",
        date: "2026-03-21",
        amount: -125000,
        payeeId: "payee-savings",
        payeeName: "Transfer : Savings",
        accountId: "account-checking",
        accountName: "Checking",
        approved: true,
        cleared: "cleared",
        deleted: false,
        transferAccountId: "account-savings"
      },
      {
        id: "txn-savings-in",
        date: "2026-03-21",
        amount: 125000,
        payeeId: "payee-savings",
        payeeName: "Transfer : Checking",
        accountId: "account-savings",
        accountName: "Savings",
        approved: true,
        cleared: "cleared",
        deleted: false,
        transferAccountId: "account-checking"
      },
      {
        id: "txn-visa-out",
        date: "2026-03-18",
        amount: -40000,
        payeeId: "payee-visa",
        payeeName: "Transfer : Visa",
        accountId: "account-checking",
        accountName: "Checking",
        approved: true,
        cleared: "cleared",
        deleted: false,
        transferAccountId: "account-visa"
      },
      {
        id: "txn-visa-in",
        date: "2026-03-18",
        amount: 40000,
        payeeId: "payee-visa",
        payeeName: "Transfer : Checking",
        accountId: "account-visa",
        accountName: "Visa",
        approved: true,
        cleared: "cleared",
        deleted: false,
        transferAccountId: "account-checking"
      },
      {
        id: "txn-deleted-transfer",
        date: "2026-03-17",
        amount: -10000,
        payeeId: "payee-old",
        payeeName: "Transfer : Closed",
        accountId: "account-checking",
        accountName: "Checking",
        approved: true,
        cleared: "cleared",
        deleted: true,
        transferAccountId: "account-savings"
      }
    ]),
    getTransaction: vi.fn(),
    listScheduledTransactions: vi.fn(),
    getScheduledTransaction: vi.fn(),
    listPayees: vi.fn(),
    getPayee: vi.fn(),
    listPayeeLocations: vi.fn(),
    getPayeeLocation: vi.fn(),
    getPayeeLocationsByPayee: vi.fn()
  };
}

describe("money movements slice", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("lists money movements using the default plan when planId is omitted", async () => {
    const ynabClient = createBaseClient();
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
      name: "ynab_get_money_movements",
      arguments: {}
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(ynabClient.listTransactions).toHaveBeenCalledWith("plan-1", undefined);
    expect(ynabClient.listAccounts).toHaveBeenCalledWith("plan-1");
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      money_movements: [
        {
          id: "txn-savings-out",
          date: "2026-03-21",
          amount: "125.00",
          from_account_name: "Checking",
          to_account_name: "Savings"
        },
        {
          id: "txn-visa-out",
          date: "2026-03-18",
          amount: "40.00",
          from_account_name: "Checking",
          to_account_name: "Visa"
        }
      ],
      movement_count: 2
    });
  });

  it("lists money movements for a single month", async () => {
    const ynabClient = createBaseClient();
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
      name: "ynab_get_money_movements_by_month",
      arguments: {
        month: "2026-03-01"
      }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(ynabClient.listTransactions).toHaveBeenCalledWith("plan-1", "2026-03-01");
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      month: "2026-03-01",
      movement_count: 2
    });
  });

  it("groups money movements by account pair", async () => {
    const ynabClient = createBaseClient();
    ynabClient.listTransactions.mockResolvedValue([
      {
        id: "txn-savings-out-1",
        date: "2026-03-21",
        amount: -125000,
        payeeName: "Transfer : Savings",
        accountId: "account-checking",
        accountName: "Checking",
        approved: true,
        cleared: "cleared",
        deleted: false,
        transferAccountId: "account-savings"
      },
      {
        id: "txn-savings-out-2",
        date: "2026-03-10",
        amount: -25000,
        payeeName: "Transfer : Savings",
        accountId: "account-checking",
        accountName: "Checking",
        approved: true,
        cleared: "cleared",
        deleted: false,
        transferAccountId: "account-savings"
      },
      {
        id: "txn-visa-out",
        date: "2026-03-18",
        amount: -40000,
        payeeName: "Transfer : Visa",
        accountId: "account-checking",
        accountName: "Checking",
        approved: true,
        cleared: "cleared",
        deleted: false,
        transferAccountId: "account-visa"
      }
    ]);
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
      name: "ynab_get_money_movement_groups",
      arguments: {
        planId: "plan-1"
      }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(JSON.parse(textContent!.text!)).toMatchObject({
      money_movement_groups: [
        {
          id: "account-checking:account-savings",
          from_account_name: "Checking",
          to_account_name: "Savings",
          total_amount: "150.00",
          movement_count: 2,
          latest_date: "2026-03-21"
        },
        {
          id: "account-checking:account-visa",
          from_account_name: "Checking",
          to_account_name: "Visa",
          total_amount: "40.00",
          movement_count: 1,
          latest_date: "2026-03-18"
        }
      ],
      group_count: 2
    });
  });

  it("groups money movements for a single month", async () => {
    const ynabClient = createBaseClient();
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
      name: "ynab_get_money_movement_groups_by_month",
      arguments: {
        month: "2026-03-01"
      }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(ynabClient.listTransactions).toHaveBeenCalledWith("plan-1", "2026-03-01");
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      month: "2026-03-01",
      group_count: 2
    });
  });
});
