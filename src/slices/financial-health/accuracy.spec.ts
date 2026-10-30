import { afterEach, describe, expect, it, vi } from "vitest";

import type { YnabClient } from "../../platform/ynab/client.js";
import {
  getCashFlowSummary,
  getCashResilienceSummary,
  getCategoryTrendSummary,
  getIncomeSummary,
  getMonthlyReview,
  getNetWorthTrajectory,
  getSpendingAnomalies,
  getSpendingSummary,
  getUpcomingObligations,
} from "./service.js";

const accounts = [
  {
    id: "checking",
    name: "Checking",
    type: "checking",
    onBudget: true,
    closed: false,
    deleted: false,
    balance: 0,
  },
  {
    id: "brokerage",
    name: "Brokerage",
    type: "otherAsset",
    onBudget: false,
    closed: false,
    deleted: false,
    balance: 0,
  },
];

const mayTransactions = [
  {
    id: "paycheck",
    date: "2026-05-01",
    amount: 3000000,
    accountId: "checking",
    payeeId: "payroll",
    payeeName: "Payroll",
    categoryName: "Split",
    deleted: false,
    subtransactions: [
      {
        id: "paycheck-rta",
        amount: 2500000,
        categoryId: "rta",
        categoryName: "Inflow: Ready to Assign",
        deleted: false,
      },
      {
        id: "paycheck-savings",
        amount: 500000,
        transferAccountId: "savings",
        deleted: false,
      },
    ],
  },
  {
    id: "market-gain",
    date: "2026-05-02",
    amount: 8000000,
    accountId: "brokerage",
    deleted: false,
  },
  {
    id: "market-loss",
    date: "2026-05-03",
    amount: -3000000,
    accountId: "brokerage",
    deleted: false,
  },
  {
    id: "mortgage",
    date: "2026-05-04",
    amount: -2400000,
    accountId: "checking",
    transferAccountId: "loan",
    categoryId: "mortgage",
    categoryName: "Mortgage",
    deleted: false,
  },
  {
    id: "groceries",
    date: "2026-05-04",
    amount: -150000,
    accountId: "checking",
    categoryId: "groceries",
    categoryName: "Groceries",
    deleted: false,
  },
  {
    id: "to-savings",
    date: "2026-05-05",
    amount: -1000000,
    accountId: "checking",
    transferAccountId: "savings",
    deleted: false,
  },
  {
    id: "all-transfer-split",
    date: "2026-05-06",
    amount: -1000000,
    accountId: "checking",
    deleted: false,
    subtransactions: [
      {
        id: "ats-1",
        amount: -500000,
        transferAccountId: "savings",
        deleted: false,
      },
      {
        id: "ats-2",
        amount: -500000,
        transferAccountId: "brokerage-2",
        deleted: false,
      },
    ],
  },
];

function budgetClient(overrides: Record<string, unknown> = {}) {
  return {
    getPlanMonth: async (_planId: string, month: string) => ({
      month,
      income: 0,
      budgeted: 0,
      activity: 0,
      toBeBudgeted: 0,
      categories: [],
    }),
    listAccounts: async () => accounts,
    listCategories: async () => [],
    listPlanMonths: async () => [{ month: "2026-05-01", deleted: false }],
    listTransactions: async () => mayTransactions,
    ...overrides,
  } as unknown as YnabClient;
}

describe("financial health accuracy", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts only budget money: no tracking-account activity or split transfer lines", async () => {
    // DEFECT: tracking-account market moves counted as income/spending and split transfer lines counted as income.
    const ynabClient = budgetClient();

    await expect(
      getMonthlyReview(ynabClient, { month: "2026-05-01", planId: "plan-1" }),
    ).resolves.toMatchObject({
      inflow: "2500.00",
      outflow: "150.00",
    });
    await expect(
      getCashFlowSummary(ynabClient, {
        fromMonth: "2026-05-01",
        toMonth: "2026-05-01",
        planId: "plan-1",
      }),
    ).resolves.toMatchObject({ inflow: "2500.00", outflow: "150.00" });
    await expect(
      getSpendingSummary(ynabClient, {
        fromMonth: "2026-05-01",
        toMonth: "2026-05-01",
        planId: "plan-1",
      }),
    ).resolves.toMatchObject({
      spent: "150.00",
      top_categories: [
        { id: "groceries", name: "Groceries", amount: "150.00" },
      ],
    });
  });

  it("counts categorized transfers into tracking accounts as spending", async () => {
    // DEFECT: mortgage payments to a tracking loan account vanished from spending and obligations.
    const loan = { ...accounts[1], id: "loan", name: "Mortgage", type: "mortgage" };
    const ynabClient = budgetClient({
      listAccounts: async () => [...accounts, loan],
      listScheduledTransactions: async () => [
        {
          id: "mortgage-next",
          dateNext: "2026-05-10",
          frequency: "never",
          amount: -2400000,
          accountId: "checking",
          transferAccountId: "loan",
          categoryId: "mortgage",
          deleted: false,
        },
        {
          id: "brokerage-contribution",
          dateNext: "2026-05-11",
          frequency: "never",
          amount: -700000,
          accountId: "brokerage",
          categoryId: "investing",
          deleted: false,
        },
      ],
    });

    await expect(
      getMonthlyReview(ynabClient, { month: "2026-05-01", planId: "plan-1" }),
    ).resolves.toMatchObject({ inflow: "2500.00", outflow: "2550.00" });
    await expect(
      getSpendingSummary(ynabClient, {
        fromMonth: "2026-05-01",
        toMonth: "2026-05-01",
        planId: "plan-1",
      }),
    ).resolves.toMatchObject({
      spent: "2550.00",
      top_categories: [
        { id: "mortgage", name: "Mortgage", amount: "2400.00" },
        { id: "groceries", name: "Groceries", amount: "150.00" },
      ],
    });
    await expect(
      getUpcomingObligations(ynabClient, {
        asOfDate: "2026-05-01",
        planId: "plan-1",
        topN: 10,
      }),
    ).resolves.toMatchObject({
      obligation_count: 1,
      windows: { "30d": { total_outflows: "2400.00" } },
    });
  });

  it("counts split Ready to Assign lines as income sources", async () => {
    // DEFECT: split paychecks were dropped from income because the parent category is "Split".
    await expect(
      getIncomeSummary(budgetClient(), {
        fromMonth: "2026-05-01",
        toMonth: "2026-05-01",
        planId: "plan-1",
      }),
    ).resolves.toMatchObject({
      income_total: "2500.00",
      top_income_sources: [{ id: "payroll", amount: "2500.00" }],
    });
  });

  it("keeps closed accounts in historical net worth and debt", async () => {
    // DEFECT: closing an account erased it from every past month, inventing net-worth gains.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));
    const ynabClient = {
      listAccounts: async () => [
        {
          id: "new-checking",
          name: "New Checking",
          type: "checking",
          closed: false,
          deleted: false,
          balance: 5000000,
        },
        {
          id: "old-checking",
          name: "Old Checking",
          type: "checking",
          closed: true,
          deleted: false,
          balance: 0,
        },
        {
          id: "old-loan",
          name: "Old Loan",
          type: "otherDebt",
          onBudget: false,
          closed: true,
          deleted: false,
          balance: 0,
        },
      ],
      listPlanMonths: async () => [],
      listTransactions: async () => [
        {
          id: "move-out",
          date: "2026-03-01",
          amount: -5000000,
          accountId: "old-checking",
          deleted: false,
        },
        {
          id: "move-in",
          date: "2026-03-01",
          amount: 5000000,
          accountId: "new-checking",
          deleted: false,
        },
        {
          id: "loan-payoff",
          date: "2026-03-02",
          amount: 1000000,
          accountId: "old-loan",
          deleted: false,
        },
      ],
    } as unknown as YnabClient;

    await expect(
      getNetWorthTrajectory(ynabClient, {
        fromMonth: "2026-02-01",
        toMonth: "2026-03-01",
        planId: "plan-1",
      }),
    ).resolves.toMatchObject({
      start_net_worth: "4000.00",
      end_net_worth: "5000.00",
      months: [
        { month: "2026-02-01", net_worth: "4000.00", debt: "1000.00" },
        { month: "2026-03-01", net_worth: "5000.00", debt: "0.00" },
      ],
    });
  });

  it("expands recurring scheduled transactions across the window", async () => {
    // DEFECT: a weekly bill counted once per 30 days, understating obligations ~4x.
    const ynabClient = {
      listAccounts: async () => [],
      listPlanMonths: async () => [{ month: "2026-04-01", deleted: false }],
      listScheduledTransactions: async () => [
        {
          id: "childcare",
          dateFirst: "2026-01-02",
          dateNext: "2026-04-02",
          frequency: "weekly",
          amount: -500000,
          deleted: false,
        },
        {
          id: "rent",
          dateFirst: "2026-01-01",
          dateNext: "2026-04-01",
          frequency: "monthly",
          amount: -2000000,
          deleted: false,
        },
        {
          id: "mortgage",
          dateFirst: "2026-01-05",
          dateNext: "2026-04-05",
          frequency: "never",
          amount: -1000000,
          transferAccountId: "loan",
          categoryId: "mortgage",
          deleted: false,
        },
        {
          id: "split-pay",
          dateFirst: "2026-01-10",
          dateNext: "2026-04-10",
          frequency: "never",
          amount: 3000000,
          deleted: false,
          subtransactions: [
            { id: "sp-1", amount: 2500000, categoryId: "rta", deleted: false },
            {
              id: "sp-2",
              amount: 500000,
              transferAccountId: "savings",
              deleted: false,
            },
          ],
        },
      ],
    } as unknown as YnabClient;

    // childcare: 04-02, 04-09, 04-16, 04-23, 04-30 = 2500; rent 04-01 + 05-01 = 4000; transfers excluded.
    await expect(
      getUpcomingObligations(ynabClient, {
        asOfDate: "2026-04-01",
        planId: "plan-1",
        topN: 10,
      }),
    ).resolves.toMatchObject({
      obligation_count: 7,
      expected_inflow_count: 1,
      windows: {
        "7d": { total_outflows: "2500.00", total_inflows: "0.00" },
        "30d": { total_outflows: "6500.00", total_inflows: "2500.00" },
      },
    });
    await expect(
      getCashResilienceSummary(ynabClient, {
        asOfDate: "2026-04-01",
        planId: "plan-1",
      }),
    ).resolves.toMatchObject({ scheduled_net_next_30d: "-4000.00" });
  });

  it("leaves the in-progress month out of income and category-trend averages", async () => {
    // DEFECT: a half-finished current month dragged averages and minimums down.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));
    const ynabClient = {
      listPlanMonths: async () => [
        { month: "2026-08-01", deleted: false, income: 6000000 },
        { month: "2026-09-01", deleted: false, income: 6000000 },
        { month: "2026-10-01", deleted: false, income: 1500000 },
      ],
      listTransactions: async () => [],
      getPlanMonth: async (_planId: string, month: string) => ({
        month,
        categories: [
          {
            id: "groceries",
            name: "Groceries",
            activity: month === "2026-10-01" ? -100000 : -600000,
            budgeted: 600000,
            balance: 0,
            hidden: false,
            deleted: false,
          },
        ],
      }),
    } as unknown as YnabClient;

    await expect(
      getIncomeSummary(ynabClient, {
        fromMonth: "2026-08-01",
        toMonth: "2026-10-01",
        planId: "plan-1",
      }),
    ).resolves.toMatchObject({
      income_total: "13500.00",
      average_monthly_income: "6000.00",
      median_monthly_income: "6000.00",
      volatility_percent: "0.00",
    });
    await expect(
      getCategoryTrendSummary(ynabClient, {
        categoryId: "groceries",
        fromMonth: "2026-08-01",
        toMonth: "2026-10-01",
        planId: "plan-1",
      }),
    ).resolves.toMatchObject({ average_spent: "600.00", spent_change: "0.00" });
  });

  it("resolves the current month in the configured time zone", async () => {
    // DEFECT: 9pm EDT on Oct 31 resolved to November because "today" was UTC.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T01:00:00.000Z"));
    const getPlanMonth = vi.fn(async (_planId: string, month: string) => ({
      month,
      categories: [],
    }));
    const ynabClient = budgetClient({
      getPlanMonth,
      listTransactions: async () => [],
      listPlanMonths: async () => [
        { month: "2026-11-01", deleted: false },
        { month: "2026-10-01", deleted: false },
      ],
    });

    await getMonthlyReview(ynabClient, {
      planId: "plan-1",
      timeZone: "America/New_York",
    });

    expect(getPlanMonth).toHaveBeenCalledWith("plan-1", "2026-10-01");
  });

  it("does not treat credit card payment activity as spending", async () => {
    // DEFECT: paying a card statement showed up as Visa "spending" and false anomalies.
    const visa = (activity: number) => ({
      id: "visa",
      name: "Visa",
      categoryGroupName: "Credit Card Payments",
      activity,
      budgeted: 0,
      balance: 0,
      hidden: false,
      deleted: false,
    });
    const ynabClient = {
      listPlanMonths: async () => [],
      getPlanMonth: async (_planId: string, month: string) => ({
        month,
        categories: [visa(month === "2026-04-01" ? -2000000 : -100000)],
      }),
    } as unknown as YnabClient;

    await expect(
      getSpendingAnomalies(ynabClient, {
        latestMonth: "2026-04-01",
        planId: "plan-1",
      }),
    ).resolves.toMatchObject({ anomaly_count: 0 });
    await expect(
      getCategoryTrendSummary(ynabClient, {
        categoryId: "visa",
        fromMonth: "2026-03-01",
        toMonth: "2026-04-01",
        planId: "plan-1",
      }),
    ).resolves.toMatchObject({ average_spent: "0.00" });
  });
});
