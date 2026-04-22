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

describe("transactions slice", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("lists transactions using the default plan when planId is omitted", async () => {
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
      getAccount: vi.fn(),
      listTransactions: vi.fn().mockResolvedValue([
        {
          id: "transaction-1",
          date: "2026-03-15",
          amount: -123450,
          payeeName: "Groceries",
          categoryName: "Food",
          accountName: "Checking",
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: null
        },
        {
          id: "transaction-2",
          date: "2026-03-13",
          amount: -4500,
          payeeName: "Coffee",
          categoryName: "Dining Out",
          accountName: "Checking",
          approved: true,
          cleared: "uncleared",
          deleted: false,
          transferAccountId: null
        },
        {
          id: "transaction-3",
          date: "2026-03-14",
          amount: -1000,
          payeeName: "Hidden",
          categoryName: "Misc",
          accountName: "Checking",
          approved: false,
          cleared: "cleared",
          deleted: true,
          transferAccountId: null
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
      name: "ynab_list_transactions",
      arguments: {}
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(ynabClient.listTransactions).toHaveBeenCalledWith("plan-1", undefined);
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      transactions: [
        {
          id: "transaction-1",
          date: "2026-03-15",
          amount: "-123.45",
          payee_name: "Groceries",
          category_name: "Food",
          account_name: "Checking",
          approved: true,
          cleared: "cleared"
        },
        {
          id: "transaction-2",
          date: "2026-03-13",
          amount: "-4.50",
          payee_name: "Coffee",
          category_name: "Dining Out",
          account_name: "Checking",
          approved: true,
          cleared: "uncleared"
        }
      ],
      transaction_count: 2
    });
  });

  it("supports pagination and field projection for transaction lists", async () => {
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
      listAccounts: vi.fn(),
      getAccount: vi.fn(),
      listTransactions: vi.fn().mockResolvedValue([
        {
          id: "transaction-1",
          date: "2026-03-15",
          amount: -123450,
          payeeName: "Groceries",
          categoryName: "Food",
          accountName: "Checking",
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: null
        },
        {
          id: "transaction-2",
          date: "2026-03-14",
          amount: -4500,
          payeeName: "Coffee",
          categoryName: "Dining Out",
          accountName: "Checking",
          approved: true,
          cleared: "uncleared",
          deleted: false,
          transferAccountId: null
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
      name: "ynab_list_transactions",
      arguments: {
        planId: "plan-1",
        limit: 1,
        offset: 1,
        fields: ["date", "amount", "payee_name"],
        includeIds: false
      }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(JSON.parse(textContent!.text!)).toMatchObject({
      transactions: [
        {
          date: "2026-03-14",
          amount: "-4.50",
          payee_name: "Coffee"
        }
      ],
      transaction_count: 2,
      limit: 1,
      offset: 1,
      returned_count: 1,
      has_more: false
    });
  });

  it("returns a compact single transaction summary", async () => {
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
      getAccount: vi.fn(),
      listTransactions: vi.fn(),
      listScheduledTransactions: vi.fn(),
      getScheduledTransaction: vi.fn(),
      listPayees: vi.fn(),
      getPayee: vi.fn(),
      listPayeeLocations: vi.fn(),
      getPayeeLocation: vi.fn(),
      getPayeeLocationsByPayee: vi.fn(),
      getTransaction: vi.fn().mockResolvedValue({
        id: "transaction-1",
        date: "2026-03-15",
        amount: -123450,
        payeeName: "Groceries",
        categoryName: "Food",
        accountName: "Checking",
        approved: true,
        cleared: "cleared",
        deleted: false,
        transferAccountId: null
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
      name: "ynab_get_transaction",
      arguments: {
        transactionId: "transaction-1"
      }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(ynabClient.getTransaction).toHaveBeenCalledWith("plan-1", "transaction-1");
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      transaction: {
        id: "transaction-1",
        date: "2026-03-15",
        amount: "-123.45",
        payee_name: "Groceries",
        category_name: "Food",
        account_name: "Checking",
        approved: true,
        cleared: "cleared"
      }
    });
  });

  it("searches transactions with filtering, sorting, and compact output", async () => {
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
      listAccounts: vi.fn(),
      getAccount: vi.fn(),
      listTransactions: vi.fn().mockResolvedValue([
        {
          id: "transaction-1",
          date: "2026-03-15",
          amount: -123450,
          payeeId: "payee-1",
          payeeName: "Groceries",
          categoryId: "category-1",
          categoryName: "Food",
          accountId: "account-1",
          accountName: "Checking",
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: null
        },
        {
          id: "transaction-2",
          date: "2026-03-20",
          amount: -4500,
          payeeId: "payee-2",
          payeeName: "Coffee",
          categoryId: "category-1",
          categoryName: "Food",
          accountId: "account-1",
          accountName: "Checking",
          approved: true,
          cleared: "uncleared",
          deleted: false,
          transferAccountId: null
        },
        {
          id: "transaction-3",
          date: "2026-03-21",
          amount: -250000,
          payeeId: "payee-1",
          payeeName: "Transfer",
          categoryId: "category-2",
          categoryName: "Savings",
          accountId: "account-1",
          accountName: "Checking",
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: "account-2"
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
      name: "ynab_search_transactions",
      arguments: {
        planId: "plan-1",
        fromDate: "2026-03-01",
        toDate: "2026-03-31",
        accountId: "account-1",
        categoryId: "category-1",
        approved: true,
        minAmount: -200000,
        maxAmount: -1000,
        includeTransfers: false,
        sort: "amount_asc",
        limit: 1,
        offset: 0,
        fields: ["date", "amount", "payee_name"],
        includeIds: false
      }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(ynabClient.listTransactions).toHaveBeenCalledWith("plan-1", "2026-03-01");
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      transactions: [
        {
          date: "2026-03-15",
          amount: "-123.45",
          payee_name: "Groceries"
        }
      ],
      match_count: 2,
      limit: 1,
      offset: 0,
      returned_count: 1,
      has_more: true,
      filters: {
        from_date: "2026-03-01",
        to_date: "2026-03-31",
        account_id: "account-1",
        category_id: "category-1",
        approved: true,
        min_amount: "-200.00",
        max_amount: "-1.00",
        include_transfers: false,
        sort: "amount_asc"
      }
    });
  });

  it("returns transactions for a specific month", async () => {
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
      listAccounts: vi.fn(),
      getAccount: vi.fn(),
      listTransactions: vi.fn().mockResolvedValue([
        {
          id: "transaction-1",
          date: "2026-03-15",
          amount: -123450,
          payeeName: "Groceries",
          categoryName: "Food",
          accountName: "Checking",
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: null
        },
        {
          id: "transaction-2",
          date: "2026-03-05",
          amount: -4500,
          payeeName: "Coffee",
          categoryName: "Dining Out",
          accountName: "Checking",
          approved: true,
          cleared: "uncleared",
          deleted: false,
          transferAccountId: null
        },
        {
          id: "transaction-3",
          date: "2026-04-02",
          amount: -2200,
          payeeName: "Snacks",
          categoryName: "Dining Out",
          accountName: "Checking",
          approved: true,
          cleared: "uncleared",
          deleted: false,
          transferAccountId: null
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
      name: "ynab_get_transactions_by_month",
      arguments: {
        planId: "plan-1",
        month: "2026-03-01"
      }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(ynabClient.listTransactions).toHaveBeenCalledWith("plan-1", "2026-03-01");
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      transactions: [
        {
          id: "transaction-1",
          date: "2026-03-15",
          amount: "-123.45"
        },
        {
          id: "transaction-2",
          date: "2026-03-05",
          amount: "-4.50"
        }
      ],
      transaction_count: 2
    });
  });

  it("returns transactions for a specific account", async () => {
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
      listAccounts: vi.fn(),
      getAccount: vi.fn(),
      listTransactions: vi.fn().mockResolvedValue([
        {
          id: "transaction-1",
          date: "2026-03-15",
          amount: -123450,
          accountId: "account-1",
          payeeName: "Groceries",
          categoryName: "Food",
          accountName: "Checking",
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: null
        },
        {
          id: "transaction-2",
          date: "2026-03-14",
          amount: -4500,
          accountId: "account-2",
          payeeName: "Coffee",
          categoryName: "Dining Out",
          accountName: "Savings",
          approved: true,
          cleared: "uncleared",
          deleted: false,
          transferAccountId: null
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
      name: "ynab_get_transactions_by_account",
      arguments: {
        planId: "plan-1",
        accountId: "account-1"
      }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(ynabClient.listTransactions).toHaveBeenCalledWith("plan-1", undefined);
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      transactions: [
        {
          id: "transaction-1",
          account_name: "Checking"
        }
      ],
      transaction_count: 1
    });
  });

  it("returns transactions for a specific category", async () => {
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
      listAccounts: vi.fn(),
      getAccount: vi.fn(),
      listTransactions: vi.fn().mockResolvedValue([
        {
          id: "transaction-1",
          date: "2026-03-15",
          amount: -123450,
          categoryId: "category-1",
          payeeName: "Groceries",
          categoryName: "Food",
          accountName: "Checking",
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: null
        },
        {
          id: "transaction-2",
          date: "2026-03-14",
          amount: -4500,
          categoryId: "category-2",
          payeeName: "Coffee",
          categoryName: "Dining Out",
          accountName: "Checking",
          approved: true,
          cleared: "uncleared",
          deleted: false,
          transferAccountId: null
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
      name: "ynab_get_transactions_by_category",
      arguments: {
        planId: "plan-1",
        categoryId: "category-1"
      }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(ynabClient.listTransactions).toHaveBeenCalledWith("plan-1", undefined);
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      transactions: [
        {
          id: "transaction-1",
          category_name: "Food"
        }
      ],
      transaction_count: 1
    });
  });

  it("returns transactions for a specific payee", async () => {
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
      listAccounts: vi.fn(),
      getAccount: vi.fn(),
      listTransactions: vi.fn().mockResolvedValue([
        {
          id: "transaction-1",
          date: "2026-03-15",
          amount: -123450,
          payeeId: "payee-1",
          payeeName: "Groceries",
          categoryName: "Food",
          accountName: "Checking",
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: null
        },
        {
          id: "transaction-2",
          date: "2026-03-14",
          amount: -4500,
          payeeId: "payee-2",
          payeeName: "Coffee",
          categoryName: "Dining Out",
          accountName: "Checking",
          approved: true,
          cleared: "uncleared",
          deleted: false,
          transferAccountId: null
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
      name: "ynab_get_transactions_by_payee",
      arguments: {
        planId: "plan-1",
        payeeId: "payee-1"
      }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(ynabClient.listTransactions).toHaveBeenCalledWith("plan-1", undefined);
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      transactions: [
        {
          id: "transaction-1",
          payee_name: "Groceries"
        }
      ],
      transaction_count: 1
    });
  });

  it("lists scheduled transactions with compact output", async () => {
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
      getAccount: vi.fn(),
      listTransactions: vi.fn(),
      getTransaction: vi.fn(),
      listScheduledTransactions: vi.fn().mockResolvedValue([
        {
          id: "scheduled-1",
          dateFirst: "2026-03-01",
          dateNext: "2026-04-01",
          amount: -750000,
          payeeName: "Rent",
          categoryName: "Housing",
          accountName: "Checking",
          deleted: false
        },
        {
          id: "scheduled-2",
          dateFirst: "2026-03-05",
          dateNext: "2026-04-05",
          amount: -150000,
          payeeName: "Insurance",
          categoryName: "Bills",
          accountName: "Checking",
          deleted: true
        }
      ]),
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
      name: "ynab_list_scheduled_transactions",
      arguments: {}
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(ynabClient.listScheduledTransactions).toHaveBeenCalledWith("plan-1");
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      scheduled_transactions: [
        {
          id: "scheduled-1",
          date_first: "2026-03-01",
          date_next: "2026-04-01",
          amount: "-750.00",
          payee_name: "Rent",
          category_name: "Housing",
          account_name: "Checking"
        }
      ],
      scheduled_transaction_count: 1
    });
  });

  it("returns a compact single scheduled transaction summary", async () => {
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
      getAccount: vi.fn(),
      listTransactions: vi.fn(),
      getTransaction: vi.fn(),
      listScheduledTransactions: vi.fn(),
      getScheduledTransaction: vi.fn().mockResolvedValue({
        id: "scheduled-1",
        dateFirst: "2026-03-01",
        dateNext: "2026-04-01",
        amount: -750000,
        payeeName: "Rent",
        categoryName: "Housing",
        accountName: "Checking",
        deleted: false
      }),
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
      name: "ynab_get_scheduled_transaction",
      arguments: {
        scheduledTransactionId: "scheduled-1"
      }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(ynabClient.getScheduledTransaction).toHaveBeenCalledWith("plan-1", "scheduled-1");
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      scheduled_transaction: {
        id: "scheduled-1",
        date_first: "2026-03-01",
        date_next: "2026-04-01",
        amount: "-750.00",
        payee_name: "Rent",
        category_name: "Housing",
        account_name: "Checking"
      }
    });
  });
});
