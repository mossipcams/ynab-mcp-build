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

describe("plans slice", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("returns plans through the MCP tool", async () => {
    const ynabClient = {
      listPlans: vi.fn().mockResolvedValue({
        plans: [
          {
            id: "plan-1",
            name: "Household",
            lastModifiedOn: "2026-04-01T00:00:00Z"
          },
          {
            id: "plan-2",
            name: "Business",
            lastModifiedOn: "2026-04-02T00:00:00Z"
          }
        ],
        defaultPlan: {
          id: "plan-1",
          name: "Household"
        }
      }),
      getUser: vi.fn(),
      getPlan: vi.fn(),
      listCategories: vi.fn(),
      getCategory: vi.fn(),
      getMonthCategory: vi.fn(),
      getPlanSettings: vi.fn(),
      listPlanMonths: vi.fn(),
      getPlanMonth: vi.fn(),
      listTransactions: vi.fn(),
      getTransaction: vi.fn(),
      listScheduledTransactions: vi.fn(),
      getScheduledTransaction: vi.fn(),
      listPayees: vi.fn(),
      getPayee: vi.fn(),
      listPayeeLocations: vi.fn(),
      getPayeeLocation: vi.fn(),
      getPayeeLocationsByPayee: vi.fn(),
      listAccounts: vi.fn(),
      getAccount: vi.fn()
    };
    const app = createApp({
      ynabClient
    });
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
      name: "ynab_list_plans",
      arguments: {}
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(ynabClient.listPlans).toHaveBeenCalledOnce();
    expect(textContent).toBeDefined();
    expect(textContent?.text).toBeDefined();
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      plans: [
        {
          id: "plan-1",
          name: "Household",
          last_modified_on: "2026-04-01T00:00:00Z"
        },
        {
          id: "plan-2",
          name: "Business",
          last_modified_on: "2026-04-02T00:00:00Z"
        }
      ],
      default_plan: {
        id: "plan-1",
        name: "Household"
      }
    });
  });

  it("returns a single plan through the MCP tool", async () => {
    const ynabClient = {
      listPlans: vi.fn(),
      getUser: vi.fn(),
      getPlan: vi.fn().mockResolvedValue({
        id: "plan-1",
        name: "Household",
        lastModifiedOn: "2026-04-01T00:00:00Z",
        firstMonth: "2026-01-01",
        lastMonth: "2026-12-01",
        accountCount: 5,
        categoryGroupCount: 12,
        payeeCount: 20
      }),
      listCategories: vi.fn(),
      getCategory: vi.fn(),
      getMonthCategory: vi.fn(),
      getPlanSettings: vi.fn(),
      listPlanMonths: vi.fn(),
      getPlanMonth: vi.fn(),
      listTransactions: vi.fn(),
      getTransaction: vi.fn(),
      listScheduledTransactions: vi.fn(),
      getScheduledTransaction: vi.fn(),
      listPayees: vi.fn(),
      getPayee: vi.fn(),
      listPayeeLocations: vi.fn(),
      getPayeeLocation: vi.fn(),
      getPayeeLocationsByPayee: vi.fn(),
      listAccounts: vi.fn(),
      getAccount: vi.fn()
    };
    const app = createApp({
      ynabClient
    });
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
      name: "ynab_get_plan",
      arguments: {
        planId: "plan-1"
      }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(ynabClient.getPlan).toHaveBeenCalledWith("plan-1");
    expect(textContent).toBeDefined();
    expect(textContent?.text).toBeDefined();
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      plan: {
        id: "plan-1",
        name: "Household",
        last_modified_on: "2026-04-01T00:00:00Z",
        first_month: "2026-01-01",
        last_month: "2026-12-01",
        account_count: 5,
        category_group_count: 12,
        payee_count: 20
      }
    });
  });

  it("returns visible category groups through the MCP tool", async () => {
    const ynabClient = {
      listPlans: vi.fn(),
      getUser: vi.fn(),
      getPlan: vi.fn(),
      listCategories: vi.fn().mockResolvedValue([
        {
          id: "group-1",
          name: "Bills",
          hidden: false,
          deleted: false,
          categories: [
            {
              id: "category-1",
              name: "Rent",
              hidden: false,
              deleted: false,
              categoryGroupName: "Bills"
            },
            {
              id: "category-2",
              name: "Archived",
              hidden: true,
              deleted: false,
              categoryGroupName: "Bills"
            }
          ]
        },
        {
          id: "group-2",
          name: "Old Group",
          hidden: true,
          deleted: false,
          categories: []
        }
      ]),
      getCategory: vi.fn(),
      getMonthCategory: vi.fn(),
      getPlanSettings: vi.fn(),
      listPlanMonths: vi.fn(),
      getPlanMonth: vi.fn(),
      listTransactions: vi.fn(),
      getTransaction: vi.fn(),
      listScheduledTransactions: vi.fn(),
      getScheduledTransaction: vi.fn(),
      listPayees: vi.fn(),
      getPayee: vi.fn(),
      listPayeeLocations: vi.fn(),
      getPayeeLocation: vi.fn(),
      getPayeeLocationsByPayee: vi.fn(),
      listAccounts: vi.fn(),
      getAccount: vi.fn()
    };
    const app = createApp({
      ynabClient
    });
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
      name: "ynab_list_categories",
      arguments: {
        planId: "plan-1"
      }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(ynabClient.listCategories).toHaveBeenCalledWith("plan-1");
    expect(textContent).toBeDefined();
    expect(textContent?.text).toBeDefined();
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      category_groups: [
        {
          id: "group-1",
          name: "Bills",
          categories: [
            {
              id: "category-1",
              name: "Rent"
            }
          ]
        }
      ],
      category_group_count: 1
    });
  });

  it("returns a compact category through the MCP tool", async () => {
    const ynabClient = {
      listPlans: vi.fn(),
      getUser: vi.fn(),
      getPlan: vi.fn(),
      listCategories: vi.fn(),
      getCategory: vi.fn().mockResolvedValue({
        id: "category-1",
        name: "Rent",
        hidden: false,
        categoryGroupName: "Bills",
        balance: 500000,
        goalType: "MF",
        goalTarget: 750000
      }),
      getMonthCategory: vi.fn(),
      getPlanSettings: vi.fn(),
      listPlanMonths: vi.fn(),
      getPlanMonth: vi.fn(),
      listTransactions: vi.fn(),
      getTransaction: vi.fn(),
      listScheduledTransactions: vi.fn(),
      getScheduledTransaction: vi.fn(),
      listPayees: vi.fn(),
      getPayee: vi.fn(),
      listPayeeLocations: vi.fn(),
      getPayeeLocation: vi.fn(),
      getPayeeLocationsByPayee: vi.fn(),
      listAccounts: vi.fn(),
      getAccount: vi.fn()
    };
    const app = createApp({
      ynabClient
    });
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
      name: "ynab_get_category",
      arguments: {
        planId: "plan-1",
        categoryId: "category-1"
      }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(ynabClient.getCategory).toHaveBeenCalledWith("plan-1", "category-1");
    expect(textContent).toBeDefined();
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      category: {
        id: "category-1",
        name: "Rent",
        hidden: false,
        category_group_name: "Bills",
        balance: 500000,
        goal_type: "MF",
        goal_target: 750000
      }
    });
  });

  it("returns a compact month category through the MCP tool", async () => {
    const ynabClient = {
      listPlans: vi.fn(),
      getUser: vi.fn(),
      getPlan: vi.fn(),
      listCategories: vi.fn(),
      getCategory: vi.fn(),
      getMonthCategory: vi.fn().mockResolvedValue({
        id: "category-1",
        name: "Rent",
        hidden: false,
        categoryGroupName: "Bills",
        budgeted: 200000,
        activity: -150000,
        balance: 550000,
        goalType: "MF",
        goalTarget: 750000,
        goalUnderFunded: 50000
      }),
      getPlanSettings: vi.fn(),
      listPlanMonths: vi.fn(),
      getPlanMonth: vi.fn(),
      listTransactions: vi.fn(),
      getTransaction: vi.fn(),
      listScheduledTransactions: vi.fn(),
      getScheduledTransaction: vi.fn(),
      listPayees: vi.fn(),
      getPayee: vi.fn(),
      listPayeeLocations: vi.fn(),
      getPayeeLocation: vi.fn(),
      getPayeeLocationsByPayee: vi.fn(),
      listAccounts: vi.fn(),
      getAccount: vi.fn()
    };
    const app = createApp({
      ynabClient
    });
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
      name: "ynab_get_month_category",
      arguments: {
        planId: "plan-1",
        month: "2026-04-01",
        categoryId: "category-1"
      }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(ynabClient.getMonthCategory).toHaveBeenCalledWith("plan-1", "2026-04-01", "category-1");
    expect(textContent).toBeDefined();
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      category: {
        id: "category-1",
        name: "Rent",
        hidden: false,
        category_group_name: "Bills",
        budgeted: 200000,
        activity: -150000,
        balance: 550000,
        goal_type: "MF",
        goal_target: 750000,
        goal_under_funded: 50000
      }
    });
  });

  it("returns plan settings through the MCP tool", async () => {
    const ynabClient = {
      listPlans: vi.fn(),
      getUser: vi.fn(),
      getPlan: vi.fn(),
      listCategories: vi.fn(),
      getCategory: vi.fn(),
      getMonthCategory: vi.fn(),
      getPlanSettings: vi.fn().mockResolvedValue({
        dateFormat: {
          format: "MM/DD/YYYY"
        },
        currencyFormat: {
          isoCode: "USD",
          exampleFormat: "$12,345.67",
          decimalDigits: 2,
          decimalSeparator: ".",
          symbolFirst: true,
          groupSeparator: ",",
          currencySymbol: "$",
          displaySymbol: true
        }
      }),
      listPlanMonths: vi.fn(),
      getPlanMonth: vi.fn(),
      listTransactions: vi.fn(),
      getTransaction: vi.fn(),
      listScheduledTransactions: vi.fn(),
      getScheduledTransaction: vi.fn(),
      listPayees: vi.fn(),
      getPayee: vi.fn(),
      listPayeeLocations: vi.fn(),
      getPayeeLocation: vi.fn(),
      getPayeeLocationsByPayee: vi.fn(),
      listAccounts: vi.fn(),
      getAccount: vi.fn()
    };
    const app = createApp({
      ynabClient
    });
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
      name: "ynab_get_plan_settings",
      arguments: {
        planId: "plan-1"
      }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(ynabClient.getPlanSettings).toHaveBeenCalledWith("plan-1");
    expect(textContent).toBeDefined();
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      settings: {
        date_format: {
          format: "MM/DD/YYYY"
        },
        currency_format: {
          iso_code: "USD",
          example_format: "$12,345.67",
          decimal_digits: 2,
          decimal_separator: ".",
          symbol_first: true,
          group_separator: ",",
          currency_symbol: "$",
          display_symbol: true
        }
      }
    });
  });

  it("returns visible plan months through the MCP tool", async () => {
    const ynabClient = {
      listPlans: vi.fn(),
      getUser: vi.fn(),
      getPlan: vi.fn(),
      listCategories: vi.fn(),
      getCategory: vi.fn(),
      getMonthCategory: vi.fn(),
      getPlanSettings: vi.fn(),
      listPlanMonths: vi.fn().mockResolvedValue([
        {
          month: "2026-03-01",
          income: 300000,
          budgeted: 250000,
          activity: -200000,
          toBeBudgeted: 50000,
          deleted: false
        },
        {
          month: "2026-02-01",
          income: 250000,
          budgeted: 200000,
          activity: -180000,
          toBeBudgeted: 20000,
          deleted: true
        }
      ]),
      getPlanMonth: vi.fn(),
      listTransactions: vi.fn(),
      getTransaction: vi.fn(),
      listScheduledTransactions: vi.fn(),
      getScheduledTransaction: vi.fn(),
      listPayees: vi.fn(),
      getPayee: vi.fn(),
      listPayeeLocations: vi.fn(),
      getPayeeLocation: vi.fn(),
      getPayeeLocationsByPayee: vi.fn(),
      listAccounts: vi.fn(),
      getAccount: vi.fn()
    };
    const app = createApp({
      ynabClient
    });
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
      name: "ynab_list_plan_months",
      arguments: {
        planId: "plan-1"
      }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(ynabClient.listPlanMonths).toHaveBeenCalledWith("plan-1");
    expect(textContent).toBeDefined();
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      months: [
        {
          month: "2026-03-01",
          income: 300000,
          budgeted: 250000,
          activity: -200000,
          to_be_budgeted: 50000
        }
      ],
      month_count: 1
    });
  });

  it("returns a compact plan month through the MCP tool", async () => {
    const ynabClient = {
      listPlans: vi.fn(),
      getUser: vi.fn(),
      getPlan: vi.fn(),
      listCategories: vi.fn(),
      getCategory: vi.fn(),
      getMonthCategory: vi.fn(),
      getPlanSettings: vi.fn(),
      listPlanMonths: vi.fn(),
      getPlanMonth: vi.fn().mockResolvedValue({
        month: "2026-03-01",
        income: 300000,
        budgeted: 250000,
        activity: -200000,
        toBeBudgeted: 50000,
        ageOfMoney: 27,
        categoryCount: 2
      }),
      listTransactions: vi.fn(),
      getTransaction: vi.fn(),
      listScheduledTransactions: vi.fn(),
      getScheduledTransaction: vi.fn(),
      listPayees: vi.fn(),
      getPayee: vi.fn(),
      listPayeeLocations: vi.fn(),
      getPayeeLocation: vi.fn(),
      getPayeeLocationsByPayee: vi.fn(),
      listAccounts: vi.fn(),
      getAccount: vi.fn()
    };
    const app = createApp({
      ynabClient
    });
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
      name: "ynab_get_plan_month",
      arguments: {
        planId: "plan-1",
        month: "2026-03-01"
      }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(ynabClient.getPlanMonth).toHaveBeenCalledWith("plan-1", "2026-03-01");
    expect(textContent).toBeDefined();
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      month: {
        month: "2026-03-01",
        income: 300000,
        budgeted: 250000,
        activity: -200000,
        to_be_budgeted: 50000,
        age_of_money: 27,
        category_count: 2
      }
    });
  });
});
