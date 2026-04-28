import { describe, expect, it, vi } from "vitest";

import { getMonthlyReview } from "./service.js";

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
    transferAccountId: null
  };
}

describe("financial health context optimization", () => {
  it("uses detailLevel to cap rollups and representative transaction evidence", async () => {
    const transactions = Array.from({ length: 12 }, (_, index) => spendingTransaction(index));
    const ynabClient = {
      listPlans: vi.fn(),
      getPlanMonth: vi.fn().mockResolvedValue({
        month: "2026-04-01",
        income: 0,
        budgeted: 120000,
        activity: -78000,
        toBeBudgeted: 0,
        categories: []
      }),
      listAccounts: vi.fn().mockResolvedValue([]),
      listTransactions: vi.fn().mockResolvedValue(transactions)
    };

    await expect(
      getMonthlyReview(ynabClient as never, {
        planId: "plan-1",
        month: "2026-04-01",
        detailLevel: "detailed"
      })
    ).resolves.toMatchObject({
      top_spending_categories: expect.arrayContaining([
        expect.objectContaining({ name: "Category 11" }),
        expect.objectContaining({ name: "Category 2" })
      ]),
      example_transactions: expect.arrayContaining([
        expect.objectContaining({ id: "txn-11" }),
        expect.objectContaining({ id: "txn-2" })
      ])
    });
  });
});
