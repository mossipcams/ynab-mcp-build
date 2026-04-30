import { describe, expect, it } from "vitest";

import type { YnabClient } from "../../platform/ynab/client.js";
import {
  getBudgetChangeDigest,
  explainMonthDelta,
  getCashResilienceSummary,
  getNetWorthTrajectory,
  getUpcomingObligations,
} from "./service.js";

describe("financial health service", () => {
  it("returns a neutral digest for a quiet month", async () => {
    // DEFECT: digest can hallucinate financial concerns when synced data has no notable changes.
    const ynabClient = {
      getPlanMonth: async (planId: string, month: string) => ({
        month,
        budgeted: 100000,
        activity: -50000,
        categories: [
          {
            id: "groceries",
            name: "Groceries",
            balance: 50000,
            activity: -50000,
            budgeted: 100000,
            deleted: false,
            hidden: false,
          },
        ],
      }),
      listScheduledTransactions: async () => [],
      listTransactions: async () => [],
    } as unknown as YnabClient;

    await expect(
      getBudgetChangeDigest(ynabClient, {
        month: "2026-04-01",
        planId: "plan-1",
      }),
    ).resolves.toMatchObject({
      month: "2026-04-01",
      headline: "No notable budget changes need attention for 2026-04.",
      top_changes: [],
      new_large_transactions: [],
      category_pressure: [],
      unusual_spending: [],
      upcoming_obligations: [],
      recommended_actions: [],
    });
  });

  it("ranks category changes, large transactions, obligations, and recommendations by attention value", async () => {
    // DEFECT: digest can miss the highest-impact budget movements and surface low-value noise instead.
    const ynabClient = {
      getPlanMonth: async (planId: string, month: string) => ({
        month,
        categories:
          month === "2026-03-01"
            ? [
                {
                  id: "groceries",
                  name: "Groceries",
                  balance: 100000,
                  activity: -300000,
                  budgeted: 400000,
                  deleted: false,
                  hidden: false,
                },
                {
                  id: "shopping",
                  name: "Shopping",
                  balance: 50000,
                  activity: -100000,
                  budgeted: 150000,
                  deleted: false,
                  hidden: false,
                },
              ]
            : [
                {
                  id: "groceries",
                  name: "Groceries",
                  balance: -50000,
                  activity: -650000,
                  budgeted: 500000,
                  deleted: false,
                  hidden: false,
                },
                {
                  id: "shopping",
                  name: "Shopping",
                  balance: 10000,
                  activity: -140000,
                  budgeted: 150000,
                  deleted: false,
                  hidden: false,
                },
              ],
      }),
      listScheduledTransactions: async () => [
        {
          id: "rent-due",
          amount: -1200000,
          dateNext: "2026-04-05",
          deleted: false,
          payeeName: "Rent",
        },
        {
          id: "transfer",
          amount: -1000000,
          dateNext: "2026-04-06",
          deleted: false,
          payeeName: "Savings Transfer",
          transferAccountId: "savings",
        },
      ],
      listTransactions: async () => [
        {
          id: "rent-paid",
          amount: -1200000,
          date: "2026-04-01",
          deleted: false,
          payeeName: "Rent",
          categoryName: "Rent",
          accountName: "Checking",
        },
        {
          id: "transfer-paid",
          amount: -900000,
          date: "2026-04-02",
          deleted: false,
          payeeName: "Savings Transfer",
          transferAccountId: "savings",
        },
        {
          id: "coffee",
          amount: -15000,
          date: "2026-04-03",
          deleted: false,
          payeeName: "Coffee",
        },
      ],
    } as unknown as YnabClient;

    await expect(
      getBudgetChangeDigest(ynabClient, {
        month: "2026-04-01",
        planId: "plan-1",
        topN: 3,
      }),
    ).resolves.toMatchObject({
      month: "2026-04-01",
      top_changes: [
        expect.objectContaining({
          category_name: "Groceries",
          reason: "spending_increased",
          amount: "350.00",
        }),
      ],
      new_large_transactions: [
        expect.objectContaining({
          id: "rent-paid",
          amount: "1200.00",
          payee_name: "Rent",
        }),
      ],
      category_pressure: [
        expect.objectContaining({
          category_name: "Groceries",
          pressure_reason: "overspent",
          available: "-50.00",
        }),
      ],
      upcoming_obligations: [
        expect.objectContaining({
          id: "rent-due",
          amount: "1200.00",
          payee_name: "Rent",
        }),
      ],
      recommended_actions: [
        expect.objectContaining({
          target: "Groceries",
          priority: "high",
        }),
      ],
    });
  });

  it("caps digest lists by detail level and uses stable tie-breaking", async () => {
    // DEFECT: digest rankings can flood MCP context or flicker between calls with equivalent signals.
    const currentCategories = [
      "Alpha",
      "Bravo",
      "Charlie",
      "Delta",
      "Echo",
      "Foxtrot",
    ].map((name, index) => ({
      id: name.toLowerCase(),
      name,
      balance: index < 4 ? -10000 : 10000,
      activity: -20000,
      budgeted: 10000,
      deleted: false,
      hidden: false,
    }));
    const previousCategories = currentCategories.map((category) => ({
      ...category,
      balance: 10000,
      activity: -10000,
    }));
    const ynabClient = {
      getPlanMonth: async (planId: string, month: string) => ({
        month,
        categories:
          month === "2026-03-01" ? previousCategories : currentCategories,
      }),
      listScheduledTransactions: async () => [],
      listTransactions: async () => [],
    } as unknown as YnabClient;

    const digest = await getBudgetChangeDigest(ynabClient, {
      detailLevel: "brief",
      month: "2026-04-01",
      planId: "plan-1",
    });

    expect(digest.top_changes).toHaveLength(3);
    expect(digest.category_pressure).toHaveLength(3);
    expect(digest.top_changes.map((entry) => entry.category_name)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
    ]);
  });

  it("explains month-over-month income and spending drivers", async () => {
    // DEFECT: month delta can report totals without explaining the drivers.
    const ynabClient = {
      getPlanMonth: async (planId: string, month: string) =>
        month === "2026-03-01"
          ? {
              month,
              income: 5000000,
              activity: -3000000,
              budgeted: 3200000,
              categories: [
                {
                  id: "dining",
                  name: "Dining",
                  balance: 50000,
                  activity: -300000,
                  budgeted: 350000,
                  deleted: false,
                  hidden: false,
                },
              ],
            }
          : {
              month,
              income: 4000000,
              activity: -4200000,
              budgeted: 3500000,
              categories: [
                {
                  id: "dining",
                  name: "Dining",
                  balance: -50000,
                  activity: -800000,
                  budgeted: 750000,
                  deleted: false,
                  hidden: false,
                },
              ],
            },
      listTransactions: async () => [
        {
          id: "restaurant",
          amount: -225000,
          date: "2026-04-12",
          deleted: false,
          payeeName: "Restaurant",
          categoryName: "Dining",
        },
      ],
    } as unknown as YnabClient;

    await expect(
      explainMonthDelta(ynabClient, {
        baselineMonth: "2026-03-01",
        comparisonMonth: "2026-04-01",
        planId: "plan-1",
      }),
    ).resolves.toMatchObject({
      baseline_month: "2026-03-01",
      comparison_month: "2026-04-01",
      summary: expect.stringContaining("2026-04"),
      drivers: [
        expect.objectContaining({
          code: "spending_increased",
          amount: "1200.00",
        }),
        expect.objectContaining({
          code: "income_decreased",
          amount: "1000.00",
        }),
      ],
      category_deltas: [
        expect.objectContaining({
          category_name: "Dining",
          reason: "spending_increased",
          amount: "500.00",
        }),
      ],
      transaction_evidence: [
        expect.objectContaining({
          id: "restaurant",
          amount: "225.00",
          payee_name: "Restaurant",
        }),
      ],
    });
  });

  it("excludes deleted and closed accounts from trajectory debt", async () => {
    const ynabClient = {
      listAccounts: async () => [
        {
          id: "cash",
          name: "Checking",
          type: "checking",
          closed: false,
          deleted: false,
          balance: 200000,
        },
        {
          id: "card-active",
          name: "Active Card",
          type: "creditCard",
          closed: false,
          deleted: false,
          balance: -100000,
        },
        {
          id: "card-deleted",
          name: "Deleted Card",
          type: "creditCard",
          closed: false,
          deleted: true,
          balance: -900000,
        },
        {
          id: "card-closed",
          name: "Closed Card",
          type: "creditCard",
          closed: true,
          deleted: false,
          balance: -800000,
        },
      ],
      listTransactions: async () => [],
    } as unknown as YnabClient;

    await expect(
      getNetWorthTrajectory(ynabClient, {
        fromMonth: "2026-04-01",
        planId: "plan-1",
        toMonth: "2026-04-01",
      }),
    ).resolves.toMatchObject({
      months: [
        {
          debt: "100.00",
          liquid_cash: "200.00",
          net_worth: "100.00",
        },
      ],
    });
  });

  it("excludes scheduled transfers from obligations and cash pressure", async () => {
    const scheduledTransactions = [
      {
        id: "transfer-1",
        dateFirst: "2026-04-01",
        dateNext: "2026-04-10",
        amount: -10000,
        transferAccountId: "savings",
        deleted: false,
      },
      {
        id: "rent",
        dateFirst: "2026-04-01",
        dateNext: "2026-04-10",
        amount: -20000,
        payeeName: "Rent",
        deleted: false,
      },
      {
        id: "paycheck",
        dateFirst: "2026-04-01",
        dateNext: "2026-04-15",
        amount: 5000,
        payeeName: "Payroll",
        deleted: false,
      },
    ];
    const ynabClient = {
      listAccounts: async () => [
        {
          id: "cash",
          name: "Checking",
          type: "checking",
          closed: false,
          deleted: false,
          balance: 90000,
        },
      ],
      listPlanMonths: async () => [
        { month: "2026-02-01", deleted: false, activity: -30000 },
        { month: "2026-03-01", deleted: false, activity: -30000 },
        { month: "2026-04-01", deleted: false, activity: -30000 },
      ],
      listScheduledTransactions: async () => scheduledTransactions,
    } as unknown as YnabClient;

    await expect(
      getUpcomingObligations(ynabClient, {
        asOfDate: "2026-04-01",
        planId: "plan-1",
      }),
    ).resolves.toMatchObject({
      obligation_count: 1,
      expected_inflow_count: 1,
      windows: {
        "30d": {
          total_inflows: "5.00",
          total_outflows: "20.00",
          net_upcoming: "-15.00",
        },
      },
      top_due: [
        expect.objectContaining({
          id: "rent",
        }),
        expect.objectContaining({
          id: "paycheck",
        }),
      ],
    });

    await expect(
      getCashResilienceSummary(ynabClient, {
        month: "2026-04-01",
        planId: "plan-1",
      }),
    ).resolves.toMatchObject({
      average_daily_outflow: "1.00",
      average_monthly_spending: "30.00",
      coverage_months: "3.00",
      runway_days: "90.00",
      scheduled_net_next_30d: "-15.00",
    });
  });
});
