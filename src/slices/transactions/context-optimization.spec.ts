import { describe, expect, it, vi } from "vitest";

import { searchTransactions } from "./service.js";

function transaction(index: number) {
  return {
    id: `txn-${String(index).padStart(2, "0")}`,
    date: `2026-04-${String(28 - Math.floor(index / 4)).padStart(2, "0")}`,
    amount: index % 3 === 0 ? 100000 : -((index + 1) * 1000),
    payeeId: `payee-${index % 4}`,
    payeeName: `Payee ${index % 4}`,
    categoryId: `category-${index % 5}`,
    categoryName: `Category ${index % 5}`,
    accountId: "account-1",
    accountName: "Checking",
    approved: true,
    cleared: "cleared",
    deleted: false,
    transferAccountId: null
  };
}

describe("transaction context optimization", () => {
  it("caps uncapped transaction search results at 65 rows and includes compact rollups", async () => {
    const ynabClient = {
      listPlans: vi.fn(),
      listTransactions: vi.fn().mockResolvedValue(Array.from({ length: 70 }, (_, index) => transaction(index)))
    };

    await expect(searchTransactions(ynabClient as never, { planId: "plan-1" })).resolves.toMatchObject({
      match_count: 70,
      limit: 65,
      offset: 0,
      returned_count: 65,
      has_more: true,
      totals: {
        total_inflow: expect.any(String),
        total_outflow: expect.any(String),
        net: expect.any(String)
      },
      top_categories: expect.any(Array),
      top_payees: expect.any(Array)
    });
  });
});
