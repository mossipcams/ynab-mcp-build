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
  getIncomeSummary,
  getMonthlyReview,
  getNetWorthTrajectory,
  getRecurringExpenseSummary,
  getSpendingSummary,
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

  it("uses transaction outflows for monthly review spent when reimbursements make category activity positive", async () => {
    // DEFECT: reimbursement-heavy months can show top spending but report spent as zero from net category activity.
    const ynabClient = {
      getPlanMonth: async () => ({
        month: "2026-05-01",
        income: 300000,
        budgeted: 200000,
        activity: 150000,
        toBeBudgeted: 0,
        categories: [],
      }),
      listTransactions: async () => [
        {
          id: "reimbursement",
          date: "2026-05-01",
          amount: 250000,
          deleted: false,
        },
        {
          id: "rent",
          date: "2026-05-01",
          amount: -100000,
          categoryId: "rent-category",
          categoryName: "Rent",
          payeeName: "Landlord",
          accountName: "Checking",
          deleted: false,
        },
      ],
    } as unknown as YnabClient;

    await expect(
      getMonthlyReview(ynabClient, {
        month: "2026-05-01",
        planId: "plan-1",
      }),
    ).resolves.toMatchObject({
      assigned: "200.00",
      spent: "100.00",
      assigned_vs_spent: "100.00",
      top_spending_categories: [
        {
          id: "rent-category",
          name: "Rent",
          amount: "100.00",
          transaction_count: 1,
        },
      ],
    });
  });

  it("rolls spending summary categories up from split subtransactions", async () => {
    // DEFECT: split parent transactions with no category can hide large spending in top category summaries.
    const ynabClient = {
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
          ],
        },
        {
          id: "home-group",
          name: "Home",
          deleted: false,
          hidden: false,
          categories: [
            {
              id: "household",
              name: "Household",
              deleted: false,
              hidden: false,
            },
          ],
        },
      ],
      listPlanMonths: async () => [
        {
          month: "2026-05-01",
          budgeted: 120000,
          activity: -100000,
          deleted: false,
        },
      ],
      listTransactions: async () => [
        {
          id: "split-target",
          date: "2026-05-12",
          amount: -100000,
          payeeName: "Target",
          deleted: false,
          subtransactions: [
            {
              id: "split-groceries",
              amount: -30000,
              categoryId: "groceries",
              categoryName: "Groceries",
              deleted: false,
            },
            {
              id: "split-household",
              amount: -70000,
              categoryId: "household",
              categoryName: "Household",
              deleted: false,
            },
          ],
        },
      ],
    } as unknown as YnabClient;

    await expect(
      getSpendingSummary(ynabClient, {
        fromMonth: "2026-05-01",
        planId: "plan-1",
        toMonth: "2026-05-01",
      }),
    ).resolves.toMatchObject({
      spent: "100.00",
      transaction_count: 1,
      top_categories: [
        {
          id: "household",
          name: "Household",
          amount: "70.00",
          transaction_count: 1,
        },
        {
          id: "groceries",
          name: "Groceries",
          amount: "30.00",
          transaction_count: 1,
        },
      ],
      top_category_groups: [
        {
          name: "Home",
          amount: "70.00",
          transaction_count: 1,
        },
        {
          name: "Food",
          amount: "30.00",
          transaction_count: 1,
        },
      ],
    });
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

  it("excludes hidden and deleted categories from spending anomaly calculations", async () => {
    // DEFECT: hidden or deleted categories can dominate anomaly rankings and surface stale budget noise.
    const ynabClient = {
      getPlanMonth: async (_planId: string, month: string) => ({
        month,
        categories:
          month === "2026-04-01"
            ? [
                {
                  id: "visible",
                  name: "Visible",
                  activity: -500000,
                  balance: 0,
                  deleted: false,
                  hidden: false,
                },
                {
                  id: "hidden",
                  name: "Hidden",
                  activity: -900000,
                  balance: 0,
                  deleted: false,
                  hidden: true,
                },
                {
                  id: "deleted",
                  name: "Deleted",
                  activity: -800000,
                  balance: 0,
                  deleted: true,
                  hidden: false,
                },
              ]
            : [
                {
                  id: "visible",
                  name: "Visible",
                  activity: -100000,
                  balance: 0,
                  deleted: false,
                  hidden: false,
                },
                {
                  id: "hidden",
                  name: "Hidden",
                  activity: 0,
                  balance: 0,
                  deleted: false,
                  hidden: true,
                },
                {
                  id: "deleted",
                  name: "Deleted",
                  activity: 0,
                  balance: 0,
                  deleted: true,
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
      anomaly_count: 1,
      anomalies: [
        expect.objectContaining({
          category_name: "Visible",
          increase: "400.00",
        }),
      ],
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

  it("detects recurring expenses at monthly cadence and amount-stability boundaries", async () => {
    // DEFECT: exact cadence or stability thresholds can be excluded by off-by-one comparison errors.
    const ynabClient = {
      listTransactions: async () => [
        {
          id: "cadence-25-a",
          amount: -100000,
          date: "2026-01-01",
          deleted: false,
          payeeId: "cadence-25",
          payeeName: "Cadence 25",
        },
        {
          id: "cadence-25-b",
          amount: -100000,
          date: "2026-01-26",
          deleted: false,
          payeeId: "cadence-25",
          payeeName: "Cadence 25",
        },
        {
          id: "cadence-25-c",
          amount: -100000,
          date: "2026-02-20",
          deleted: false,
          payeeId: "cadence-25",
          payeeName: "Cadence 25",
        },
        {
          id: "cadence-35-a",
          amount: -200000,
          date: "2026-01-01",
          deleted: false,
          payeeId: "cadence-35",
          payeeName: "Cadence 35",
        },
        {
          id: "cadence-35-b",
          amount: -200000,
          date: "2026-02-05",
          deleted: false,
          payeeId: "cadence-35",
          payeeName: "Cadence 35",
        },
        {
          id: "cadence-35-c",
          amount: -200000,
          date: "2026-03-12",
          deleted: false,
          payeeId: "cadence-35",
          payeeName: "Cadence 35",
        },
        {
          id: "stable-50-a",
          amount: -50000,
          date: "2026-01-15",
          deleted: false,
          payeeId: "stable-50",
          payeeName: "Stable 50",
        },
        {
          id: "stable-50-b",
          amount: -100000,
          date: "2026-02-15",
          deleted: false,
          payeeId: "stable-50",
          payeeName: "Stable 50",
        },
        {
          id: "stable-50-c",
          amount: -150000,
          date: "2026-03-15",
          deleted: false,
          payeeId: "stable-50",
          payeeName: "Stable 50",
        },
        {
          id: "unstable-a",
          amount: -49000,
          date: "2026-01-20",
          deleted: false,
          payeeId: "unstable",
          payeeName: "Unstable",
        },
        {
          id: "unstable-b",
          amount: -100000,
          date: "2026-02-20",
          deleted: false,
          payeeId: "unstable",
          payeeName: "Unstable",
        },
        {
          id: "unstable-c",
          amount: -151000,
          date: "2026-03-20",
          deleted: false,
          payeeId: "unstable",
          payeeName: "Unstable",
        },
      ],
    } as unknown as YnabClient;

    const summary = await getRecurringExpenseSummary(ynabClient, {
      fromDate: "2026-01-01",
      planId: "plan-1",
      toDate: "2026-03-31",
      topN: 10,
    });

    expect(
      summary.recurring_expenses.map((expense) => expense.payee_name),
    ).toEqual(["Cadence 35", "Cadence 25", "Stable 50"]);
    expect(summary.recurring_expenses).toEqual([
      expect.objectContaining({
        average_amount: "200.00",
        cadence: "monthly",
        occurrence_count: 3,
        payee_name: "Cadence 35",
      }),
      expect.objectContaining({
        average_amount: "100.00",
        cadence: "monthly",
        occurrence_count: 3,
        payee_name: "Cadence 25",
      }),
      expect.objectContaining({
        average_amount: "100.00",
        cadence: "monthly",
        occurrence_count: 3,
        payee_name: "Stable 50",
      }),
    ]);
  });

  it("rejects recurring expenses whose monthly cadence only matches on average", async () => {
    // DEFECT: irregular purchase dates can average to monthly and create false recurring bills.
    const ynabClient = {
      listTransactions: async () => [
        {
          id: "rent-jan",
          amount: -100000,
          date: "2026-01-01",
          deleted: false,
          payeeId: "rent",
          payeeName: "Rent",
        },
        {
          id: "rent-feb",
          amount: -100000,
          date: "2026-02-01",
          deleted: false,
          payeeId: "rent",
          payeeName: "Rent",
        },
        {
          id: "rent-mar",
          amount: -100000,
          date: "2026-03-01",
          deleted: false,
          payeeId: "rent",
          payeeName: "Rent",
        },
        {
          id: "travel-jan",
          amount: -900000,
          date: "2026-01-01",
          deleted: false,
          payeeId: "travel",
          payeeName: "Travel",
        },
        {
          id: "travel-feb",
          amount: -900000,
          date: "2026-02-20",
          deleted: false,
          payeeId: "travel",
          payeeName: "Travel",
        },
        {
          id: "travel-mar",
          amount: -900000,
          date: "2026-03-05",
          deleted: false,
          payeeId: "travel",
          payeeName: "Travel",
        },
      ],
    } as unknown as YnabClient;

    const summary = await getRecurringExpenseSummary(ynabClient, {
      fromDate: "2026-01-01",
      planId: "plan-1",
      toDate: "2026-03-31",
      topN: 10,
    });

    expect(
      summary.recurring_expenses.map((expense) => expense.payee_name),
    ).toEqual(["Rent"]);
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

  it("includes scheduled obligations exactly at 7, 14, and 30 days and excludes day 31", async () => {
    // DEFECT: upcoming obligation windows can drift at inclusive day boundaries and double-count outside the 30-day horizon.
    const ynabClient = {
      listScheduledTransactions: async () => [
        {
          id: "due-today",
          amount: -1000,
          dateNext: "2026-04-01",
          deleted: false,
          payeeName: "Today",
        },
        {
          id: "due-7",
          amount: -7000,
          dateNext: "2026-04-08",
          deleted: false,
          payeeName: "Seven",
        },
        {
          id: "due-14",
          amount: -14000,
          dateNext: "2026-04-15",
          deleted: false,
          payeeName: "Fourteen",
        },
        {
          id: "due-30",
          amount: -30000,
          dateNext: "2026-05-01",
          deleted: false,
          payeeName: "Thirty",
        },
        {
          id: "due-31",
          amount: -31000,
          dateNext: "2026-05-02",
          deleted: false,
          payeeName: "Thirty One",
        },
        {
          id: "past",
          amount: -5000,
          dateNext: "2026-03-31",
          deleted: false,
          payeeName: "Past",
        },
      ],
    } as unknown as YnabClient;

    await expect(
      getUpcomingObligations(ynabClient, {
        asOfDate: "2026-04-01",
        planId: "plan-1",
        topN: 10,
      }),
    ).resolves.toMatchObject({
      obligation_count: 4,
      windows: {
        "7d": {
          obligation_count: 2,
          total_outflows: "8.00",
        },
        "14d": {
          obligation_count: 3,
          total_outflows: "22.00",
        },
        "30d": {
          obligation_count: 4,
          total_outflows: "52.00",
        },
      },
      top_due: [
        expect.objectContaining({ id: "due-today" }),
        expect.objectContaining({ id: "due-7" }),
        expect.objectContaining({ id: "due-14" }),
        expect.objectContaining({ id: "due-30" }),
      ],
    });
  });

  it("classifies cash resilience status at coverage month boundaries", async () => {
    // DEFECT: coverage boundary comparisons can classify exact threshold values into the lower risk bucket.
    const makeClient = (balance: number) =>
      ({
        listAccounts: async () => [
          {
            id: "cash",
            name: "Checking",
            type: "checking",
            closed: false,
            deleted: false,
            balance,
          },
        ],
        listPlanMonths: async () => [
          { month: "2026-02-01", deleted: false, activity: -30000 },
          { month: "2026-03-01", deleted: false, activity: -30000 },
          { month: "2026-04-01", deleted: false, activity: -30000 },
        ],
        listScheduledTransactions: async () => [],
      }) as unknown as YnabClient;

    await expect(
      getCashResilienceSummary(makeClient(30000), {
        month: "2026-04-01",
        planId: "plan-1",
      }),
    ).resolves.toMatchObject({ coverage_months: "1.00", status: "thin" });
    await expect(
      getCashResilienceSummary(makeClient(90000), {
        month: "2026-04-01",
        planId: "plan-1",
      }),
    ).resolves.toMatchObject({ coverage_months: "3.00", status: "solid" });
    await expect(
      getCashResilienceSummary(makeClient(180000), {
        month: "2026-04-01",
        planId: "plan-1",
      }),
    ).resolves.toMatchObject({ coverage_months: "6.00", status: "strong" });
  });

  it("uses the same current 30-day scheduled net as upcoming obligations", async () => {
    // DEFECT: cash resilience labeled the current-month 7-day scheduled net as the next 30-day net.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-24T17:00:00.000Z"));

    const scheduledTransactions = [
      {
        id: "week-paycheck",
        dateFirst: "2026-04-01",
        dateNext: "2026-04-27",
        amount: 1082530,
        payeeName: "Payroll",
        deleted: false,
      },
      {
        id: "later-income",
        dateFirst: "2026-04-01",
        dateNext: "2026-05-10",
        amount: 58050,
        payeeName: "Reimbursement",
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
          balance: 9000000,
        },
      ],
      listPlanMonths: async () => [
        { month: "2026-02-01", deleted: false, activity: -3000000 },
        { month: "2026-03-01", deleted: false, activity: -3000000 },
        { month: "2026-04-01", deleted: false, activity: -3000000 },
      ],
      listScheduledTransactions: async () => scheduledTransactions,
    } as unknown as YnabClient;

    await expect(
      getUpcomingObligations(ynabClient, {
        asOfDate: "2026-04-24",
        planId: "plan-1",
      }),
    ).resolves.toMatchObject({
      windows: {
        "7d": {
          net_upcoming: "1082.53",
        },
        "30d": {
          net_upcoming: "1140.58",
        },
      },
    });

    await expect(
      getCashResilienceSummary(ynabClient, {
        planId: "plan-1",
      }),
    ).resolves.toMatchObject({
      month: "2026-04-01",
      scheduled_net_next_30d: "1140.58",
    });
  });

  it("rounds income averages and medians from integer milliunits to cents", async () => {
    // DEFECT: formatting through floating-point toFixed drifted exact half-cent income statistics down.
    const ynabClient = {
      listPlanMonths: async () => [
        { month: "2026-01-01", deleted: false, activity: 0 },
        { month: "2026-02-01", deleted: false, activity: 0 },
        { month: "2026-03-01", deleted: false, activity: 0 },
        { month: "2026-04-01", deleted: false, activity: 0 },
      ],
      listTransactions: async () => [
        {
          id: "income-jan",
          date: "2026-01-15",
          amount: 7000550,
          payeeName: "Payroll",
          cleared: "cleared",
          approved: true,
          deleted: false,
        },
        {
          id: "income-feb",
          date: "2026-02-15",
          amount: 5181310,
          payeeName: "Payroll",
          cleared: "cleared",
          approved: true,
          deleted: false,
        },
        {
          id: "income-mar",
          date: "2026-03-15",
          amount: 5181320,
          payeeName: "Payroll",
          cleared: "cleared",
          approved: true,
          deleted: false,
        },
        {
          id: "income-apr",
          date: "2026-04-15",
          amount: 3881800,
          payeeName: "Payroll",
          cleared: "cleared",
          approved: true,
          deleted: false,
        },
      ],
    } as unknown as YnabClient;

    await expect(
      getIncomeSummary(ynabClient, {
        fromMonth: "2026-01-01",
        planId: "plan-1",
        toMonth: "2026-04-01",
      }),
    ).resolves.toMatchObject({
      average_monthly_income: "5311.25",
      median_monthly_income: "5181.32",
    });
  });

  it("uses month income totals and excludes reimbursements from income sources", async () => {
    // DEFECT: positive category reimbursements can inflate income totals and source rankings.
    const ynabClient = {
      listPlanMonths: async () => [
        {
          month: "2026-05-01",
          income: 300000,
          budgeted: 0,
          activity: 0,
          deleted: false,
        },
      ],
      listTransactions: async () => [
        {
          id: "payroll",
          date: "2026-05-15",
          amount: 300000,
          payeeId: "employer",
          payeeName: "Employer",
          categoryName: "Inflow: Ready to Assign",
          deleted: false,
        },
        {
          id: "dining-refund",
          date: "2026-05-16",
          amount: 50000,
          payeeId: "restaurant",
          payeeName: "Restaurant Refund",
          categoryId: "dining",
          categoryName: "Dining",
          deleted: false,
        },
      ],
    } as unknown as YnabClient;

    await expect(
      getIncomeSummary(ynabClient, {
        fromMonth: "2026-05-01",
        planId: "plan-1",
        toMonth: "2026-05-01",
      }),
    ).resolves.toMatchObject({
      income_total: "300.00",
      average_monthly_income: "300.00",
      top_income_sources: [
        {
          id: "employer",
          name: "Employer",
          amount: "300.00",
          transaction_count: 1,
        },
      ],
      months: [
        {
          month: "2026-05-01",
          income: "300.00",
        },
      ],
    });
  });

  it("nets positive split subtransaction lines in spending summary category rollups", async () => {
    // DEFECT: split-line returns can make top category totals exceed the net spent total.
    const ynabClient = {
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
          ],
        },
      ],
      listPlanMonths: async () => [
        {
          month: "2026-05-01",
          budgeted: 100000,
          activity: -70000,
          deleted: false,
        },
      ],
      listTransactions: async () => [
        {
          id: "split-return",
          date: "2026-05-12",
          amount: -70000,
          payeeName: "Market",
          deleted: false,
          subtransactions: [
            {
              id: "split-purchase",
              amount: -100000,
              categoryId: "groceries",
              categoryName: "Groceries",
              deleted: false,
            },
            {
              id: "split-return-line",
              amount: 30000,
              categoryId: "groceries",
              categoryName: "Groceries",
              deleted: false,
            },
          ],
        },
      ],
    } as unknown as YnabClient;

    await expect(
      getSpendingSummary(ynabClient, {
        fromMonth: "2026-05-01",
        planId: "plan-1",
        toMonth: "2026-05-01",
      }),
    ).resolves.toMatchObject({
      spent: "70.00",
      top_categories: [
        {
          id: "groceries",
          name: "Groceries",
          amount: "70.00",
          transaction_count: 1,
        },
      ],
      top_category_groups: [
        {
          name: "Food",
          amount: "70.00",
          transaction_count: 1,
        },
      ],
      top_payees: [
        {
          name: "Market",
          amount: "70.00",
          transaction_count: 1,
        },
      ],
    });
  });
});
