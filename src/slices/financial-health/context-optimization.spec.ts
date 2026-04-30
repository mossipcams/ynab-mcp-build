import { describe, expect, it, vi } from "vitest";

import {
  getBudgetHealthSummary,
  getCashFlowSummary,
  getFinancialSnapshot,
  getMonthlyReview,
  getNetWorthTrajectory,
} from "./service.js";

function spendingTransaction(index: number) {
  return {
    id: `txn-${index}`,
    date: "2026-04-12",
    amount: -((index + 1) * 1000),
    payeeId: `payee-${index}`,
    payeeName: `Payee ${index}`,
    categoryId: `category-${index}`,
    categoryName: `Category ${index}`,
    accountId: "account-1",
    accountName: "Checking",
    approved: true,
    cleared: "cleared",
    deleted: false,
    transferAccountId: null,
  };
}

describe("financial health context optimization", () => {
  it("passes both range bounds to transaction reads for range summaries", async () => {
    const ynabClient = {
      listPlanMonths: vi.fn().mockResolvedValue([
        {
          month: "2026-01-01",
          budgeted: 100000,
          activity: -50000,
          deleted: false,
        },
        {
          month: "2026-02-01",
          budgeted: 100000,
          activity: -60000,
          deleted: false,
        },
      ]),
      listTransactions: vi.fn().mockResolvedValue([]),
    };

    await getCashFlowSummary(ynabClient as never, {
      planId: "plan-1",
      fromMonth: "2026-01-01",
      toMonth: "2026-02-01",
    });

    expect(ynabClient.listTransactions).toHaveBeenCalledWith(
      "plan-1",
      "2026-01-01",
      "2026-02-28",
    );
  });

  it("reconstructs net worth trajectories without rescanning every transaction for every month", async () => {
    let dateReadCount = 0;
    const transactions = Array.from({ length: 24 }, (_, index) => ({
      id: `txn-${index}`,
      get date() {
        dateReadCount += 1;
        return `2026-${String((index % 12) + 1).padStart(2, "0")}-15`;
      },
      amount: -1000,
      accountId: "account-1",
      deleted: false,
    }));
    const ynabClient = {
      listAccounts: vi.fn().mockResolvedValue([
        {
          id: "account-1",
          name: "Checking",
          type: "checking",
          closed: false,
          deleted: false,
          balance: 100000,
        },
      ]),
      listTransactions: vi.fn().mockResolvedValue(transactions),
    };

    await expect(
      getNetWorthTrajectory(ynabClient as never, {
        planId: "plan-1",
        fromMonth: "2026-01-01",
        toMonth: "2026-12-01",
      }),
    ).resolves.toMatchObject({
      from_month: "2026-01-01",
      to_month: "2026-12-01",
      months: expect.arrayContaining([
        expect.objectContaining({ month: "2026-01-01" }),
        expect.objectContaining({ month: "2026-12-01" }),
      ]),
    });
    expect(dateReadCount).toBeLessThan(200);
  });

  it("does not fetch accounts or transactions for month-only summaries", async () => {
    const ynabClient = {
      getPlanMonth: vi.fn().mockResolvedValue({
        month: "2026-04-01",
        ageOfMoney: 17,
        toBeBudgeted: 10000,
        budgeted: 120000,
        activity: -95000,
        categories: [],
      }),
      listAccounts: vi.fn().mockResolvedValue([]),
      listTransactions: vi.fn().mockResolvedValue([]),
    };

    await getBudgetHealthSummary(ynabClient as never, {
      planId: "plan-1",
      month: "2026-04-01",
    });
    expect(ynabClient.getPlanMonth).toHaveBeenCalledTimes(1);
    expect(ynabClient.listAccounts).not.toHaveBeenCalled();
    expect(ynabClient.listTransactions).not.toHaveBeenCalled();
  });

  it("does not fetch transactions for financial snapshots", async () => {
    const ynabClient = {
      getPlanMonth: vi.fn().mockResolvedValue({
        month: "2026-04-01",
        income: 300000,
        budgeted: 200000,
        activity: -150000,
        toBeBudgeted: 25000,
        categories: [],
      }),
      listAccounts: vi.fn().mockResolvedValue([]),
      listTransactions: vi.fn().mockResolvedValue([]),
    };

    await getFinancialSnapshot(ynabClient as never, {
      planId: "plan-1",
      month: "2026-04-01",
    });

    expect(ynabClient.getPlanMonth).toHaveBeenCalledTimes(1);
    expect(ynabClient.listAccounts).toHaveBeenCalledTimes(1);
    expect(ynabClient.listTransactions).not.toHaveBeenCalled();
  });

  it("uses detailLevel to cap rollups and representative transaction evidence", async () => {
    const transactions = Array.from({ length: 12 }, (_, index) =>
      spendingTransaction(index),
    );
    const ynabClient = {
      listPlans: vi.fn(),
      getPlanMonth: vi.fn().mockResolvedValue({
        month: "2026-04-01",
        income: 0,
        budgeted: 120000,
        activity: -78000,
        toBeBudgeted: 0,
        categories: [],
      }),
      listAccounts: vi.fn().mockResolvedValue([]),
      listTransactions: vi.fn().mockResolvedValue(transactions),
    };

    await expect(
      getMonthlyReview(ynabClient as never, {
        planId: "plan-1",
        month: "2026-04-01",
        detailLevel: "detailed",
      }),
    ).resolves.toMatchObject({
      top_spending_categories: expect.arrayContaining([
        expect.objectContaining({ name: "Category 11" }),
        expect.objectContaining({ name: "Category 2" }),
      ]),
      example_transactions: expect.arrayContaining([
        expect.objectContaining({ id: "txn-11" }),
        expect.objectContaining({ id: "txn-2" }),
      ]),
    });
  });
});
