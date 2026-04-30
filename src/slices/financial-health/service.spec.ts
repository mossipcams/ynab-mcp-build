import { afterEach, describe, expect, it, vi } from "vitest";

import type { YnabClient } from "../../platform/ynab/client.js";
import {
  getBudgetChangeDigest,
  getBudgetCleanupSummary,
  getBudgetHealthSummary,
  explainMonthDelta,
  getCashResilienceSummary,
  getCategoryTrendSummary,
  getFinancialHealthCheck,
  getFinancialSnapshot,
  getMonthlyReview,
  getNetWorthTrajectory,
  getRecurringExpenseSummary,
  getSpendingAnomalies,
  getUpcomingObligations,
} from "./service.js";

describe("financial health service", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves current month to the calendar month instead of a future empty budget month", async () => {
    // DEFECT: current/default month resolution can choose the latest future budget month and hide real current-month signals.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T17:00:00.000Z"));

    const getPlanMonth = vi.fn(async (_planId: string, month: string) => ({
      month,
      income: month === "2026-04-01" ? 5000000 : 0,
      budgeted: month === "2026-04-01" ? 4500000 : 0,
      activity: month === "2026-04-01" ? -4000000 : 0,
      toBeBudgeted: 0,
      categories: [],
    }));
    const ynabClient = {
      getPlanMonth,
      listPlanMonths: async () => [
        { month: "2026-06-01", deleted: false, activity: 0 },
        { month: "2026-05-01", deleted: false, activity: 0 },
        { month: "2026-04-01", deleted: false, activity: -4000000 },
      ],
      listTransactions: async () => [],
    } as unknown as YnabClient;

    await expect(
      getMonthlyReview(ynabClient, {
        month: "current",
        planId: "plan-1",
      }),
    ).resolves.toMatchObject({
      month: "2026-04-01",
      income: "5000.00",
      spent: "4000.00",
    });

    expect(getPlanMonth).toHaveBeenCalledWith("plan-1", "2026-04-01");
  });

  it("uses the calendar month for omitted month inputs across month-defaulting summaries", async () => {
    // DEFECT: omitted month inputs can drift to future empty budget months across broad summary tools.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T17:00:00.000Z"));

    const getPlanMonth = vi.fn(async (_planId: string, month: string) => ({
      month,
      income: month === "2026-04-01" ? 5000000 : 0,
      budgeted: month === "2026-04-01" ? 4500000 : 0,
      activity: month === "2026-04-01" ? -4000000 : 0,
      toBeBudgeted: 0,
      categories: [],
    }));
    const ynabClient = {
      getPlanMonth,
      listAccounts: async () => [],
      listPlanMonths: async () => [
        { month: "2026-06-01", deleted: false, activity: 0 },
        { month: "2026-05-01", deleted: false, activity: 0 },
        { month: "2026-04-01", deleted: false, activity: -4000000 },
      ],
      listTransactions: async () => [],
    } as unknown as YnabClient;

    await expect(
      Promise.all([
        getMonthlyReview(ynabClient, { planId: "plan-1" }),
        getBudgetHealthSummary(ynabClient, { planId: "plan-1" }),
        getBudgetCleanupSummary(ynabClient, { planId: "plan-1" }),
        getFinancialSnapshot(ynabClient, { planId: "plan-1" }),
        getFinancialHealthCheck(ynabClient, { planId: "plan-1" }),
      ]),
    ).resolves.toEqual([
      expect.objectContaining({ month: "2026-04-01" }),
      expect.objectContaining({ month: "2026-04-01" }),
      expect.objectContaining({ month: "2026-04-01" }),
      expect.objectContaining({ month: "2026-04-01" }),
      expect.objectContaining({ as_of_month: "2026-04-01" }),
    ]);
  });

  it("aggregates category group trends from category membership when month categories omit group names", async () => {
    // DEFECT: read-model month category rows can omit category_group_name and make group trends report all zeroes.
    const ynabClient = {
      getPlanMonth: async (_planId: string, month: string) => ({
        month,
        categories: [
          {
            id: "groceries",
            name: "Groceries",
            budgeted: 200000,
            activity: -150000,
            balance: 50000,
            deleted: false,
            hidden: false,
          },
          {
            id: "dining",
            name: "Dining",
            budgeted: 100000,
            activity: -125000,
            balance: -25000,
            deleted: false,
            hidden: false,
          },
          {
            id: "rent",
            name: "Rent",
            budgeted: 1000000,
            activity: -1000000,
            balance: 0,
            deleted: false,
            hidden: false,
          },
        ],
      }),
      listCategories: async () => [
        {
          id: "food-group",
          name: "Food",
          deleted: false,
          hidden: false,
          categories: [
            {
              id: "groceries",
              name: "Groceries",
              deleted: false,
              hidden: false,
            },
            { id: "dining", name: "Dining", deleted: false, hidden: false },
          ],
        },
      ],
      listPlanMonths: async () => [{ month: "2026-04-01", deleted: false }],
    } as unknown as YnabClient;

    await expect(
      getCategoryTrendSummary(ynabClient, {
        categoryGroupName: "Food",
        fromMonth: "2026-04-01",
        planId: "plan-1",
        toMonth: "2026-04-01",
      }),
    ).resolves.toMatchObject({
      average_spent: "275.00",
      periods: [
        {
          assigned: "300.00",
          available: "25.00",
          spent: "275.00",
        },
      ],
    });
  });

  it("adds regression slope and assigned-spent correlation to category trends", async () => {
    const ynabClient = {
      getPlanMonth: async (_planId: string, month: string) => {
        const monthIndex = ["2026-01-01", "2026-02-01", "2026-03-01"].indexOf(
          month,
        );

        return {
          month,
          categories: [
            {
              id: "groceries",
              name: "Groceries",
              budgeted: 100000 + monthIndex * 10000,
              activity: -(100000 + monthIndex * 50000),
              balance: 0,
              deleted: false,
              hidden: false,
            },
          ],
        };
      },
      listPlanMonths: async () => [
        { month: "2026-01-01", deleted: false },
        { month: "2026-02-01", deleted: false },
        { month: "2026-03-01", deleted: false },
      ],
    } as unknown as YnabClient;

    await expect(
      getCategoryTrendSummary(ynabClient, {
        categoryId: "groceries",
        fromMonth: "2026-01-01",
        planId: "plan-1",
        toMonth: "2026-03-01",
      }),
    ).resolves.toMatchObject({
      trend: {
        spent_slope_per_month: "50.00",
        spent_direction: "increasing",
        assigned_spent_correlation: "1.0000",
      },
    });
  });

  it("includes category trend diagnostics in default responses", async () => {
    const ynabClient = {
      getPlanMonth: async (_planId: string, month: string) => ({
        month,
        categories: [
          {
            id: "groceries",
            name: "Groceries",
            budgeted: 100000,
            activity: -100000,
            balance: 0,
            deleted: false,
            hidden: false,
          },
        ],
      }),
      listPlanMonths: async () => [
        { month: "2026-01-01", deleted: false },
        { month: "2026-02-01", deleted: false },
      ],
    } as unknown as YnabClient;

    const summary = await getCategoryTrendSummary(ynabClient, {
      categoryId: "groceries",
      fromMonth: "2026-01-01",
      planId: "plan-1",
      toMonth: "2026-02-01",
    });

    expect(summary).toMatchObject({
      trend: {
        spent_slope_per_month: "0.00",
        spent_direction: "flat",
      },
    });
  });

  it("bounds net worth transaction reads to the current balance month", async () => {
    // DEFECT: net worth trajectory should avoid unbounded reads while still preserving rollback from current balances.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T17:00:00.000Z"));

    const listTransactions = vi.fn(async () => []);
    const ynabClient = {
      listAccounts: async () => [],
      listPlanMonths: async () => [
        { month: "2026-04-01", deleted: false },
        { month: "2026-03-01", deleted: false },
      ],
      listTransactions,
    } as unknown as YnabClient;

    await getNetWorthTrajectory(ynabClient, {
      fromMonth: "2026-03-01",
      planId: "plan-1",
      toMonth: "2026-04-01",
    });

    expect(listTransactions).toHaveBeenCalledWith(
      "plan-1",
      "2026-03-01",
      "2026-04-30",
    );
  });

  it("includes post-range transactions when rolling current balances back for historical net worth", async () => {
    // DEFECT: ending transaction reads at toMonth leaves later activity inside historical balances.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T17:00:00.000Z"));

    const ynabClient = {
      listAccounts: async () => [
        {
          id: "checking",
          name: "Checking",
          type: "checking",
          closed: false,
          deleted: false,
          balance: 1200000,
        },
      ],
      listPlanMonths: async () => [
        { month: "2026-06-01", deleted: false },
        { month: "2026-05-01", deleted: false },
        { month: "2026-04-01", deleted: false },
        { month: "2026-03-01", deleted: false },
      ],
      listTransactions: async (
        _planId: string,
        fromDate?: string,
        toDate?: string,
      ) =>
        [
          {
            id: "april-income",
            accountId: "checking",
            amount: 100000,
            date: "2026-04-15",
            deleted: false,
          },
          {
            id: "may-income",
            accountId: "checking",
            amount: 200000,
            date: "2026-05-15",
            deleted: false,
          },
        ].filter(
          (transaction) =>
            (!fromDate || transaction.date >= fromDate) &&
            (!toDate || transaction.date <= toDate),
        ),
    } as unknown as YnabClient;

    await expect(
      getNetWorthTrajectory(ynabClient, {
        fromMonth: "2026-03-01",
        planId: "plan-1",
        toMonth: "2026-04-01",
      }),
    ).resolves.toMatchObject({
      start_net_worth: "900.00",
      end_net_worth: "1000.00",
      months: [
        expect.objectContaining({
          month: "2026-03-01",
          net_worth: "900.00",
        }),
        expect.objectContaining({
          month: "2026-04-01",
          net_worth: "1000.00",
        }),
      ],
    });
  });

  it("treats spending anomaly minimumDifference as dollars instead of raw milliunits", async () => {
    // DEFECT: minimumDifference can be compared to milliunits, letting small dollar changes through.
    const ynabClient = {
      getPlanMonth: async (_planId: string, month: string) => ({
        month,
        categories:
          month === "2026-04-01"
            ? [
                {
                  id: "groceries",
                  name: "Groceries",
                  activity: -291100,
                  balance: 0,
                  deleted: false,
                  hidden: false,
                },
                {
                  id: "vet",
                  name: "Vet",
                  activity: -500000,
                  balance: 0,
                  deleted: false,
                  hidden: false,
                },
              ]
            : [
                {
                  id: "groceries",
                  name: "Groceries",
                  activity: -192270,
                  balance: 0,
                  deleted: false,
                  hidden: false,
                },
                {
                  id: "vet",
                  name: "Vet",
                  activity: -100000,
                  balance: 0,
                  deleted: false,
                  hidden: false,
                },
              ],
      }),
    } as unknown as YnabClient;

    await expect(
      getSpendingAnomalies(ynabClient, {
        baselineMonths: 1,
        latestMonth: "2026-04-01",
        minimumDifference: 100,
        planId: "plan-1",
        thresholdMultiplier: 1,
      }),
    ).resolves.toMatchObject({
      anomalies: [
        expect.objectContaining({
          category_name: "Vet",
          increase: "400.00",
        }),
      ],
    });
  });

  it("converts high-dollar spending anomaly minimumDifference values to milliunits", async () => {
    // DEFECT: minimumDifference values at 1000 or more can be treated as raw milliunits instead of dollars.
    const ynabClient = {
      getPlanMonth: async (_planId: string, month: string) => ({
        month,
        categories:
          month === "2026-04-01"
            ? [
                {
                  id: "minor",
                  name: "Minor Spike",
                  activity: -999000,
                  balance: 0,
                  deleted: false,
                  hidden: false,
                },
                {
                  id: "major",
                  name: "Major Spike",
                  activity: -1100000,
                  balance: 0,
                  deleted: false,
                  hidden: false,
                },
              ]
            : [
                {
                  id: "minor",
                  name: "Minor Spike",
                  activity: 0,
                  balance: 0,
                  deleted: false,
                  hidden: false,
                },
                {
                  id: "major",
                  name: "Major Spike",
                  activity: 0,
                  balance: 0,
                  deleted: false,
                  hidden: false,
                },
              ],
      }),
    } as unknown as YnabClient;

    await expect(
      getSpendingAnomalies(ynabClient, {
        baselineMonths: 1,
        latestMonth: "2026-04-01",
        minimumDifference: 1000,
        planId: "plan-1",
      }),
    ).resolves.toMatchObject({
      anomalies: [
        expect.objectContaining({
          category_name: "Major Spike",
          increase: "1100.00",
        }),
      ],
    });
  });

  it("uses z-scores to filter noisy spending anomaly candidates", async () => {
    const categoryActivityByMonth: Record<
      string,
      { stable: number; noisy: number }
    > = {
      "2026-01-01": {
        stable: -100000,
        noisy: -100000,
      },
      "2026-02-01": {
        stable: -120000,
        noisy: -700000,
      },
      "2026-03-01": {
        stable: -80000,
        noisy: -100000,
      },
      "2026-04-01": {
        stable: -180000,
        noisy: -500000,
      },
    };
    const ynabClient = {
      getPlanMonth: async (_planId: string, month: string) => ({
        month,
        categories: [
          {
            id: "stable",
            name: "Stable Spike",
            activity: categoryActivityByMonth[month]!.stable,
            balance: 0,
            deleted: false,
            hidden: false,
          },
          {
            id: "noisy",
            name: "Noisy Spike",
            activity: categoryActivityByMonth[month]!.noisy,
            balance: 0,
            deleted: false,
            hidden: false,
          },
        ],
      }),
    } as unknown as YnabClient;

    await expect(
      getSpendingAnomalies(ynabClient, {
        baselineMonths: 3,
        latestMonth: "2026-04-01",
        minimumDifference: 50,
        planId: "plan-1",
        thresholdMultiplier: 1.5,
      }),
    ).resolves.toMatchObject({
      anomalies: [
        expect.objectContaining({
          category_name: "Stable Spike",
          z_score: "4.8990",
        }),
      ],
    });
  });

  it("includes spending anomaly z-scores in default responses", async () => {
    const ynabClient = {
      getPlanMonth: async (_planId: string, month: string) => ({
        month,
        categories:
          month === "2026-04-01"
            ? [
                {
                  id: "vet",
                  name: "Vet",
                  activity: -500000,
                  balance: 0,
                  deleted: false,
                  hidden: false,
                },
              ]
            : [
                {
                  id: "vet",
                  name: "Vet",
                  activity: -100000,
                  balance: 0,
                  deleted: false,
                  hidden: false,
                },
              ],
      }),
    } as unknown as YnabClient;

    const summary = await getSpendingAnomalies(ynabClient, {
      baselineMonths: 1,
      latestMonth: "2026-04-01",
      minimumDifference: 100,
      planId: "plan-1",
      thresholdMultiplier: 1,
    });

    expect(summary.anomalies[0]).toMatchObject({
      category_name: "Vet",
      z_score: "0.0000",
    });
  });

  it("omits zero-dollar scheduled rows and exposes signed upcoming obligation amounts", async () => {
    // DEFECT: zero-dollar scheduled rows can crowd upcoming obligations and positive display amounts hide outflow signs.
    const ynabClient = {
      listScheduledTransactions: async () => [
        {
          id: "zero-card-payment",
          amount: 0,
          dateNext: "2026-05-03",
          deleted: false,
          payeeName: "Credit Card Payment",
        },
        {
          id: "rent",
          amount: -1550000,
          dateNext: "2026-05-01",
          deleted: false,
          payeeName: "Rent",
          categoryName: "Rent",
          accountName: "Checking",
        },
      ],
    } as unknown as YnabClient;

    await expect(
      getUpcomingObligations(ynabClient, {
        asOfDate: "2026-04-30",
        detailLevel: "detailed",
        planId: "plan-1",
      }),
    ).resolves.toMatchObject({
      obligation_count: 1,
      expected_inflow_count: 0,
      top_due: [
        expect.objectContaining({
          amount: "1550.00",
          signed_amount: "-1550.00",
          type: "outflow",
        }),
      ],
    });
  });

  it("filters repeated casual merchants out of recurring expense detection", async () => {
    // DEFECT: three roughly monthly purchases can be mistaken for a recurring bill even when amounts vary heavily.
    const ynabClient = {
      listTransactions: async () => [
        {
          id: "rent-1",
          amount: -1550000,
          date: "2026-02-01",
          deleted: false,
          payeeId: "rent",
          payeeName: "Rent",
        },
        {
          id: "rent-2",
          amount: -1550000,
          date: "2026-03-01",
          deleted: false,
          payeeId: "rent",
          payeeName: "Rent",
        },
        {
          id: "rent-3",
          amount: -1550000,
          date: "2026-04-01",
          deleted: false,
          payeeId: "rent",
          payeeName: "Rent",
        },
        {
          id: "clinic-1",
          amount: -20000,
          date: "2026-02-16",
          deleted: false,
          payeeId: "clinic",
          payeeName: "Clinic",
        },
        {
          id: "clinic-2",
          amount: -395150,
          date: "2026-03-16",
          deleted: false,
          payeeId: "clinic",
          payeeName: "Clinic",
        },
        {
          id: "clinic-3",
          amount: -878950,
          date: "2026-04-16",
          deleted: false,
          payeeId: "clinic",
          payeeName: "Clinic",
        },
      ],
    } as unknown as YnabClient;

    await expect(
      getRecurringExpenseSummary(ynabClient, {
        fromDate: "2026-02-01",
        planId: "plan-1",
        toDate: "2026-04-30",
      }),
    ).resolves.toMatchObject({
      recurring_expenses: [
        expect.objectContaining({
          payee_name: "Rent",
        }),
      ],
    });
  });

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

  it("caps digest lists by explicit topN and uses stable tie-breaking", async () => {
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
      month: "2026-04-01",
      planId: "plan-1",
      topN: 3,
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
