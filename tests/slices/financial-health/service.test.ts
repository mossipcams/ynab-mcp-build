import { describe, expect, it, vi } from "vitest";

import {
  getBudgetHealthSummary,
  getFinancialSnapshot,
  getSpendingAnomalies
} from "../../../src/slices/financial-health/service.js";

describe("financial health service", () => {
  it("builds a compact snapshot from the resolved current month and active accounts only", async () => {
    // DEFECT: the financial snapshot can resolve the wrong month or include deleted accounts in asset and debt rollups.
    const ynabClient = {
      listPlans: vi.fn().mockResolvedValue({
        plans: [{ id: "plan-1", name: "Household" }],
        defaultPlan: { id: "plan-1", name: "Household" }
      }),
      listPlanMonths: vi.fn().mockResolvedValue([
        {
          month: "2026-04-01",
          deleted: false
        }
      ]),
      getPlanMonth: vi.fn().mockResolvedValue({
        month: "2026-04-01",
        toBeBudgeted: 25000,
        income: 300000,
        budgeted: 200000,
        activity: -150000,
        ageOfMoney: 42,
        categories: []
      }),
      listAccounts: vi.fn().mockResolvedValue([
        {
          id: "account-1",
          name: "Checking",
          balance: 200000,
          deleted: false,
          closed: false,
          onBudget: true
        },
        {
          id: "account-2",
          name: "Card",
          balance: -50000,
          deleted: false,
          closed: false,
          onBudget: true
        },
        {
          id: "account-3",
          name: "Archived",
          balance: 999999,
          deleted: true,
          closed: false,
          onBudget: true
        }
      ]),
      listTransactions: vi.fn().mockResolvedValue([])
    };

    await expect(getFinancialSnapshot(ynabClient as never, {})).resolves.toEqual({
      month: "2026-04-01",
      net_worth: "150.00",
      liquid_cash: "200.00",
      debt: "50.00",
      ready_to_assign: "25.00",
      income: "300.00",
      assigned: "200.00",
      spent: "150.00",
      assigned_vs_spent: "50.00",
      age_of_money: 42,
      account_count: 2,
      on_budget_account_count: 2,
      debt_account_count: 1,
      top_asset_accounts: [
        {
          id: "account-1",
          name: "Checking",
          amount: "200.00"
        }
      ],
      top_debt_accounts: [
        {
          id: "account-2",
          name: "Card",
          amount: "50.00"
        }
      ]
    });
  });

  it("summarizes overspent and underfunded categories from the resolved month", async () => {
    // DEFECT: the budget health summary can include hidden or deleted categories and misstate overspent and underfunded totals.
    const ynabClient = {
      listPlans: vi.fn().mockResolvedValue({
        plans: [{ id: "plan-1", name: "Household" }],
        defaultPlan: { id: "plan-1", name: "Household" }
      }),
      listPlanMonths: vi.fn().mockResolvedValue([
        {
          month: "2026-04-01",
          deleted: false
        }
      ]),
      getPlanMonth: vi.fn().mockResolvedValue({
        month: "2026-04-01",
        ageOfMoney: 17,
        toBeBudgeted: 10000,
        budgeted: 120000,
        activity: -95000,
        categories: [
          {
            id: "category-1",
            name: "Rent",
            balance: -25000,
            hidden: false,
            deleted: false,
            goalUnderFunded: 10000,
            categoryGroupName: "Bills"
          },
          {
            id: "category-2",
            name: "Hidden",
            balance: -99999,
            hidden: true,
            deleted: false,
            goalUnderFunded: 99999,
            categoryGroupName: "Hidden"
          }
        ]
      }),
      listAccounts: vi.fn().mockResolvedValue([]),
      listTransactions: vi.fn().mockResolvedValue([])
    };

    await expect(getBudgetHealthSummary(ynabClient as never, {})).resolves.toMatchObject({
      month: "2026-04-01",
      age_of_money: 17,
      ready_to_assign: "10.00",
      overspent_total: "25.00",
      underfunded_total: "10.00",
      overspent_category_count: 1,
      underfunded_category_count: 1,
      top_overspent_categories: [
        {
          id: "category-1",
          name: "Rent",
          category_group_name: "Bills",
          amount: "25.00"
        }
      ],
      top_underfunded_categories: [
        {
          id: "category-1",
          name: "Rent",
          category_group_name: "Bills",
          amount: "10.00"
        }
      ]
    });
  });

  it("flags category spikes only when the latest month exceeds the baseline threshold", async () => {
    // DEFECT: spending anomalies can overfire on ordinary month-to-month variance instead of real spikes.
    const ynabClient = {
      listPlans: vi.fn().mockResolvedValue({
        plans: [{ id: "plan-1", name: "Household" }],
        defaultPlan: { id: "plan-1", name: "Household" }
      }),
      getPlanMonth: vi.fn()
        .mockResolvedValueOnce({
          month: "2026-01-01",
          categories: [
            {
              id: "category-1",
              name: "Dining",
              activity: -10000,
              hidden: false,
              deleted: false
            }
          ]
        })
        .mockResolvedValueOnce({
          month: "2026-02-01",
          categories: [
            {
              id: "category-1",
              name: "Dining",
              activity: -12000,
              hidden: false,
              deleted: false
            }
          ]
        })
        .mockResolvedValueOnce({
          month: "2026-03-01",
          categories: [
            {
              id: "category-1",
              name: "Dining",
              activity: -11000,
              hidden: false,
              deleted: false
            }
          ]
        })
        .mockResolvedValueOnce({
          month: "2026-04-01",
          categories: [
            {
              id: "category-1",
              name: "Dining",
              activity: -40000,
              hidden: false,
              deleted: false
            }
          ]
        })
    };

    await expect(
      getSpendingAnomalies(ynabClient as never, {
        latestMonth: "2026-04-01",
        minimumDifference: 5000,
        thresholdMultiplier: 2
      })
    ).resolves.toEqual({
      latest_month: "2026-04-01",
      baseline_month_count: 3,
      anomaly_count: 1,
      anomalies: [
        {
          category_id: "category-1",
          category_name: "Dining",
          latest_spent: "40.00",
          baseline_average: "11.00",
          increase: "29.00",
          increase_pct: "263.64"
        }
      ]
    });
  });
});
