import { describe, expect, it, vi } from "vitest";

import {
  getCashFlowSummary,
  getBudgetHealthSummary,
  getCashRunway,
  getCategoryTrendSummary,
  getFinancialHealthCheck,
  getFinancialSnapshot,
  getIncomeSummary,
  getMonthlyReview,
  getSpendingSummary,
  getSpendingAnomalies,
  getUpcomingObligations
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

  it("resolves the first non-deleted month and honors a custom topN for account rollups", async () => {
    // DEFECT: snapshot rollups can resolve a deleted month or ignore a caller-provided topN and over-return accounts.
    const ynabClient = {
      listPlans: vi.fn().mockResolvedValue({
        plans: [{ id: "plan-1", name: "Household" }],
        defaultPlan: { id: "plan-1", name: "Household" }
      }),
      listPlanMonths: vi.fn().mockResolvedValue([
        {
          month: "2026-03-01",
          deleted: true
        },
        {
          month: "2026-04-01",
          deleted: false
        }
      ]),
      getPlanMonth: vi.fn().mockResolvedValue({
        month: "2026-04-01",
        toBeBudgeted: 10000,
        income: 120000,
        budgeted: 90000,
        activity: -60000,
        ageOfMoney: 30,
        categories: []
      }),
      listAccounts: vi.fn().mockResolvedValue([
        {
          id: "account-3",
          name: "Brokerage",
          balance: 150000,
          deleted: false,
          closed: false,
          onBudget: false
        },
        {
          id: "account-1",
          name: "Checking",
          balance: 300000,
          deleted: false,
          closed: false,
          onBudget: true
        },
        {
          id: "account-2",
          name: "Savings",
          balance: 200000,
          deleted: false,
          closed: false,
          onBudget: true
        },
        {
          id: "account-4",
          name: "Card",
          balance: -90000,
          deleted: false,
          closed: false,
          onBudget: true
        }
      ]),
      listTransactions: vi.fn().mockResolvedValue([])
    };

    await expect(getFinancialSnapshot(ynabClient as never, { topN: 1 })).resolves.toEqual({
      month: "2026-04-01",
      net_worth: "560.00",
      liquid_cash: "650.00",
      debt: "90.00",
      ready_to_assign: "10.00",
      income: "120.00",
      assigned: "90.00",
      spent: "60.00",
      assigned_vs_spent: "30.00",
      age_of_money: 30,
      account_count: 4,
      on_budget_account_count: 3,
      debt_account_count: 1,
      top_asset_accounts: [
        {
          id: "account-1",
          name: "Checking",
          amount: "300.00"
        }
      ],
      top_debt_accounts: [
        {
          id: "account-4",
          name: "Card",
          amount: "90.00"
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

  it("sorts overspent and underfunded categories by severity and respects a custom topN", async () => {
    // DEFECT: budget health rollups can return unsorted category lists or ignore the requested topN cap.
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
        ageOfMoney: 9,
        toBeBudgeted: 2000,
        budgeted: 50000,
        activity: -30000,
        categories: [
          {
            id: "category-1",
            name: "Big Overspend",
            balance: -20000,
            hidden: false,
            deleted: false,
            goalUnderFunded: 10000,
            categoryGroupName: "Bills"
          },
          {
            id: "category-2",
            name: "Big Underfunded",
            balance: -10000,
            hidden: false,
            deleted: false,
            goalUnderFunded: 20000,
            categoryGroupName: "Goals"
          },
          {
            id: "category-3",
            name: "Hidden",
            balance: -99999,
            hidden: true,
            deleted: false,
            goalUnderFunded: 99999,
            categoryGroupName: "Ignore"
          }
        ]
      }),
      listAccounts: vi.fn().mockResolvedValue([]),
      listTransactions: vi.fn().mockResolvedValue([])
    };

    await expect(getBudgetHealthSummary(ynabClient as never, { topN: 1 })).resolves.toEqual({
      month: "2026-04-01",
      age_of_money: 9,
      ready_to_assign: "2.00",
      available_total: "0.00",
      overspent_total: "30.00",
      underfunded_total: "30.00",
      assigned: "50.00",
      spent: "30.00",
      assigned_vs_spent: "20.00",
      overspent_category_count: 2,
      underfunded_category_count: 2,
      top_overspent_categories: [
        {
          id: "category-1",
          name: "Big Overspend",
          category_group_name: "Bills",
          amount: "20.00"
        }
      ],
      top_underfunded_categories: [
        {
          id: "category-2",
          name: "Big Underfunded",
          category_group_name: "Goals",
          amount: "20.00"
        }
      ]
    });
  });

  it("scores financial health using only in-month non-transfer cleanup items and caps top risks by topN", async () => {
    // DEFECT: the health check can count transfers or out-of-month cleanup items and mis-rank the riskiest issues.
    const ynabClient = {
      listPlans: vi.fn().mockResolvedValue({
        plans: [{ id: "plan-1", name: "Household" }],
        defaultPlan: { id: "plan-1", name: "Household" }
      }),
      getPlanMonth: vi.fn().mockResolvedValue({
        month: "2026-04-01",
        ageOfMoney: 12,
        toBeBudgeted: -1000,
        budgeted: 50000,
        activity: -45000,
        categories: [
          {
            id: "category-1",
            name: "Rent",
            balance: -5000,
            hidden: false,
            deleted: false,
            goalUnderFunded: 10000,
            categoryGroupName: "Bills"
          }
        ]
      }),
      listAccounts: vi.fn().mockResolvedValue([
        {
          id: "account-1",
          name: "Checking",
          balance: 100000,
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
        }
      ]),
      listTransactions: vi.fn().mockResolvedValue([
        {
          id: "txn-1",
          date: "2026-04-02",
          amount: -1000,
          categoryId: null,
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: null
        },
        {
          id: "txn-2",
          date: "2026-04-03",
          amount: -2000,
          categoryId: "category-1",
          approved: false,
          cleared: "cleared",
          deleted: false,
          transferAccountId: null
        },
        {
          id: "txn-3",
          date: "2026-04-04",
          amount: -3000,
          categoryId: "category-1",
          approved: true,
          cleared: "uncleared",
          deleted: false,
          transferAccountId: null
        },
        {
          id: "txn-4",
          date: "2026-04-05",
          amount: -4000,
          categoryId: null,
          approved: false,
          cleared: "uncleared",
          deleted: false,
          transferAccountId: "account-2"
        },
        {
          id: "txn-5",
          date: "2026-03-30",
          amount: -5000,
          categoryId: null,
          approved: false,
          cleared: "uncleared",
          deleted: false,
          transferAccountId: null
        },
        {
          id: "txn-6",
          date: "2026-04-06",
          amount: -6000,
          categoryId: null,
          approved: false,
          cleared: "uncleared",
          deleted: true,
          transferAccountId: null
        }
      ])
    };

    await expect(
      getFinancialHealthCheck(ynabClient as never, {
        month: "2026-04-01",
        topN: 2
      })
    ).resolves.toEqual({
      as_of_month: "2026-04-01",
      status: "watch",
      score: 50,
      metrics: {
        net_worth: "50.00",
        liquid_cash: "100.00",
        debt: "50.00",
        ready_to_assign: "-1.00",
        age_of_money: 12,
        overspent_category_count: 1,
        underfunded_category_count: 1,
        uncategorized_transaction_count: 1,
        unapproved_transaction_count: 1,
        uncleared_transaction_count: 1
      },
      top_risks: [
        {
          code: "negative_ready_to_assign",
          severity: "high"
        },
        {
          code: "overspent_categories",
          severity: "high"
        }
      ]
    });
  });

  it("builds a monthly review from in-month non-transfer cash flow and grouped spending rollups", async () => {
    // DEFECT: the monthly review can include transfers or out-of-month activity and misstate the top spending category totals.
    const ynabClient = {
      listPlans: vi.fn().mockResolvedValue({
        plans: [{ id: "plan-1", name: "Household" }],
        defaultPlan: { id: "plan-1", name: "Household" }
      }),
      getPlanMonth: vi.fn().mockResolvedValue({
        month: "2026-04-01",
        ageOfMoney: 18,
        toBeBudgeted: 5000,
        income: 80000,
        budgeted: 60000,
        activity: -32000,
        categories: [
          {
            id: "category-1",
            name: "Groceries",
            balance: 10000,
            hidden: false,
            deleted: false,
            goalUnderFunded: 0,
            categoryGroupName: "Food"
          }
        ]
      }),
      listAccounts: vi.fn().mockResolvedValue([]),
      listTransactions: vi.fn().mockResolvedValue([
        {
          id: "txn-1",
          date: "2026-04-02",
          amount: 100000,
          categoryId: null,
          categoryName: null,
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: null
        },
        {
          id: "txn-2",
          date: "2026-04-03",
          amount: -20000,
          categoryId: "category-1",
          categoryName: "Groceries",
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: null
        },
        {
          id: "txn-3",
          date: "2026-04-04",
          amount: -5000,
          categoryId: "category-1",
          categoryName: "Groceries",
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: null
        },
        {
          id: "txn-4",
          date: "2026-04-05",
          amount: -7000,
          categoryId: null,
          categoryName: null,
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: null
        },
        {
          id: "txn-5",
          date: "2026-04-06",
          amount: -9000,
          categoryId: "category-2",
          categoryName: "Transfer",
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: "account-2"
        },
        {
          id: "txn-6",
          date: "2026-03-31",
          amount: -6000,
          categoryId: "category-3",
          categoryName: "Old",
          approved: true,
          cleared: "cleared",
          deleted: false,
          transferAccountId: null
        }
      ])
    };

    await expect(
      getMonthlyReview(ynabClient as never, {
        month: "2026-04-01",
        topN: 2
      })
    ).resolves.toEqual({
      month: "2026-04-01",
      income: "80.00",
      inflow: "100.00",
      outflow: "32.00",
      net_flow: "68.00",
      ready_to_assign: "5.00",
      available_total: "10.00",
      overspent_total: "0.00",
      underfunded_total: "0.00",
      assigned: "60.00",
      spent: "32.00",
      assigned_vs_spent: "28.00",
      top_spending_categories: [
        {
          id: "category-1",
          name: "Groceries",
          amount: "25.00",
          transaction_count: 2
        },
        {
          name: "Uncategorized",
          amount: "7.00",
          transaction_count: 1
        }
      ]
    });
  });

  it("summarizes cash flow across an explicit month range using visible months only", async () => {
    // DEFECT: cash flow summaries can drift outside the requested month range or mix in transfers and deleted months.
    const ynabClient = {
      listPlans: vi.fn().mockResolvedValue({
        plans: [{ id: "plan-1", name: "Household" }],
        defaultPlan: { id: "plan-1", name: "Household" }
      }),
      listPlanMonths: vi.fn().mockResolvedValue([
        {
          month: "2025-12-01",
          deleted: false,
          income: 50000,
          budgeted: 40000,
          activity: -30000,
          toBeBudgeted: 10000
        },
        {
          month: "2026-01-01",
          deleted: false,
          income: 200000,
          budgeted: 150000,
          activity: -90000,
          toBeBudgeted: 10000
        },
        {
          month: "2026-02-01",
          deleted: false,
          income: 100000,
          budgeted: 90000,
          activity: -80000,
          toBeBudgeted: 5000
        },
        {
          month: "2026-03-01",
          deleted: false,
          income: 0,
          budgeted: 50000,
          activity: -20000,
          toBeBudgeted: 3000
        },
        {
          month: "2026-04-01",
          deleted: false,
          income: 10000,
          budgeted: 5000,
          activity: -4000,
          toBeBudgeted: 1000
        }
      ]),
      listTransactions: vi.fn().mockResolvedValue([
        {
          id: "txn-1",
          date: "2026-01-03",
          amount: 200000,
          deleted: false,
          transferAccountId: null
        },
        {
          id: "txn-2",
          date: "2026-01-04",
          amount: -50000,
          deleted: false,
          transferAccountId: null
        },
        {
          id: "txn-3",
          date: "2026-02-05",
          amount: 100000,
          deleted: false,
          transferAccountId: null
        },
        {
          id: "txn-4",
          date: "2026-02-06",
          amount: -70000,
          deleted: false,
          transferAccountId: null
        },
        {
          id: "txn-5",
          date: "2026-02-07",
          amount: -10000,
          deleted: false,
          transferAccountId: "account-2"
        },
        {
          id: "txn-6",
          date: "2026-03-08",
          amount: -20000,
          deleted: false,
          transferAccountId: null
        },
        {
          id: "txn-7",
          date: "2026-03-09",
          amount: -99999,
          deleted: true,
          transferAccountId: null
        },
        {
          id: "txn-8",
          date: "2026-04-01",
          amount: 1000,
          deleted: false,
          transferAccountId: null
        }
      ])
    };

    await expect(
      getCashFlowSummary(ynabClient as never, {
        fromMonth: "2026-01-01",
        toMonth: "2026-03-01"
      })
    ).resolves.toEqual({
      from_month: "2026-01-01",
      to_month: "2026-03-01",
      inflow: "300.00",
      outflow: "140.00",
      net_flow: "160.00",
      assigned: "290.00",
      spent: "190.00",
      assigned_vs_spent: "100.00",
      periods: [
        {
          month: "2026-01-01",
          inflow: "200.00",
          outflow: "50.00",
          net_flow: "150.00",
          assigned: "150.00",
          spent: "90.00",
          assigned_vs_spent: "60.00"
        },
        {
          month: "2026-02-01",
          inflow: "100.00",
          outflow: "70.00",
          net_flow: "30.00",
          assigned: "90.00",
          spent: "80.00",
          assigned_vs_spent: "10.00"
        },
        {
          month: "2026-03-01",
          inflow: "0.00",
          outflow: "20.00",
          net_flow: "-20.00",
          assigned: "50.00",
          spent: "20.00",
          assigned_vs_spent: "30.00"
        }
      ]
    });
    expect(ynabClient.listTransactions).toHaveBeenCalledWith("plan-1", "2026-01-01", "2026-03-31");
  });

  it("summarizes spending by category, group, and payee across a month range with topN limits", async () => {
    // DEFECT: spending summary can include transfers or out-of-range activity and mis-rank grouped rollups.
    const ynabClient = {
      listPlans: vi.fn().mockResolvedValue({
        plans: [{ id: "plan-1", name: "Household" }],
        defaultPlan: { id: "plan-1", name: "Household" }
      }),
      listPlanMonths: vi.fn().mockResolvedValue([
        {
          month: "2026-01-01",
          deleted: false,
          income: 0,
          budgeted: 100000,
          activity: -60000,
          toBeBudgeted: 0
        },
        {
          month: "2026-02-01",
          deleted: false,
          income: 0,
          budgeted: 80000,
          activity: -50000,
          toBeBudgeted: 0
        }
      ]),
      listTransactions: vi.fn().mockResolvedValue([
        {
          id: "txn-1",
          date: "2026-01-05",
          amount: -30000,
          deleted: false,
          transferAccountId: null,
          categoryId: "category-1",
          categoryName: "Groceries",
          payeeId: "payee-1",
          payeeName: "Market"
        },
        {
          id: "txn-2",
          date: "2026-01-06",
          amount: -10000,
          deleted: false,
          transferAccountId: null,
          categoryId: "category-1",
          categoryName: "Groceries",
          payeeId: "payee-1",
          payeeName: "Market"
        },
        {
          id: "txn-3",
          date: "2026-02-07",
          amount: -25000,
          deleted: false,
          transferAccountId: null,
          categoryId: "category-2",
          categoryName: "Dining",
          payeeId: "payee-2",
          payeeName: "Cafe"
        },
        {
          id: "txn-4",
          date: "2026-02-08",
          amount: -15000,
          deleted: false,
          transferAccountId: null,
          categoryId: null,
          categoryName: null,
          payeeId: null,
          payeeName: null
        },
        {
          id: "txn-5",
          date: "2026-02-09",
          amount: -9999,
          deleted: false,
          transferAccountId: "account-2",
          categoryId: "category-3",
          categoryName: "Transfer",
          payeeId: "payee-3",
          payeeName: "Transfer"
        }
      ]),
      listCategories: vi.fn().mockResolvedValue([
        {
          name: "Food",
          categories: [
            { id: "category-1", deleted: false },
            { id: "category-2", deleted: false }
          ]
        }
      ])
    };

    await expect(
      getSpendingSummary(ynabClient as never, {
        fromMonth: "2026-01-01",
        toMonth: "2026-02-01",
        topN: 2
      })
    ).resolves.toEqual({
      from_month: "2026-01-01",
      to_month: "2026-02-01",
      assigned: "180.00",
      spent: "80.00",
      assigned_vs_spent: "100.00",
      transaction_count: 4,
      average_transaction: "20.00",
      top_categories: [
        {
          id: "category-1",
          name: "Groceries",
          amount: "40.00",
          transaction_count: 2
        },
        {
          id: "category-2",
          name: "Dining",
          amount: "25.00",
          transaction_count: 1
        }
      ],
      top_category_groups: [
        {
          name: "Food",
          amount: "65.00",
          transaction_count: 3
        },
        {
          name: "Uncategorized",
          amount: "15.00",
          transaction_count: 1
        }
      ],
      top_payees: [
        {
          id: "payee-1",
          name: "Market",
          amount: "40.00",
          transaction_count: 2
        },
        {
          id: "payee-2",
          name: "Cafe",
          amount: "25.00",
          transaction_count: 1
        }
      ]
    });
  });

  it("summarizes income by month and source while excluding transfers and out-of-range activity", async () => {
    // DEFECT: income summaries can overcount transfers or skip empty months, distorting volatility and median calculations.
    const ynabClient = {
      listPlans: vi.fn().mockResolvedValue({
        plans: [{ id: "plan-1", name: "Household" }],
        defaultPlan: { id: "plan-1", name: "Household" }
      }),
      listPlanMonths: vi.fn().mockResolvedValue([
        { month: "2026-01-01", deleted: false, income: 0, budgeted: 0, activity: 0, toBeBudgeted: 0 },
        { month: "2026-02-01", deleted: false, income: 0, budgeted: 0, activity: 0, toBeBudgeted: 0 },
        { month: "2026-03-01", deleted: false, income: 0, budgeted: 0, activity: 0, toBeBudgeted: 0 }
      ]),
      listTransactions: vi.fn().mockResolvedValue([
        {
          id: "txn-1",
          date: "2026-01-03",
          amount: 100000,
          deleted: false,
          transferAccountId: null,
          payeeId: "payee-1",
          payeeName: "Employer"
        },
        {
          id: "txn-2",
          date: "2026-01-20",
          amount: 50000,
          deleted: false,
          transferAccountId: null,
          payeeId: "payee-2",
          payeeName: "Gift"
        },
        {
          id: "txn-3",
          date: "2026-02-02",
          amount: 80000,
          deleted: false,
          transferAccountId: null,
          payeeId: "payee-1",
          payeeName: "Employer"
        },
        {
          id: "txn-4",
          date: "2026-02-03",
          amount: 25000,
          deleted: false,
          transferAccountId: "account-2",
          payeeId: "payee-3",
          payeeName: "Transfer"
        },
        {
          id: "txn-5",
          date: "2026-03-04",
          amount: 0,
          deleted: false,
          transferAccountId: null,
          payeeId: null,
          payeeName: null
        }
      ])
    };

    await expect(
      getIncomeSummary(ynabClient as never, {
        fromMonth: "2026-01-01",
        toMonth: "2026-03-01",
        topN: 2
      })
    ).resolves.toEqual({
      from_month: "2026-01-01",
      to_month: "2026-03-01",
      income_total: "230.00",
      average_monthly_income: "76.67",
      median_monthly_income: "80.00",
      income_month_count: 3,
      volatility_percent: "195.65",
      top_income_sources: [
        {
          id: "payee-1",
          name: "Employer",
          amount: "180.00",
          transaction_count: 2
        },
        {
          id: "payee-2",
          name: "Gift",
          amount: "50.00",
          transaction_count: 1
        }
      ],
      months: [
        {
          month: "2026-01-01",
          income: "150.00"
        },
        {
          month: "2026-02-01",
          income: "80.00"
        },
        {
          month: "2026-03-01",
          income: "0.00"
        }
      ]
    });
  });

  it("requires a category id or category group name when building a category trend summary", async () => {
    // DEFECT: category trend summaries can silently proceed without a scope and return misleading aggregates.
    const ynabClient = {
      listPlans: vi.fn().mockResolvedValue({
        plans: [{ id: "plan-1", name: "Household" }],
        defaultPlan: { id: "plan-1", name: "Household" }
      })
    };

    await expect(getCategoryTrendSummary(ynabClient as never, {})).rejects.toThrow(
      "Provide either categoryId or categoryGroupName."
    );
  });

  it("summarizes category-group trends across a month range while ignoring hidden and deleted categories", async () => {
    // DEFECT: category trend summaries can match the wrong categories or include hidden and deleted rows in period totals.
    const ynabClient = {
      listPlans: vi.fn().mockResolvedValue({
        plans: [{ id: "plan-1", name: "Household" }],
        defaultPlan: { id: "plan-1", name: "Household" }
      }),
      listPlanMonths: vi.fn().mockResolvedValue([
        { month: "2026-01-01", deleted: false },
        { month: "2026-02-01", deleted: false },
        { month: "2026-03-01", deleted: false }
      ]),
      getPlanMonth: vi.fn()
        .mockResolvedValueOnce({
          month: "2026-01-01",
          categories: [
            {
              id: "category-1",
              name: "Groceries",
              categoryGroupName: "Food",
              budgeted: 30000,
              activity: -12000,
              balance: 18000,
              hidden: false,
              deleted: false
            },
            {
              id: "category-2",
              name: "Dining",
              categoryGroupName: "Food",
              budgeted: 15000,
              activity: -8000,
              balance: 7000,
              hidden: false,
              deleted: false
            },
            {
              id: "category-hidden",
              name: "Ignore Hidden",
              categoryGroupName: "Food",
              budgeted: 99999,
              activity: -99999,
              balance: 99999,
              hidden: true,
              deleted: false
            }
          ]
        })
        .mockResolvedValueOnce({
          month: "2026-02-01",
          categories: [
            {
              id: "category-1",
              name: "Groceries",
              categoryGroupName: "Food",
              budgeted: 20000,
              activity: -15000,
              balance: 5000,
              hidden: false,
              deleted: false
            },
            {
              id: "category-2",
              name: "Dining",
              categoryGroupName: "Food",
              budgeted: 10000,
              activity: -10000,
              balance: 0,
              hidden: false,
              deleted: false
            },
            {
              id: "category-deleted",
              name: "Ignore Deleted",
              categoryGroupName: "Food",
              budgeted: 77777,
              activity: -77777,
              balance: 77777,
              hidden: false,
              deleted: true
            }
          ]
        })
        .mockResolvedValueOnce({
          month: "2026-03-01",
          categories: [
            {
              id: "category-1",
              name: "Groceries",
              categoryGroupName: "Food",
              budgeted: 25000,
              activity: -11000,
              balance: 14000,
              hidden: false,
              deleted: false
            },
            {
              id: "category-2",
              name: "Dining",
              categoryGroupName: "Food",
              budgeted: 5000,
              activity: -4000,
              balance: 1000,
              hidden: false,
              deleted: false
            },
            {
              id: "category-other",
              name: "Transport",
              categoryGroupName: "Travel",
              budgeted: 40000,
              activity: -30000,
              balance: 10000,
              hidden: false,
              deleted: false
            }
          ]
        })
    };

    await expect(
      getCategoryTrendSummary(ynabClient as never, {
        categoryGroupName: "Food",
        fromMonth: "2026-01-01",
        toMonth: "2026-03-01"
      })
    ).resolves.toEqual({
      from_month: "2026-01-01",
      to_month: "2026-03-01",
      scope: {
        type: "category_group",
        name: "Food",
        match_basis: "category_group_name"
      },
      average_spent: "20.00",
      peak_month: "2026-02-01",
      spent_change: "-5.00",
      periods: [
        {
          month: "2026-01-01",
          assigned: "45.00",
          spent: "20.00",
          available: "25.00"
        },
        {
          month: "2026-02-01",
          assigned: "30.00",
          spent: "25.00",
          available: "5.00"
        },
        {
          month: "2026-03-01",
          assigned: "30.00",
          spent: "15.00",
          available: "15.00"
        }
      ]
    });
  });

  it("computes cash runway from recent monthly spending and next-30-day scheduled activity", async () => {
    // DEFECT: cash runway can use the wrong month window or include deleted and out-of-window scheduled transactions.
    const ynabClient = {
      listPlans: vi.fn().mockResolvedValue({
        plans: [{ id: "plan-1", name: "Household" }],
        defaultPlan: { id: "plan-1", name: "Household" }
      }),
      listAccounts: vi.fn().mockResolvedValue([
        {
          id: "account-1",
          name: "Checking",
          balance: 300000,
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
        }
      ]),
      listPlanMonths: vi.fn().mockResolvedValue([
        { month: "2026-01-01", deleted: false, activity: -90000 },
        { month: "2026-02-01", deleted: false, activity: -60000 },
        { month: "2026-03-01", deleted: false, activity: -30000 },
        { month: "2026-04-01", deleted: false, activity: -12000 }
      ]),
      listScheduledTransactions: vi.fn().mockResolvedValue([
        {
          id: "scheduled-1",
          amount: -10000,
          deleted: false,
          dateNext: "2026-04-10"
        },
        {
          id: "scheduled-2",
          amount: 4000,
          deleted: false,
          dateNext: "2026-04-25"
        },
        {
          id: "scheduled-3",
          amount: -5000,
          deleted: false,
          dateNext: "2026-05-05"
        },
        {
          id: "scheduled-4",
          amount: -7000,
          deleted: true,
          dateNext: "2026-04-15"
        }
      ])
    };

    await expect(
      getCashRunway(ynabClient as never, {
        asOfMonth: "2026-04-01",
        monthsBack: 3
      })
    ).resolves.toEqual({
      as_of_month: "2026-04-01",
      liquid_cash: "300.00",
      average_daily_outflow: "1.13",
      scheduled_net_next_30d: "-6.00",
      runway_days: "264.71",
      status: "stable",
      months_considered: 3
    });
  });

  it("treats the as-of day and 30-day boundary as upcoming obligations when computing runway", async () => {
    // DEFECT: runway calculations can drop same-day or day-30 scheduled activity and accidentally pull future months into the average.
    const ynabClient = {
      listPlans: vi.fn().mockResolvedValue({
        plans: [{ id: "plan-1", name: "Household" }],
        defaultPlan: { id: "plan-1", name: "Household" }
      }),
      listAccounts: vi.fn().mockResolvedValue([
        {
          id: "account-1",
          name: "Checking",
          balance: 120000,
          deleted: false,
          closed: false,
          onBudget: true
        }
      ]),
      listPlanMonths: vi.fn().mockResolvedValue([
        { month: "2026-03-01", deleted: false, activity: -30000 },
        { month: "2026-04-01", deleted: false, activity: -60000 },
        { month: "2026-05-01", deleted: false, activity: -999999 }
      ]),
      listScheduledTransactions: vi.fn().mockResolvedValue([
        {
          id: "scheduled-1",
          amount: -10000,
          deleted: false,
          dateNext: "2026-04-01"
        },
        {
          id: "scheduled-2",
          amount: -5000,
          deleted: false,
          dateNext: "2026-05-01"
        },
        {
          id: "scheduled-3",
          amount: 2000,
          deleted: false,
          dateNext: "2026-05-02"
        }
      ])
    };

    await expect(
      getCashRunway(ynabClient as never, {
        asOfMonth: "2026-04-01",
        monthsBack: 2
      })
    ).resolves.toEqual({
      as_of_month: "2026-04-01",
      liquid_cash: "120.00",
      average_daily_outflow: "1.50",
      scheduled_net_next_30d: "-15.00",
      runway_days: "80.00",
      status: "watch",
      months_considered: 2
    });
  });

  it("summarizes upcoming obligations by window and due-date ordering", async () => {
    // DEFECT: upcoming obligations can miscount inflows and outflows across windows or return the wrong items first.
    const ynabClient = {
      listPlans: vi.fn().mockResolvedValue({
        plans: [{ id: "plan-1", name: "Household" }],
        defaultPlan: { id: "plan-1", name: "Household" }
      }),
      listScheduledTransactions: vi.fn().mockResolvedValue([
        {
          id: "scheduled-1",
          dateNext: "2026-04-01",
          payeeName: "Landlord",
          categoryName: "Rent",
          accountName: "Checking",
          amount: -100000,
          deleted: false
        },
        {
          id: "scheduled-2",
          dateNext: "2026-04-08",
          payeeName: "Payroll",
          categoryName: "Income",
          accountName: "Checking",
          amount: 250000,
          deleted: false
        },
        {
          id: "scheduled-3",
          dateNext: "2026-04-15",
          payeeName: "Utilities",
          categoryName: "Bills",
          accountName: "Checking",
          amount: -15000,
          deleted: false
        },
        {
          id: "scheduled-4",
          dateNext: "2026-05-01",
          payeeName: "Insurance",
          categoryName: "Bills",
          accountName: "Checking",
          amount: -20000,
          deleted: false
        },
        {
          id: "scheduled-5",
          dateNext: "2026-05-02",
          payeeName: "Ignore Future",
          categoryName: "Bills",
          accountName: "Checking",
          amount: -9999,
          deleted: false
        },
        {
          id: "scheduled-6",
          dateNext: "2026-04-10",
          payeeName: "Deleted",
          categoryName: "Bills",
          accountName: "Checking",
          amount: -5000,
          deleted: true
        }
      ])
    };

    await expect(
      getUpcomingObligations(ynabClient as never, {
        asOfDate: "2026-04-01",
        topN: 3
      })
    ).resolves.toEqual({
      as_of_date: "2026-04-01",
      obligation_count: 3,
      expected_inflow_count: 1,
      windows: {
        "7d": {
          total_inflows: "250.00",
          total_outflows: "100.00",
          net_upcoming: "150.00",
          obligation_count: 1,
          expected_inflow_count: 1
        },
        "14d": {
          total_inflows: "250.00",
          total_outflows: "115.00",
          net_upcoming: "135.00",
          obligation_count: 2,
          expected_inflow_count: 1
        },
        "30d": {
          total_inflows: "250.00",
          total_outflows: "135.00",
          net_upcoming: "115.00",
          obligation_count: 3,
          expected_inflow_count: 1
        }
      },
      top_due: [
        {
          id: "scheduled-1",
          date_next: "2026-04-01",
          payee_name: "Landlord",
          category_name: "Rent",
          account_name: "Checking",
          amount: "100.00",
          type: "outflow"
        },
        {
          id: "scheduled-2",
          date_next: "2026-04-08",
          payee_name: "Payroll",
          category_name: "Income",
          account_name: "Checking",
          amount: "250.00",
          type: "inflow"
        },
        {
          id: "scheduled-3",
          date_next: "2026-04-15",
          payee_name: "Utilities",
          category_name: "Bills",
          account_name: "Checking",
          amount: "15.00",
          type: "outflow"
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

  it("limits spending anomalies by topN and ignores hidden or deleted categories in baseline and latest months", async () => {
    // DEFECT: anomaly detection can include hidden or deleted categories, drop zero-baseline handling, or ignore a stricter threshold multiplier.
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
              id: "category-high",
              name: "Travel",
              activity: -10000,
              hidden: false,
              deleted: false
            },
            {
              id: "category-medium",
              name: "Dining",
              activity: -5000,
              hidden: false,
              deleted: false
            },
            {
              id: "category-low",
              name: "Shopping",
              activity: -10000,
              hidden: false,
              deleted: false
            },
            {
              id: "category-hidden",
              name: "Ignore Hidden",
              activity: -5000,
              hidden: true,
              deleted: false
            }
          ]
        })
        .mockResolvedValueOnce({
          month: "2026-02-01",
          categories: [
            {
              id: "category-high",
              name: "Travel",
              activity: -12000,
              hidden: false,
              deleted: false
            },
            {
              id: "category-medium",
              name: "Dining",
              activity: -5000,
              hidden: false,
              deleted: false
            },
            {
              id: "category-low",
              name: "Shopping",
              activity: -10000,
              hidden: false,
              deleted: false
            },
            {
              id: "category-zero",
              name: "New Category",
              activity: 0,
              hidden: false,
              deleted: false
            }
          ]
        })
        .mockResolvedValueOnce({
          month: "2026-03-01",
          categories: [
            {
              id: "category-high",
              name: "Travel",
              activity: -11000,
              hidden: false,
              deleted: false
            },
            {
              id: "category-medium",
              name: "Dining",
              activity: -5000,
              hidden: false,
              deleted: false
            },
            {
              id: "category-low",
              name: "Shopping",
              activity: -10000,
              hidden: false,
              deleted: false
            },
            {
              id: "category-zero",
              name: "New Category",
              activity: 0,
              hidden: false,
              deleted: false
            }
          ]
        })
        .mockResolvedValueOnce({
          month: "2026-04-01",
          categories: [
            {
              id: "category-high",
              name: "Travel",
              activity: -22000,
              hidden: false,
              deleted: false
            },
            {
              id: "category-medium",
              name: "Dining",
              activity: -15000,
              hidden: false,
              deleted: false
            },
            {
              id: "category-low",
              name: "Shopping",
              activity: -16000,
              hidden: false,
              deleted: false
            },
            {
              id: "category-zero",
              name: "New Category",
              activity: -7000,
              hidden: false,
              deleted: false
            },
            {
              id: "category-hidden",
              name: "Ignore Hidden",
              activity: -50000,
              hidden: true,
              deleted: false
            },
            {
              id: "category-deleted",
              name: "Ignore Deleted",
              activity: -50000,
              hidden: false,
              deleted: true
            }
          ]
        })
    };

    await expect(
      getSpendingAnomalies(ynabClient as never, {
        latestMonth: "2026-04-01",
        topN: 2,
        minimumDifference: 7000,
        thresholdMultiplier: 2
      })
    ).resolves.toEqual({
      latest_month: "2026-04-01",
      baseline_month_count: 3,
      anomaly_count: 2,
      anomalies: [
        {
          category_id: "category-high",
          category_name: "Travel",
          latest_spent: "22.00",
          baseline_average: "11.00",
          increase: "11.00",
          increase_pct: "100.00"
        },
        {
          category_id: "category-medium",
          category_name: "Dining",
          latest_spent: "15.00",
          baseline_average: "5.00",
          increase: "10.00",
          increase_pct: "200.00"
        }
      ]
    });
  });
});
