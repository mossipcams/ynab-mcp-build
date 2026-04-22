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

function createBaseClient() {
  return {
    listPlans: vi.fn().mockResolvedValue({
      plans: [{ id: "plan-1", name: "Household" }],
      defaultPlan: { id: "plan-1", name: "Household" }
    }),
    getUser: vi.fn(),
    getPlan: vi.fn(),
    listCategories: vi.fn().mockResolvedValue([
      {
        id: "group-bills",
        name: "Bills",
        hidden: false,
        deleted: false,
        categories: [
          {
            id: "category-rent",
            name: "Rent",
            hidden: false,
            deleted: false,
            categoryGroupName: "Bills"
          }
        ]
      },
      {
        id: "group-food",
        name: "Food",
        hidden: false,
        deleted: false,
        categories: [
          {
            id: "category-groceries",
            name: "Groceries",
            hidden: false,
            deleted: false,
            categoryGroupName: "Food"
          },
          {
            id: "category-dining",
            name: "Dining Out",
            hidden: false,
            deleted: false,
            categoryGroupName: "Food"
          }
        ]
      },
      {
        id: "group-goals",
        name: "Goals",
        hidden: false,
        deleted: false,
        categories: [
          {
            id: "category-vacation",
            name: "Vacation",
            hidden: false,
            deleted: false,
            categoryGroupName: "Goals"
          }
        ]
      }
    ]),
    getCategory: vi.fn(),
    getMonthCategory: vi.fn(),
    getPlanSettings: vi.fn(),
    listPlanMonths: vi.fn().mockResolvedValue([
      {
        month: "2026-03-01",
        income: 500000,
        budgeted: 300000,
        activity: -230000,
        toBeBudgeted: 70000,
        deleted: false
      }
    ]),
    getPlanMonth: vi.fn().mockResolvedValue({
      month: "2026-03-01",
      income: 500000,
      budgeted: 300000,
      activity: -230000,
      toBeBudgeted: 70000,
      ageOfMoney: 32,
      categoryCount: 4,
      categories: [
        {
          id: "category-rent",
          name: "Rent",
          budgeted: 120000,
          activity: -120000,
          balance: 120000,
          hidden: false,
          deleted: false,
          goalUnderFunded: 0,
          categoryGroupName: "Bills"
        },
        {
          id: "category-groceries",
          name: "Groceries",
          budgeted: 45000,
          activity: -75000,
          balance: -30000,
          hidden: false,
          deleted: false,
          goalUnderFunded: 10000,
          categoryGroupName: "Food"
        },
        {
          id: "category-vacation",
          name: "Vacation",
          budgeted: 30000,
          activity: -25000,
          balance: 5000,
          hidden: false,
          deleted: false,
          goalUnderFunded: 40000,
          categoryGroupName: "Goals"
        },
        {
          id: "category-hidden",
          name: "Hidden",
          budgeted: 10000,
          activity: -20000,
          balance: -10000,
          hidden: true,
          deleted: false,
          goalUnderFunded: 5000,
          categoryGroupName: "Hidden"
        }
      ]
    }),
    listAccounts: vi.fn().mockResolvedValue([
      {
        id: "account-checking",
        name: "Checking",
        type: "checking",
        onBudget: true,
        closed: false,
        deleted: false,
        balance: 250000
      },
      {
        id: "account-savings",
        name: "Savings",
        type: "savings",
        onBudget: true,
        closed: false,
        deleted: false,
        balance: 900000
      },
      {
        id: "account-visa",
        name: "Visa",
        type: "creditCard",
        onBudget: true,
        closed: false,
        deleted: false,
        balance: -200000
      }
    ]),
    getAccount: vi.fn(),
    listTransactions: vi.fn().mockResolvedValue([
      {
        id: "txn-income",
        date: "2026-03-02",
        amount: 500000,
        payeeName: "Employer",
        categoryId: null,
        categoryName: null,
        accountId: "account-checking",
        accountName: "Checking",
        approved: true,
        cleared: "cleared",
        deleted: false,
        transferAccountId: null
      },
      {
        id: "txn-rent",
        date: "2026-03-05",
        amount: -120000,
        payeeName: "Landlord",
        categoryId: "category-rent",
        categoryName: "Rent",
        accountId: "account-checking",
        accountName: "Checking",
        approved: true,
        cleared: "cleared",
        deleted: false,
        transferAccountId: null
      },
      {
        id: "txn-grocery",
        date: "2026-03-10",
        amount: -30000,
        payeeName: "Grocer",
        categoryId: "category-groceries",
        categoryName: "Groceries",
        accountId: "account-checking",
        accountName: "Checking",
        approved: false,
        cleared: "uncleared",
        deleted: false,
        transferAccountId: null
      },
      {
        id: "txn-transfer",
        date: "2026-03-12",
        amount: -50000,
        payeeName: "Transfer : Savings",
        categoryId: null,
        categoryName: null,
        accountId: "account-checking",
        accountName: "Checking",
        approved: true,
        cleared: "cleared",
        deleted: false,
        transferAccountId: "account-savings"
      },
      {
        id: "txn-cafe",
        date: "2026-03-14",
        amount: -8000,
        payeeName: "Cafe",
        categoryId: null,
        categoryName: null,
        accountId: "account-checking",
        accountName: "Checking",
        approved: true,
        cleared: "cleared",
        deleted: false,
        transferAccountId: null
      }
    ]),
    getTransaction: vi.fn(),
    listScheduledTransactions: vi.fn().mockResolvedValue([
      {
        id: "sched-rent",
        dateFirst: "2026-01-15",
        dateNext: "2026-03-15",
        amount: -100000,
        payeeName: "Landlord",
        categoryName: "Rent",
        accountName: "Checking",
        deleted: false
      },
      {
        id: "sched-paycheck",
        dateFirst: "2026-01-20",
        dateNext: "2026-03-20",
        amount: 50000,
        payeeName: "Employer",
        categoryName: "Inflow: Ready to Assign",
        accountName: "Checking",
        deleted: false
      },
      {
        id: "sched-gym",
        dateFirst: "2026-01-05",
        dateNext: "2026-04-05",
        amount: -45000,
        payeeName: "Gym",
        categoryName: "Health",
        accountName: "Checking",
        deleted: false
      },
      {
        id: "sched-hidden",
        dateFirst: "2026-01-10",
        dateNext: "2026-03-18",
        amount: -20000,
        payeeName: "Hidden",
        categoryName: "Misc",
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
}

describe("financial health slice", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("returns a compact financial snapshot", async () => {
    const ynabClient = createBaseClient();
    const app = createApp({ ynabClient });
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        return app.fetch(request, createTestEnv());
      }
    });
    const client = new Client({ name: "ynab-mcp-build-test-client", version: "1.0.0" });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport);

    const result = await client.callTool({
      name: "ynab_get_financial_snapshot",
      arguments: { month: "2026-03-01" }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(ynabClient.listAccounts).toHaveBeenCalledWith("plan-1");
    expect(ynabClient.getPlanMonth).toHaveBeenCalledWith("plan-1", "2026-03-01");
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      month: "2026-03-01",
      net_worth: "950.00",
      liquid_cash: "1150.00",
      debt: "200.00",
      ready_to_assign: "70.00",
      income: "500.00",
      assigned: "300.00",
      spent: "230.00",
      assigned_vs_spent: "70.00",
      age_of_money: 32,
      account_count: 3,
      on_budget_account_count: 3,
      debt_account_count: 1
    });
  });

  it("returns a compact budget health summary", async () => {
    const ynabClient = createBaseClient();
    const app = createApp({ ynabClient });
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        return app.fetch(request, createTestEnv());
      }
    });
    const client = new Client({ name: "ynab-mcp-build-test-client", version: "1.0.0" });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport);

    const result = await client.callTool({
      name: "ynab_get_budget_health_summary",
      arguments: { month: "2026-03-01", topN: 2 }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(JSON.parse(textContent!.text!)).toMatchObject({
      month: "2026-03-01",
      age_of_money: 32,
      ready_to_assign: "70.00",
      available_total: "125.00",
      overspent_total: "30.00",
      underfunded_total: "50.00",
      assigned: "300.00",
      spent: "230.00",
      assigned_vs_spent: "70.00",
      overspent_category_count: 1,
      underfunded_category_count: 2,
      top_overspent_categories: [
        {
          id: "category-groceries",
          name: "Groceries",
          category_group_name: "Food",
          amount: "30.00"
        }
      ],
      top_underfunded_categories: [
        {
          id: "category-vacation",
          name: "Vacation",
          category_group_name: "Goals",
          amount: "40.00"
        },
        {
          id: "category-groceries",
          name: "Groceries",
          category_group_name: "Food",
          amount: "10.00"
        }
      ]
    });
  });

  it("returns a compact financial health check", async () => {
    const ynabClient = createBaseClient();
    const app = createApp({ ynabClient });
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        return app.fetch(request, createTestEnv());
      }
    });
    const client = new Client({ name: "ynab-mcp-build-test-client", version: "1.0.0" });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport);

    const result = await client.callTool({
      name: "ynab_get_financial_health_check",
      arguments: { month: "2026-03-01", topN: 3 }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(ynabClient.listTransactions).toHaveBeenCalledWith("plan-1", "2026-03-01");
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      as_of_month: "2026-03-01",
      status: "watch",
      score: 70,
      metrics: {
        net_worth: "950.00",
        liquid_cash: "1150.00",
        debt: "200.00",
        ready_to_assign: "70.00",
        age_of_money: 32,
        overspent_category_count: 1,
        underfunded_category_count: 2,
        uncategorized_transaction_count: 2,
        unapproved_transaction_count: 1,
        uncleared_transaction_count: 1
      },
      top_risks: [
        { code: "overspent_categories", severity: "high" },
        { code: "goal_underfunding", severity: "medium" },
        { code: "cleanup_backlog", severity: "medium" }
      ]
    });
  });

  it("returns a compact monthly review", async () => {
    const ynabClient = createBaseClient();
    const app = createApp({ ynabClient });
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        return app.fetch(request, createTestEnv());
      }
    });
    const client = new Client({ name: "ynab-mcp-build-test-client", version: "1.0.0" });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport);

    const result = await client.callTool({
      name: "ynab_get_monthly_review",
      arguments: { month: "2026-03-01", topN: 2 }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(JSON.parse(textContent!.text!)).toMatchObject({
      month: "2026-03-01",
      income: "500.00",
      inflow: "500.00",
      outflow: "158.00",
      net_flow: "342.00",
      ready_to_assign: "70.00",
      available_total: "125.00",
      overspent_total: "30.00",
      underfunded_total: "50.00",
      assigned: "300.00",
      spent: "230.00",
      assigned_vs_spent: "70.00",
      top_spending_categories: [
        {
          id: "category-rent",
          name: "Rent",
          amount: "120.00",
          transaction_count: 1
        },
        {
          id: "category-groceries",
          name: "Groceries",
          amount: "30.00",
          transaction_count: 1
        }
      ]
    });
  });

  it("returns a compact cash flow summary across a month range", async () => {
    const ynabClient = createBaseClient();
    ynabClient.listPlanMonths.mockResolvedValue([
      {
        month: "2026-02-01",
        income: 450000,
        budgeted: 280000,
        activity: -210000,
        toBeBudgeted: 60000,
        deleted: false
      },
      {
        month: "2026-03-01",
        income: 500000,
        budgeted: 300000,
        activity: -230000,
        toBeBudgeted: 70000,
        deleted: false
      }
    ]);
    ynabClient.listTransactions.mockResolvedValue([
      {
        id: "txn-feb-income",
        date: "2026-02-02",
        amount: 450000,
        payeeName: "Employer",
        accountId: "account-checking",
        accountName: "Checking",
        approved: true,
        cleared: "cleared",
        deleted: false,
        transferAccountId: null
      },
      {
        id: "txn-feb-spend",
        date: "2026-02-12",
        amount: -90000,
        payeeName: "Bills",
        categoryId: "category-rent",
        categoryName: "Rent",
        accountId: "account-checking",
        accountName: "Checking",
        approved: true,
        cleared: "cleared",
        deleted: false,
        transferAccountId: null
      },
      {
        id: "txn-mar-income",
        date: "2026-03-02",
        amount: 500000,
        payeeName: "Employer",
        accountId: "account-checking",
        accountName: "Checking",
        approved: true,
        cleared: "cleared",
        deleted: false,
        transferAccountId: null
      },
      {
        id: "txn-mar-spend",
        date: "2026-03-10",
        amount: -158000,
        payeeName: "Mixed",
        categoryId: "category-groceries",
        categoryName: "Groceries",
        accountId: "account-checking",
        accountName: "Checking",
        approved: true,
        cleared: "cleared",
        deleted: false,
        transferAccountId: null
      },
      {
        id: "txn-mar-transfer",
        date: "2026-03-15",
        amount: -50000,
        payeeName: "Transfer : Savings",
        accountId: "account-checking",
        accountName: "Checking",
        approved: true,
        cleared: "cleared",
        deleted: false,
        transferAccountId: "account-savings"
      }
    ]);
    const app = createApp({ ynabClient });
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        return app.fetch(request, createTestEnv());
      }
    });
    const client = new Client({ name: "ynab-mcp-build-test-client", version: "1.0.0" });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport);

    const result = await client.callTool({
      name: "ynab_get_cash_flow_summary",
      arguments: { fromMonth: "2026-02-01", toMonth: "2026-03-01" }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(JSON.parse(textContent!.text!)).toMatchObject({
      from_month: "2026-02-01",
      to_month: "2026-03-01",
      inflow: "950.00",
      outflow: "248.00",
      net_flow: "702.00",
      assigned: "580.00",
      spent: "440.00",
      assigned_vs_spent: "140.00",
      periods: [
        {
          month: "2026-02-01",
          inflow: "450.00",
          outflow: "90.00",
          net_flow: "360.00",
          assigned: "280.00",
          spent: "210.00",
          assigned_vs_spent: "70.00"
        },
        {
          month: "2026-03-01",
          inflow: "500.00",
          outflow: "158.00",
          net_flow: "342.00",
          assigned: "300.00",
          spent: "230.00",
          assigned_vs_spent: "70.00"
        }
      ]
    });
  });

  it("returns a compact spending summary across a month range", async () => {
    const ynabClient = createBaseClient();
    ynabClient.listPlanMonths.mockResolvedValue([
      {
        month: "2026-02-01",
        income: 450000,
        budgeted: 280000,
        activity: -210000,
        toBeBudgeted: 60000,
        deleted: false
      },
      {
        month: "2026-03-01",
        income: 500000,
        budgeted: 300000,
        activity: -230000,
        toBeBudgeted: 70000,
        deleted: false
      }
    ]);
    ynabClient.listTransactions.mockResolvedValue([
      {
        id: "txn-rent",
        date: "2026-02-05",
        amount: -120000,
        payeeId: "payee-landlord",
        payeeName: "Landlord",
        categoryId: "category-rent",
        categoryName: "Rent",
        accountId: "account-checking",
        accountName: "Checking",
        approved: true,
        cleared: "cleared",
        deleted: false,
        transferAccountId: null
      },
      {
        id: "txn-groceries",
        date: "2026-03-10",
        amount: -75000,
        payeeId: "payee-grocer",
        payeeName: "Grocer",
        categoryId: "category-groceries",
        categoryName: "Groceries",
        accountId: "account-checking",
        accountName: "Checking",
        approved: true,
        cleared: "cleared",
        deleted: false,
        transferAccountId: null
      },
      {
        id: "txn-vacation",
        date: "2026-03-16",
        amount: -25000,
        payeeId: "payee-airline",
        payeeName: "Airline",
        categoryId: "category-vacation",
        categoryName: "Vacation",
        accountId: "account-checking",
        accountName: "Checking",
        approved: true,
        cleared: "cleared",
        deleted: false,
        transferAccountId: null
      },
      {
        id: "txn-transfer",
        date: "2026-03-20",
        amount: -40000,
        payeeName: "Transfer : Savings",
        accountId: "account-checking",
        accountName: "Checking",
        approved: true,
        cleared: "cleared",
        deleted: false,
        transferAccountId: "account-savings"
      }
    ]);
    const app = createApp({ ynabClient });
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        return app.fetch(request, createTestEnv());
      }
    });
    const client = new Client({ name: "ynab-mcp-build-test-client", version: "1.0.0" });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport);

    const result = await client.callTool({
      name: "ynab_get_spending_summary",
      arguments: { fromMonth: "2026-02-01", toMonth: "2026-03-01", topN: 2 }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(JSON.parse(textContent!.text!)).toMatchObject({
      from_month: "2026-02-01",
      to_month: "2026-03-01",
      assigned: "580.00",
      spent: "220.00",
      assigned_vs_spent: "360.00",
      transaction_count: 3,
      average_transaction: "73.33",
      top_categories: [
        { id: "category-rent", name: "Rent", amount: "120.00", transaction_count: 1 },
        { id: "category-groceries", name: "Groceries", amount: "75.00", transaction_count: 1 }
      ],
      top_category_groups: [
        { name: "Bills", amount: "120.00" },
        { name: "Food", amount: "75.00" }
      ],
      top_payees: [
        { id: "payee-landlord", name: "Landlord", amount: "120.00", transaction_count: 1 },
        { id: "payee-grocer", name: "Grocer", amount: "75.00", transaction_count: 1 }
      ]
    });
  });

  it("returns compact spending anomalies against a trailing baseline", async () => {
    const ynabClient = createBaseClient();
    ynabClient.listPlanMonths.mockResolvedValue([
      { month: "2026-01-01", income: 400000, budgeted: 250000, activity: -180000, toBeBudgeted: 50000, deleted: false },
      { month: "2026-02-01", income: 450000, budgeted: 280000, activity: -210000, toBeBudgeted: 60000, deleted: false },
      { month: "2026-03-01", income: 500000, budgeted: 300000, activity: -230000, toBeBudgeted: 70000, deleted: false }
    ]);
    ynabClient.getPlanMonth.mockImplementation(async (_planId: string, month: string) => {
      if (month === "2026-01-01") {
        return {
          month,
          categories: [
            { id: "category-groceries", name: "Groceries", budgeted: 30000, activity: -20000, balance: 10000, hidden: false, deleted: false, categoryGroupName: "Food" },
            { id: "category-vacation", name: "Vacation", budgeted: 10000, activity: -10000, balance: 0, hidden: false, deleted: false, categoryGroupName: "Goals" }
          ]
        };
      }
      if (month === "2026-02-01") {
        return {
          month,
          categories: [
            { id: "category-groceries", name: "Groceries", budgeted: 35000, activity: -25000, balance: 10000, hidden: false, deleted: false, categoryGroupName: "Food" },
            { id: "category-vacation", name: "Vacation", budgeted: 15000, activity: -15000, balance: 0, hidden: false, deleted: false, categoryGroupName: "Goals" }
          ]
        };
      }

      return {
        month,
        categories: [
          { id: "category-groceries", name: "Groceries", budgeted: 45000, activity: -75000, balance: -30000, hidden: false, deleted: false, categoryGroupName: "Food" },
          { id: "category-vacation", name: "Vacation", budgeted: 30000, activity: -25000, balance: 5000, hidden: false, deleted: false, categoryGroupName: "Goals" }
        ]
      };
    });
    const app = createApp({ ynabClient });
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        return app.fetch(request, createTestEnv());
      }
    });
    const client = new Client({ name: "ynab-mcp-build-test-client", version: "1.0.0" });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport);

    const result = await client.callTool({
      name: "ynab_get_spending_anomalies",
      arguments: { latestMonth: "2026-03-01", baselineMonths: 2, topN: 3, thresholdMultiplier: 1.5, minimumDifference: 30000 }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(JSON.parse(textContent!.text!)).toMatchObject({
      latest_month: "2026-03-01",
      baseline_month_count: 2,
      anomaly_count: 1,
      anomalies: [
        {
          category_id: "category-groceries",
          category_name: "Groceries",
          latest_spent: "75.00",
          baseline_average: "22.50",
          increase: "52.50",
          increase_pct: "233.33"
        }
      ]
    });
  });

  it("returns a compact category trend summary", async () => {
    const ynabClient = createBaseClient();
    ynabClient.listPlanMonths.mockResolvedValue([
      { month: "2026-01-01", income: 400000, budgeted: 250000, activity: -180000, toBeBudgeted: 50000, deleted: false },
      { month: "2026-02-01", income: 450000, budgeted: 280000, activity: -210000, toBeBudgeted: 60000, deleted: false },
      { month: "2026-03-01", income: 500000, budgeted: 300000, activity: -230000, toBeBudgeted: 70000, deleted: false }
    ]);
    ynabClient.getPlanMonth.mockImplementation(async (_planId: string, month: string) => {
      const data = new Map([
        [
          "2026-01-01",
          [
            { id: "category-groceries", name: "Groceries", budgeted: 30000, activity: -20000, balance: 10000, hidden: false, deleted: false, categoryGroupName: "Food" },
            { id: "category-dining", name: "Dining Out", budgeted: 15000, activity: -12000, balance: 3000, hidden: false, deleted: false, categoryGroupName: "Food" }
          ]
        ],
        [
          "2026-02-01",
          [
            { id: "category-groceries", name: "Groceries", budgeted: 35000, activity: -25000, balance: 10000, hidden: false, deleted: false, categoryGroupName: "Food" },
            { id: "category-dining", name: "Dining Out", budgeted: 18000, activity: -10000, balance: 8000, hidden: false, deleted: false, categoryGroupName: "Food" }
          ]
        ],
        [
          "2026-03-01",
          [
            { id: "category-groceries", name: "Groceries", budgeted: 45000, activity: -75000, balance: -30000, hidden: false, deleted: false, categoryGroupName: "Food" },
            { id: "category-dining", name: "Dining Out", budgeted: 20000, activity: -15000, balance: 5000, hidden: false, deleted: false, categoryGroupName: "Food" }
          ]
        ]
      ]);

      return { month, categories: data.get(month) ?? [] };
    });
    const app = createApp({ ynabClient });
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        return app.fetch(request, createTestEnv());
      }
    });
    const client = new Client({ name: "ynab-mcp-build-test-client", version: "1.0.0" });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport);

    const result = await client.callTool({
      name: "ynab_get_category_trend_summary",
      arguments: { fromMonth: "2026-01-01", toMonth: "2026-03-01", categoryGroupName: "Food" }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(JSON.parse(textContent!.text!)).toMatchObject({
      from_month: "2026-01-01",
      to_month: "2026-03-01",
      scope: { type: "category_group", name: "Food", match_basis: "category_group_name" },
      average_spent: "52.33",
      peak_month: "2026-03-01",
      spent_change: "58.00",
      periods: [
        { month: "2026-01-01", assigned: "45.00", spent: "32.00", available: "13.00" },
        { month: "2026-02-01", assigned: "53.00", spent: "35.00", available: "18.00" },
        { month: "2026-03-01", assigned: "65.00", spent: "90.00", available: "-25.00" }
      ]
    });
  });

  it("returns a compact cash runway estimate", async () => {
    const ynabClient = createBaseClient();
    ynabClient.listPlanMonths.mockResolvedValue([
      { month: "2026-02-01", income: 450000, budgeted: 280000, activity: -210000, toBeBudgeted: 60000, deleted: false },
      { month: "2026-03-01", income: 500000, budgeted: 300000, activity: -230000, toBeBudgeted: 70000, deleted: false }
    ]);
    const app = createApp({ ynabClient });
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        return app.fetch(request, createTestEnv());
      }
    });
    const client = new Client({ name: "ynab-mcp-build-test-client", version: "1.0.0" });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport);

    const result = await client.callTool({
      name: "ynab_get_cash_runway",
      arguments: { asOfMonth: "2026-03-01", monthsBack: 2 }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(JSON.parse(textContent!.text!)).toMatchObject({
      as_of_month: "2026-03-01",
      liquid_cash: "1150.00",
      average_daily_outflow: "7.33",
      scheduled_net_next_30d: "-50.00",
      runway_days: "156.82",
      status: "stable",
      months_considered: 2
    });
  });

  it("returns compact upcoming obligations windows", async () => {
    const ynabClient = createBaseClient();
    const app = createApp({ ynabClient });
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        return app.fetch(request, createTestEnv());
      }
    });
    const client = new Client({ name: "ynab-mcp-build-test-client", version: "1.0.0" });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport);

    const result = await client.callTool({
      name: "ynab_get_upcoming_obligations",
      arguments: { asOfDate: "2026-03-10", topN: 3 }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(JSON.parse(textContent!.text!)).toMatchObject({
      as_of_date: "2026-03-10",
      obligation_count: 2,
      expected_inflow_count: 1,
      windows: {
        "7d": {
          total_inflows: "0.00",
          total_outflows: "100.00",
          net_upcoming: "-100.00",
          obligation_count: 1,
          expected_inflow_count: 0
        },
        "14d": {
          total_inflows: "50.00",
          total_outflows: "100.00",
          net_upcoming: "-50.00",
          obligation_count: 1,
          expected_inflow_count: 1
        },
        "30d": {
          total_inflows: "50.00",
          total_outflows: "145.00",
          net_upcoming: "-95.00",
          obligation_count: 2,
          expected_inflow_count: 1
        }
      },
      top_due: [
        {
          id: "sched-rent",
          date_next: "2026-03-15",
          payee_name: "Landlord",
          amount: "100.00",
          type: "outflow"
        },
        {
          id: "sched-paycheck",
          date_next: "2026-03-20",
          payee_name: "Employer",
          amount: "50.00",
          type: "inflow"
        },
        {
          id: "sched-gym",
          date_next: "2026-04-05",
          payee_name: "Gym",
          amount: "45.00",
          type: "outflow"
        }
      ]
    });
  });

  it("returns a compact income summary across a month range", async () => {
    const ynabClient = createBaseClient();
    ynabClient.listTransactions.mockResolvedValue([
      {
        id: "txn-feb-paycheck",
        date: "2026-02-02",
        amount: 450000,
        payeeId: "payee-employer",
        payeeName: "Employer",
        categoryId: null,
        categoryName: null,
        accountId: "account-checking",
        accountName: "Checking",
        approved: true,
        cleared: "cleared",
        deleted: false,
        transferAccountId: null
      },
      {
        id: "txn-mar-paycheck",
        date: "2026-03-02",
        amount: 500000,
        payeeId: "payee-employer",
        payeeName: "Employer",
        categoryId: null,
        categoryName: null,
        accountId: "account-checking",
        accountName: "Checking",
        approved: true,
        cleared: "cleared",
        deleted: false,
        transferAccountId: null
      },
      {
        id: "txn-mar-bonus",
        date: "2026-03-25",
        amount: 100000,
        payeeId: "payee-bonus",
        payeeName: "Bonus",
        categoryId: null,
        categoryName: null,
        accountId: "account-checking",
        accountName: "Checking",
        approved: true,
        cleared: "cleared",
        deleted: false,
        transferAccountId: null
      },
      {
        id: "txn-transfer",
        date: "2026-03-27",
        amount: 50000,
        payeeName: "Transfer : Savings",
        accountId: "account-savings",
        accountName: "Savings",
        approved: true,
        cleared: "cleared",
        deleted: false,
        transferAccountId: "account-checking"
      }
    ]);
    const app = createApp({ ynabClient });
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        return app.fetch(request, createTestEnv());
      }
    });
    const client = new Client({ name: "ynab-mcp-build-test-client", version: "1.0.0" });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport);

    const result = await client.callTool({
      name: "ynab_get_income_summary",
      arguments: { fromMonth: "2026-02-01", toMonth: "2026-03-01", topN: 2 }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(JSON.parse(textContent!.text!)).toMatchObject({
      from_month: "2026-02-01",
      to_month: "2026-03-01",
      income_total: "1050.00",
      average_monthly_income: "525.00",
      median_monthly_income: "525.00",
      income_month_count: 2,
      volatility_percent: "28.57",
      top_income_sources: [
        { id: "payee-employer", name: "Employer", amount: "950.00", transaction_count: 2 },
        { id: "payee-bonus", name: "Bonus", amount: "100.00", transaction_count: 1 }
      ],
      months: [
        { month: "2026-02-01", income: "450.00" },
        { month: "2026-03-01", income: "600.00" }
      ]
    });
  });

  it("returns a compact recurring expense summary", async () => {
    const ynabClient = createBaseClient();
    ynabClient.listTransactions.mockResolvedValue([
      { id: "gym-1", date: "2026-01-03", amount: -45000, payeeId: "payee-gym", payeeName: "Gym", accountId: "account-checking", accountName: "Checking", deleted: false, transferAccountId: null },
      { id: "gym-2", date: "2026-02-03", amount: -45000, payeeId: "payee-gym", payeeName: "Gym", accountId: "account-checking", accountName: "Checking", deleted: false, transferAccountId: null },
      { id: "gym-3", date: "2026-03-03", amount: -45000, payeeId: "payee-gym", payeeName: "Gym", accountId: "account-checking", accountName: "Checking", deleted: false, transferAccountId: null },
      { id: "netflix-1", date: "2026-01-05", amount: -15000, payeeId: "payee-netflix", payeeName: "Netflix", accountId: "account-checking", accountName: "Checking", deleted: false, transferAccountId: null },
      { id: "netflix-2", date: "2026-02-05", amount: -15000, payeeId: "payee-netflix", payeeName: "Netflix", accountId: "account-checking", accountName: "Checking", deleted: false, transferAccountId: null },
      { id: "netflix-3", date: "2026-03-05", amount: -15000, payeeId: "payee-netflix", payeeName: "Netflix", accountId: "account-checking", accountName: "Checking", deleted: false, transferAccountId: null },
      { id: "cafe", date: "2026-03-10", amount: -8000, payeeId: "payee-cafe", payeeName: "Cafe", accountId: "account-checking", accountName: "Checking", deleted: false, transferAccountId: null }
    ]);
    const app = createApp({ ynabClient });
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        return app.fetch(request, createTestEnv());
      }
    });
    const client = new Client({ name: "ynab-mcp-build-test-client", version: "1.0.0" });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport);

    const result = await client.callTool({
      name: "ynab_get_recurring_expense_summary",
      arguments: { fromDate: "2026-01-01", toDate: "2026-03-31", topN: 2 }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(JSON.parse(textContent!.text!)).toMatchObject({
      from_date: "2026-01-01",
      to_date: "2026-03-31",
      recurring_expense_count: 2,
      recurring_expenses: [
        {
          payee_id: "payee-gym",
          payee_name: "Gym",
          cadence: "monthly",
          occurrence_count: 3,
          average_amount: "45.00",
          estimated_monthly_cost: "45.00",
          annualized_cost: "540.00"
        },
        {
          payee_id: "payee-netflix",
          payee_name: "Netflix",
          cadence: "monthly",
          occurrence_count: 3,
          average_amount: "15.00",
          estimated_monthly_cost: "15.00",
          annualized_cost: "180.00"
        }
      ]
    });
  });

  it("returns compact emergency fund coverage", async () => {
    const ynabClient = createBaseClient();
    ynabClient.listPlanMonths.mockResolvedValue([
      { month: "2026-02-01", income: 450000, budgeted: 280000, activity: -210000, toBeBudgeted: 60000, deleted: false },
      { month: "2026-03-01", income: 500000, budgeted: 300000, activity: -230000, toBeBudgeted: 70000, deleted: false }
    ]);
    const app = createApp({ ynabClient });
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        return app.fetch(request, createTestEnv());
      }
    });
    const client = new Client({ name: "ynab-mcp-build-test-client", version: "1.0.0" });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport);

    const result = await client.callTool({
      name: "ynab_get_emergency_fund_coverage",
      arguments: { asOfMonth: "2026-03-01", monthsBack: 2 }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(JSON.parse(textContent!.text!)).toMatchObject({
      as_of_month: "2026-03-01",
      liquid_cash: "1150.00",
      average_monthly_spending: "220.00",
      scheduled_net_next_30d: "-50.00",
      coverage_months: "5.23",
      status: "solid",
      months_considered: 2
    });
  });

  it("returns a compact goal progress summary", async () => {
    const ynabClient = createBaseClient();
    const app = createApp({ ynabClient });
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        return app.fetch(request, createTestEnv());
      }
    });
    const client = new Client({ name: "ynab-mcp-build-test-client", version: "1.0.0" });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport);

    const result = await client.callTool({
      name: "ynab_get_goal_progress_summary",
      arguments: { month: "2026-03-01", topN: 2 }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(JSON.parse(textContent!.text!)).toMatchObject({
      month: "2026-03-01",
      goal_count: 3,
      underfunded_total: "50.00",
      on_track_count: 1,
      off_track_count: 2,
      top_underfunded_goals: [
        { id: "category-vacation", name: "Vacation", amount: "40.00" },
        { id: "category-groceries", name: "Groceries", amount: "10.00" }
      ]
    });
  });

  it("returns a compact debt summary", async () => {
    const ynabClient = createBaseClient();
    const app = createApp({ ynabClient });
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        return app.fetch(request, createTestEnv());
      }
    });
    const client = new Client({ name: "ynab-mcp-build-test-client", version: "1.0.0" });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport);

    const result = await client.callTool({
      name: "ynab_get_debt_summary",
      arguments: { topN: 2 }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(JSON.parse(textContent!.text!)).toMatchObject({
      total_debt: "200.00",
      liquid_cash: "1150.00",
      debt_account_count: 1,
      debt_to_cash_ratio: "0.17",
      status: "manageable",
      top_debt_accounts: [
        { id: "account-visa", name: "Visa", type: "creditCard", balance: "200.00" }
      ]
    });
  });

  it("returns a compact budget cleanup summary", async () => {
    const ynabClient = createBaseClient();
    const app = createApp({ ynabClient });
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        return app.fetch(request, createTestEnv());
      }
    });
    const client = new Client({ name: "ynab-mcp-build-test-client", version: "1.0.0" });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport);

    const result = await client.callTool({
      name: "ynab_get_budget_cleanup_summary",
      arguments: { month: "2026-03-01", topN: 2 }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(JSON.parse(textContent!.text!)).toMatchObject({
      month: "2026-03-01",
      uncategorized_transaction_count: 2,
      unapproved_transaction_count: 1,
      uncleared_transaction_count: 1,
      overspent_category_count: 1,
      hidden_problem_category_count: 1,
      top_uncategorized_transactions: [
        { id: "txn-income", date: "2026-03-02", amount: "500.00" },
        { id: "txn-cafe", date: "2026-03-14", payee_name: "Cafe", amount: "8.00" }
      ],
      top_unapproved_transactions: [
        { id: "txn-grocery", date: "2026-03-10", payee_name: "Grocer", amount: "30.00" }
      ],
      top_overspent_categories: [
        { id: "category-groceries", name: "Groceries", amount: "30.00" }
      ]
    });
  });

  it("returns a compact net worth trajectory", async () => {
    const ynabClient = createBaseClient();
    ynabClient.listAccounts.mockResolvedValue([
      {
        id: "account-checking",
        name: "Checking",
        type: "checking",
        onBudget: true,
        closed: false,
        deleted: false,
        balance: 250000
      },
      {
        id: "account-savings",
        name: "Savings",
        type: "savings",
        onBudget: true,
        closed: false,
        deleted: false,
        balance: 900000
      },
      {
        id: "account-visa",
        name: "Visa",
        type: "creditCard",
        onBudget: true,
        closed: false,
        deleted: false,
        balance: -200000
      }
    ]);
    ynabClient.listTransactions.mockResolvedValue([
      {
        id: "txn-feb-income",
        date: "2026-02-05",
        amount: 400000,
        accountId: "account-checking",
        accountName: "Checking",
        deleted: false,
        transferAccountId: null
      },
      {
        id: "txn-feb-spend",
        date: "2026-02-15",
        amount: -100000,
        accountId: "account-checking",
        accountName: "Checking",
        deleted: false,
        transferAccountId: null
      },
      {
        id: "txn-mar-income",
        date: "2026-03-25",
        amount: 500000,
        accountId: "account-checking",
        accountName: "Checking",
        deleted: false,
        transferAccountId: null
      },
      {
        id: "txn-mar-spend",
        date: "2026-03-10",
        amount: -30000,
        accountId: "account-checking",
        accountName: "Checking",
        deleted: false,
        transferAccountId: null
      },
      {
        id: "txn-savings-out",
        date: "2026-03-12",
        amount: -50000,
        accountId: "account-checking",
        accountName: "Checking",
        deleted: false,
        transferAccountId: "account-savings"
      },
      {
        id: "txn-savings-in",
        date: "2026-03-12",
        amount: 50000,
        accountId: "account-savings",
        accountName: "Savings",
        deleted: false,
        transferAccountId: "account-checking"
      },
      {
        id: "txn-visa-charge",
        date: "2026-03-18",
        amount: -20000,
        accountId: "account-visa",
        accountName: "Visa",
        deleted: false,
        transferAccountId: null
      }
    ]);
    const app = createApp({ ynabClient });
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        return app.fetch(request, createTestEnv());
      }
    });
    const client = new Client({ name: "ynab-mcp-build-test-client", version: "1.0.0" });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport);

    const result = await client.callTool({
      name: "ynab_get_net_worth_trajectory",
      arguments: { fromMonth: "2026-02-01", toMonth: "2026-03-01" }
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(JSON.parse(textContent!.text!)).toMatchObject({
      from_month: "2026-02-01",
      to_month: "2026-03-01",
      start_net_worth: "500.00",
      end_net_worth: "950.00",
      change_net_worth: "450.00",
      months: [
        { month: "2026-02-01", net_worth: "500.00", liquid_cash: "850.00", debt: "350.00" },
        { month: "2026-03-01", net_worth: "950.00", liquid_cash: "1150.00", debt: "200.00" }
      ]
    });
  });
});
